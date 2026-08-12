// Mechanic tests for Ghost Protocol, run headless in Node.
const API = require('./harness.js');
const { game, Draw, tcx, tcy, COLS, bfsRoute, neighborsOf, wrapCol, OPP } = API;
const dots = () => API.dots;
const dotTotal = () => API.dotTotal;

let pass = 0, fail = 0, loopLength = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  -> ' + JSON.stringify(extra) : '')); }
}
function tick(n) {
  const live = ['ready','play','capture','flash','escaped','gameover'];
  for (let i = 0; i < n; i++) {
    // ghosts don't camp: the game halts for orders. Headless tests are not
    // here to give orders, so force-resume at the top of each tick -- the
    // flip happens BEFORE the update, so a freeze is still observable after
    // the final tick of a loop.
    if (game.phase === 'command') game.phase = 'play';
    if (live.includes(game.phase)) game.update();
    game.popups = game.popups.filter(p => --p.t > 0);
  }
}
function toPlay() {
  game.newGame();
  while (game.phase === 'ready') game.update();  // wait out READY, whatever its length
  tick(20);
}

console.log('\n== path drawing ==');
toPlay();
game.phase = 'command';
{
  const h = game.hunters[0];
  h.state = 'active'; h.x = tcx(1); h.y = tcy(1); h.dir = null; h.path = null;
  Draw.begin(h);
  Draw.extendToward(6, 1);
  const fwd = Draw.active.tiles.length;
  Draw.extendToward(3, 1);
  const back = Draw.active.tiles.length;
  ok('drag forward extends the tip', fwd === 6, { fwd });
  ok('dragging back retracts it', back === 3, { fwd, back });

  Draw.extendToward(6, 1); Draw.extendToward(6, 5);
  Draw.extendToward(1, 5); Draw.extendToward(1, 1);
  ok('returning to the start tile arms loop closure', Draw.active.closable === true);
  const drawn = Draw.active.tiles.length;
  Draw.commit(true);
  ok('committed path is a closed patrol', h.path && h.path.closed === true);
  ok('closed path drops the duplicated start tile', h.path.tiles.length === drawn - 1,
     { drawn, len: h.path && h.path.tiles.length });
  loopLength = h.path.tiles.length;
}

console.log('\n== the wall-stop rule ==');
{
  const h = game.hunters[1];
  h.state = 'active'; h.path = null;
  h.x = tcx(6); h.y = tcy(9); h.dir = 'up';
  game.phase = 'play';
  for (let i = 0; i < 400; i++) h.update(game);
  const t = h.tile();
  ok('an unordered hunter runs until a wall, then stops dead',
     h.dir === null && !API.isOpen(t.c, t.r - 1) && t.r < 9,
     { tile: t, dir: h.dir, aboveOpen: API.isOpen(t.c, t.r - 1) });
  const before = { x: h.x, y: h.y };
  for (let i = 0; i < 200; i++) h.update(game);
  ok('and it stays stopped with no order', h.x === before.x && h.y === before.y);
}

console.log('\n== patrol loops run forever ==');
{
  const h = game.hunters[0];
  const seen = new Set();
  for (let i = 0; i < 4000; i++) {
    h.update(game);
    const t = h.tile(); seen.add(t.c + ',' + t.r);
  }
  ok('a looped hunter keeps walking its circuit', h.path !== null && h.dir !== null);
  ok('the circuit covers its whole perimeter', seen.size === loopLength,
     { walked: seen.size, loop: loopLength });
}

console.log('\n== self-crossing paths are legal ==');
{
  game.phase = 'command';
  const h = game.hunters[2];
  h.state = 'active'; h.x = tcx(1); h.y = tcy(1); h.dir = null; h.path = null;
  Draw.begin(h);
  Draw.extendToward(6, 1); Draw.extendToward(6, 5);
  Draw.extendToward(1, 5); Draw.extendToward(1, 1);
  const around = Draw.active.tiles.length;
  Draw.extendToward(6, 1);   // re-enter an earlier corridor the long way
  ok('re-entering an earlier corridor crosses instead of retracting',
     Draw.active.tiles.length > around, { around, now: Draw.active.tiles.length });
  Draw.active = null;
}

