// The practice: a first visit's first press, run headless in Node.
// Driven through the real bound listeners wherever a player would be, so
// the routing, the gate and the double-press guard are tested as pressed.
const API = require('./harness.js');
const { game, Draw, tcx, tcy, fire, screen, win, touch, touchEvent, storage } = API;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  -> ' + JSON.stringify(extra) : '')); }
}

/* ---- storage ----
   The harness stub answers '0' for every key: a returning player. A first
   visit is gpOnboard never written; every write is kept, so a test can ask
   what the practice told the browser to remember. */
const realGet = storage.getItem, realSet = storage.setItem;
let mem = {};
const writes = [];
function firstVisit() {
  mem = {};
  writes.length = 0;
  storage.getItem = (k) => (k in mem ? mem[k] : k === 'gpOnboard' ? null : '0');
  storage.setItem = (k, v) => { writes.push([k, String(v)]); mem[k] = String(v); };
  API.resetOnboardMem();
  API.setForceDrill(false);
}
function returning() {
  storage.getItem = realGet;
  storage.setItem = realSet;
  API.resetOnboardMem();
  API.setForceDrill(false);
}
const wrote = (k, v) => writes.some(w => w[0] === k && (v === undefined || w[1] === v));

/* ---- time ----
   sim() is frame()'s tick loop without the clock: exact tick counts, and
   the same drillCheck after. frames() is the real frame(), clock and all,
   for anything that waits on presentation time or must be drawn. */
function sim(n, until) {
  const live = ['ready', 'play', 'capture', 'flash', 'escaped', 'gameover'];
  for (let i = 0; i < n; i++) {
    if (until && until()) return i;
    if (live.includes(game.phase)) game.update();
    game.popups = game.popups.filter(p => --p.t > 0);
    API.drillCheck();
  }
  return until && until() ? n : -1;
}
let ts = 1e6;
function frames(n) { for (let i = 0; i < n; i++) { ts += 1000 / 60; API.frame(ts); } }
// past the practice's 300ms press guard; a frozen board runs no ticks
function settle() { ts += 400; API.frame(ts); }

/* ---- the two idioms ----
   Native maze px in, client px out: the canvas rect is 224x288, so client
   px are native px with the HUD's three rows above. */
const mouse = {
  name: 'mouse',
  down(x, y) { fire(screen, 'mousedown', { button: 0, clientX: x, clientY: y + 24 }); },
  move(x, y) { fire(win, 'mousemove', { clientX: x, clientY: y + 24 }); },
  up(x, y) { fire(win, 'mouseup', { button: 0, clientX: x, clientY: y + 24 }); },
};
const finger = {
  name: 'touch',
  down(x, y) { const t = touch(1, x, y + 24); fire(screen, 'touchstart', touchEvent('touchstart', [t], [t])); },
  move(x, y) { const t = touch(1, x, y + 24); fire(screen, 'touchmove', touchEvent('touchmove', [t], [t])); },
  up(x, y) { const t = touch(1, x, y + 24); fire(screen, 'touchend', touchEvent('touchend', [], [t])); },
};
const px = (c, r) => [tcx(c), tcy(r)];
function tap(P, x, y) { P.down(x, y); P.up(x, y); }
function drag(P, from, ...to) {
  P.down(from[0], from[1]);
  for (const p of to) P.move(p[0], p[1]);
  const last = to[to.length - 1];
  P.up(last[0], last[1]);
}
/* Open floor nobody stands in, and clear of the card at either of its
   docks on every glass: the right-hand end of the long row 17, in the
   band between the top of the maze and the bottom that the card never
   reaches, however tall its sentences wrap. */
const EMPTY = px(26, 17);
const at = h => [h.x, h.y];
const drill = () => game.drill;

/* game.js as text, for the checks that read the source. Line endings are
   normalised first: with core.autocrlf a Windows checkout is CRLF, and a
   header searched for with a bare \n would simply not be found -- which
   failed one check and let another pass on an empty string. */
const SRC = require('fs').readFileSync(require('path').join(__dirname, '..', 'game.js'), 'utf8')
  .replace(/\r\n/g, '\n');
// a function's body, by brace-matching from its header
function body(header) {
  const i = SRC.indexOf(header);
  if (i < 0) return null;
  let k = SRC.indexOf('{', i), depth = 0;
  for (let j = k; j < SRC.length; j++) {
    if (SRC[j] === '{') depth++;
    else if (SRC[j] === '}' && --depth === 0) return SRC.slice(k, j + 1);
  }
  return null;
}

// the UI clock starts on the first frame; start it before anything is timed on it
frames(1);
/* The spec's 300ms double-press guard, in frames, less two: late in the
   window, where a slow double-click's second press lands. A literal, so a
   guard shrunk in game.js cannot shrink the test along with it. */
const NEAR_GUARD = 300 * 60 / 1000 - 2;

console.log('\n== first-run routing ==');
{
  returning();
  API.enterAttract();
  API.setTouchMode(false);
  tap(mouse, 100, 100);
  ok('a returning player presses into READY, as always',
     game.phase === 'ready' && game.drill === null, { phase: game.phase });

  firstVisit();
  API.enterAttract();
  mouse.down(100, 100);
  ok('a first visit presses straight into the practice, live, in the same event',
     drill() && drill().step === 'freeze' && game.phase === 'play', { phase: game.phase });
  ok('and the browser is told it has started', wrote('gpOnboard', 'started'), writes);
  mouse.up(100, 100);
  frames(NEAR_GUARD);
  mouse.down(...EMPTY);
  mouse.up(...EMPTY);
  ok('a second press inside 300ms is the same click, not the first step',
     drill().step === 'freeze' && game.phase === 'play', { step: drill().step, phase: game.phase });
  frames(3);
  tap(mouse, ...EMPTY);
  ok('...and the first press after them is the lesson',
     drill().step === 'draw' && game.phase === 'command', { step: drill().step, phase: game.phase });
  API.endDrill('skipped');
  API.enterAttract();
  tap(mouse, 100, 100);
  ok('once written, the title press is a real game', game.phase === 'ready' && !game.drill);

  // storage that refuses: once per page load, then never
  returning();
  storage.getItem = () => { throw new Error('denied'); };
  storage.setItem = () => { throw new Error('denied'); };
  API.enterAttract();
  tap(mouse, 100, 100);
  const first = !!game.drill;
  API.endDrill('done');
  API.enterAttract();
  tap(mouse, 100, 100);
  ok('storage that throws still runs the practice once, and only once',
     first && game.phase === 'ready' && !game.drill, { first, phase: game.phase });

  // storage that reads but will not write: a full quota, an old private window
  firstVisit();
  storage.setItem = () => { throw new Error('QuotaExceededError'); };
  API.enterAttract();
  tap(mouse, 100, 100);
  const once = !!game.drill;
  API.endDrill('skipped');
  API.enterAttract();
  tap(mouse, 100, 100);
  ok('storage that reads but refuses the write: still once a page load, not every game',
     once && game.phase === 'ready' && !game.drill, { once, phase: game.phase });

  const T = API.TUTORIAL_PARAM;
  ok('?tutorial is the parameter, not any link that says the word',
     ['?tutorial', '?tutorial=1', '?a=b&tutorial', '?tutorial&x=1'].every(q => T.test(q))
     && !['?utm_campaign=tutorial', '?ref=yt-tutorial-video', '?tutorials', ''].some(q => T.test(q)));

  // ?tutorial, for a friend who has played before
  firstVisit();
  mem.gpOnboard = 'done';
  API.setForceDrill(true);
  API.enterAttract();
  API.fire(win, 'keydown', { code: 'Space', repeat: false, preventDefault() {} });
  ok('?tutorial starts the practice whatever the browser remembers, from the keyboard too',
     !!game.drill && game.phase === 'play' && API.forceDrill === false);
  ok('and a replay writes nothing at its start', !wrote('gpOnboard'), writes);
  API.endDrill('done');

  // a game over is not a first visit
  firstVisit();
  game.phase = 'gameover';
  tap(mouse, 100, 100);
  ok('a game-over press is never the practice', game.phase === 'ready' && !game.drill);
  returning();
}

console.log('\n== the walk ==');
function walk(P) {
  firstVisit();
  // a setting of the player's own, not whatever the last check left behind
  const orig = { limit: game.campLimit, choice: game.campChoice };
  game.campLimit = 300; game.campChoice = 2;
  const savedCamp = { limit: 300, choice: 2 };
  const score = game.score, high = game.high;
  API.setTouchMode(P === finger);
  API.enterAttract();
  tap(P, 100, 100);
  ok(P.name + ': the first press is the practice',
     drill() && drill().step === 'freeze' && game.phase === 'play');
  ok(P.name + ': the camp limit is off and no energizer is left',
     game.campLimit === null && !API.dots.some(row => row.includes(2)));
  ok(P.name + ': and his rules are level one\'s, to the letter',
     JSON.stringify(game.params) === JSON.stringify(API.levelParams(1)));
  sim(100);
  frames(3);
  settle();
  let R = game.hunters[0], M = game.hunters[1];
  ok(P.name + ': with no path, RAZE has stopped at the left wall',
     R.state === 'active' && !R.dir && !R.path && R.tile().c === 1 && R.tile().r === 11,
     { tile: R.tile(), dir: R.dir });

  tap(P, ...EMPTY);
  ok(P.name + ': a press anywhere stops time and the step turns',
     game.phase === 'command' && drill().step === 'draw' && Draw.selected === 0,
     { phase: game.phase, step: drill().step });

  drag(P, at(R), px(1, 5));
  ok(P.name + ': a drag from RAZE up column 1 is its path',
     R.path && R.path.tiles.length >= 2 && drill().step === 'go' && drill().watchIdx === 0,
     { path: R.path && R.path.tiles.length, step: drill().step });

  tap(P, ...EMPTY);
  ok(P.name + ': empty maze runs time', game.phase === 'play');
  const toDen = sim(300, () => drill().step === 'den');
  ok(P.name + ': it walks, stops at a wall, and the practice moves to the den',
     toDen >= 0 && drill().stage === 1, { toDen, step: drill().step });

  tap(P, ...EMPTY);
  ok(P.name + ': stopped again, with the pink ghost in hand',
     game.phase === 'command' && Draw.selected === 1);
  drag(P, at(M), px(12, 11), px(12, 8));
  ok(P.name + ': MIST drawn out of the den starts at the door',
     M.path && M.path.tiles[0].c === 13 && M.path.tiles[0].r === 11 && drill().denDone,
     { path: M.path && M.path.tiles });
  tap(P, ...EMPTY);
  const toTrap = sim(120, () => drill().stage === 2 && game.phase === 'command');
  ok(P.name + ': once it is out, the trap loads frozen',
     toTrap >= 0 && drill().step === 'trap', { toTrap, step: drill().step, phase: game.phase });
  // the trap is a fresh cast: resetActors, same as a new life
  R = game.hunters[0]; M = game.hunters[1];
  const E = game.evader;
  ok(P.name + ': at the pinned geometry',
     R.tile().c === 6 && R.tile().r === 4 && M.tile().c === 13 && M.tile().r === 5
     && E.tile().c === 9 && E.tile().r === 1);
  ok(P.name + ': with no energizer back, and the same rules',
     !API.dots.some(row => row.includes(2)) && JSON.stringify(game.params) === JSON.stringify(API.levelParams(1)));

  frames(2);   // the card goes down, so the presses below meet it if they would
  drag(P, at(R), px(9, 1));
  drag(P, at(M), px(9, 1));
  ok(P.name + ': both ghosts sent at him',
     R.path && M.path && R.path.tiles.length > 3 && M.path.tiles.length > 3);
  tap(P, ...EMPTY);
  ok(P.name + ': and time runs', game.phase === 'play');
  const toCatch = sim(60, () => game.phase === 'capture');
  ok(P.name + ': caught from two sides within a second',
     toCatch >= 0 && game.captureInfo.dirs >= 2, { toCatch, info: game.captureInfo });
  ok(P.name + ': PINCER on the board, and no banked number',
     game.popups.some(p => p.text === 'PINCER') && !game.popups.some(p => /^\d+$/.test(p.text)),
     game.popups.map(p => p.text));
  sim(60, () => drill().step === 'graduate');
  ok(P.name + ': the catch graduates the practice', drill().step === 'graduate' && game.phaseT === 60);
  sim(140);
  ok(P.name + ': and the board holds there, never reaching the next round',
     game.phase === 'capture' && game.phaseT === 200 && game.evaderLives === 3);

  frames(1);                      // the sheet lands
  frames(NEAR_GUARD);
  tap(P, ...EMPTY);
  ok(P.name + ': a press inside 300ms of the sheet is the tail of the catch, ignored', !!game.drill);
  frames(3);
  tap(P, ...EMPTY);
  ok(P.name + ': a press on the sheet starts a real game',
     game.drill === null && game.phase === 'ready' && wrote('gpOnboard', 'done'),
     { phase: game.phase, writes });
  ok(P.name + ': with the camp limit handed back',
     game.campLimit === savedCamp.limit && game.campChoice === savedCamp.choice);
  ok(P.name + ': nothing scored, nothing written but the one flag',
     game.score === 0 && game.high === high && !wrote('ghostProtocolHigh') && !wrote('gpCampLimit'),
     { score, writes });
  game.campLimit = orig.limit; game.campChoice = orig.choice;
  returning();
}
walk(mouse);
walk(finger);
API.setTouchMode(false);

console.log('\n== the gate ==');
{
  const { fx } = API;
  returning();
  API.startDrill();
  settle();
  tap(mouse, ...EMPTY);
  ok('draw: stopped', drill().step === 'draw');
  const was = fx.refusedAt, n = drill().refusals;
  tap(mouse, ...EMPTY);
  ok('draw: empty maze without a path is refused, the way PLAY already refuses',
     game.phase === 'command' && fx.refusedAt === API.uiClock && fx.refusedAt !== was
     && drill().refusals === n + 1);
  ok('and the card says why', drillCaptionHas('RED GHOST'), API.drillCopy());
  API.setTouchMode(true);
  ok('in the finger idiom too', drillCaptionHas('FINGER'), API.drillCopy());
  API.setTouchMode(false);
  const key = code => fire(win, 'keydown', { code, repeat: false, preventDefault() {} });
  key('Escape');
  ok('draw: Esc is refused the same way', game.phase === 'command' && drill().refusals === n + 2);
  /* The newcomer's mistake with a finger: drawing the corridor they want
     from empty maze. A mouse press there is already a refused PLAY; the
     finger's swipe is heard the same way, once for the whole gesture. */
  API.setTouchMode(true);
  drag(finger, px(6, 5), px(6, 8), px(6, 12), px(6, 16));
  ok('draw: a finger swiping empty maze is refused too, once',
     game.phase === 'command' && drill().refusals === n + 3 && !game.hunters.some(h => h.path),
     { refusals: drill().refusals - n });
  ok('and answered in the finger\'s words', API.drillCopy().caption === 'Start with your finger on the red ghost.',
     API.drillCopy());
  API.setTouchMode(false);

  // den: RAZE redrawn is not what the step asks for
  const R = game.hunters[0];
  drag(mouse, at(R), px(1, 5));
  tap(mouse, ...EMPTY);
  sim(300, () => drill().step === 'den');
  tap(mouse, ...EMPTY);
  drag(mouse, at(R), px(6, 5));
  const n2 = drill().refusals;
  tap(mouse, ...EMPTY);
  ok('den: a route for RAZE alone does not open it',
     game.phase === 'command' && drill().refusals === n2 + 1 && API.tutResumeLocked());
  ok('and the card points at the den', drillCaptionHas('PINK GHOST'), API.drillCopy());

  // trap: nothing drawn, nothing runs
  game.phase = 'play';
  API.loadTrap(false);
  const n3 = drill().refusals;
  tap(mouse, ...EMPTY);
  ok('trap: with no paths PLAY is refused', game.phase === 'command' && drill().refusals === n3 + 1);
  ok('and the card says draw first', drillCaptionHas('DRAW A PATH FIRST'), API.drillCopy());
  API.endDrill('skipped');

  // outside the practice the swipe means what it always has: nothing
  sim(300, () => game.phase === 'play');
  tap(mouse, ...EMPTY);
  const was2 = fx.refusedAt;
  API.setTouchMode(true);
  drag(finger, px(6, 5), px(6, 8), px(6, 12));
  ok('in a real game the same swipe is silent, as ever', game.phase === 'command' && fx.refusedAt === was2);
  API.setTouchMode(false);
}

console.log('\n== the gate opens once time has run ==');
{
  /* A step's lock is for "draw first". Once time has run on the route it
     asked for, freezing again to look never locks the player in. */
  returning();
  API.startDrill();
  settle();
  tap(mouse, ...EMPTY);
  const R = game.hunters[0], M = game.hunters[1];
  drag(mouse, at(R), px(1, 5));
  tap(mouse, ...EMPTY);
  sim(300, () => !R.path);
  ok('go: the route is walked before the watch is up',
     !R.path && drill().step === 'go' && drill().stopT < API.DRILL_WATCH, { stopT: drill().stopT, step: drill().step });
  tap(mouse, ...EMPTY);
  ok('go: a freeze to look is not locked in', game.phase === 'command' && !API.tutResumeLocked());
  tap(mouse, ...EMPTY);
  ok('go: ...and the next press runs time again', game.phase === 'play' && drill().step === 'go');

  sim(300, () => drill().step === 'den');
  tap(mouse, ...EMPTY);
  drag(mouse, at(M), px(12, 11), px(12, 8));
  tap(mouse, ...EMPTY);
  sim(120, () => M.state === 'active');
  ok('den: the pink ghost is out and hunting before the step is done',
     M.state === 'active' && drill().step === 'den' && drill().outT < API.DRILL_OUT,
     { state: M.state, step: drill().step, outT: drill().outT });
  tap(mouse, ...EMPTY);
  ok('den: a freeze now is not locked in, and PLAY does not wear the lock',
     game.phase === 'command' && !API.tutResumeLocked() && API.playLook() !== 'gated');
  API.endDrill('skipped');
}

