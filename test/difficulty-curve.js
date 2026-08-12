// Plays the game against itself with a scripted "competent player" and a
// scripted "bad player", to check the difficulty ramp is a curve, not a cliff.
//
//   swarm   -- reissues four pincer orders that cut off the evader's exits
//   babysit -- chases with a single hunter and leaves the other three parked
//
// The lives era changed what "difficulty" means. A board is three catches,
// and with three chances even late boards usually get WON eventually -- so
// win rate is a soft, nearly useless ruler. The real skill meter is how
// CLEAN each catch is: the score banks dots-left x level, so dots-left at
// the moment of capture is the level-normalized measure of how badly he
// outplayed you before you got him. A healthy game: catches get dirtier as
// levels climb, coordination banks cleaner catches than babysitting, and
// babysitting still loses boards outright.
const API = require('./harness.js');
const { game, tcx, tcy, COLS, bfsRoute, neighborsOf, wrapCol, OPP } = API;

const MAX_TICKS = 30000;   // ~8 minutes of game time: a board is three chases

/* Walk outward from the evader down each corridor to find the tiles that seal
   his exits: that is what a player who thinks in pincers actually draws. */
function pinchPoints(depth) {
  const et = game.evader.tile();
  if (et.c < 0 || et.c >= COLS) return [];
  const out = [];
  for (const n of neighborsOf(wrapCol(et.c), et.r)) {
    let cur = { c: n.c, r: n.r }, prevDir = n.dir, steps = 1;
    while (steps < depth) {
      const exits = neighborsOf(wrapCol(cur.c), cur.r).filter(x => x.dir !== OPP[prevDir]);
      if (exits.length !== 1) break;
      cur = { c: exits[0].c, r: exits[0].r }; prevDir = exits[0].dir; steps++;
    }
    out.push({ c: wrapCol(cur.c), r: cur.r });
  }
  return out;
}

function orderTo(h, target) {
  const ht = h.tile();
  if (ht.c < 0 || ht.c >= COLS) return false;
  const route = bfsRoute({ c: wrapCol(ht.c), r: ht.r }, target);
  if (!route || route.length < 2) return false;
  h.setOrder(route, false);
  return true;
}

function swarm() {
  const anchors = pinchPoints(7);
  if (!anchors.length) return;
  const used = new Set();
  for (const h of game.hunters) {
    if (h.state !== 'active') continue;
    let best = null, bd = 1e9;
    anchors.forEach((a, i) => {
      if (used.has(i)) return;
      const ht = h.tile();
      if (ht.c < 0 || ht.c >= COLS) return;
      const r = bfsRoute({ c: wrapCol(ht.c), r: ht.r }, a);
      if (r && r.length < bd) { bd = r.length; best = { i, a }; }
    });
    if (best && orderTo(h, best.a)) used.add(best.i);
  }
}

function babysit() {
  const h = game.hunters.find(x => x.state === 'active');
  const et = game.evader.tile();
  if (!h || et.c < 0 || et.c >= COLS) return;
  orderTo(h, { c: wrapCol(et.c), r: et.r });
}

/* One full board: up to three catches, dots persisting across his lives.
   Resolves 'won' (third catch -> flash), 'escaped' (he cleared the dots),
   or 'timeout'. Records dots-left at every catch. */
function playBoard(level, strategy, reissueEvery) {
  game.level = level;
  game.contracts = 3;
  game.score = 0;
  game.startLevel(true);           // fresh dots, fresh three lives
  const catches = [];
  let t = 0, wasCapture = false;
  while (t < MAX_TICKS) {
    if (game.phase === 'play' && t % reissueEvery === 0) strategy();
    if (game.phase === 'command') game.phase = 'play';
    game.update(); t++;
    if (game.phase === 'capture' && !wasCapture) {
      wasCapture = true;
      catches.push({ dotsLeft: game.captureInfo.dotsLeft, ticks: t });
    } else if (game.phase !== 'capture') {
      wasCapture = false;
    }
    if (game.phase === 'flash') return { result: 'won', catches, ticks: t };
    if (game.phase === 'escaped') return { result: 'escaped', catches, ticks: t };
    if (game.phase === 'gameover') return { result: 'escaped', catches, ticks: t };
  }
  return { result: 'timeout', catches, ticks: t };
}

const TRIALS = 3;
const levels = [1, 2, 4, 8, 12, 20];
const rows = [];
const avg = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);

console.log('per-catch cleanliness: dots still on the board when he was caught');
console.log('(higher = caught faster = better play was possible at that level)\n');
console.log('level | swarm won  catches  dots@catch | babysit won  catches  dots@catch');
for (const L of levels) {
  const run = (strat) => {
    const boards = [];
    for (let i = 0; i < TRIALS; i++) boards.push(playBoard(L, strat, 150));
    return {
      wonPct: Math.round(100 * boards.filter(b => b.result === 'won').length / TRIALS),
      catches: avg(boards.map(b => b.catches.length)),
      clean: avg(boards.flatMap(b => b.catches.map(c => c.dotsLeft))),
    };
  };
  const sw = run(swarm);
  const bb = run(babysit);
  rows.push({ L, sw, bb });
  const f = (v, w) => String(Number.isNaN(v) ? '--' : Math.round(v)).padStart(w);
  console.log(String(L).padStart(5) + ' |' + f(sw.wonPct, 9) + '%'
    + f(sw.catches * 10 / 10, 8) + '/3' + f(sw.clean, 11)
    + ' |' + f(bb.wonPct, 10) + '%' + f(bb.catches, 8) + '/3' + f(bb.clean, 11));
}

console.log('\nchecks:');
const early = rows.filter(r => r.L <= 2);
const late = rows.filter(r => r.L >= 12);
const earlyClean = avg(early.map(r => r.sw.clean).filter(v => !Number.isNaN(v)));
const lateClean = avg(late.map(r => r.sw.clean).filter(v => !Number.isNaN(v)));
const swCleanAll = avg(rows.map(r => r.sw.clean).filter(v => !Number.isNaN(v)));
const bbCleanAll = avg(rows.map(r => r.bb.clean).filter(v => !Number.isNaN(v)));
const bbWonAll = avg(rows.map(r => r.bb.wonPct));
console.log('  swarm dots@catch, early (L1-2):   ' + earlyClean.toFixed(0));
console.log('  swarm dots@catch, late (L12-20):  ' + lateClean.toFixed(0));
console.log('  catches get dirtier with level:   '
  + (earlyClean > lateClean ? 'yes — the curve is real'
     : 'NO — he is not getting harder to catch cleanly'));
console.log('  swarm dots@catch vs babysit:      ' + swCleanAll.toFixed(0)
  + ' vs ' + (Number.isNaN(bbCleanAll) ? '--' : bbCleanAll.toFixed(0)));
console.log('  coordination banks cleaner:       '
  + (Number.isNaN(bbCleanAll) || swCleanAll > bbCleanAll ? 'yes'
     : 'NO — babysitting catches just as clean'));
console.log('  babysit boards won overall:       ' + bbWonAll.toFixed(0) + '%  (want low)');
console.log('  (boards-won is a soft metric now: three chances per board means'
  + '\n   even late boards usually resolve — the score is the skill meter)');