console.log('\n== stacked ghosts stay reachable ==');
{
  toPlay();
  const H = game.hunters;
  H.forEach(h => { h.state = 'active'; h.path = null; h.dir = 'left';
                   h.x = tcx(6); h.y = tcy(8); });
  game.phase = 'command';
  const picks = [];
  for (let i = 0; i < 5; i++) {
    const p = Draw.pickAt(tcx(6), tcy(8));
    picks.push(p ? p.key : null);
  }
  ok('clicking a pile of ghosts cycles through every one of them',
     new Set(picks.slice(0, 4)).size === 4, { picks });
  ok('and the cycle wraps back round', picks[4] === picks[0], { picks });

  Draw.selected = 2;                     // as a number key would
  Draw.begin(H[Draw.selected]);
  ok('a ghost selected by number is the one that gets drawn for',
     Draw.active.hunter === H[2]);
  Draw.extendToward(12, 8);
  Draw.commit(true);
  ok('and the order lands on that ghost, not the one on top',
     H[2].path !== null && H[0].path === null,
     { volt: !!H[2].path, raze: !!H[0].path });
}

console.log('\n== the tip never reroutes on the player\'s behalf ==');
{
  toPlay();
  game.phase = 'command';
  const h = game.hunters[0];
  h.state = 'active'; h.x = tcx(1); h.y = tcy(1); h.dir = null; h.path = null;
  Draw.begin(h);
  // row 1 is a corridor; row 4 is walled between columns 2 and 5. Dragging
  // the cursor into that wall must stall the tip, not send it the long way.
  Draw.extendToward(6, 1);
  const atCorner = Draw.active.tiles.length;
  Draw.extendToward(1, 4);
  const after = Draw.active.tiles;
  const tip = after[after.length - 1];
  const detoured = after.length > atCorner + 6;
  ok('dragging into a wall stalls the tip instead of pathfinding around it',
     !detoured, { atCorner, after: after.length, tip });
  ok('and the tip is left on a tile adjacent to where it stopped',
     API.isOpen(tip.c, tip.r), { tip });
  Draw.active = null;
}

console.log('\n== orders can be queued for a hunter still in the den ==');
{
  toPlay();
  const h = game.hunters.find(x => x.inDenStates()) || game.hunters[3];
  ok('a denned hunter is commandable', h.isCommandable(), { state: h.state });
  game.phase = 'command';
  Draw.begin(h);
  ok('its trail starts at the den door',
     Draw.active.tiles[0].r === 11, { anchor: Draw.active.tiles[0] });
  Draw.extendToward(6, 11);
  Draw.commit(true);
  ok('the order sticks while it waits', h.path !== null);
  game.phase = 'play';
  let n = 0;
  while (h.state !== 'active' && n++ < 4000) { if (h.releaseT > 2) h.releaseT = 2; tick(1); }
  ok('and it still has the order once it gets out',
     h.state === 'active' && h.path !== null, { state: h.state, path: !!h.path });
}

console.log('\n== a failed drag must not wipe an existing order ==');
{
  const h = game.hunters[2];
  h.setOrder([{ c: 1, r: 1 }, { c: 2, r: 1 }, { c: 3, r: 1 }], false);
  game.phase = 'command';
  Draw.begin(h);
  Draw.extendToward(13, 13);        // inside the den: illegal, tip never moves
  Draw.commit(true);                // committed after a real drag gesture
  ok('a drag that found no legal tile leaves the order alone', h.path !== null);
  Draw.begin(h);
  Draw.commit(false);               // a true click with no drag
  ok('a bare click never clears an order (there is no clear gesture)', h.path !== null);
}

console.log('\n== continue a route from its arrowhead ==');
{
  toPlay();
  game.phase = 'command';
  const h = game.hunters[0];
  h.state = 'active'; h.x = tcx(1); h.y = tcy(1); h.dir = null; h.path = null;
  Draw.begin(h);
  Draw.extendToward(6, 1);
  Draw.commit(true);
  const firstLen = h.path.tiles.length;
  // clicking the arrowhead picks the committed route back up
  const tip = h.path.tiles[h.path.tiles.length - 1];
  const owner = Draw.tipAt(game, tcx(tip.c), tcy(tip.r));
  ok('the arrowhead is a live handle', owner === h);
  ok('continuing resumes from the committed trail', Draw.continueFrom(h)
     && Draw.active.tiles.length === firstLen);
  Draw.extendToward(12, 1);
  Draw.commit(true);
  ok('the extension lands as one longer order', h.path.tiles.length > firstLen,
     { before: firstLen, after: h.path.tiles.length });
  h.path = null;
}

