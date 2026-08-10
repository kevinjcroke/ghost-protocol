// Plays the game against itself with a scripted "competent player" and a
// scripted "bad player", to check the difficulty ramp is a curve, not a cliff.
//
//   swarm   -- reissues four pincer orders that cut off the evader's exits
//   babysit -- chases with a single hunter and leaves the other three parked
//
// A healthy game: swarm reliably wins the early levels and starts losing
// later ones; babysit loses almost everywhere.
const API = require('./harness.js');
const { game, tcx, tcy, COLS, bfsRoute, neighborsOf, wrapCol, OPP } = API;

const MAX_TICKS = 12000;   // ~3.3 minutes of game time

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

function playLevel(level, strategy, reissueEvery) {
  game.level = level;
  game.contracts = 3;
  game.score = 0;
  game.startLevel(true);
  let t = 0;
  while (t < 240) { game.update(); t++; }        // READY
  while (t < MAX_TICKS) {
    if (t % reissueEvery === 0) strategy();
    game.update(); t++;
    if (game.phase === 'capture' || game.phase === 'flash') {
      return { result: 'caught', ticks: t, score: game.score };
    }
    if (game.phase === 'escaped') return { result: 'escaped', ticks: t, score: game.score };
  }
  return { result: 'timeout', ticks: t, score: game.score };
}

const TRIALS = 5;
const levels = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 18, 20];
const rows = [];
console.log('level  swarm win%   median catch (s)   babysit win%');
for (const L of levels) {
  const sw = [], bb = [];
  for (let i = 0; i < TRIALS; i++) sw.push(playLevel(L, swarm, 150));
  for (let i = 0; i < TRIALS; i++) bb.push(playLevel(L, babysit, 150));
  const swWins = sw.filter(r => r.result === 'caught');
  const bbWins = bb.filter(r => r.result === 'caught');
  const times = swWins.map(r => r.ticks / 60).sort((a, b) => a - b);
  const med = times.length ? times[Math.floor(times.length / 2)].toFixed(0) : '--';
  const swPct = Math.round(100 * swWins.length / TRIALS);
  const bbPct = Math.round(100 * bbWins.length / TRIALS);
  rows.push({ L, swPct, med, bbPct });
  console.log(
    String(L).padStart(5) + String(swPct + '%').padStart(11)
    + String(med).padStart(19) + String(bbPct + '%').padStart(15));
}

console.log('\nchecks:');
const early = rows.filter(r => r.L <= 3);
const late = rows.filter(r => r.L >= 15);
const earlyAvg = early.reduce((s, r) => s + r.swPct, 0) / early.length;
const lateAvg = late.reduce((s, r) => s + r.swPct, 0) / late.length;
const babysitAvg = rows.reduce((s, r) => s + r.bbPct, 0) / rows.length;
console.log('  early levels (1-3) swarm win rate: ' + earlyAvg.toFixed(0) + '%  (want high)');
console.log('  late levels (15-20) swarm win rate: ' + lateAvg.toFixed(0) + '%  (want lower)');
console.log('  babysitting win rate overall:      ' + babysitAvg.toFixed(0) + '%  (want low)');
console.log('  ramp is a curve, not a cliff:      '
  + (earlyAvg > lateAvg ? 'yes' : 'NO — difficulty does not increase'));
console.log('  swarming beats babysitting:        '
  + (earlyAvg > babysitAvg ? 'yes' : 'NO — coordination is not rewarded'));