console.log('\n== a route home is not the lesson ==');
{
  /* Dragging the red ghost "to the other ghosts" along row 11 walks the
     tip onto the door: a trip home. The game keeps the order -- it never
     undraws -- but the step waits for a route along a corridor, and says
     why. Drawn in the go step, the watch ends when it gets home. */
  returning();
  API.setTouchMode(false);
  API.startDrill();
  sim(100);
  settle();
  tap(mouse, ...EMPTY);
  const R = game.hunters[0];
  drag(mouse, at(R), px(14, 14));
  ok('draw: dragged toward the den, the red ghost is sent home',
     !!R.path && R.path.home, R.path && R.path.tiles.slice(-2));
  ok('draw: the order stands, but the step waits', drill().step === 'draw' && API.tutResumeLocked());
  ok('draw: and the card says what that route does',
     API.drillCopy().caption === 'That sends it home. Draw it along a corridor.' && API.drillCopy().hint, API.drillCopy());
  tap(mouse, ...EMPTY);
  ok('draw: PLAY refuses it, and the card keeps those words',
     game.phase === 'command' && API.drillCopy().caption.startsWith('That sends it home'), API.drillCopy());
  drag(mouse, at(R), px(1, 5));
  ok('draw: redrawn up a corridor, the step turns', drill().step === 'go' && !!R.path && !R.path.home);

  drag(mouse, at(R), px(14, 14));
  tap(mouse, ...EMPTY);
  const walked = sim(300, () => drill().stopT > 0);
  ok('go: sent home instead, it walks in and the card says where it went',
     walked >= 0 && R.inDenStates() && API.drillCopy().lead === 'It walked your path home to the den.', API.drillCopy());
  sim(300, () => drill().step !== 'go');
  ok('go: the watch ends once it sits, not at the time cap',
     drill().step === 'den' && drill().resumeT < API.DRILL_WATCH_MAX, { step: drill().step, resumeT: drill().resumeT });
  ok('den: and the card counts the ghosts that are really in there',
     API.drillCopy().lead === 'All 4 ghosts wait in the den. Click to stop time.', API.drillCopy());
  API.endDrill('skipped');
}
function drillCaptionHas(s) { return API.drillCopy().caption.toLowerCase().includes(s.toLowerCase()); }

console.log('\n== the trap split (pinned) ==');
{
  /* One ghost always loses and two always win: that is the lesson, and it
     is only honest while it is true. Pinned like speed-audit pins speeds,
     and to the tick: a change to his speed, his adrenaline or his brain
     moves these numbers long before it flips an outcome, and the practice
     promises his rules are the real ones. So is the card's reading of
     the board: it offers "spring the trap" exactly when the sim springs
     it, and names the one side when both ghosts come from it.
     The six seeds are insurance, not coverage. Under this much pressure
     his feint never opens, so his coin is never tossed (counted below)
     and every seed plays the same game today; they are here for the day
     an AI change brings chance into the scene. Each seed also starts at
     a different point in his food map's 20-tick refresh, the one cycle
     loadTrap does not reset. */
  const Evader = game.evader.constructor;
  const realRnd = Evader.prototype.rnd;
  let tosses = 0;
  Evader.prototype.rnd = function () { tosses++; return realRnd.call(this); };
  const run = (seed, off, orders) => {
    returning();
    game.newGame();
    API.startDrill();
    game.tick += off;
    API.loadTrap(false);
    const rules = JSON.stringify(game.params) === JSON.stringify(API.levelParams(1));
    game.evader.decisionSeed = seed;
    for (const [i, pts] of orders) {
      Draw.begin(game.hunters[i]);
      pts.forEach(p => Draw.extendToward(p[0], p[1]));
      Draw.commit(true);
    }
    const lead = API.drillCopy().lead, look = API.playLook();
    API.resumeFromCommand();
    for (let t = 0; t < 600; t++) {
      game.update();
      if (game.phase === 'capture') return { res: 'catch', t, dirs: game.captureInfo.dirs, rules, lead, look };
      if (game.drill.fails === 1) return { res: 'reload', t, kind: game.drill.failKind, phase: game.phase, rules, lead, look };
    }
    return { res: 'timeout' };
  };
  // [name, orders, outcome, tick, why, what the card said before the resume]
  const SPRING = 'spring the trap', ONE = "One ghost won't", SIDE = 'one side of him';
  const cases = [
    ['RAZE alone', [[0, [[9, 1]]]], 'reload', 148, 'one', ONE],
    ['MIST alone', [[1, [[9, 1]]]], 'reload', 75, 'one', ONE],
    ['RAZE at him, MIST off along row 5', [[0, [[9, 1]]], [1, [[16, 5]]]], 'reload', 151, 'open', ONE],
    ['RAZE to the west end, MIST off along row 5', [[0, [[6, 1]]], [1, [[16, 5]]]], 'reload', 147, 'open', ONE],
    ['both from the west, up column 6', [[0, [[9, 1]]], [1, [[6, 5], [6, 1], [9, 1]]]], 'reload', 143, 'open', SIDE],
    ['both straight at him', [[0, [[9, 1]]], [1, [[9, 1]]]], 'catch', 27, null, SPRING],
    ['both to the corridor ends', [[0, [[6, 1]]], [1, [[12, 5], [12, 1]]]], 'catch', 27, null, SPRING],
    ['both a tile short', [[0, [[6, 2]]], [1, [[12, 5], [12, 2]]]], 'catch', 27, null, SPRING],
    ['RAZE to the west end, MIST straight at him', [[0, [[6, 1]]], [1, [[9, 1]]]], 'catch', 27, null, SPRING],
  ];
  const seeds = [1, 99, 12345, 777, 4242, 31337];
  try {
    for (const [name, orders, res, t, kind, said] of cases) {
      const rs = seeds.map((s, k) => run(s, (k * 7) % 20, orders));
      // PLAY breathes green for a trap that will spring, and only for one
      const honest = rs.every(r => r.rules && r.lead.includes(said) && r.look === (res === 'catch' ? 'go' : 'play'));
      if (res === 'reload') {
        ok(name + ': he gets away, and at tick ' + t + ' the trap reloads frozen with the reason (6/6)',
           rs.every(r => r.res === 'reload' && r.t === t && r.kind === kind && r.phase === 'command') && honest, rs);
      } else {
        ok(name + ': caught from two sides at tick ' + t + ' (6/6)',
           rs.every(r => r.res === 'catch' && r.t === t && r.dirs === 2) && honest, rs);
      }
    }
  } finally { Evader.prototype.rnd = realRnd; }
  ok('his coin was tossed ' + tosses + ' times across the split', true);
  API.endDrill('skipped');
}

console.log('\n== a miss, stopped to watch ==');
{
  /* He slips out and the scene holds a moment so the player sees it. A
     newcomer's reflex is to stop time right there, and to start it again:
     neither may re-judge the miss. */
  returning();
  API.setTouchMode(false);
  API.startDrill();
  API.loadTrap(false);
  settle();
  let [R, M] = game.hunters;
  drag(mouse, at(R), px(9, 1));
  drag(mouse, at(M), px(16, 5));
  tap(mouse, ...EMPTY);
  sim(300, () => drill().failKind !== null);
  sim(10);
  tap(mouse, ...EMPTY);
  ok('open: stopped mid-hold, the card has the verdict',
     game.phase === 'command' && API.drillCopy().lead === 'He slipped out an open end.', API.drillCopy());
  tap(mouse, ...EMPTY);
  ok('open: started again, the hold carries on where it was',
     game.phase === 'play' && drill().failKind === 'open' && drill().failHoldT >= 10, { hold: drill().failHoldT });
  sim(100, () => drill().fails === 1);
  ok('open: and it reloads with that verdict, not another',
     drill().fails === 1 && drill().failKind === 'open' && game.phase === 'command', { kind: drill().failKind });

  // one ghost sent; a second drawn during the hold does not rewrite what happened
  [R, M] = game.hunters;
  drag(mouse, at(M), px(9, 1));
  tap(mouse, ...EMPTY);
  sim(300, () => drill().failKind !== null && drill().fails === 1);
  tap(mouse, ...EMPTY);
  drag(mouse, at(R), px(6, 1));
  tap(mouse, ...EMPTY);
  sim(100, () => drill().fails === 2);
  ok('one: a ghost added mid-hold, and it still reloads as one ghost',
     drill().fails === 2 && drill().failKind === 'one', { kind: drill().failKind, fails: drill().fails });

  // and the run after a reload is judged afresh: two from both sides, caught
  [R, M] = game.hunters;
  drag(mouse, at(R), px(9, 1));
  drag(mouse, at(M), px(9, 1));
  tap(mouse, ...EMPTY);
  ok('the next run starts clean', drill().failKind === null && drill().ordersAtResume === 2);
  const t = sim(60, () => game.phase === 'capture');
  ok('and a real trap still springs', t >= 0 && game.captureInfo.dirs === 2, { t });
  API.endDrill('skipped');
}

console.log('\n== out of the practice, the siren starts fresh ==');
{
  /* A stand-in for the page's audio, just enough to hear what the siren
     is doing: its oscillator, its level, its pitch. */
  const { Sound } = API;
  const param = () => ({ value: 0, setValueAtTime(v) { this.value = v; }, linearRampToValueAtTime(v) { this.value = v; },
    cancelScheduledValues() {}, exponentialRampToValueAtTime(v) { this.value = v; } });
  const real = { ctx: Sound.ctx, master: Sound.master };
  Sound.ctx = { currentTime: 0, sampleRate: 44100, state: 'running', resume() {},
    createOscillator: () => ({ frequency: param(), detune: param(), connect() {}, start() {}, stop() { this.stopped = true; } }),
    createGain: () => ({ gain: param(), connect() {} }),
    createBuffer: () => ({ getChannelData: () => new Float32Array(16) }),
    createBufferSource: () => ({ buffer: null, connect() {}, start() {} }) };
  Sound.master = { connect() {} };
  try {
    for (const [name, frozen] of [['in live play', false], ['with time stopped', true]]) {
      returning();
      API.startDrill();
      sim(60);
      if (frozen) API.pauseToCommand({ x: 10, y: 10 });   // the siren sags on the tape-stop
      const old = Sound.siren;
      API.endDrill('skipped');
      ok('SKIP ' + name + ': READY plays its jingle over no siren',
         game.phase === 'ready' && !Sound.sirenOn && !!old && old.stopped);
      sim(400, () => game.phase === 'play');
      ok('SKIP ' + name + ': and the round starts a fresh one, in tune and audible',
         game.phase === 'play' && Sound.sirenOn && Sound.siren !== old
         && Sound.siren.detune.value === 0 && Sound.sirenGain.gain.value === 0.035,
         { on: Sound.sirenOn, detune: Sound.siren && Sound.siren.detune.value, gain: Sound.sirenGain && Sound.sirenGain.gain.value });
      game.newGame();
    }
  } finally {
    Sound.stopSiren();
    Sound.sirenGain = null;
    Sound.ctx = real.ctx; Sound.master = real.master;
  }
}

console.log('\n== out of order ==');
{
  returning();
  API.startDrill();
  settle();
  tap(mouse, ...EMPTY);
  const M = game.hunters[1];
  drag(mouse, at(M), px(12, 11), px(12, 8));
  ok('the den ghost drawn first counts for the den', drill().denDone && drill().step === 'go');
  tap(mouse, ...EMPTY);
  const t = sim(300, () => drill().stage === 2);
  ok('so the watch goes straight to the trap, no den step',
     t >= 0 && drill().step === 'trap' && game.phase === 'command', { t, step: drill().step });
  API.endDrill('skipped');

  // grabbing RAZE mid-play is the freeze and the drag in one gesture
  API.startDrill();
  sim(100);
  settle();
  const R = game.hunters[0];
  drag(mouse, at(R), px(1, 5));
  ok('a ghost grabbed in live play lands straight on "go"',
     drill().step === 'go' && R.path && game.phase === 'command', { step: drill().step });
  API.endDrill('skipped');

  // a lucky lone catch in scene one graduates rather than hanging
  API.startDrill();
  sim(100);
  settle();
  tap(mouse, ...EMPTY);
  drag(mouse, at(game.hunters[0]), px(1, 5));
  // he blunders into it: whatever the AI would have done, a touch is a catch
  const E = game.evader, H = game.hunters[0];
  E.x = H.x; E.y = H.y - 3; E.dir = 'down';
  tap(mouse, ...EMPTY);
  sim(120, () => game.phase === 'capture');
  sim(80);
  ok('a lucky catch in scene one graduates, never hangs',
     game.phase === 'capture' && drill().step === 'graduate');
  API.endDrill('done');
}

console.log('\n== the manual during practice ==');
{
  returning();
  API.startDrill();
  settle();
  API.render();
  const b = API.helpUI.btn, S = API.scale;
  fire(screen, 'mousedown', { button: 0, clientX: (b.x + b.w / 2) / S, clientY: (b.y + b.h / 2) / S });
  fire(win, 'mouseup', { button: 0, clientX: (b.x + b.w / 2) / S, clientY: (b.y + b.h / 2) / S });
  ok('the ? chip freezes the practice without counting as the lesson',
     game.helpOpen && game.phase === 'command' && drill().step === 'freeze');
  API.closeHelp();
  API.drillCheck();
  ok('closing it lands on the next step', drill().step === 'draw');
  API.endDrill('skipped');

  // the manual opened during READY holds the count
  game.newGame();
  API.openHelp();
  const t0 = game.phaseT;
  frames(300);
  ok('READY waits for a reader', game.phase === 'ready' && game.phaseT === t0, { phaseT: game.phaseT });
  API.closeHelp();
}

console.log('\n== SKIP ==');
{
  const S = () => API.scale;
  const pressSkip = () => {
    API.render();
    const r = API.coachUI.skip;
    if (!r) return false;
    const x = (r.x + r.w / 2) / S(), y = (r.y + r.h / 2) / S();
    fire(screen, 'mousedown', { button: 0, clientX: x, clientY: y });
    fire(win, 'mouseup', { button: 0, clientX: x, clientY: y });
    return true;
  };
  const steps = {
    freeze: () => {},
    draw: () => tap(mouse, ...EMPTY),
    go: () => { tap(mouse, ...EMPTY); drag(mouse, at(game.hunters[0]), px(1, 5)); },
    den: () => { tap(mouse, ...EMPTY); drag(mouse, at(game.hunters[0]), px(1, 5)); tap(mouse, ...EMPTY);
                 sim(300, () => drill().step === 'den'); },
    trap: () => { API.loadTrap(false); },
    failing: () => { API.loadTrap(false); drag(mouse, at(game.hunters[1]), px(9, 1)); tap(mouse, ...EMPTY);
                     sim(200, () => drill().failKind !== null); },
  };
  for (const [name, reach] of Object.entries(steps)) {
    firstVisit();
    game.campLimit = 300; game.campChoice = 2;
    API.enterAttract();
    tap(mouse, 100, 100);
    sim(100);
    settle();
    reach();
    const where = drill() && (drill().failKind ? 'failing' : drill().step);
    const pressed = pressSkip();
    ok('SKIP from ' + name + ' is a real game, with the settings put back',
       pressed && where === name && game.drill === null && game.phase === 'ready'
       && wrote('gpOnboard', 'skipped') && game.campLimit === 300 && game.campChoice === 2,
       { pressed, where, phase: game.phase, camp: game.campLimit });
  }
  returning();

  // the rest of the card is glass: frozen, it never resumes
  API.startDrill();
  settle();
  tap(mouse, ...EMPTY);
  drag(mouse, at(game.hunters[0]), px(1, 5));
  API.render();
  const c = API.coachUI.card;
  const cx = (c.x + c.w * 0.3) / S(), cy = (c.y + c.h * 0.7) / S();
  fire(screen, 'mousedown', { button: 0, clientX: cx, clientY: cy });
  fire(win, 'mouseup', { button: 0, clientX: cx, clientY: cy });
  ok('a press on the card while frozen is swallowed', game.phase === 'command' && !!game.drill);
  API.endDrill('skipped');
}

console.log('\n== nothing leaks ==');
{
  // while it runs, the practice's own rules hold: no prize, no escape
  returning();
  API.startDrill();
  sim(30);
  game.dotsEaten = 69;
  sim(300, () => game.dotsEaten >= 70);   // the prize is due on the tick the 70th goes
  sim(2);
  ok('in the practice, 70 dots brings no prize', game.dotsEaten >= 70 && game.fruit === null && game.phase === 'play',
     { eaten: game.dotsEaten, fruit: !!game.fruit });
  game.dotsEaten = API.dotTotal;
  game.update();
  ok('...and a cleared board is no escape', game.phase === 'play' && !!game.drill);
  API.endDrill('skipped');

  const score0 = game.score, high0 = game.high;
  for (const how of ['done', 'skipped']) {
    returning();
    API.startDrill();
    sim(200);
    API.endDrill(how);
    const dots = API.dots;
    let en = 0;
    for (const row of dots) for (const v of row) if (v === 2) en++;
    ok('after ' + how + ': the four energizers are back', en === 4, { en });
    ok('after ' + how + ': no practice object, a real READY', game.drill === null && game.phase === 'ready');
    sim(300, () => game.phase === 'play');
    game.dotsEaten = 69;
    game.evader.x = tcx(1); game.evader.y = tcy(1); game.evader.dir = 'right';
    game.hunters.forEach(h => { h.state = 'active'; h.x = tcx(26); h.y = tcy(29); h.dir = null; h.path = null; });
    sim(40, () => !!game.fruit);
    ok('after ' + how + ': the prize spawns at 70 dots', !!game.fruit, { eaten: game.dotsEaten });
    game.dotsEaten = API.dotTotal;
    game.update();
    ok('after ' + how + ': a cleared board escapes', game.phase === 'escaped');
    game.newGame();
    sim(300, () => game.phase === 'play');
    const E = game.evader, H = game.hunters[0];
    H.state = 'active'; H.x = E.x; H.y = E.y;
    game.checkCollisions();
    sim(81);
    ok('after ' + how + ': a capture spends a life and banks a score',
       game.evaderLives === 2 && game.score > 0, { lives: game.evaderLives, score: game.score });
  }
  void score0; void high0;
}