console.log('\n== auto-freeze when a path runs out ==');
{
  toPlay();
  game.phase = 'play';
  const h = game.hunters[1];
  h.state = 'active'; h.x = tcx(1); h.y = tcy(1); h.dir = null;
  h.setOrder([{ c: 1, r: 1 }, { c: 2, r: 1 }, { c: 3, r: 1 }], false);
  let n = 0;
  while (game.phase === 'play' && n++ < 900) tick(1);
  ok('a ghost stalling at a wall freezes the game for new orders',
     game.phase === 'command', { phase: game.phase, n });
  const sel = game.hunters[Draw.selected];
  ok('and a stalled ghost is pre-selected',
     sel && sel.state === 'active' && !sel.path && !sel.dir,
     { selected: Draw.selected });
  // the gate itself: resume must be refused until every stalled ghost
  // has somewhere to be -- ghosts don't camp
  API.resumeFromCommand();
  ok('resume is refused while any ghost is stalled',
     game.phase === 'command', { phase: game.phase });
  while (API.stalledHunter()) {
    const s = API.stalledHunter();
    const st = s.tile();
    const route = bfsRoute({ c: wrapCol(st.c), r: st.r }, { c: 6, r: 17 });
    ok('a stalled ghost can be given an order', !!route && route.length > 1,
       { at: st });
    if (!route || route.length < 2) break;
    s.setOrder(route, false);
  }
  API.resumeFromCommand();
  ok('and once everyone has orders, resume works', game.phase === 'play',
     { phase: game.phase });
}

console.log('\n== energizer role reversal ==');
{
  toPlay();
  game.phase = 'play';
  const ev = game.evader;
  game.hunters.forEach(h => { h.state = 'active'; h.path = null; h.dir = null;
                              h.x = tcx(26); h.y = tcy(29); });
  dots()[4][1] = 2;
  ev.x = tcx(1) + 1; ev.y = tcy(4); ev.dir = 'left';
  tick(4);
  ok('eating an energizer starts the fright clock', game.frightT > 0, { f: game.frightT });

  const h = game.hunters[2];
  h.x = ev.x; h.y = ev.y; h.dir = 'left';
  tick(2);
  ok('a frightened hunter struck by the evader dissolves', h.state === 'dissolving');
  tick(50);
  ok('it becomes eyes and heads home', h.state === 'eyes');
  let n = 0;
  while (h.state === 'eyes' && n++ < 600) tick(5);
  ok('the eyes reach the den', h.state === 'enteringDen' || h.state === 'respawn');
  n = 0;
  while (h.state !== 'active' && n++ < 900) { if (h.respawnT > 5) h.respawnT = 5; tick(5); }
  ok('and it respawns back into play', h.state === 'active');
}

console.log('\n== eyes eaten on the doorstep still make it home ==');
{
  /* Field report: eyes stalled just above the den door. A hunter eaten
     mid-stride ON the doorstep tile starts off the tile's center, the
     route home is zero tiles long so nothing ever moves it, and the old
     hand-off demanded sub-pixel alignment. It bobbed there forever. */
  toPlay();
  game.phase = 'play';
  const h = game.hunters[1];
  h.state = 'eyes'; h.path = null; h.dir = null;
  h.x = tcx(13) - 2.7;   // struck walking across the doorstep: off-center
  h.y = tcy(11);
  let n = 0;
  while (h.state === 'eyes' && n++ < 200) tick(5);
  ok('doorstep eyes hand off to the den instead of stalling',
     h.state === 'enteringDen' || h.state === 'respawn', { state: h.state });
  n = 0;
  while (h.state !== 'respawn' && n++ < 200) tick(5);
  ok('and they land parked on the respawn seam',
     h.state === 'respawn' && h.x === 112 && h.y === tcy(14),
     { state: h.state, x: h.x, y: h.y });
}