console.log('\n== no autopilot ==');
{
  /* The game never draws for the player. Every order that lands in the
     walk lands inside a Draw.commit that input made -- a press, a lift,
     or a resume -- and no route is ever in hand without a pointer down. */
  const Hunter = game.hunters[0].constructor;
  const realSet = Hunter.prototype.setOrder, realCommit = Draw.commit, realBegin = Draw.begin;
  let inCommit = 0, inEvent = 0, strays = 0, begins = 0, beginsOutside = 0, heldIdle = 0;
  Hunter.prototype.setOrder = function (...a) { if (!inCommit) strays++; return realSet.apply(this, a); };
  Draw.commit = function (...a) { inCommit++; try { if (!inEvent) strays++; return realCommit.apply(this, a); } finally { inCommit--; } };
  Draw.begin = function (...a) { begins++; if (!inEvent) beginsOutside++; return realBegin.apply(this, a); };
  const realFire = API.fire;
  const evFire = (t, type, ev) => { inEvent++; try { realFire(t, type, ev); } finally { inEvent--; } };
  const P = {
    down: (x, y) => evFire(screen, 'mousedown', { button: 0, clientX: x, clientY: y + 24 }),
    move: (x, y) => evFire(win, 'mousemove', { clientX: x, clientY: y + 24 }),
    up: (x, y) => evFire(win, 'mouseup', { button: 0, clientX: x, clientY: y + 24 }),
  };
  /* ...counted, so the spies are provably watching while the fingertip
     and the ripple are drawn, not merely while nothing is. */
  let demoFrames = 0, rippleFrames = 0;
  const idle = (n) => {
    for (let i = 0; i < n; i++) {
      frames(1);
      const s = API.coachScene();
      if (s.demo) demoFrames++;
      if (s.ripple >= 0) rippleFrames++;
      if (!API.input.leftDown && API.input.touchId === null && Draw.active) heldIdle++;
    }
  };
  returning();
  API.setTouchMode(false);
  API.startDrill();
  sim(100);                                    // RAZE out at his wall, as a player finds him
  idle(API.COACH_RIPPLE + 150);                // scene one, untouched: the ripple
  tap(P, ...EMPTY);
  idle(API.COACH_SHOW + 150);                  // frozen at 'draw', untouched: the fingertip
  let R = game.hunters[0], M = game.hunters[1];
  drag(P, at(R), px(1, 5));
  tap(P, ...EMPTY);
  idle(300);
  tap(P, ...EMPTY);
  idle(API.COACH_SHOW + 150);                  // frozen at 'den', untouched: the fingertip again
  drag(P, at(M), px(12, 11), px(12, 8));
  tap(P, ...EMPTY);
  idle(200);
  idle(150);                                   // the trap, frozen and untouched
  R = game.hunters[0]; M = game.hunters[1];
  drag(P, at(M), px(9, 1));                    // one ghost: a miss
  tap(P, ...EMPTY);
  idle(300);
  idle(API.COACH_SHOW + 150);                  // after the miss, the two strokes
  drill().fails = 3;
  idle(200);                                   // three misses: shown straight away
  R = game.hunters[0]; M = game.hunters[1];
  drag(P, at(R), px(9, 1));
  drag(P, at(M), px(9, 1));
  tap(P, ...EMPTY);
  idle(200);
  Hunter.prototype.setOrder = realSet; Draw.commit = realCommit; Draw.begin = realBegin;
  ok('the walk reached graduation', game.drill && game.drill.step === 'graduate', drill() && drill().step);
  ok('with the fingertip and the ripple on the glass for much of it',
     demoFrames > 300 && rippleFrames > 100, { demoFrames, rippleFrames });
  ok('every order came from a commit the player made', strays === 0, { strays });
  ok('every route was begun by a press', begins > 0 && beginsOutside === 0, { begins, beginsOutside });
  ok('no route is ever in hand without a pointer down', heldIdle === 0, { heldIdle });
  API.endDrill('done');
}

console.log('\n== the spine ==');
{
  const clean = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    .replace(/fx\.skipEnter\s*=\s*true/g, '');
  /* Presentation state by name, and every helper that reads it on the
     sim's behalf -- a read through coachIdle is still a read of uiClock. */
  const forbidden = ['coachFx', 'uiClock', 'fx.', 'reducedMotion', 'coachIdle', 'coachScene', 'coachStall',
    'coachNotice', 'coachNeedsRoute', 'coachReady', 'drillCopy', 'playLook', 'tipTick', 'g1Wanted',
    'trapSides', 'drillRefuse'];
  for (const [name, header] of [['game.update', '  update() {\n    this.tick++;'],
                                ['drillTick', 'function drillTick('], ['loadTrap', 'function loadTrap('],
                                ['drillCheck', 'function drillCheck('],
                                ['tutResumeLocked', 'function tutResumeLocked('],
                                ['drillDenOrdered', 'function drillDenOrdered('],
                                ['drillLaneRouted', 'function drillLaneRouted(']]) {
    const b = body(header);
    const bad = b === null ? ['missing'] : forbidden.filter(w => new RegExp('\\b' + w.replace('.', '\\.')).test(clean(b)));
    ok(name + ' never reads presentation state', bad.length === 0, bad);
  }

  /* And by behaviour: the same scene twice, once with the coach's clocks
     run half a minute ahead of it on every tick. Nothing may differ. */
  const twin = (aged) => {
    returning();
    game.tick = 0;
    API.startDrill();
    game.evader.decisionSeed = 4242;   // out in the open he does toss his coin
    for (let i = 0; i < 700; i++) {
      if (aged) age(API.COACH_SKIP + 600);
      if (game.phase === 'play') game.update();
      API.drillCheck();
    }
    return JSON.stringify({ phase: game.phase, step: drill().step, stopT: drill().stopT, eaten: game.dotsEaten,
      pos: game.hunters.map(h => [h.x, h.y, h.state]), ev: [game.evader.x, game.evader.y] });
  };
  const plain = twin(false), aged = twin(true);
  ok('twelve seconds of scene one play out the same, however stuck the coach thinks the player is',
     plain === aged && JSON.parse(plain).phase === 'play', { plain, aged });
  API.endDrill('skipped');

  ok('the gesture thresholds are untouched',
     API.TAP_SLOP === 6 && API.TAP_SLOP_TOUCH === 12 && API.TAP_MS === 250 && API.TAP_TRAVEL === 24);
  // ...and so are the pads around the controls, and how far a press reaches for a ghost
  const S = API.scale;
  API.setTouchMode(true);
  const pad = JSON.stringify(API.tapPad(1, 2, 3, 4));
  API.setTouchMode(false);
  ok('tapPad is a finger\'s alone, a scale per unit',
     pad === JSON.stringify({ t: S, r: 2 * S, b: 3 * S, l: 4 * S }) && API.tapPad(1, 2, 3, 4) === null, pad);
  returning();
  API.startDrill();
  sim(100);
  settle();
  tap(mouse, ...EMPTY);
  const R = game.hunters[0];
  drag(mouse, at(R), px(1, 5));
  const grabs = (d) => Draw.poolAt(R.x + d, R.y).some(n => n.h === R);
  const tips = (d) => Draw.tipAt(game, tcx(1) + d, tcy(5)) === R;
  API.setTouchMode(true);
  const finger18 = grabs(17.9) && !grabs(18), fingerTip = tips(13.9) && !tips(14);
  API.setTouchMode(false);
  const mouse12 = grabs(11.9) && !grabs(12), mouseTip = tips(7.9) && !tips(8);
  ok('pick reach is 12px for a cursor and 18 for a finger; an arrowhead 8 and 14',
     finger18 && mouse12 && fingerTip && mouseTip, { finger18, mouse12, fingerTip, mouseTip });
  API.endDrill('skipped');
}

console.log('\n== copy speaks the live idiom ==');
{
  /* Every step and state the card can be in, in both idioms: a finger
     never reads CLICK, a mouse never reads TAP or FINGER. */
  returning();
  const seen = { mouse: [], touch: [] };
  const look = () => {
    for (const t of [false, true]) {
      API.setTouchMode(t);
      const c = API.drillCopy();
      seen[t ? 'touch' : 'mouse'].push(Object.values(c).filter(v => typeof v === 'string').join(' | '));
    }
    API.setTouchMode(false);
  };
  API.startDrill();
  look();
  settle();
  tap(mouse, ...EMPTY); look();
  tap(mouse, ...EMPTY); look();                       // refused
  drag(mouse, at(game.hunters[0]), px(1, 5)); look();
  tap(mouse, ...EMPTY); sim(10); look();
  sim(300, () => drill().stopT > 0); look();
  sim(300, () => drill().step === 'den'); look();
  tap(mouse, ...EMPTY); look();
  tap(mouse, ...EMPTY); look();                       // refused
  drag(mouse, at(game.hunters[1]), px(12, 11), px(12, 8)); look();
  tap(mouse, ...EMPTY); sim(5); look();
  sim(120, () => drill().stage === 2); look();
  tap(mouse, ...EMPTY); look();                       // refused
  drag(mouse, at(game.hunters[1]), px(9, 1)); look();
  tap(mouse, ...EMPTY); sim(5); look();
  sim(200, () => drill().fails === 1); look();
  drag(mouse, at(game.hunters[0]), px(9, 1)); drag(mouse, at(game.hunters[1]), px(9, 1)); look();
  game.drill.failKind = 'open'; game.hunters.forEach(h => { h.path = null; }); look();
  game.drill.step = 'graduate'; look();
  const badTouch = seen.touch.filter(s => /click/i.test(s));
  const badMouse = seen.mouse.filter(s => /\btap\b|finger/i.test(s));
  ok('touch copy never says CLICK (' + seen.touch.length + ' states)', badTouch.length === 0, badTouch);
  ok('mouse copy never says TAP or FINGER', badMouse.length === 0, badMouse);
  ok('every state has a lead', seen.mouse.every(s => s.split(' | ')[0].length > 0), seen.mouse);
  /* A sentence wraps before it shortens, but anything over thirty letters
     still carries a short form for a glass narrower than any the tests
     know, and the short form keeps its own idiom, whatever its case. */
  const lines = new Set();
  for (const k of ['mouse', 'touch']) for (const s of seen[k]) for (const l of s.split(' | ')) if (l) lines.add(l);
  const long = [...lines].filter(l => l.length > 30 && !API.COACH_SHORT[l]);
  ok('every long line has a short form (' + lines.size + ' lines)', long.length === 0, long);
  const shortBad = Object.entries(API.COACH_SHORT).filter(([k, v]) => [].concat(v).some(t =>
    (/click/i.test(t) && !/click/i.test(k)) || (/\btap\b|finger/i.test(t) && !/\btap\b|finger/i.test(k))));
  ok('no short form borrows the other idiom\'s verb', shortBad.length === 0, shortBad);
  API.endDrill('skipped');
}

console.log('\n== the first seconds of a real round ==');
{
  returning();
  API.setTipBits(API.TIP.freeze);   // a player who has stopped time before: no first-game toast
  API.startDemo();
  for (let i = 0; i < 1400; i++) { game.phase = 'play'; game.update(); game.phase = 'attract'; }
  game.newGame();
  sim(400, () => game.phase === 'play');
  ok('GRAB A GHOST shows after the attract demo has run a long while', API.hintWindowOpen(),
     { tick: game.tick, t0: game.playTick0 });
  sim(960);
  game.phase = 'play';
  ok('and closes on the round\'s own clock', !API.hintWindowOpen());
  API.startDrill();
  ok('never during the practice', !API.hintWindowOpen());
  API.endDrill('skipped');
}

console.log('\n== the glass renders every step ==');
{
  returning();
  let threw = null;
  const draw = () => { try { API.render(); } catch (e) { threw = threw || e.message; } };
  API.startDrill(); draw();
  settle(); tap(mouse, ...EMPTY); draw();
  drag(mouse, at(game.hunters[0]), px(1, 5)); draw();
  tap(mouse, ...EMPTY); draw();
  game.phase = 'play'; API.loadTrap(false); draw();
  game.drill.step = 'graduate'; game.phase = 'capture'; draw();
  ok('card and sheet draw without throwing', threw === null, { threw });
  ok('the sheet leaves the card off the glass', API.coachUI.card === null && API.coachUI.play !== null);
  API.endDrill('done');
  draw();
  ok('and a real game has no card at all', API.coachUI.card === null && API.coachUI.skip === null);
}

/* ---- the coach's clocks ----
   Every stuck rung counts uiClock from the step, the last press and the
   last freeze or thaw. Pushing all of those back is "the player has sat
   here this long" without driving thousands of frames -- and without a
   single tick of the sim, which is the point: none of it may move the
   game. The card is read first, so the step's own stamp is already down. */
function age(n) {
  const c = API.coachFx, f = API.fx;
  API.drillCopy();
  c.stepAt -= n; c.pressAt -= n; c.tapAt -= n; c.failAt -= n;
  f.enterAt -= n; f.thawAt -= n; f.refusedAt -= n;
}
const scene = () => API.coachScene();
const copy = () => API.drillCopy();
/* The card as drawn this frame, read off a context that keeps its alpha
   honestly through save and restore: the strength of the plate, of each
   line of the lead and of the caption, and whether the caption was set
   in ink. Drawing it is also what docks it, so the rects follow. */
function cardAlpha() {
  let st = { globalAlpha: 1, fillStyle: '' };
  const stack = [], out = { plate: null, lead: [], cap: [], capInk: false };
  const c = copy();
  const ctx = new Proxy({
    save() { stack.push(Object.assign({}, st)); },
    restore() { if (stack.length) st = stack.pop(); },
    measureText: () => ({ width: 0 }),
    createRadialGradient: () => ({ addColorStop() {} }),
    fill() { if (st.fillStyle === API.TOKENS.glass && out.plate === null) out.plate = st.globalAlpha; },
    fillText(t) {
      if (c.lead.includes(t)) out.lead.push(st.globalAlpha);
      else if (c.caption && c.caption.includes(t)) {
        out.cap.push(st.globalAlpha);
        out.capInk = st.fillStyle === API.TOKENS.ink;
      }
    },
  }, {
    get(t, k) { return k in t ? t[k] : k in st ? st[k] : () => {}; },
    set(t, k, v) { st[k] = v; return true; },
  });
  API.drawCoachLayer(ctx);
  return out;
}

console.log('\n== the stuck ladder ==');
{
  const { coachFx } = API;
  returning();
  API.setTouchMode(false);
  API.startDrill();
  sim(100);   // RAZE walks out and stands at the left wall, as in the walk
  settle();
  ok('freeze: a fresh practice is quiet',
     scene().ripple < 0 && !scene().skipLit && copy().lead === 'Time is running.'
     && copy().caption === 'Click anywhere to stop it.' && !copy().hint, copy());
  age(API.COACH_RIPPLE);
  ok('freeze: 4s untouched and the maze pulses, the lead with it', scene().ripple >= 0 && scene().breathe);
  ok('freeze: ...while the words wait', !copy().hint);
  age(API.COACH_ANYWHERE - API.COACH_RIPPLE);
  ok('freeze: 10s and the caption says where', copy().caption === 'Anywhere on the maze works.' && copy().hint, copy());
  age(API.COACH_SKIP - API.COACH_ANYWHERE);
  ok('freeze: 20s and SKIP lights', scene().skipLit);
  // (that none of it can move the game once ticks run is the spine's twin-run check)
  ok('freeze: and none of it touched the game', game.phase === 'play' && drill().step === 'freeze');
  tap(mouse, ...EMPTY);
  ok('freeze: the press ends all of it',
     drill().step === 'draw' && scene().ripple < 0 && !scene().skipLit && !copy().hint);

  const R = game.hunters[0];
  ok('draw: the ring is on the red ghost, and only there',
     scene().rings.length === 1 && scene().rings[0].h === R && !scene().rings[0].thin);
  ok('draw: PLAY wears the lock', API.playLook() === 'gated');
  ok('draw: no fingertip yet', scene().demo === null);
  age(API.COACH_SHOW);
  const demo = scene().demo;
  ok('draw: 5s frozen and untouched, a fingertip shows the gesture from RAZE',
     demo && demo.length === 1 && demo[0][0].x === R.x && demo[0][0].y === R.y, demo);
  ok('draw: along a real corridor, five tiles up the left',
     demo && demo[0].length === 6 && demo[0].slice(1).every(p =>
       API.isOpen(Math.floor(p.x / 8), Math.floor(p.y / 8)) && Math.floor(p.x / 8) === 1), demo);
  API.input.leftDown = true;
  ok('draw: any pointer down and it is gone', scene().demo === null);
  API.input.leftDown = false;
  API.input.touchId = 1;
  ok('draw: a finger resting on the glass, too', scene().demo === null);
  API.input.touchId = null;
  API.input.rightDown = true;
  ok('draw: or the right button', scene().demo === null);
  API.input.rightDown = false;
  ok('draw: and back when they let go', scene().demo !== null);
  ok('draw: and it drew nothing', !R.path && !Draw.active);
  mouse.down(...at(R));
  ok('draw: a ghost in hand takes the fingertip away, and the ring with it',
     scene().demo === null && scene().rings.length === 0);
  mouse.up(...at(R));
  ok('draw: a tap on the ghost is answered: hold and drag',
     copy().caption === 'Hold the button down and drag before you let go.' && copy().hint && drill().taps === 1, copy());
  API.setTouchMode(true);
  ok('draw: ...in the finger idiom too', copy().caption === 'Keep your finger down and drag before you lift it.');
  API.setTouchMode(false);
  tap(mouse, ...EMPTY);
  ok('draw: a refusal after the tap is the newer news', copy().caption === 'Start the drag on the red ghost.', copy());
  tap(mouse, ...EMPTY);
  tap(mouse, ...EMPTY);
  ok('draw: three refusals and SKIP lights', drill().refusals >= 3 && scene().skipLit);
  age(API.REFUSAL_SHOWN);
  ok('draw: the reason goes after 3s', !copy().hint && copy().caption.startsWith('It walks'), copy());

  // a drag going nowhere: right along row 11 is all the corridor there is
  API.reducedMotionMQ.matches = true;   // every spring home, so the card can be read on one frame
  mouse.down(...at(R));
  mouse.move(...px(4, 8));
  const tip = Draw.active && Draw.active.tiles[Draw.active.tiles.length - 1];
  ok('draw: the tip goes as far as the corridor allows', tip && tip.c === 4 && tip.r === 11, tip);
  const held = cardAlpha();
  ok('draw: the card stays at full strength while a route is being drawn',
     held.lead.length > 0 && held.lead.every(a => a === 1) && held.plate === 1, held);
  ok('draw: ...and holds its place (SKIP never slips away)', !!API.coachUI.skip && !!API.coachUI.card);
  frames(API.COACH_STALL + 2);   // frozen: only the clock moves
  ok('draw: a tip that will not follow is a lesson in corridors',
     copy().caption === 'Paths follow the corridors. Trace along one.', copy());
  const told = cardAlpha();
  ok('draw: ...said at full strength, in ink', told.cap.length > 0 && told.cap.every(a => a === 1)
     && told.capInk, told);
  API.reducedMotionMQ.matches = false;
  mouse.move(...px(1, 5));
  mouse.up(...px(1, 5));
  ok('draw: released, it is a route, and the step turns', drill().step === 'go' && !!R.path);

  ok('go: PLAY is unlocked and breathing green', API.playLook() === 'go');
  ok('go: nothing is ringed at first', !scene().ringPlay);
  age(API.COACH_SHOW);
  ok('go: 5s frozen, a ring on ▶ and the caption says where it is',
     scene().ringPlay && copy().caption === '▶ is at the bottom right.', copy());

  /* The route erased before time ever ran: PLAY is shut again, so the
     card goes back to the draw step's words and ring -- never "click
     empty maze, or ▶" over a PLAY that will say no. */
  fire(screen, 'mousedown', { button: 2, clientX: R.x, clientY: R.y + 24 });
  fire(win, 'mouseup', { button: 2, clientX: R.x, clientY: R.y + 24 });
  age(API.COACH_SHOW);
  const erased = copy();
  ok('go: its route erased before it ran, PLAY is locked again', !R.path && API.playLook() === 'gated');
  ok('go: ...and the card asks for the drag again, not for ▶',
     erased.lead === 'Press on the red ghost and drag a path.' && !/▶|empty maze/i.test(erased.lead + ' ' + erased.caption)
     && !scene().ringPlay && scene().rings.length === 1 && scene().rings[0].h === R, { erased, scene: scene() });
  API.setTouchMode(true);
  ok('go: ...in the finger idiom too', copy().lead === 'Put a finger on the red ghost and drag a path.');
  API.setTouchMode(false);
  tap(mouse, ...EMPTY);
  ok('go: a refused PLAY there agrees with the lead', copy().caption === 'Start the drag on the red ghost.', copy());
  frames(1);   // the newer of the two is the one said, so not on the refusal's own frame
  mouse.down(...at(R)); mouse.up(...at(R));
  ok('go: ...and a tap on the ghost is answered as the draw step answers it',
     copy().caption === 'Hold the button down and drag before you let go.', copy());
  mouse.down(...at(R)); mouse.move(...px(4, 8)); mouse.move(...px(1, 5)); mouse.up(...px(1, 5));
  ok('go: redrawn, PLAY is open and the card is back on ▶',
     drill().step === 'go' && !!R.path && API.playLook() === 'go' && /empty maze, or ▶/.test(copy().lead), copy());

  tap(mouse, ...EMPTY);
  sim(5);
  ok('go: live, a thin ring follows the ghost it is watching',
     scene().rings.length === 1 && scene().rings[0].h === R && scene().rings[0].thin);
  sim(300, () => drill().stopT > 0);
  /* It coasted off the end of its route to the wall, and scene one showed
     RAZE walking out of the den unbidden: the card says what is true of a
     ghost without a path -- it waits -- not that it never moves. */
  const stopped = copy();
  ok('go: stopped, the card says it waits, and never that ghosts do not move',
     stopped.lead === 'Path done, so it stopped at a wall.'
     && stopped.caption === 'Without a path, a ghost waits where it stops.'
     && ![stopped.caption].concat(API.COACH_SHORT[stopped.caption] || []).some(s => /never move|no move/i.test(s)),
     stopped);
  sim(300, () => drill().step === 'den');

  ok('den: live, the den is bracketed', scene().bracket && scene().ripple < 0);
  age(API.COACH_DEN_LIVE);
  ok('den: 6s without a freeze and the pulse comes back', scene().ripple >= 0);
  tap(mouse, ...EMPTY);
  const M = game.hunters[1];
  ok('den: frozen, the ring is on the pink ghost and the chevron on the door',
     scene().rings.length === 1 && scene().rings[0].h === M && scene().chevron && !scene().bracket);
  ok('den: PLAY is locked', API.playLook() === 'gated');
  age(API.COACH_SHOW);
  const dd = scene().demo && scene().demo[0];
  const end = dd && dd[dd.length - 1];
  ok('den: 5s idle, the fingertip goes up through the door, a step left, and on up',
     dd && dd[0].x === M.x && dd.some(p => p.x === API.DEN_EXIT_X && p.y === tcy(11))
     && end.x === tcx(12) && end.y === tcy(8), dd);
  const n = API.neighborsOf(R.tile().c, R.tile().r)[0];
  drag(mouse, at(R), px(n.c, n.r));
  ok('den: a route for the red ghost again is gently turned',
     !!R.path && copy().caption === 'The red ghost has its path. Now the pink one.' && copy().hint, copy());
  mouse.down(...at(M));
  mouse.move(...px(13, 8));
  frames(API.COACH_STALL + 2);
  const door = Draw.active && Draw.active.tiles[Draw.active.tiles.length - 1];
  ok('den: straight up sits on the door, and the card says which way',
     door && door.r === 11 && (door.c === 13 || door.c === 14)
     && copy().caption === 'Go left or right along the top of the den first.', { door, copy: copy() });
  ok('den: the chevron stays while the den ghost is in hand', scene().chevron);
  mouse.move(...px(12, 11));
  mouse.move(...px(12, 8));
  mouse.up(...px(12, 8));
  ok('den: out through the door, the lock is off and the chevron gone',
     API.playLook() === 'go' && !scene().chevron && drillDenOk());
  tap(mouse, ...EMPTY);
  sim(10);
  ok('den: live, a thin ring on the one coming out', scene().rings.some(r => r.h === M && r.thin));
  sim(120, () => drill().stage === 2);

  let T = game.hunters;
  ok('trap: both ghosts ringed, PLAY locked', scene().rings.length === 2 && API.playLook() === 'gated');
  drag(mouse, at(T[1]), px(9, 1));
  ok('trap: one path is not yet a go', API.playLook() === 'play' && scene().rings.length === 1);
  tap(mouse, ...EMPTY);
  sim(200, () => drill().fails === 1);
  API.render();
  ok('trap: a miss reloads with an amber rim, and the card shakes its head',
     scene().failing && coachFx.failAt === API.uiClock && drill().failKind === 'one');
  ok('trap: one miss shows no fingertip until a pause', scene().demo === null);
  age(API.COACH_SHOW);
  T = game.hunters;
  const td = scene().demo;
  ok('trap: after a pause both strokes are shown, red then pink',
     td && td.length === 2 && td[0][0].x === T[0].x && td[1][0].x === T[1].x
     && td[0][td[0].length - 1].x === tcx(9) && td[1][td[1].length - 1].x === tcx(9), td);
  drill().fails = 2;
  // the ghosts wear rings too: the caption names the corridor's ends, not "each ring"
  ok('trap: two misses ring the corridor ends', scene().markers
     && copy().caption === 'Send one ghost to each end of his corridor.' && !/\bring/i.test(copy().caption), copy());
  drill().fails = 3;
  ok('trap: three misses show the gesture straight away, and light SKIP',
     scene().demo !== null && scene().skipLit);
  ok('trap: ...still SKIP', copy().skip === 'SKIP ›');
  drill().fails = 4;
  ok('trap: four misses, and SKIP becomes the way on', copy().skip === 'START THE GAME ›');
  API.render();
  const r = API.coachUI.skip, S = API.scale;
  fire(screen, 'mousedown', { button: 0, clientX: (r.x + r.w / 2) / S, clientY: (r.y + r.h / 2) / S });
  fire(win, 'mouseup', { button: 0, clientX: (r.x + r.w / 2) / S, clientY: (r.y + r.h / 2) / S });
  ok('trap: pressing it starts the real game', game.drill === null && game.phase === 'ready');
}
function drillDenOk() { return API.drillDenOrdered(); }

console.log('\n== the card moves, it never fades ==');
{
  /* The card's home is the bottom of the maze, and it never fades: what
     it must not cover, it moves off, to the top under the pill. In scene
     one that is only what the step is about -- the ghost it asks for, at
     once, and a reason it never overrides to uncover something less. He
     is not what scene one is about, and may run under it as he likes. */
  const { coachFx } = API;
  returning();
  API.setTouchMode(false);
  API.reducedMotionMQ.matches = true;
  API.startDrill();
  settle();
  tap(mouse, ...EMPTY);
  API.render();
  const S = API.scale;
  const E = game.evader, R = game.hunters[0];
  const ex = E.x, ey = E.y, home = { x: R.x, y: R.y };
  const card = () => API.coachUI.card;
  const covers = (h, r) => {
    const q = { x: h.x * S, y: (h.y + 24) * S }, m = S * 6;
    return q.x + m > r.x && q.x - m < r.x + r.w && q.y + m > r.y && q.y - m < r.y + r.h;
  };
  ok('it starts at the bottom, over the roster', coachFx.dock === 'bottom' && card().y > API.screen.height / 2);
  const bottom = Object.assign({}, card());
  const top = API.coachCardRect(undefined, undefined, 'top');
  E.x = (bottom.x + bottom.w / 2) / S; E.y = (bottom.y + bottom.h / 2) / S - 24;
  const seen = cardAlpha();
  ok('scene one: he runs under it, and it stays home at full strength',
     coachFx.dock === 'bottom' && covers(E, card()) && seen.plate === 1 && seen.lead.every(a => a === 1),
     { dock: coachFx.dock, seen });
  frames(API.DOCK_DWELL + API.DOCK_HOME + 2);
  ok('...however long he stays there', coachFx.dock === 'bottom' && covers(E, card()), { dock: coachFx.dock });
  E.x = ex; E.y = ey;

  R.x = (bottom.x + bottom.w * 0.3) / S; R.y = (bottom.y + bottom.h / 2) / S - 24;
  API.render();
  ok('the ghost it asks for stands under it: it moves off at once',
     coachFx.dock === 'top' && !covers(R, card()), { dock: coachFx.dock });
  ok('...where its rects go with it', card().y === top.y && API.coachUI.skip.y < API.screen.height / 2);
  E.x = (top.x + top.w * 0.7) / S; E.y = (top.y + top.h / 2) / S - 24;
  frames(API.DOCK_HOME + 2);
  ok('...and he under it up there sends it nowhere, least of all back over the ghost',
     coachFx.dock === 'top' && !covers(R, card()));
  E.x = ex; E.y = ey; R.x = home.x; R.y = home.y;
  API.render();
  ok('the ghost clears off: it waits before it goes home', coachFx.dock === 'top');
  frames(API.DOCK_HOME + 2);
  ok('...and goes home once the bottom has stayed clear', coachFx.dock === 'bottom', { dock: coachFx.dock });

  /* A ghost it is not talking about can still stand under the card, and
     a press there reaches the ghost, not the card: once the route is
     down nothing is ringed, so the card has no reason to move. */
  drag(mouse, at(R), px(1, 5));
  R.x = tcx(6); R.y = tcy(29);
  /* The route taken away, as if walked, and time run in the step: an
     empty route before any run would shut PLAY again and bring the ring
     back (the go step's erased case), which is not what is asked here. */
  R.path = null;
  drill().ran = true;
  API.render();
  const c = API.coachUI.card;
  ok('a ghost it is not asking about may stand under it', coachFx.dock === 'bottom' && covers(R, c), c);
  fire(win, 'mousemove', { clientX: R.x, clientY: R.y + 24 });
  ok('and the hand over it is a grab, not the plain arrow the card wears', API.pointerTarget().cursor === 'grab',
     API.pointerTarget());
  mouse.down(...at(R));
  ok('frozen, a press on it picks it up through the glass', !!Draw.active && Draw.active.hunter === R,
     { active: !!Draw.active });
  mouse.move(...px(9, 29));
  mouse.up(...px(9, 29));
  ok('...and it is a route like any other', !!R.path);
  R.x = home.x; R.y = home.y; R.path = null;
  API.render();
  API.reducedMotionMQ.matches = false;

  const hoverAt = (r) => {
    fire(win, 'mousemove', { clientX: (r.x + r.w / 2) / S, clientY: (r.y + r.h / 2) / S });
    return API.pointerTarget();
  };
  const sk = hoverAt(API.coachUI.skip);
  ok('a hand over SKIP', sk.cursor === 'pointer' && sk.hover === 'skip');
  const cd = hoverAt({ x: c.x + c.w * 0.3, y: c.y + c.h * 0.7, w: 0, h: 0 });
  ok('the plain cursor over the rest of the card', cd.cursor === 'default');
  const pl = hoverAt(API.rosterUI.play);
  ok('a hand over the locked PLAY: it answers, even if it says no', pl.cursor === 'pointer');

  // the graduation sheet
  API.loadTrap(false);
  game.phase = 'capture';
  drill().step = 'graduate';
  API.render();
  ok('the sheet lands with its PLAY', !!API.coachUI.play && API.coachFx.gradAt === API.uiClock);
  const gp = hoverAt(API.coachUI.play);
  ok('a hand over PLAY ▶', gp.cursor === 'pointer' && gp.hover === 'grad');
  const gs = hoverAt({ x: 10, y: 10, w: 0, h: 0 });
  ok('...and over the whole sheet, which is all one button', gs.cursor === 'pointer');
  frames(NEAR_GUARD);
  fire(win, 'keydown', { code: 'Enter', repeat: false, preventDefault() {} });
  ok('Enter inside 300ms of the sheet is the tail of the catch, ignored', !!game.drill);
  frames(600);
  ok('ten seconds on, it has not moved on by itself', !!game.drill && drill().step === 'graduate');
  fire(win, 'keydown', { code: 'Enter', repeat: false, preventDefault() {} });
  ok('Enter after the guard starts the real game', game.drill === null && game.phase === 'ready');
}