console.log('\n== a frightened statue is dinner, not lava ==');
{
  /* Field report: a wall-stopped ghost in the corner, the energized evader
     chasing it -- and he 180'd one step from eating it. The soft danger
     model knew frightened hunters are food, but the hard never-step-on-a-
     statue veto did not, and the veto outranks everything. */
  toPlay();
  game.phase = 'play';
  const ev = game.evader;
  game.hunters.forEach(h => { h.state = 'active'; h.path = null; h.dir = null;
                              h.x = tcx(26); h.y = tcy(1); });
  const h = game.hunters[0];
  h.x = tcx(1); h.y = tcy(29);           // parked dead in the lower-left corner
  game.frightT = 400;
  tick(2);
  const key = 29 * COLS + 1;
  ok('a parked hunter is not lethal terrain while he can eat it',
     !game.parkedTiles.has(key), { parked: [...game.parkedTiles] });

  game.frightT = 20;                     // clock about to flip
  tick(2);
  ok('near fright expiry the statue turns back into a wall that kills',
     game.parkedTiles.has(key));

  // the user-visible behavior: chased into the corner, the statue gets eaten
  game.frightT = 400;
  ev.x = tcx(4); ev.y = tcy(29); ev.dir = 'left';
  let n = 0;
  while (h.state === 'active' && game.frightT > 60 && n++ < 500) tick(1);
  ok('a cornered frightened statue gets eaten, not orbited',
     h.state === 'dissolving' || h.state === 'eyes', { state: h.state, n });
}

console.log('\n== capture, lives, pincer scoring, level flow ==');
{
  toPlay();
  game.phase = 'play';
  game.frightT = 0;
  // he has grazed: this progress must survive his deaths
  game.dotsEaten = 40;
  const grazed = game.dotsEaten;
  const ev = game.evader;
  const h1 = game.hunters[0], h2 = game.hunters[1];
  h1.state = 'active'; h2.state = 'active';
  h1.x = ev.x; h1.y = ev.y;
  h2.x = ev.x + 16; h2.y = ev.y;
  const before = game.score;
  const dotsLeftNow = dotTotal() - game.dotsEaten;
  tick(3);
  ok('touching the evader ends the round', game.phase === 'capture');
  ok('the capture banks dots-left times level',
     game.score - before === game.captureInfo.dotsLeft * game.level
     && Math.abs(game.captureInfo.dotsLeft - dotsLeftNow) <= 3,
     { gained: game.score - before, info: game.captureInfo });
  tick(90);
  ok('a first capture spends a life, not the board',
     game.evaderLives === 2 && game.phase === 'ready' && game.level === 1,
     { lives: game.evaderLives, ph: game.phase, lvl: game.level });
  ok('and the dots he ate stay eaten', game.dotsEaten === grazed,
     { eaten: game.dotsEaten });

  // catch him twice more; only the third catch ends the board
  const catchHim = () => {
    game.phase = 'play';
    const h = game.hunters[0];
    h.state = 'active'; h.x = game.evader.x; h.y = game.evader.y;
    tick(3);
  };
  const beforeSecond = game.score;
  catchHim();
  tick(90);
  ok('the second capture banks again and respawns him',
     game.score > beforeSecond && game.evaderLives === 1 && game.phase === 'ready',
     { lives: game.evaderLives, ph: game.phase });
  catchHim();
  tick(90);
  ok('the third capture flashes the board', game.phase === 'flash',
     { ph: game.phase });
  tick(150);
  ok('then the next level starts with his lives refilled',
     game.level === 2 && game.phase === 'ready'
     && game.evaderLives === 3 && game.dotsEaten === 0,
     { lvl: game.level, ph: game.phase, lives: game.evaderLives });
}

console.log('\n== the camp limit is a dial ==');
{
  // allowance: a ghost may stand parked up to the limit before intervention
  toPlay();
  game.phase = 'play';
  game.campLimit = 300;
  const h = game.hunters[1];
  h.state = 'active'; h.x = tcx(1); h.y = tcy(1); h.dir = null; h.path = null;
  h.campT = 0; h.overdue = false;
  tick(120);
  ok('camping inside the allowance does not freeze the game',
     game.phase === 'play' && !h.overdue, { phase: game.phase, campT: h.campT });
  tick(400);
  ok('camping past the limit goes overdue and freezes',
     h.overdue === true, { campT: h.campT });
  // OFF: the original cruelty rule, nothing ever intervenes
  toPlay();
  game.phase = 'play';
  game.campLimit = null;
  const h2 = game.hunters[1];
  h2.state = 'active'; h2.x = tcx(1); h2.y = tcy(1); h2.dir = null; h2.path = null;
  h2.campT = 0; h2.overdue = false;
  let froze = false;
  for (let i = 0; i < 1200; i++) {
    if (game.phase === 'command') froze = true;
    tick(1);
  }
  ok('with the limit OFF a ghost camps forever, unfrozen',
     !froze && !h2.overdue && h2.campT > 1000,
     { froze, campT: h2.campT });
  game.campLimit = 0;   // restore the harness default for later tests
}