console.log('\n== the first instruction, front and centre ==');
{
  /* Step one's card is the hero: large, centred over the den, the thing
     the eye lands on. The freeze that answers it sends it home to the
     bottom dock, shrinking as it goes, and step two's words land with it
     -- so the player has seen where the next instruction will be. */
  const { coachFx } = API;
  const S = () => API.scale, W = () => API.screen.width;
  const same = (a, b) => !!a && !!b && ['x', 'y', 'w', 'h'].every(k => Math.abs(a[k] - b[k]) < 0.5);
  const inside = (a, b) => !!a && !!b && a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
  const within = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  /* What the card says this frame, and how strongly: every string set,
     with its alpha and the scale it was drawn at. Drawing it is also what
     moves it, as a frame's render would. */
  const said = () => {
    let st = { globalAlpha: 1, k: 1 };
    const stack = [], out = [];
    const ctx = new Proxy({
      save() { stack.push(Object.assign({}, st)); },
      restore() { if (stack.length) st = stack.pop(); },
      scale(x) { st.k *= x; },
      measureText: () => ({ width: 0 }),
      createRadialGradient: () => ({ addColorStop() {} }),
      fillText(t) { out.push({ t, a: st.globalAlpha, k: st.k }); },
    }, {
      get(t, k) { return k in t ? t[k] : k in st ? st[k] : () => {}; },
      set(t, k, v) { st[k] = v; return true; },
    });
    API.drawCoachLayer(ctx);
    return out;
  };
  // the strongest any line of `text` was set at
  const alphaOf = (lines, text) => Math.max(0, ...lines.filter(l => l.t && text.includes(l.t)).map(l => l.a));

  returning();
  API.setTouchMode(false);
  API.startDrill();
  settle();
  API.render();
  const hero = API.coachCardRect();
  const heroSaid = said();
  ok('step one is the hero, centred on the glass and on the den',
     hero.dock === 'hero' && Math.abs(hero.x + hero.w / 2 - W() / 2) <= 1
     && Math.abs(hero.y + hero.h / 2 - API.heroMid()) <= 1, hero);
  ok('...in sentence case: the state, then the one thing to do',
     API.drillCopy().lead === 'Time is running.' && API.drillCopy().caption === 'Click anywhere to stop it.');
  API.setTouchMode(true);
  ok('...and a finger reads tap', API.drillCopy().caption === 'Tap anywhere to stop it.');
  API.setTouchMode(false);
  const dock = API.coachCardRect(undefined, undefined, 'bottom');
  ok('...a size up from the docked card, lead and body',
     hero.lead.px >= dock.lead.px * 1.3 && hero.cap.px > dock.cap.px && hero.w >= dock.w && hero.h > dock.h,
     { hero: [hero.lead.px, hero.cap.px, hero.w, hero.h], dock: [dock.lead.px, dock.cap.px, dock.w, dock.h] });
  ok('...keeping PRACTICE, its pips and SKIP ›, with SKIP inside it',
     heroSaid.some(l => l.t === 'PRACTICE') && heroSaid.some(l => l.t === 'SKIP ›')
     && same(API.coachUI.card, hero) && inside(API.coachUI.skip, API.coachUI.card), heroSaid.map(l => l.t));
  ok('...drawn where it rests, with nowhere to go yet', same(coachFx.drawn, hero) && coachFx.dock === 'bottom');

  // a press on its glass, clear of SKIP and of any ghost, stops time as a press anywhere does
  const c = API.coachUI.card;
  const on = { x: c.x + c.w * 0.1, y: c.y + c.h * 0.8 };
  const nat = { x: on.x / S(), y: on.y / S() - 24 };
  ok('(the spot pressed is the hero\'s glass, over no ghost and off SKIP)',
     !Draw.poolAt(nat.x, nat.y).length && within(on, c) && !within(on, API.coachUI.skip));
  mouse.down(nat.x, nat.y);
  mouse.up(nat.x, nat.y);
  ok('a press on the hero stops time, and the practice turns to step two',
     game.phase === 'command' && drill().step === 'draw', { phase: game.phase, step: drill().step });

  /* The trip home, frame by frame: from the hero's rect on the freeze's
     own frame to the bottom dock's, using the whole of HERO_MOVE to get
     there; step one's words scaled with the plate and gone before step
     two's are half there, and step two's whole as it lands -- the words
     keyed to how far the plate has come, not to the clock; the rects the
     dock's all the way, SKIP inside them. */
  const trip = [];
  for (let i = 0; i <= API.HERO_MOVE + 2; i++) {
    const lines = said();
    const oldK = lines.filter(l => l.t === 'Time is running.').map(l => l.k);
    trip.push({ t: API.uiClock - coachFx.heroAt, drawn: Object.assign({}, coachFx.drawn),
      card: Object.assign({}, API.coachUI.card), skip: Object.assign({}, API.coachUI.skip),
      old: alphaOf(lines, 'Time is running. Click anywhere to stop it.'),
      now: alphaOf(lines, API.drillCopy().lead), oldK: oldK.length ? Math.min(...oldK) : null });
    frames(1);
  }
  const home = API.coachCardRect();
  ok('its home is the bottom dock', home.dock === 'bottom' && home.y > API.screen.height / 2);
  ok('on the freeze\'s own frame it is still the hero, where it stood',
     trip[0].t === 0 && same(trip[0].drawn, hero) && trip[0].old === 1 && trip[0].now === 0, trip[0]);
  const mid = trip.find(f => f.t >= 3);
  ok('on the way it has left the middle, falling and shrinking, its words with it',
     !!mid && mid.drawn.y > hero.y + 1 && mid.drawn.w < hero.w && mid.oldK < 1, mid);
  // how far the plate has come, 0 at the hero, 1 at the dock
  const far = f => (f.drawn.y - hero.y) / (home.y - hero.y);
  const landed = trip.findIndex(f => same(f.drawn, home));
  ok('it takes the trip it is given: not home before the last sixth of it, and never past',
     landed >= 0 && trip[landed].t >= API.HERO_MOVE * 5 / 6 && trip.every(f => far(f) <= 1.0001)
     && trip.every((f, i) => i === 0 || far(f) >= far(trip[i - 1]) - 1e-6),
     trip.map(f => [f.t, +far(f).toFixed(3)]));
  ok('step two\'s words never show before the last part of the trip',
     trip.every(f => f.now === 0 || far(f) >= API.HERO_NEW[0] - 0.01),
     trip.map(f => [f.t, +far(f).toFixed(3), f.now]));
  ok('...nor step one\'s after it, and step one\'s are gone before step two\'s are half there',
     trip.every(f => f.old === 0 || far(f) < API.HERO_OLD[1] + 0.01) && trip.every(f => f.now < 0.5 || f.old === 0),
     trip.map(f => [f.t, f.old, f.now]));
  ok('the frame it lands, it says step two and only step two',
     landed >= 0 && trip[landed].old === 0 && trip[landed].now >= 0.9, landed >= 0 && trip[landed]);
  const last = trip[trip.length - 1];
  ok('settled, it is the bottom dock\'s rect, saying step two',
     same(last.drawn, home) && last.old === 0 && last.now === 1 && coachFx.heroCopy === null, last);
  ok('the rects are the dock\'s at rest the whole way, SKIP inside',
     trip.every(f => same(f.card, home) && inside(f.skip, f.card) && same(f.skip, trip[0].skip)),
     trip.map(f => f.card.y));
  API.endDrill('skipped');

  // SKIP is where it will be, and takes a press in mid-flight
  API.startDrill();
  settle();
  API.render();
  tap(mouse, ...EMPTY);
  API.render();
  frames(3);
  const sk = API.coachUI.skip;
  const flying = coachFx.heroCopy !== null && !same(coachFx.drawn, API.coachUI.card);
  fire(screen, 'mousedown', { button: 0, clientX: (sk.x + sk.w / 2) / S(), clientY: (sk.y + sk.h / 2) / S() });
  fire(win, 'mouseup', { button: 0, clientX: (sk.x + sk.w / 2) / S(), clientY: (sk.y + sk.h / 2) / S() });
  ok('SKIP takes a press at its resting place while the card is still flying there',
     flying && game.drill === null && game.phase === 'ready', { flying });

  // reduced motion: no trip, only the card at home saying step two
  API.startDrill();
  settle();
  API.render();
  API.reducedMotionMQ.matches = true;
  tap(mouse, ...EMPTY);
  const still = said();
  const rest = API.coachCardRect();
  ok('reduced motion: the freeze puts it straight at the bottom, saying step two',
     rest.dock === 'bottom' && same(coachFx.drawn, rest) && coachFx.heroCopy === null
     && alphaOf(still, 'Time is running.') === 0 && alphaOf(still, API.drillCopy().lead) === 1, coachFx.drawn);
  API.reducedMotionMQ.matches = false;
  API.endDrill('skipped');

  /* The hero sits on the den, over the three ghosts it hides. A press on
     its words is the freeze and nothing else: no den ghost picked up
     through the glass, nothing dragged out of the door by a press that
     never let go, and step two hands over RAZE as it always does -- the
     den's own lesson still ahead. */
  API.startDrill();
  settle();
  API.render();
  const hc = API.coachUI.card;
  const centre = [(hc.x + hc.w / 2) / S(), (hc.y + hc.h / 2) / S() - 24];
  const hidden = game.hunters.filter((h, i) => i > 0 && within({ x: h.x * S(), y: (h.y + 24) * S() }, hc));
  ok('(the hero\'s middle is over the den, a ghost under its glass)',
     hidden.length >= 1 && Draw.poolAt(centre[0], centre[1]).length > 0, { hidden: hidden.length });
  API.input.hovering = true;
  API.input.dx = hc.x + hc.w / 2; API.input.dy = hc.y + hc.h / 2;
  ok('hovering its words shows the glass\'s cursor, not a ghost\'s open hand',
     API.pointerTarget().cursor === 'default', API.pointerTarget());
  API.input.hovering = false;
  drag(mouse, centre, px(12, 11), px(12, 8), px(16, 8));
  ok('a press on its middle, held and dragged out of the door, is the freeze alone',
     game.phase === 'command' && drill().step === 'draw' && Draw.selected === 0
     && !game.hunters.some((h, i) => i > 0 && h.path) && !drill().denDone && drill().watchIdx === -1,
     { phase: game.phase, step: drill().step, sel: Draw.selected, denDone: drill().denDone,
       paths: game.hunters.map(h => !!h.path) });
  API.endDrill('skipped');

  /* "Click anywhere" invites a double-click, and the hero's rect leaves
     for the dock on the first press. The second, a few frames on and on
     the same spot, lands on glass the card has just left: it is
     swallowed, not refused as an early PLAY nor a grab of the ghost the
     hero was hiding, and step two says its own words. Once the guard is
     out the maze there is maze again. */
  const offGhost = [(hc.x + hc.w * 0.1) / S(), (hc.y + hc.h * 0.8) / S() - 24];
  for (const [name, spot] of [['its middle', centre], ['bare glass', offGhost]]) {
    API.startDrill();
    settle();
    API.render();
    tap(mouse, ...spot);
    API.render();
    const cap = API.drillCopy().caption;
    frames(6);
    tap(mouse, ...spot);
    API.render();
    ok(`a double-click on the hero (${name}): the second press is swallowed, not refused, not a grab`,
       game.phase === 'command' && drill().step === 'draw' && drill().refusals === 0
       && !Draw.active && Draw.selected === 0 && !game.hunters.some(h => h.path)
       && API.drillCopy().caption === cap && cap === 'It walks your path, then stops at a wall.' && !API.drillCopy().hint,
       { phase: game.phase, step: drill().step, refusals: drill().refusals, sel: Draw.selected, cap: API.drillCopy().caption });
    if (spot === centre) {
      frames(API.DRILL_GUARD);
      mouse.down(...spot);
      const grabbed = !!Draw.active;
      mouse.up(...spot);
      ok('...and once the guard is out, a press there is on the maze again (the den ghost, now in sight)', grabbed);
    }
    API.endDrill('skipped');
  }
}

console.log('\n== in the trap, he and its rings are the lesson ==');
{
  /* In the trap he is what the card is about, and so are the corridor's
     end rings: the card keeps them clear as it keeps the ghost it asks
     for -- him once it has rested a moment. A trap that loads with him
     under its dock starts at the other one, simply there. */
  const { coachFx } = API;
  const S = API.scale;
  const card = () => API.coachUI.card;
  const covers = (h, r) => {
    const q = { x: h.x * S, y: (h.y + 24) * S }, m = S * 6;
    return q.x + m > r.x && q.x - m < r.x + r.w && q.y + m > r.y && q.y - m < r.y + r.h;
  };
  const saved = JSON.stringify(API.TRAP);
  returning();
  API.setTouchMode(false);
  API.reducedMotionMQ.matches = true;
  try {
    API.startDrill();
    settle();
    tap(mouse, ...EMPTY);
    API.render();
    ok('(scene one left it at the bottom)', coachFx.dock === 'bottom');
    // his start moved under the bottom dock, and the ghosts to the middle band, clear of both
    Object.assign(API.TRAP.evader, { c: 9, r: 29 });
    Object.assign(API.TRAP.raze, { c: 6, r: 14 });
    Object.assign(API.TRAP.mist, { c: 21, r: 14 });
    game.phase = 'play';
    API.loadTrap(false);
    API.render();
    const E = game.evader;
    ok('a trap loading with him under the bottom dock starts it at the top, at once',
       coachFx.dock === 'top' && !covers(E, card()), { dock: coachFx.dock });
    ok('...simply there, with no trip across the maze',
       !!coachFx.geo && coachFx.geo.y0 === coachFx.geo.y1 && coachFx.drawn.y === card().y);
    Object.assign(API.TRAP.evader, JSON.parse(saved).evader);   // put back before anything reloads
    E.x = tcx(26); E.y = tcy(14);                               // the middle band: under neither dock
    frames(API.DOCK_HOME + 2);
    ok('he clears off, and it goes home', coachFx.dock === 'bottom');
    const bot = Object.assign({}, card());
    E.x = (bot.x + bot.w / 2) / S; E.y = (bot.y + bot.h / 2) / S - 24;
    coachFx.dockAt = API.uiClock;   // freshly arrived
    API.render();
    ok('he runs under it: it holds its dock a moment, so he cannot set it swinging', coachFx.dock === 'bottom');
    frames(API.DOCK_DWELL + 1);
    ok('...then moves off him to the top', coachFx.dock === 'top' && !covers(E, card()), { dock: coachFx.dock });
    // the end rings are under the top dock: two misses, and it goes down whatever he does
    drill().fails = 2;
    E.x = tcx(26); E.y = tcy(14);
    API.render();
    ok('two misses ring the corridor ends: it moves off them at once',
       API.coachScene().markers && coachFx.dock === 'bottom', { dock: coachFx.dock });
    API.endDrill('skipped');
  } finally {
    const t = JSON.parse(saved);
    for (const k of Object.keys(t)) Object.assign(API.TRAP[k], t[k]);
    API.reducedMotionMQ.matches = false;
  }
}

console.log('\n== reduced motion ==');
{
  /* Every coach mark is drawn through the same arc(); under reduced motion
     the calls are identical from one moment to the next -- the ring does
     not breathe or turn, the fingertip does not travel. */
  const arcs = () => {
    const c = API.screenCtx, rec = [];
    c.arc = (...a) => rec.push(a.slice(0, 3).map(v => Math.round(v * 10) / 10));
    try { API.drawCoachMarks(c, API.coachScene()); } finally { delete c.arc; }
    return JSON.stringify(rec);
  };
  returning();
  API.startDrill();
  settle();
  tap(mouse, ...EMPTY);
  age(API.COACH_SHOW);
  API.reducedMotionMQ.matches = true;
  const a1 = arcs(); frames(37); const a2 = arcs();
  API.reducedMotionMQ.matches = false;
  const b1 = arcs(); frames(37); const b2 = arcs();
  ok('ring and fingertip are still under reduced motion', a1 === a2 && a1.length > 20);
  ok('...and move without it', b1 !== b2);
  ok('the static fingertip still shows the whole stroke', scene().demo !== null);
  API.endDrill('skipped');
}

console.log('\n== the fingertip is not a route ==');
{
  /* Presentation only, and it has to look it: white and grey, dots and
     circles -- no line, so no arrow, no casing, no ghost's color -- and
     gone under any real pointer, the card's glass included. Three missed
     traps show it without waiting, so a press can be seen to hide it
     rather than merely reset the idle clock. */
  returning();
  API.setTouchMode(false);
  API.startDrill();
  game.phase = 'play';
  API.loadTrap(false);
  settle();
  drill().fails = 3;
  const base = scene();
  const styles = new Set();
  let lines = 0, arcs = 0;
  const rec = new Proxy({ measureText: () => ({ width: 0 }) }, {
    get(t, k) {
      if (k in t) return t[k];
      if (['lineTo', 'quadraticCurveTo', 'bezierCurveTo', 'arcTo', 'rect', 'fillRect', 'strokeRect'].includes(k)) {
        return () => { lines++; };
      }
      if (k === 'arc') return () => { arcs++; };
      return () => {};
    },
    set(t, k, v) { if (k === 'fillStyle' || k === 'strokeStyle') styles.add(v); t[k] = v; return true; },
  });
  const onlyDemo = Object.assign({}, base,
    { rings: [], ringPlay: false, ripple: -1, bracket: false, chevron: false, markers: false });
  for (const still of [false, true]) {
    API.reducedMotionMQ.matches = still;
    for (let t = 0; t < 400; t += 5) API.drawCoachMarks(rec, Object.assign({}, onlyDemo, { demoT: t }));
  }
  API.reducedMotionMQ.matches = false;
  ok('three misses: the fingertip is up', !!base.demo && base.demo.length === 2 && arcs > 100, { arcs });
  ok('drawn in white and grey alone, never a ghost\'s color',
     styles.size > 0 && [...styles].every(v => v === API.TOKENS.ink || v === API.TOKENS.muted), [...styles]);
  ok('in dots and circles: not one line, so nothing a route is made of', lines === 0, { lines });

  API.render();
  const c = API.coachUI.card, S = API.scale;
  const on = { button: 0, clientX: (c.x + c.w * 0.3) / S, clientY: (c.y + c.h * 0.7) / S };
  fire(screen, 'mousedown', on);
  ok('a press held on the card\'s glass takes it away', scene().demo === null && game.phase === 'command');
  fire(win, 'mouseup', on);
  ok('...and it is back when the press lets go', scene().demo !== null);
  const right = { button: 2, clientX: EMPTY[0], clientY: EMPTY[1] + 24 };
  fire(screen, 'mousedown', right);
  ok('the right button held on the maze takes it away too', scene().demo === null);
  fire(win, 'mouseup', right);
  ok('...back again on release, with nothing drawn by any of it',
     scene().demo !== null && !game.hunters.some(h => h.path) && !Draw.active);
  API.endDrill('skipped');
}

console.log('\n== the shell ==');
{
  const doc = API.doc, realGet = doc.getElementById;
  const cls = new Set();
  const els = { 'hint-live': { textContent: '' },
    'hint-idle': { innerHTML: 'FIRST', dataset: { after: 'BACK' } } };
  doc.body = { classList: { toggle(c, on) { if (on) cls.add(c); else cls.delete(c); } },
    style: { setProperty() {} } };
  doc.getElementById = (id) => els[id] || screen;
  try {
    returning();
    API.setTouchMode(false);
    API.startDrill();
    API.shell.key = null;
    API.render();
    ok('practice, live: the room is coaching and the live line is the hero\'s lead and its instruction',
       cls.has('coaching') && !cls.has('frozen')
       && els['hint-live'].textContent === 'Time is running. Click anywhere to stop it.', els['hint-live']);
    ok('...and the first-visit line waits under it', els['hint-idle'].innerHTML === 'FIRST');
    settle();
    tap(mouse, ...EMPTY);
    API.render();
    ok('frozen: the live line follows the step',
       cls.has('frozen') && els['hint-live'].textContent === 'Press on the red ghost and drag a path.');
    API.setTouchMode(true);
    API.render();
    ok('the live line changes idiom with the card', /finger/i.test(els['hint-live'].textContent));
    API.setTouchMode(false);
    API.endDrill('skipped');
    API.render();
    ok('a real game: no longer coaching, and the resting line is the returning player\'s',
       !cls.has('coaching') && els['hint-idle'].innerHTML === 'BACK' && !('after' in els['hint-idle'].dataset));
  } finally {
    delete doc.body;
    doc.getElementById = realGet;
  }
}