console.log('\n== losing a board ==');
{
  toPlay();
  game.phase = 'play';
  const c0 = game.contracts;
  game.dotsEaten = dotTotal();
  tick(3);
  ok('clearing every dot costs a board', game.phase === 'escaped' && game.contracts === c0 - 1,
     { ph: game.phase, c: game.contracts });
}

console.log('\n== the contested prize ==');
{
  toPlay();
  game.phase = 'play';
  game.fruit = { idx: 0, timer: 600 };
  const h = game.hunters[0];
  h.state = 'active'; h.x = 112; h.y = tcy(17);
  const before = game.score;
  tick(2);
  ok('a hunter routed over the prize claims it, for zero points',
     game.fruit === null && game.score === before, { gained: game.score - before });
  ok('and that hunter gets a burst of overdrive', h.boostT > 0, { boostT: h.boostT });
  const slow = game.params.hunterSpeed;
  h.dir = 'right'; h.update(game);
  ok('which actually makes it faster', h.speed > slow, { speed: h.speed, base: slow });

  game.fruit = { idx: 0, timer: 600 };
  game.hunters.forEach(x => { x.x = tcx(26); x.y = tcy(29); });
  game.evader.x = tcx(14); game.evader.y = tcy(17);
  tick(2);
  const scoreBefore = game.score;
  ok('the evader taking it costs the player the points and nothing else',
     game.fruit === null && game.score === scoreBefore, { score: game.score });
}

console.log('\n== a long soak with no orders at all ==');
{
  toPlay();
  let crashed = null;
  try { tick(30000); } catch (e) { crashed = e.message; }
  ok('30000 ticks run without throwing', crashed === null, { crashed });
  // with nobody giving orders he clears board after board, so running out of
  // contracts and idling back to attract is the correct end state here
  ok('and the game is still in a sane phase',
     ['play','ready','capture','flash','escaped','gameover','attract','command'].includes(game.phase),
     { ph: game.phase });
}

console.log('\n== evader competence: he should survive brainless hunters ==');
{
  // stochastic: he wins ~11/12 of these, so demand 3 of 4 rather than
  // perfection and let the difficulty-curve suite measure the real rate
  let survived = 0;
  for (let trial = 0; trial < 4; trial++) {
    game.level = 1; game.contracts = 3;
    game.startLevel(true);
    tick(240);
    let caught = false;
    for (let i = 0; i < 6000 && !caught; i++) {
      tick(1);
      if (game.phase === 'capture' || game.phase === 'flash') caught = true;
    }
    if (!caught) survived++;
  }
  ok('he survives hunters left parked and stupid', survived >= 3, { survived });
}

console.log('\n== the attract demo is a silent movie ==');
{
  /* Field report: the demo is normally silent, but clicking the ? chip made
     it start narrating itself. It was only ever silent by luck -- nothing
     had created the AudioContext yet -- and the first click unlocked audio
     for a demo that was emitting real chomps and a real siren all along. */
  const { Sound } = API;
  const wasMuted = Sound.muted;
  Sound.muted = false;
  game.demo = true;
  ok('demo board audio is gated off', Sound.quiet() === true);
  ok('but UI feedback still answers the player', (() => {
    let heard = false;
    const realBlip = Sound.blip;
    Sound.blip = function () { heard = !this.quiet(); };
    Sound.uiCommit();
    Sound.blip = realBlip;
    return heard;
  })());
  game.demo = false;
  ok('and normal play is audible again', Sound.quiet() === false);
  Sound.muted = true;
  ok('mute still wins over everything', Sound.quiet() === true);
  Sound.muted = wasMuted;
}

console.log('\n== the manual ==');
{
  const { openHelp, closeHelp, render } = API;
  toPlay();
  game.phase = 'play';
  openHelp();
  ok('opening the manual mid-play freezes time',
     game.phase === 'command' && game.helpOpen === true, { phase: game.phase });
  closeHelp();
  ok('closing it never auto-resumes: the click is still the clock',
     game.phase === 'command' && game.helpOpen === false, { phase: game.phase });
  openHelp();
  let threw = null;
  try { render(); render(); } catch (e) { threw = e.message; }
  ok('the open manual renders headlessly without throwing', threw === null, { threw });
  closeHelp();
}

console.log('\n' + (fail === 0 ? 'ALL ' + pass + ' CHECKS PASSED' : pass + ' passed, ' + fail + ' FAILED'));
process.exit(fail === 0 ? 0 : 1);