console.log('\n== the page greets a first visit ==');
{
  const fs = require('fs'), vm = require('vm'), path = require('path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const greet = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('hint-idle'));
  const resting = html.match(/<span id="hint-idle">([\s\S]*?)<\/span>/)[1];
  const run = ({ coarse, stored, throws, search }) => {
    const el = { innerHTML: resting, dataset: {} };
    vm.runInNewContext(greet, {
      navigator: { maxTouchPoints: coarse ? 5 : 0 },
      window: { matchMedia: () => ({ matches: !coarse }) },
      document: { getElementById: () => el },
      localStorage: { getItem: () => { if (throws) throw new Error('denied'); return stored; } },
      location: { search: search || '' },
    });
    return el;
  };
  for (const [name, env, verb, first] of [
    ['a first visit with a mouse', { coarse: false, stored: null }, 'CLICK', true],
    ['a first visit with a finger', { coarse: true, stored: null }, 'TAP', true],
    ['storage that will not answer', { coarse: false, throws: true }, 'CLICK', true],
    ['?tutorial for someone who has played', { coarse: true, stored: 'done', search: '?tutorial' }, 'TAP', true],
    ['a returning player with a mouse', { coarse: false, stored: 'done' }, 'CLICK', false],
    ['a returning player from a link that only says tutorial', { coarse: false, stored: 'done', search: '?utm_campaign=tutorial' }, 'CLICK', false],
    ['a returning player with a finger', { coarse: true, stored: 'skipped' }, 'TAP', false],
  ]) {
    const el = run(env);
    const other = verb === 'TAP' ? /CLICK/ : /\bTAP\b|FINGER/;
    const says = first ? /FIRST TIME\?.*1-MINUTE PRACTICE COMES FIRST/.test(el.innerHTML) : /NEW HERE\?/.test(el.innerHTML);
    const kept = first ? /NEW HERE\?/.test(el.dataset.after || '') && !other.test(el.dataset.after) : !el.dataset.after;
    ok('index.html: ' + name, says && el.innerHTML.includes(verb) && !other.test(el.innerHTML) && kept, el);
  }
}

/* ---- the tour ----
   Every state the coach can show, in order, calling look(label) at each:
   each step and its stuck rungs, the drags in the middle of going wrong,
   the misses, the catch and the sheet. Played with a mouse; looks that
   care about the idiom flip it themselves. */
function tour(look) {
  returning();
  API.setTouchMode(false);
  API.startDrill();
  sim(100);
  settle();
  look('freeze');
  age(API.COACH_ANYWHERE); look('freeze, stuck');
  tap(mouse, ...EMPTY); look('draw');
  const R = game.hunters[0], M = game.hunters[1];
  mouse.down(...at(R)); mouse.up(...at(R)); look('draw, tapped');
  tap(mouse, ...EMPTY); look('draw, refused');
  age(API.COACH_SHOW); look('draw, fingertip');
  drag(mouse, at(R), px(14, 14)); look('draw, sent home');
  mouse.down(...at(R)); mouse.move(...px(4, 8)); frames(API.COACH_STALL + 2); look('draw, stalled');
  mouse.move(...px(1, 5)); mouse.up(...px(1, 5)); look('go');
  age(API.COACH_SHOW); look('go, stuck');
  tap(mouse, ...EMPTY); sim(5); look('go, watching');
  sim(300, () => drill().stopT > 0); look('go, stopped');
  // a route that ended on the door, and the den it filled: read, not played
  R.state = 'idle'; look('go, walked home'); R.state = 'active';
  sim(300, () => drill().step === 'den'); look('den, live');
  R.state = 'idle'; look('den, live, all four'); R.state = 'active';
  age(API.COACH_DEN_LIVE); look('den, live, stuck');
  tap(mouse, ...EMPTY); look('den');
  tap(mouse, ...EMPTY); look('den, refused');
  age(API.COACH_SHOW); look('den, fingertip');
  const n = API.neighborsOf(R.tile().c, R.tile().r)[0];
  drag(mouse, at(R), px(n.c, n.r)); look('den, red again');
  mouse.down(...at(M)); mouse.move(...px(13, 8)); frames(API.COACH_STALL + 2); look('den, at the door');
  mouse.move(...px(12, 11)); mouse.move(...px(12, 8)); mouse.up(...px(12, 8)); look('den, ordered');
  tap(mouse, ...EMPTY); sim(5); look('den, coming out');
  sim(120, () => drill().stage === 2); look('trap');
  tap(mouse, ...EMPTY); look('trap, refused');
  drag(mouse, at(game.hunters[1]), px(9, 1)); look('trap, one path');
  tap(mouse, ...EMPTY); sim(3); look('trap, live');
  sim(200, () => drill().fails === 1); look('trap, missed');
  age(API.COACH_SHOW); look('trap, fingertip');
  drill().failKind = 'open'; look('trap, missed open');
  drill().fails = 2; look('trap, rings');
  drill().fails = 4; look('trap, the way on');
  drag(mouse, at(game.hunters[0]), px(9, 1)); look('trap, one of two');
  drag(mouse, at(game.hunters[1]), px(6, 5), px(6, 1), px(9, 1)); look('trap, both on one side');
  drag(mouse, at(game.hunters[1]), px(9, 1)); look('trap, set');
  tap(mouse, ...EMPTY);
  sim(60, () => game.phase === 'capture'); look('capture');
  sim(80, () => drill().step === 'graduate'); look('graduate');
  const done = !!game.drill && drill().step === 'graduate';
  API.endDrill('done');
  return done;
}

console.log('\n== the board stays on the palette with the coach up ==');
{
  /* palette-lock.js reads the source; this watches the framebuffer's
     own context while every coach state is on the glass. Anything the
     coach drew there -- a color off the palette, an alpha, a blur, a
     gradient -- would show up here. */
  const pal = new Set(Object.values(API.PAL).map(v => String(v).toUpperCase()));
  const bad = [];
  let sets = 0;
  const rec = new Proxy({
    canvas: { width: 224, height: 288 },
    createRadialGradient() { bad.push('gradient'); return { addColorStop() {} }; },
    createLinearGradient() { bad.push('gradient'); return { addColorStop() {} }; },
    measureText: () => ({ width: 0 }),
  }, {
    get(t, k) { return k in t ? t[k] : () => {}; },
    set(t, k, v) {
      if (k === 'fillStyle' || k === 'strokeStyle') {
        sets++;
        if (typeof v !== 'string' || !pal.has(v.toUpperCase())) bad.push(k + '=' + v);
      }
      if (k === 'globalAlpha' && v !== 1) bad.push('globalAlpha=' + v);
      if ((k === 'filter' && v && v !== 'none') || (k === 'shadowBlur' && v)) bad.push(k + '=' + v);
      if (k === 'imageSmoothingEnabled' && v) bad.push('smoothing on');
      t[k] = v;
      return true;
    },
  });
  const realNative = API.nativeCtx;
  const looked = [], idiomBad = [], lines = new Set();
  API.setNativeCtx(rec);
  let reached;
  try {
    reached = tour(label => {
      const before = bad.length;
      API.render();
      API.coachScene();
      if (bad.length > before) bad.push('^ at ' + label);
      looked.push(label);
      /* ...and what the card says there, in both idioms. The tour is
         every rung of every ladder, so this is the whole vocabulary. */
      for (const t of [false, true]) {
        API.setTouchMode(t);
        const line = Object.values(API.drillCopy()).filter(v => typeof v === 'string').join(' | ');
        if (t ? /click/i.test(line) : /\btap\b|finger/i.test(line)) idiomBad.push(label + (t ? ' / touch: ' : ' / mouse: ') + line);
        for (const l of line.split(' | ')) if (l) lines.add(l);
      }
      API.setTouchMode(false);
    });
  } finally { API.setNativeCtx(realNative); API.setTouchMode(false); }
  ok('the tour reached the sheet (' + looked.length + ' states)', reached, looked);
  ok('in every state on it, touch copy never says CLICK and mouse copy never TAP or FINGER',
     idiomBad.length === 0 && lines.size > 50, idiomBad.slice(0, 8));
  const long = [...lines].filter(l => l.length > 30 && !API.COACH_SHORT[l]);
  ok('and every long line among them has a short form (' + lines.size + ' lines)', long.length === 0, long);
  ok('the board drew only palette entries, with no alpha, blur or gradient, in every coach state',
     bad.length === 0 && sets > 100, bad.slice(0, 12));
}

console.log('\n== the practice lifts the board exactly when real play does ==');
{
  /* The practice is real play with a coach on top, so the board is too:
     the solid board on every frozen step, the 1981 pixels on every live
     one, and the card, its rings, the fingertip and the trap's exits all
     drawn after it, over it. */
  const seen = { frozen: [], live: [], wrong: [] };
  const sctx = () => API.screenCtx;
  tour(label => {
    const blits = [];
    const ctx = sctx();
    ctx.drawImage = (img) => { blits.push(img); };
    API.render();
    ctx.drawImage = () => {};
    const lifted = blits.filter(img => img === API.frozenCache.walls).length;
    const frozen = game.phase === 'command';
    (frozen ? seen.frozen : seen.live).push(label);
    if (lifted !== (frozen ? 1 : 0)) seen.wrong.push(label + ' (' + game.phase + ', ' + lifted + ')');
  });
  ok('every frozen step of the practice is on the lifted board (' + seen.frozen.length + ' states)',
     seen.frozen.length > 15 && ['draw', 'den', 'trap', 'trap, set'].every(l => seen.frozen.includes(l)),
     seen.frozen);
  ok('...and every live one on the pixels (' + seen.live.length + ' states)',
     seen.live.length > 5 && ['freeze', 'go, watching', 'den, live', 'trap, live'].every(l => seen.live.includes(l)),
     seen.live);
  ok('...with no state where the board disagrees with the clock', seen.wrong.length === 0, seen.wrong);
  const r = body('function render()');
  ok('and the coach is drawn over it, never under',
     r && r.indexOf('drawFrozenBoard(') >= 0 && r.indexOf('drawFrozenBoard(') < r.indexOf('drawCoachLayer('));
}

console.log('\n== every line fits the narrowest glass ==');
{
  /* The harness measures every string as 0 wide, so here the card is set
     with a stand-in for the platform face: per-letter advances for a
     semibold UI sans, a little generous. It is set at 360 CSS px and dpr
     3 -- the narrowest phone, where every role sits at its floor -- and
     every string the coach draws must land inside its own plate, in both
     idioms. The practice's sentences get there by wrapping, whole; only
     the one-line labels may reach for a short form. */
  const EM = { ' ': 0.28, '.': 0.28, ',': 0.28, ':': 0.28, "'": 0.24, '?': 0.52, '›': 0.38,
    '▶': 0.74, '…': 0.86, '-': 0.38, A: 0.68, B: 0.63, C: 0.65, D: 0.71, E: 0.56, F: 0.53,
    G: 0.71, H: 0.73, I: 0.29, J: 0.43, K: 0.64, L: 0.51, M: 0.87, N: 0.74, O: 0.75, P: 0.61,
    Q: 0.75, R: 0.64, S: 0.58, T: 0.59, U: 0.72, V: 0.67, W: 0.96, X: 0.65, Y: 0.63, Z: 0.61,
    a: 0.56, b: 0.6, c: 0.5, d: 0.6, e: 0.56, f: 0.36, g: 0.6, h: 0.6, i: 0.27, j: 0.27, k: 0.54,
    l: 0.27, m: 0.9, n: 0.6, o: 0.6, p: 0.6, q: 0.6, r: 0.4, s: 0.49, t: 0.37, u: 0.6, v: 0.54,
    w: 0.8, x: 0.53, y: 0.54, z: 0.49 };
  const textW = (text, font, ls) => {
    const px = Number(/(\d+(?:\.\d+)?)px/.exec(font)[1]);
    let em = 0;
    for (const ch of text) em += EM[ch] !== undefined ? EM[ch] : /[0-9]/.test(ch) ? 0.59 : 0.68;
    return em * px + (parseFloat(ls) || 0) * [...text].length;
  };
  // a context that keeps its state honestly, save/restore and transforms included
  const recorder = () => {
    let st = { font: '10px sans', textAlign: 'start', letterSpacing: '0px', a: 1, d: 1, e: 0, f: 0 };
    const stack = [], drawn = [];
    const methods = {
      save() { stack.push(Object.assign({}, st)); },
      restore() { if (stack.length) st = stack.pop(); },
      translate(x, y) { st.e += st.a * x; st.f += st.d * y; },
      scale(x, y) { st.a *= x; st.d *= y; },
      measureText(t) { return { width: textW(t, st.font, st.letterSpacing) }; },
      fillText(t, x) {
        const w = textW(t, st.font, st.letterSpacing);
        const l = st.textAlign === 'center' ? x - w / 2 : st.textAlign === 'right' ? x - w : x;
        drawn.push({ t, px: Number(/(\d+)px/.exec(st.font)[1]), l: st.e + st.a * l, r: st.e + st.a * (l + w) });
      },
      createRadialGradient: () => ({ addColorStop() {} }),
    };
    const ctx = new Proxy(methods, {
      get(t, k) { return k in t ? t[k] : k in st ? st[k] : () => {}; },
      set(t, k, v) { st[k] = v; return true; },
      has(t, k) { return k in t || k in st || k === 'letterSpacing'; },
    });
    return { ctx, drawn };
  };
  const fullLines = new Set(Object.keys(API.COACH_SHORT));

  /* A sentence set whole is one whose wrapped lines join back into it;
     one that is not has been cut to a short form, or lost words. */
  const probe = (overflow, used, cut) => (label) => {
    for (const t of [false, true]) {
      API.setTouchMode(t);
      API.drillCopy();
      API.coachFx.failAt = -1e9;   // the shake is a moment, not a place
      if (API.coachFx.heroCopy) API.coachFx.heroAt = API.uiClock - API.HERO_MOVE;   // ...and so is the trip home
      if (drill().step === 'graduate') {
        API.drawCoachLayer(recorder().ctx);
        API.coachFx.gradAt = API.uiClock - 100;   // settled on its spring
      }
      const { ctx, drawn } = recorder();
      API.drawCoachLayer(ctx);
      const grad = drill().step === 'graduate';
      const box = grad ? API.gradSheetRect(ctx) : API.coachCardRect(ctx);
      const c = API.drillCopy();
      const said = grad ? [[box.lead, c.lead], [box.cap, c.caption], [box.micro, c.micro]]
        : [[box.lead, c.lead], [box.cap, c.caption]];
      for (const [set, text] of said) {
        if (text && (!set || set.lines.join(' ') !== text || set.lines.length > 2)) {
          cut.push({ at: label + (t ? ' / touch' : ' / mouse'), text, lines: set && set.lines });
        }
      }
      for (const d of drawn) {
        used.push(d.t);
        if (d.l < box.x + 2 || d.r > box.x + box.w - 2) {
          overflow.push({ at: label + (t ? ' / touch' : ' / mouse'), t: d.t, over: Math.round(Math.max(box.x + 2 - d.l, d.r - box.x - box.w + 2)) });
        }
      }
    }
    API.setTouchMode(false);
  };

  const size = (w, h, dpr) => { win.innerWidth = w; win.innerHeight = h; win.devicePixelRatio = dpr; API.layout(); };
  // the one-line labels' short forms: the only ones a known glass may use
  const labelShorts = new Set();
  for (const [k, v] of Object.entries(API.COACH_SHORT)) {
    if (k === k.toUpperCase()) [].concat(v).forEach(s => labelShorts.add(s));
  }
  let overflow = [], used = [], cut = [];
  size(360, 740, 3);
  const phone = { scale: API.scale, dpr: API.uiDpr };
  try { tour(probe(overflow, used, cut)); } finally { size(900, 1000, undefined); }
  ok('the phone is scale 4 at dpr 3 (' + JSON.stringify(phone) + ')', phone.scale === 4 && phone.dpr === 3);
  ok('at 360 CSS px, dpr 3, every coach string lands inside its plate (' + used.length + ' drawn)',
     overflow.length === 0 && used.length > 200, overflow.slice(0, 12));
  ok('...every sentence whole, wrapped onto two lines at most rather than cut short',
     cut.length === 0, cut.slice(0, 8));

  // and where there is room, nothing is shortened at all
  overflow = []; used = []; cut = [];
  tour(probe(overflow, used, cut));
  const label = [...new Set(used.filter(t => labelShorts.has(t) && !fullLines.has(t)))];
  ok('on a desktop window every line is set in full',
     overflow.length === 0 && cut.length === 0 && label.length === 0, { overflow, cut, label });

  /* The glass after the practice, set at the same narrow phone: every
     toast in both idioms (the camp tip with the longest name), the
     manual's control in each of its three words, and the game-over
     chip. Each must land inside its own plate, and the manual's title
     must give way to its control rather than run under it. */
  const after = [];
  const inside = (d, r) => d.l >= r.x + 1 && d.r <= r.x + r.w - 1;
  const saved = { phase: game.phase, helpOpen: game.helpOpen, drill: game.drill };
  size(360, 740, 3);
  try {
    for (const t of [false, true]) {
      API.setTouchMode(t);
      const idiom = t ? ' / touch' : ' / mouse';
      game.phase = 'play';   // no game over behind the toasts
      for (const kind of Object.keys(API.TIP)) {
        Object.assign(API.tipUI, { active: kind, at: API.uiClock - 100, name: 'EMBER', leaving: null, nudgeAt: -1e9 });
        const { ctx, drawn } = recorder();
        API.drawTipLayer(ctx);
        const r = API.tipUI.rect;
        if (!r || drawn.length < 2 || drawn.length > 4) after.push({ at: kind + idiom, drawn: drawn.length });
        for (const d of drawn) if (!inside(d, r)) after.push({ at: kind + idiom, t: d.t });
      }
      API.tipUI.active = null;
      game.drill = null;
      for (const [phase, drill, arm] of [['attract', null, false], ['command', null, false],
                                          ['command', null, true], ['command', { step: 'draw' }, false]]) {
        game.phase = phase; game.drill = drill; game.helpOpen = true;
        API.helpFx.confirmAt = arm ? API.uiClock : -1e9;
        const label = API.practiceLabel();
        const { ctx, drawn } = recorder();
        API.drawHelpLayer(ctx);
        const r = API.helpUI.practice;
        const mine = drawn.filter(d => d.t === label || [].concat(API.COACH_SHORT[label] || []).includes(d.t));
        const title = drawn.find(d => d.t === 'HOW TO PLAY');
        if (mine.length !== 1 || !inside(mine[0], r)) after.push({ at: label + idiom, mine });
        if (!title || title.r > r.x) after.push({ at: label + idiom, title: title && Math.round(title.r - r.x) });
      }
      game.helpOpen = false; game.drill = null;
      game.phase = 'gameover'; game.catches = 0;
      Object.assign(API.gameOverFx, { live: true, spent: true, at: API.uiClock - 100 });
      const { ctx, drawn } = recorder();
      API.drawTipLayer(ctx);
      const g = API.gameOverUI.practice;
      if (drawn.length !== 1 || !inside(drawn[0], g)) after.push({ at: 'game-over chip' + idiom, drawn });
    }
  } finally {
    size(900, 1000, undefined);
    API.setTouchMode(false);
    Object.assign(API.gameOverFx, { live: false, spent: false, at: -1e9 });
    API.helpFx.confirmAt = -1e9;
    game.phase = saved.phase; game.helpOpen = saved.helpOpen; game.drill = saved.drill;
  }
  ok('at 360 CSS px, dpr 3, every toast, the manual\'s PRACTICE and the game-over chip fit their glass',
     after.length === 0, after.slice(0, 12));
}

console.log('\n== the coach is legible on every screen ==');
{
  /* The practice was read at 1024x768, where the scale is 2 and every
     role of the rules sits at its floor, and it was hard going. So the
     card is laid out here on the screens people have, with a stand-in for
     the platform face -- every character 0.55em, about a semibold UI
     sans's average -- through every state of the tour, in both idioms.
     On each: the lead is at least 16 CSS px and the caption 14; every
     sentence the card or the sheet says is set whole, on two lines at
     most, inside its plate; and the card never rests over the ghost it is
     asking for, or the trap's rings. The toasts are held to the same. */
  const VIEWS = [[1024, 768, 1], [1366, 768, 1], [1536, 864, 1.25], [1920, 1080, 1],
    [2560, 1440, 1], [390, 844, 3], [360, 780, 3], [844, 390, 3]];
  const measuring = () => {
    let st = { font: '10px sans', letterSpacing: '0px', globalAlpha: 1, textAlign: 'start' };
    const stack = [];
    return new Proxy({
      save() { stack.push(Object.assign({}, st)); },
      restore() { if (stack.length) st = stack.pop(); },
      measureText(t) {
        const em = Number(/(\d+(?:\.\d+)?)px/.exec(st.font)[1]);
        return { width: [...t].length * 0.55 * em };
      },
      createRadialGradient: () => ({ addColorStop() {} }),
    }, {
      get(t, k) { return k in t ? t[k] : k in st ? st[k] : () => {}; },
      set(t, k, v) { st[k] = v; return true; },
      has(t, k) { return k in t || k in st || k === 'letterSpacing'; },
    });
  };
  const size = (w, h, dpr) => { win.innerWidth = w; win.innerHeight = h; win.devicePixelRatio = dpr; API.layout(); };
  const FLOOR = { coachLead: 16, coachBody: 14, heroLead: 22, heroBody: 16 };
  const small = [], long = [], over = [], seen = [], docked = [], heroes = [];
  let looks = 0;
  // a set, held to its floor, set whole on two lines, inside the width it was given
  const judge = (where, set, role, text, tw) => {
    if (!text) return;
    const css = set.px / API.uiDpr;
    if (css < FLOOR[role]) small.push({ where, role, css });
    if (set.lines.join(' ') !== text || set.lines.length > 2 || set.w > tw + 0.5) {
      long.push({ where, text, lines: set.lines, w: Math.round(set.w), tw: Math.round(tw) });
    }
  };
  try {
    for (const [w, h, dpr] of VIEWS) {
      size(w, h, dpr);
      const at = w + 'x' + h + '@' + dpr;
      const ctx = measuring();
      const sizes = { S: API.scale, lead: Infinity, body: Infinity, docks: new Set() };
      tour(label => {
        for (const t of [false, true]) {
          API.setTouchMode(t);
          const c = API.drillCopy();
          const where = at + ' ' + label + (t ? ' / touch' : ' / mouse');
          const S = API.scale;
          if (drill().step === 'graduate') {
            const g = API.gradSheetRect(ctx), tw = g.w - g.pad * 2;
            judge(where, g.lead, 'coachLead', c.lead, tw);
            judge(where, g.cap, 'coachBody', c.caption, tw);
            judge(where, g.micro, 'coachBody', c.micro, tw);
            sizes.lead = Math.min(sizes.lead, g.lead.px / API.uiDpr);
          } else {
            API.drawCoachLayer(ctx);   // what docks it, as a frame would
            const r = API.coachCardRect(ctx);
            judge(where, r.lead, r.leadRole, c.lead, r.tw);
            if (r.cap) judge(where, r.cap, r.bodyRole, c.caption, r.tw);
            sizes.lead = Math.min(sizes.lead, r.lead.px / API.uiDpr);
            if (r.cap) sizes.body = Math.min(sizes.body, r.cap.px / API.uiDpr);
            sizes.docks.add(r.dock);
            if (game.phase !== 'capture') {
              const card = API.coachUI.card, sc = API.coachScene();
              const marks = sc.rings.filter(q => !q.thin).map(q => ({ x: q.h.x, y: q.h.y, rad: 10 }))
                .concat(sc.markers ? [6, 12].map(col => ({ x: tcx(col), y: tcy(1), rad: 5 })) : []);
              for (const m of marks) {
                const x = m.x * S, y = (m.y + 24) * S, k = m.rad * S;
                if (card && x + k > card.x && x - k < card.x + card.w && y + k > card.y && y - k < card.y + card.h) {
                  over.push({ where, dock: API.coachFx.dock, at: [m.x, m.y] });
                }
              }
            }
          }
          looks++;
        }
        API.setTouchMode(false);
      });
      for (const t of [false, true]) {
        API.setTouchMode(t);
        for (const kind of Object.keys(API.TIP)) {
          const c = API.tipCopy(kind, 'EMBER'), r = API.tipRect(ctx, c, kind), most = r.w - r.pad * 2;
          const where = at + ' tip ' + kind + (t ? ' / touch' : ' / mouse');
          judge(where, r.lead, r.leadRole, c.lead, Math.max(most, r.lead.w));
          judge(where, r.cap, r.bodyRole, c.caption, Math.max(most, r.cap.w));
          if (r.lead.w > most + 0.5 || r.cap.w > most + 0.5) long.push({ where, toast: Math.round(r.w) });
        }
      }
      API.setTouchMode(false);

      /* The hero, on each glass: the practice's first card, at rest and at
         its stuck rung, and a first game's toast, in both idioms -- centred
         on the glass, in the hero's own roles, a size up from the docked
         card's, and set whole by the judge above. The card is centred on
         the den; the toast, whose caption is about the ghosts in the den,
         is clear of the den and of the first ghost's start, so it never
         covers what it talks about. */
      const W = API.screen.width, mid = API.heroMid();
      const centred = r => Math.abs(r.x + r.w / 2 - W / 2) <= 1 && Math.abs(r.y + r.h / 2 - mid) <= 1;
      const across = r => Math.abs(r.x + r.w / 2 - W / 2) <= 1;
      const meets = (r, q) => r.x < q.x + q.w && r.x + r.w > q.x && r.y < q.y + q.h && r.y + r.h > q.y;
      const T = 8, D = API.DEN, dp = API.glassAt(D.left * T, D.top * T);
      const denRect = { x: dp.x, y: dp.y,
        w: (D.right + 1 - D.left) * T * API.scale, h: (D.bottom + 1 - D.top) * T * API.scale };
      const bp = API.glassAt(API.DEN_EXIT_X - 7, (API.DEN_EXIT_ROW + 0.5) * T - 7);
      const startRect = { x: bp.x, y: bp.y, w: 14 * API.scale, h: 14 * API.scale };
      const upFrom = API.coachCardRect(ctx, { lead: 'Time is running.', caption: 'Click anywhere to stop it.' }, 'bottom');
      returning();
      API.startDrill();
      sim(100);
      settle();
      for (const stuck of [false, true]) {
        if (stuck) age(API.COACH_ANYWHERE);
        for (const t of [false, true]) {
          API.setTouchMode(t);
          const c = API.drillCopy(), where = at + ' hero' + (stuck ? ', stuck' : '') + (t ? ' / touch' : ' / mouse');
          API.drawCoachLayer(ctx);
          const r = API.coachCardRect(ctx);
          judge(where, r.lead, 'heroLead', c.lead, r.tw);
          judge(where, r.cap, 'heroBody', c.caption, r.tw);
          if (r.dock !== 'hero' || !centred(r) || r.lead.px < upFrom.lead.px * 1.3 || r.cap.px <= upFrom.cap.px
              || !API.coachUI.card || API.coachUI.card.y !== r.y || API.coachUI.card.w !== r.w) {
            heroes.push({ where, dock: r.dock, r: [r.x, r.y, r.w, r.h], px: [r.lead.px, r.cap.px], mid });
          }
        }
      }
      API.setTouchMode(false);
      API.endDrill('skipped');
      for (const t of [false, true]) {
        API.setTouchMode(t);
        const r = API.tipRect(ctx, API.tipCopy('freeze'), 'freeze');
        if (!r.hero || !across(r) || meets(r, denRect) || meets(r, startRect) || r.lead.px < upFrom.lead.px * 1.3) {
          heroes.push({ where: at + ' toast' + (t ? ' / touch' : ' / mouse'), r: [r.x, r.y, r.w, r.h], px: r.lead.px,
            den: denRect.y, start: startRect.y });
        }
      }
      API.setTouchMode(false);

      /* The tour's ghosts never stand under the bottom dock, so on its own
         it cannot tell a card that docks from one that never leaves the
         bottom. Here they are put there, on each glass, at the card's real
         two-line height: the ghost it asks for under the bottom dock sends
         it to the top at once, off the ring, with SKIP inside it; and the
         trap's two end rings, which always sit under the top dock, send a
         card resting there back down at once, with nothing else to say so. */
      const S = API.scale, fx = API.coachFx;
      const onRing = (h, card) => {
        const x = h.x * S, y = (h.y + 24) * S, k = 10 * S;
        return x + k > card.x && x - k < card.x + card.w && y + k > card.y && y - k < card.y + card.h;
      };
      const inside = (a, b) => !!a && !!b && a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
      returning();
      API.setTouchMode(false);
      API.startDrill();
      sim(100);
      settle();
      tap(mouse, ...EMPTY);
      const R = game.hunters[0], M = game.hunters[1], E = game.evader;
      /* he starts on row 23, under a phone's bottom dock, and may already
         have sent it up: put him in the middle band, and the card at the
         bottom, freshly arrived, so only the ghost can move it -- at once */
      E.x = tcx(26); E.y = tcy(14);
      Object.assign(fx, { dock: 'bottom', dockAt: API.uiClock, clearAt: API.uiClock });
      const bot = API.coachCardRect(ctx, undefined, 'bottom');
      R.x = (bot.x + bot.w * 0.3) / S; R.y = (bot.y + bot.h / 2) / S - 24;
      API.drawCoachLayer(ctx);
      if (fx.dock !== 'top' || onRing(R, API.coachUI.card)
          || !inside(API.coachUI.skip, API.coachUI.card) || API.coachUI.card.y !== API.coachCardRect(ctx).y) {
        docked.push({ at, draw: { dock: fx.dock, card: API.coachUI.card, skip: API.coachUI.skip } });
      }
      API.loadTrap(false);
      drill().fails = 2;
      // all three to the middle band, under neither dock: only the end rings are left to move it
      const [TR, TM] = game.hunters, TE = game.evader;   // the trap deals its actors afresh
      TR.x = tcx(6); TR.y = tcy(15); TM.x = tcx(21); TM.y = tcy(15); TE.x = tcx(26); TE.y = tcy(14);
      // freshly arrived at the top, so the fingertip's strokes up there cannot move it yet
      Object.assign(fx, { dock: 'top', dockAt: API.uiClock, clearAt: API.uiClock });
      API.drawCoachLayer(ctx);
      if (!API.coachScene().markers || fx.dock !== 'bottom') docked.push({ at, marks: fx.dock });
      // a ring under the top dock as well: the bottom is still the only clean place
      const top = API.coachCardRect(ctx, undefined, 'top');
      TR.x = (top.x + top.w * 0.7) / S; TR.y = (top.y + top.h / 2) / S - 24;
      frames(API.DOCK_HOME + 2);
      API.drawCoachLayer(ctx);
      if (fx.dock !== 'bottom' || onRing(TR, API.coachUI.card)) docked.push({ at, both: fx.dock });
      API.endDrill('skipped');

      seen.push(at + ' S' + sizes.S + ' lead ' + sizes.lead + ' body ' + sizes.body + ' ' + [...sizes.docks].join('/'));
    }
  } finally {
    size(900, 1000, undefined);
    API.setTouchMode(false);
  }
  console.log('    ' + seen.join('\n    '));
  ok('the coach roles rest at 16 and 14 CSS px at least, and grow with the scale',
     API.TYPE_ROLES.coachLead.floor === 16 && API.TYPE_ROLES.coachBody.floor === 14
     && API.TYPE_ROLES.coachLead.k * 5 > 16 && API.TYPE_ROLES.coachBody.k * 5 > 14);
  ok('on ' + VIEWS.length + ' screens (' + looks + ' looks), the lead is never under 16 CSS px nor the caption 14',
     small.length === 0 && looks > 400, small.slice(0, 8));
  ok('...every sentence set whole, on two lines at most, inside its plate', long.length === 0, long.slice(0, 8));
  ok('...and the card never rests over the ghost it asks for, or the trap\'s rings', over.length === 0, over.slice(0, 8));
  ok('step one\'s hero centred over the den on every screen, a first game\'s toast centred clear of the den and the first ghost\'s start, a size up, at 22 and 16 CSS px at least',
     heroes.length === 0 && API.TYPE_ROLES.heroLead.floor === 22 && API.TYPE_ROLES.heroBody.floor === 16, heroes.slice(0, 8));
  ok('...and with that ghost put under it, it docks at the top, off the ring, SKIP inside it; the trap\'s end rings send it down',
     docked.length === 0, docked.slice(0, 8));
}

console.log('\n== a new glass, and the card is simply there ==');
{
  /* A resize or a phone turning builds the type afresh, and the card's
     spring with it: the first frame at the new scale lands the card at
     rest, as a practice's first frame does, rather than flying it in from
     display px of a glass that is gone. */
  const size = (w, h, dpr) => { win.innerWidth = w; win.innerHeight = h; win.devicePixelRatio = dpr; API.layout(); };
  const drawnAt = () => { const g = API.coachFx.geo; return g && { y: g.y0, h: g.h0, y1: g.y1, h1: g.h1 }; };
  const same = (a, b) => !!a && !!b && ['x', 'y', 'w', 'h'].every(k => Math.abs(a[k] - b[k]) < 0.5);
  const bad = [];
  const VIEWS = [[1920, 1080, 1], [1024, 768, 1], [390, 844, 3], [844, 390, 3]];
  try {
    size(1024, 768, 1);
    returning();
    API.setTouchMode(false);
    API.startDrill();
    frames(60);
    // the hero first: it has no spring, and is simply drawn where it rests
    for (const [w, h, dpr] of VIEWS) {
      size(w, h, dpr);
      API.render();
      if (!same(API.coachFx.drawn, API.coachUI.card) || API.coachCardRect().dock !== 'hero') {
        bad.push({ hero: true, w, h, dpr, drawn: API.coachFx.drawn, card: API.coachUI.card });
      }
    }
    tap(mouse, ...EMPTY);
    frames(60);   // home at the dock
    for (const [w, h, dpr] of VIEWS) {
      size(w, h, dpr);
      API.render();
      const g = drawnAt(), c = API.coachUI.card;
      if (!g || !c || g.y !== c.y || g.h !== c.h || g.y1 !== c.y || g.h1 !== c.h
          || !same(API.coachFx.drawn, c)) bad.push({ w, h, dpr, g, card: c });
    }
    API.endDrill('skipped');
  } finally {
    size(900, 1000, undefined);
  }
  ok('the first frame after a resize draws the card at its resting rect, hero or docked', bad.length === 0, bad);
}

/* ---- after the practice ----
   What a real game shows once the practice is behind it, or skipped.
   All of it is glass: toasts that take no press, one control in the
   manual, one chip on a game over. The tips are read here through the
   same render a player sees, with the browser's memory swapped in. */
const tipsFresh = (bits) => {
  API.setTipBits(bits);
  Object.assign(API.tipUI, { active: null, leaving: null, at: -1e9, nudgeAt: -1e9, campAt: -1e9 });
};
const toPlay = () => sim(400, () => game.phase === 'play');
// a display-px rect's centre, pressed as a player would
const pressAt = (P, r) => {
  const x = (r.x + r.w / 2) / API.scale, y = (r.y + r.h / 2) / API.scale - 24;
  P.down(x, y); P.up(x, y);
};
const snapshot = () => JSON.stringify({ phase: game.phase, phaseT: game.phaseT, tick: game.tick,
  paths: game.hunters.map(h => h.path && h.path.tiles.length), pos: game.hunters.map(h => [h.x, h.y]),
  ev: [game.evader.x, game.evader.y] });

console.log('\n== the first real game\'s toast ==');
{
  firstVisit();
  mem.gpOnboard = 'skipped';   // they skipped the practice
  const camp = { l: game.campLimit, c: game.campChoice };
  game.campLimit = null;       // no camp freeze stepping into rounds left alone on purpose
  API.setTouchMode(false);
  tipsFresh(0);
  game.newGame();
  API.render();
  ok('a first real game has the toast up from READY', game.phase === 'ready' && API.tipUI.active === 'freeze',
     { phase: game.phase, active: API.tipUI.active });
  const c = API.tipCopy('freeze');
  ok('it says what the press does, in the mouse\'s words',
     c.lead === 'Click anywhere to stop time.' && c.caption === '3 more ghosts wait in the den for your paths.', c);
  API.setTouchMode(true);
  ok('and in the finger\'s', API.tipCopy('freeze').lead === 'Tap anywhere to stop time.');
  API.setTouchMode(false);

  const before = snapshot();
  for (let i = 0; i < 5; i++) API.render();
  ok('drawing it moves nothing', snapshot() === before);

  const t0 = game.phaseT;
  mouse.down(...EMPTY);
  ok('a press in READY is still not a freeze', game.phase === 'ready' && game.phaseT === t0);
  ok('...but the toast answers it', API.tipUI.nudgeAt === API.uiClock);
  mouse.up(...EMPTY);
  API.tipUI.nudgeAt = -1e9;
  fire(win, 'keydown', { code: 'Space', repeat: false, preventDefault() {} });
  ok('Space in READY is answered the same way', game.phase === 'ready' && API.tipUI.nudgeAt === API.uiClock);

  toPlay();
  API.render();
  ok('in play it is still up, and GRAB A GHOST stands aside for it',
     API.tipUI.active === 'freeze' && !API.hintWindowOpen() && game.phase === 'play');
  /* A hero, as the practice's first card is: centred on the glass, in
     the hero's type -- but off the den, whose waiting ghosts its caption
     is about, and off the first ghost's start: the ghosts it talks about
     stay in plain view. It takes no press -- one on its glass is a press
     on the maze, and stops time. */
  const tr = API.tipUI.rect, W = API.screen.width, Sc = API.scale;
  const denTop = API.glassAt(0, API.DEN.top * 8).y;
  const startTop = API.glassAt(0, (API.DEN_EXIT_ROW + 0.5) * 8 - 7).y;
  const ghostsOut = game.hunters.filter(h => {
    const p = API.glassAt(h.x, h.y), k = 7 * Sc;
    return tr && p.x + k > tr.x && p.x - k < tr.x + tr.w && p.y + k > tr.y && p.y - k < tr.y + tr.h;
  });
  ok('it is a hero: centred on the glass, a size up from the docked card',
     !!tr && tr.hero && Math.abs(tr.x + tr.w / 2 - W / 2) <= 1
     && tr.lead.px >= API.uiDpr * 22 && tr.cap.px >= API.uiDpr * 16
     && tr.lead.px > API.TYPE.coachLead.max, tr && { x: tr.x, y: tr.y, w: tr.w, h: tr.h, lead: tr.lead.px });
  ok('...over neither the den nor the first ghost\'s start, and over no ghost at all',
     !!tr && tr.y + tr.h <= startTop && tr.y + tr.h <= denTop && ghostsOut.length === 0,
     tr && { bottom: tr.y + tr.h, startTop, denTop, under: ghostsOut.map(h => h.def.name) });
  const onToast = { x: tr.x + tr.w * 0.12, y: tr.y + tr.h / 2, w: 0, h: 0 };
  ok('(the spot pressed is its glass, over no ghost)',
     !Draw.poolAt(onToast.x / API.scale, onToast.y / API.scale - 24).length);
  pressAt(mouse, onToast);
  ok('a press on it is a press on the maze: the player\'s own freeze, the lesson learned',
     game.phase === 'command' && (API.tipBits & API.TIP.freeze) && wrote('gpTips', '1'), writes);
  API.render();
  ok('and the toast leaves', API.tipUI.active === null && API.tipUI.leaving && API.tipUI.leaving.kind === 'freeze');
  const was = API.tipUI.leaving && API.tipUI.leaving.at;
  frames(API.FX_EXIT + 2);
  ok('...fading where it stood, and gone', API.tipUI.leaving === null && API.tipUI.rect === null
     && API.uiClock - was >= API.FX_EXIT);
  game.newGame();
  API.render();
  ok('never to come back in a later game', API.tipUI.active !== 'freeze');
  API.loadTips();
  ok('as the browser remembers it', API.tipBits & API.TIP.freeze);

  // the freezes that were not the player's own
  tipsFresh(0);
  game.newGame();
  toPlay();
  API.render();
  API.openHelp();
  API.closeHelp();
  ok('the manual\'s freeze does not count', game.phase === 'command' && !(API.tipBits & API.TIP.freeze));
  tipsFresh(0);
  game.newGame();
  game.campLimit = 30;
  toPlay();
  sim(400, () => game.phase === 'command');
  ok('the camp limit\'s freeze does not count', game.phase === 'command' && API.stalledHunter()
     && !(API.tipBits & API.TIP.freeze));
  game.campLimit = 600;

  // and the keys that do
  for (const code of ['Space', 'KeyP', 'Digit1', 'Tab']) {
    tipsFresh(0);
    game.newGame();
    toPlay();
    fire(win, 'keydown', { code, repeat: false, preventDefault() {} });
    ok(code + ' freezes by hand, and counts', game.phase === 'command' && (API.tipBits & API.TIP.freeze));
  }
  tipsFresh(0);
  game.newGame();
  toPlay();
  fire(screen, 'mousedown', { button: 2, clientX: EMPTY[0], clientY: EMPTY[1] + 24 });
  fire(win, 'mouseup', { button: 2, clientX: EMPTY[0], clientY: EMPTY[1] + 24 });
  ok('so does the right button', game.phase === 'command' && (API.tipBits & API.TIP.freeze));
  tipsFresh(0);
  game.newGame();
  toPlay();
  sim(60);
  const R = game.hunters[0];
  drag(finger, at(R), px(R.tile().c, 5));
  ok('and a ghost grabbed with a finger mid-play', game.phase === 'command' && (API.tipBits & API.TIP.freeze));
  API.setTouchMode(false);

  // a round that never froze: the toast gives up, and GRAB A GHOST has its turn
  tipsFresh(0);
  game.newGame();
  toPlay();
  API.render();
  sim(API.TIP_G1_PLAY);
  API.render();
  ok('eight seconds of play untouched and the toast hides, unspent',
     API.tipUI.active === null && !(API.tipBits & API.TIP.freeze) && game.phase === 'play');
  ok('GRAB A GHOST takes over for the rest of its window', API.hintWindowOpen());
  game.newGame();
  frames(10);
  ok('and the next game has the toast again', API.tipUI.active === 'freeze');

  // the practice and its graduates
  tipsFresh(0);
  API.startDrill();
  API.render();
  ok('never over the practice', API.tipUI.active === null);
  API.endDrill('skipped');
  ok('a skip leaves the lesson for the first game', !(API.tipBits & API.TIP.freeze));
  API.render();
  ok('...which shows it', API.tipUI.active === 'freeze');
  API.startDrill();
  API.endDrill('done');
  ok('a graduate never needs it', API.tipBits & API.TIP.freeze);
  API.render();
  ok('so a graduate\'s first game is quiet', API.tipUI.active !== 'freeze');

  tipsFresh(0);
  API.startDemo();
  API.render();
  ok('nor over the attract demo', API.tipUI.active === null);
  API.enterAttract();
  game.campLimit = camp.l; game.campChoice = camp.c;
  returning();
}

console.log('\n== the tips ==');
{
  firstVisit();
  mem.gpOnboard = 'done';
  const ALL = 31;
  const camp = { l: game.campLimit, c: game.campChoice };
  game.campLimit = null;
  const run = (bits) => { tipsFresh(bits); game.newGame(); toPlay(); sim(60); API.render(); };

  run(ALL & ~API.TIP.fright);
  game.triggerFright();
  const fr = snapshot();
  API.render();
  ok('the first blue ghost: a toast', API.tipUI.active === 'fright', API.tipUI.active);
  ok('spent as it shows', (API.tipBits & API.TIP.fright) && wrote('gpTips', String(ALL)), writes.slice(-2));
  ok('and it told the game nothing', snapshot() === fr);
  ok('its words', API.tipCopy('fright').lead === 'Blue ghosts can be eaten.');
  const tipBad = [];
  for (const t of [false, true]) {
    API.setTouchMode(t);
    for (const k of Object.keys(API.TIP)) {
      const c = API.tipCopy(k, 'EMBER'), line = c.lead + ' | ' + c.caption;
      if (t ? /click/i.test(line) : /\btap\b|finger/i.test(line)) tipBad.push(k + (t ? ' / touch: ' : ' / mouse: ') + line);
    }
  }
  API.setTouchMode(false);
  ok('every tip speaks the live idiom (' + Object.keys(API.TIP).length + ' kinds, both)', tipBad.length === 0, tipBad);
  frames(API.TIP_SHOW + 12);
  ok('three and a half seconds, then gone', API.tipUI.active === null);
  game.frightT = 0;
  game.triggerFright();
  API.render();
  ok('once ever', API.tipUI.active === null);

  run(ALL & ~API.TIP.eaten);
  game.hunters[0].dissolve();
  API.render();
  ok('the first ghost eaten: a toast', API.tipUI.active === 'eaten'
     && API.tipCopy('eaten').lead === 'Eaten ghosts wait 5 seconds in the den.');

  run(ALL & ~API.TIP.camp);
  game.campLimit = 30;
  sim(400, () => game.phase === 'command');
  API.render();
  ok('the camp limit\'s first freeze: a toast naming the ghost', API.tipUI.active === 'camp'
     && API.tipCopy('camp', API.tipUI.name).lead === 'Raze waited too long.', API.tipUI);
  ok('the chip is still, while it rises', API.campPulse() === 0);
  frames(14 + 24);
  ok('then it swells once', API.campPulse() > 0.5);
  frames(60);
  ok('and settles', API.campPulse() === 0);
  game.campLimit = null;

  run(ALL & ~API.TIP.beads);
  const route = API.bfsRoute(game.hunters[0].tile(), { c: 1, r: 5 });
  game.hunters[0].setOrder(route, false);
  game.hunters[1].setOrder(route, false);
  API.render();
  ok('white beads in live play say nothing', API.tipUI.active === null);
  tap(mouse, ...EMPTY);
  API.render();
  ok('the first frozen frame with white beads: a toast', API.tipUI.active === 'beads'
     && API.tipCopy('beads').lead === 'White beads: these two arrive together.');

  // the freeze toast goes first; a lesson due behind it waits for its turn
  run(0);
  game.triggerFright();
  API.render();
  ok('the freeze toast outranks the rest', API.tipUI.active === 'freeze' && !(API.tipBits & API.TIP.fright));
  tap(mouse, ...EMPTY);
  API.render();
  frames(10);
  ok('and when the click is found, the fright it held back is next', API.tipUI.active === 'fright');

  // what the browser keeps
  storage.getItem = () => 'garbage';
  API.loadTips();
  ok('unreadable memory is no tips shown', API.tipBits === 0);
  storage.getItem = () => { throw new Error('denied'); };
  API.loadTips();
  ok('memory that will not answer is no tips shown', API.tipBits === 0);
  storage.setItem = () => { throw new Error('denied'); };
  run(ALL & ~API.TIP.fright);
  game.triggerFright();
  API.render();
  ok('and a refused write still shows a tip only once this page', API.tipUI.active === 'fright'
     && (API.tipBits & API.TIP.fright));

  // nothing in the tips can reach the game: its source never names them
  const upd = body('  update() {\n    this.tick++;') || '';
  const sec = SRC.slice(SRC.indexOf('/* ---- after the practice: the tips ----'), SRC.indexOf('/* The pincer read, heard.'));
  ok('game.update never reads a tip', upd.length > 2000 && !/\btip[A-Z]|\bTIP\b|tipBits|g1Wanted|gameOverFx/.test(upd),
     { length: upd.length });
  ok('and the tips never draw on the board', sec.length > 1000 && !/nativeCtx|drawText\(|\bPAL\./.test(sec));
  API.enterAttract();
  game.campLimit = camp.l; game.campChoice = camp.c;
  returning();
}

console.log('\n== PRACTICE in the manual ==');
{
  firstVisit();
  mem.gpOnboard = 'done';
  const orig = { limit: game.campLimit, choice: game.campChoice };
  game.campLimit = 180; game.campChoice = 1;   // the player's own, and not the default
  const camp0 = { limit: 180, choice: 1 };
  for (const P of [mouse, finger]) {
    const name = P.name + ': ';
    API.enterAttract();
    API.openHelp();
    API.render();
    ok(name + 'on the title it reads PRACTICE', API.practiceLabel() === 'PRACTICE ▶' && !!API.helpUI.practice);
    if (P === mouse) {
      const r = API.helpUI.practice;
      API.input.hovering = true; API.input.dx = r.x + r.w / 2; API.input.dy = r.y + r.h / 2;
      const t = API.pointerTarget();
      ok('a hand over it', t.cursor === 'pointer' && t.hover === 'practice', t);
      API.input.hovering = false;
    }
    pressAt(P, API.helpUI.practice);
    ok(name + 'one press and the manual gives way to the practice',
       !game.helpOpen && drill() && drill().step === 'freeze' && game.phase === 'play');
    API.endDrill('skipped');

    // over a game still being played, it asks first
    game.newGame();
    toPlay();
    API.openHelp();
    API.render();
    pressAt(P, API.helpUI.practice);
    API.render();
    ok(name + 'mid-game, the first press only asks', game.helpOpen && !game.drill
       && API.practiceLabel() === 'END THIS GAME?' && game.phase === 'command');
    pressAt(P, API.helpUI.practice);
    ok(name + 'and the second is the yes', !game.helpOpen && drill() && drill().step === 'freeze');
    ok(name + 'with the camp limit it came in with kept aside',
       drill().saved.campLimit === camp0.limit && drill().saved.campChoice === camp0.choice);
    API.endDrill('skipped');

    game.newGame();
    toPlay();
    API.openHelp();
    API.render();
    pressAt(P, API.helpUI.practice);
    frames(API.HELP_CONFIRM + 2);
    ok(name + 'three seconds and the question lapses', API.practiceLabel() === 'PRACTICE ▶');
    API.render();
    pressAt(P, API.helpUI.practice);
    ok(name + '...so the next press asks again', game.helpOpen && !game.drill);
    API.closeHelp();
    API.openHelp();
    ok(name + 'and shutting the manual withdraws it', API.practiceLabel() === 'PRACTICE ▶');
    API.closeHelp();

    // during the practice it starts over, no questions
    API.startDrill();
    settle();
    tap(P, ...EMPTY);
    const was = drill().step;
    API.openHelp();
    API.render();
    ok(name + 'in the practice it reads RESTART PRACTICE', was === 'draw' && API.practiceLabel() === 'RESTART PRACTICE');
    pressAt(P, API.helpUI.practice);
    ok(name + 'and starts it over at once', !game.helpOpen && drill().step === 'freeze' && game.phase === 'play');
    API.endDrill('skipped');
    ok(name + 'the camp limit comes back as it was', game.campLimit === camp0.limit && game.campChoice === camp0.choice);
    API.setTouchMode(false);
  }
  API.enterAttract();
  game.campLimit = orig.limit; game.campChoice = orig.choice;
  returning();
}

console.log('\n== a game over with no catch ==');
{
  firstVisit();
  mem.gpOnboard = 'done';
  const camp = { l: game.campLimit, c: game.campChoice };
  game.campLimit = null;
  game.newGame();
  ok('a new game has caught nobody', game.catches === 0);
  toPlay();
  sim(100);
  const R = game.hunters[0];
  game.evader.x = R.x; game.evader.y = R.y;
  sim(1);
  ok('a real catch is counted', game.phase === 'capture' && game.catches === 1);
  game.newGame();
  ok('and a new game starts the count over', game.catches === 0);
  API.startDrill();
  sim(100);
  game.evader.x = game.hunters[0].x; game.evader.y = game.hunters[0].y;
  sim(1);
  ok('a practice catch is not', game.phase === 'capture' && game.catches === 0, { phase: game.phase, n: game.catches });
  API.endDrill('skipped');

  Object.assign(API.gameOverFx, { live: false, spent: false, at: -1e9 });
  game.phase = 'gameover'; game.phaseT = 0; game.catches = 1;
  API.render();
  ok('a game over after a catch offers nothing', API.gameOverUI.practice === null);
  game.phase = 'gameover'; game.catches = 0;
  API.render();
  const chip = API.gameOverUI.practice;
  ok('a catchless one offers the practice', !!chip);
  API.input.hovering = true; API.input.dx = chip.x + chip.w / 2; API.input.dy = chip.y + chip.h / 2;
  const t = API.pointerTarget();
  ok('under a hand', t.cursor === 'pointer' && t.hover === 'retry', t);
  API.input.hovering = false;
  pressAt(mouse, chip);
  ok('one press on it is the practice', drill() && drill().step === 'freeze' && game.phase === 'play');
  API.endDrill('skipped');
  API.render();
  game.phase = 'gameover'; game.phaseT = 0; game.catches = 0;
  API.render();
  ok('once per page load', API.gameOverUI.practice === null);
  tap(mouse, 100, 100);
  ok('and the rest of a game over is a new game, as ever', game.phase === 'ready' && !game.drill);

  Object.assign(API.gameOverFx, { live: false, spent: false, at: -1e9 });
  game.phase = 'gameover'; game.phaseT = 0; game.catches = 0;
  API.render();
  API.setTouchMode(true);
  pressAt(finger, API.gameOverUI.practice);
  ok('a finger takes it too', drill() && drill().step === 'freeze');
  API.endDrill('skipped');
  API.setTouchMode(false);
  API.enterAttract();
  game.campLimit = camp.l; game.campChoice = camp.c;
  returning();
}

returning();
console.log('\n' + (fail === 0 ? 'ALL ' + pass + ' CHECKS PASSED' : pass + ' passed, ' + fail + ' FAILED'));
process.exit(fail === 0 ? 0 : 1);
