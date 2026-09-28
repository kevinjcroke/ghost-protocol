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
  Draw.sticky = false; Draw.tapAdvances = false; Draw.selected = 0;
  // a TAP is pickAt (press) + cycleAt (release with no drag in between)
  const picks = [];
  for (let i = 0; i < 5; i++) {
    const p = Draw.pickAt(tcx(6), tcy(8));
    picks.push(p ? p.key : null);
    Draw.cycleAt(tcx(6), tcy(8));
  }
  ok('tapping a pile of ghosts steps through every one of them',
     new Set(picks.slice(0, 4)).size === 4, { picks });
  ok('and the browse wraps back round', picks[4] === picks[0], { picks });

  // a drag never browses: the press must grab the ghost already held, and
  // a dragMoved release skips cycleAt entirely
  const before = Draw.selected;
  const held = Draw.pickAt(tcx(6), tcy(8));
  ok('a press grabs the ghost already held, not the next one',
     held === H[before], { before, held: held && held.key });

  // a roster-button pick is sticky: a full tap on the pile keeps the
  // chosen ghost instead of stepping past it; the tap after that browses
  Draw.select(1);
  const kept = Draw.pickAt(tcx(6), tcy(8));
  Draw.cycleAt(tcx(6), tcy(8));
  ok('a button-selected ghost survives a full tap on its pile',
     kept === H[1] && Draw.selected === 1,
     { kept: kept && kept.key, selected: Draw.selected });
  Draw.pickAt(tcx(6), tcy(8));
  Draw.cycleAt(tcx(6), tcy(8));
  ok('and the tap after that browses onward',
     Draw.selected !== 1, { selected: Draw.selected });

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
  game.triggerFright();                  // the real path: clears den-exit immunity
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

console.log('\n== the last dots pull him from across the board ==');
{
  toPlay();
  game.phase = 'play';
  game.campLimit = null;   // parked statues are allowed to sit
  /* The endgame that exposed him: two last clusters on opposite flanks,
     each with a statue parked at the mouth of its corridor, him orbiting
     the middle. Three separate sins kept this board alive forever: the
     food pull faded out at 24 tiles, a statue's wake-grace decayed with
     his arrival time (painting no-go zones around guarded dots), and a
     dot was worth 1.2 points against a margin term of 180 -- so hovering
     one tile from the pile scored the same as eating it. */
  const D = dots();
  for (let r = 0; r < D.length; r++)
    for (let c = 0; c < COLS; c++) D[r][c] = 0;
  for (let c = 2; c <= 5; c++) D[11][c] = 1;
  for (let c = 22; c <= 25; c++) D[11][c] = 1;
  game.dotsEaten = dotTotal() - 8;
  game.hunters.forEach(h => { h.state = 'active'; h.path = null; h.dir = null;
                              h.x = tcx(26); h.y = tcy(29); });
  game.hunters[0].x = tcx(1);  game.hunters[0].y = tcy(11);
  game.hunters[1].x = tcx(26); game.hunters[1].y = tcy(11);
  game.evader.x = tcx(13); game.evader.y = tcy(17); game.evader.dir = 'left';
  game.foodDist = null;    // force a rebuild against the stripped board
  let t = 0;
  while (t < 4000 && game.phase === 'play') { tick(1); t++; }
  ok('he finishes statue-guarded leftovers instead of orbiting them',
     game.phase === 'escaped', { ph: game.phase, left: dotTotal() - game.dotsEaten, t });
  game.campLimit = 0;      // restore the harness default
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

console.log('\n== leaving the den sheds the blue ==');
{
  /* Classic rule: an eaten hunter that walks home and re-emerges is a
     hunter again, even while the fright clock still runs. Only a fresh
     energizer re-blues it. */
  toPlay();
  game.phase = 'play';
  const h = game.hunters[1];
  game.hunters.forEach(x => {
    if (x === h) return;
    x.state = 'active'; x.path = null; x.dir = null; x.x = tcx(26); x.y = tcy(29);
  });
  game.evader.x = tcx(1); game.evader.y = tcy(29);

  game.triggerFright();
  ok('an energizer blues the squad', h.frightImmune === false && game.frightT > 0);

  // fast-forward the den stay: respawn -> exitingDen -> exiting -> active
  h.state = 'respawn'; h.respawnT = 1; h.x = 112; h.y = tcy(14); h.path = null; h.dir = null;
  let t = 0;
  while (h.state !== 'active' && t < 300) { h.update(game); t++; }
  ok('a hunter that walks out of the den mid-fright sheds the blue',
     h.state === 'active' && h.frightImmune === true && game.frightT > 0,
     { state: h.state, immune: h.frightImmune, frightT: game.frightT });

  h.dir = 'left'; h.update(game);
  ok('and it hunts at full speed, not the fright crawl',
     h.speed === game.params.hunterSpeed,
     { speed: h.speed, fright: game.params.hunterFrightSpeed });

  game.evader.x = h.x; game.evader.y = h.y;
  game.checkCollisions();
  ok('touching it mid-fright is a capture, not a meal',
     game.phase === 'capture' && h.state === 'active',
     { ph: game.phase, st: h.state });

  game.phase = 'play';
  game.triggerFright();
  ok('a fresh energizer blues it again', h.frightImmune === false);
  game.evader.x = h.x; game.evader.y = h.y;
  game.checkCollisions();
  ok('and now it is back on the menu', h.state === 'dissolving', { st: h.state });
}

console.log('\n== touch controls ==');
{
  /* Driven through the real bound listeners with real TouchEvent shapes,
     because every interesting bug here is in the plumbing -- which finger
     is primary, which list an event carries, what a release means. */
  const { fire, screen, render, touch, touchEvent, rosterUI, input } = API;
  const S = () => API.scale;

  // the canvas rect is 224x288, so client px are native px; display px are
  // native px x scale, and the roster lives in display space
  const start = (...ts) => fire(screen, 'touchstart',
    touchEvent('touchstart', ts, [ts[ts.length - 1]]));
  const move = (...ts) => fire(screen, 'touchmove', touchEvent('touchmove', ts, ts));
  const end = (remaining, lifted) => fire(screen, 'touchend',
    touchEvent('touchend', remaining, [lifted]));
  const nat = (col, row) => touch(1, col * 8 + 4, row * 8 + 4 + 24);   // +HUD

  ok('touch handlers are actually bound',
     !!(screen.listeners.touchstart && screen.listeners.touchmove
        && screen.listeners.touchend && screen.listeners.touchcancel));

  {
    const ev = touchEvent('touchstart', [nat(1, 1)]);
    fire(screen, 'touchstart', ev);
    ok('a touch is swallowed so the page cannot scroll or zoom under it',
       ev.defaultPrevented === true);
    ok('and the first finger puts the game in the finger idiom',
       API.touchMode === true);
    fire(screen, 'touchend', touchEvent('touchend', [], [nat(1, 1)]));
  }

  console.log('  -- one finger is the mouse');
  toPlay();
  game.phase = 'play';
  {
    const h = game.hunters[0];
    game.hunters.forEach(x => { x.state = 'active'; x.path = null; x.dir = null; });
    h.x = tcx(1); h.y = tcy(1);

    start(nat(1, 1));
    ok('a finger on the board freezes time', game.phase === 'command');
    ok('landing on a ghost starts its trail', !!Draw.active && Draw.active.hunter === h);

    move(nat(4, 1));
    move(nat(6, 1));
    ok('dragging extends the trail down the corridor',
       Draw.active.tiles.length === 6, { len: Draw.active && Draw.active.tiles.length });

    end([], nat(6, 1));
    ok('lifting commits the path', !!h.path && h.path.tiles.length === 6,
       { path: h.path && h.path.tiles.length });
    ok('and the game stays frozen: committing is not the same as going',
       game.phase === 'command');
  }

  console.log('  -- the tap that means go waits for the finger to lift');
  {
    game.hunters.forEach(x => { x.path = null; x.dir = 'left'; });   // nobody overdue
    game.phase = 'command';
    const empty = touch(7, 1 * 8 + 4, 5 * 8 + 4 + 24);
    start(empty);
    ok('a finger down on empty floor does NOT resume yet',
       game.phase === 'command' && input.pendingResume === true);
    end([], empty);
    ok('lifting it does', game.phase === 'play');
  }

  console.log('  -- a thumb roll is still a tap');
  {
    /* The bug this exists to stop: a fingertip rolls several px just being
       pressed down. That was over the cursor-sized drag threshold, so every
       tap on a pile of ghosts landed as a drag -- the pile stopped stepping
       and the ghost on top walked off along a two-tile order nobody gave.
       Rolls past the drag slop (12) ride on the quick-tap ruling instead:
       the stubbed clock makes every harness press instantaneous, which is
       the honest reading of a synthetic start/move/end burst. */
    const roll = [0, 3, 6, 9, 11, 16, 22];   // native px; last two are past the slop
    const results = [];
    for (const d of roll) {
      toPlay();
      game.phase = 'command';
      game.hunters.forEach(h => { h.state = 'active'; h.path = null; h.dir = 'left';
                                  h.x = tcx(6); h.y = tcy(8); });
      Draw.sticky = false; Draw.tapAdvances = false; Draw.selected = 0;
      const picks = [];
      for (let i = 0; i < 4; i++) {
        const a = touch(1, 6 * 8 + 4, 8 * 8 + 4 + 24);
        const b = touch(1, 6 * 8 + 4 + d, 8 * 8 + 4 + 24);
        start(a); move(b); end([], b);
        picks.push(Draw.selected);
      }
      results.push({ d, picks: picks.join(','), stray: game.hunters.some(h => h.path) });
    }
    ok('a tap steps through the pile however much the thumb rolls',
       results.every(r => r.picks === '1,2,3,0'), results);
    ok('and leaves no order behind it',
       results.every(r => !r.stray), results.filter(r => r.stray));
  }

  console.log('  -- a fat finger near the pile is aiming at the pile');
  {
    /* The pick reach used to be 12px -- cursor-sized. A tap 15px off a
       stack found nothing, fell through to "empty floor", and the round
       restarted under a hand that was aiming at four ghosts. */
    toPlay();
    game.phase = 'command';
    game.hunters.forEach(h => { h.state = 'active'; h.path = null; h.dir = 'left';
                                h.x = tcx(6); h.y = tcy(8); });
    Draw.sticky = false; Draw.tapAdvances = false; Draw.selected = 0;
    const off = touch(1, 6 * 8 + 4 + 15, 8 * 8 + 4 + 24);   // 15px right of the stack
    start(off); end([], off);
    ok('a tap that misses the stack by 15px still lands on it',
       game.phase === 'command', { ph: game.phase });
    ok('and it browses rather than resuming', Draw.selected === 1,
       { selected: Draw.selected });
  }

  console.log('  -- drawing through the tunnel');
  {
    /* A finger cannot leave the glass, so the wrap tile beyond the screen
       edge was unreachable and the horizontal tunnel might as well not
       have existed. Pressure against the playfield edge now targets it. */
    toPlay();
    game.phase = 'command';
    const h = game.hunters[0];
    game.hunters.forEach(x => { x.state = 'active'; x.path = null; x.dir = 'left';
                                x.x = tcx(20); x.y = tcy(20); });
    h.x = tcx(3); h.y = tcy(14); h.dir = null;    // near the left tunnel mouth
    start(touch(1, 3 * 8 + 4, 14 * 8 + 4 + 24));
    move(touch(1, 1 * 8 + 4, 14 * 8 + 4 + 24));   // declare the drag
    move(touch(1, 2, 14 * 8 + 4 + 24));           // press against the edge
    const tiles = Draw.active && Draw.active.tiles.map(t => t.c);
    ok('the tip walks into the wrap zone', tiles && tiles.includes(27),
       { tiles });
    end([], touch(1, 2, 14 * 8 + 4 + 24));
    ok('and the committed order crosses the seam',
       h.path && h.path.tiles.some(t => t.c === 27) && h.path.tiles.some(t => t.c <= 1),
       { path: h.path && h.path.tiles.map(t => t.c) });

    // the right mouth, same story
    game.phase = 'command';
    h.path = null; h.x = tcx(24); h.y = tcy(14); h.dir = null;
    Draw.select(0);
    start(touch(2, 24 * 8 + 4, 14 * 8 + 4 + 24));
    move(touch(2, 26 * 8 + 4, 14 * 8 + 4 + 24));
    move(touch(2, 224 - 2, 14 * 8 + 4 + 24));
    end([], touch(2, 224 - 2, 14 * 8 + 4 + 24));
    ok('the right edge wraps too',
       h.path && h.path.tiles.some(t => t.c === 0),
       { path: h.path && h.path.tiles.map(t => t.c) });

    // and everywhere else the beyond-edge tile is wall: nothing moves
    game.phase = 'command';
    h.path = null; h.x = tcx(1); h.y = tcy(1); h.dir = null;
    Draw.select(0);
    start(touch(3, 1 * 8 + 4, 1 * 8 + 4 + 24));
    move(touch(3, 1 * 8 + 4, 3 * 8 + 4 + 24));    // declare the drag downward
    move(touch(3, 2, 3 * 8 + 4 + 24));            // then press against the edge
    const offRow = Draw.active && Draw.active.tiles.every(t => t.c >= 0 && t.c <= 1);
    end([], touch(3, 2, 3 * 8 + 4 + 24));
    ok('off a tunnel row the edge is just a wall', offRow === true,
       { path: h.path && h.path.tiles.map(t => t.c) });
  }

  console.log('  -- but a real stroke still commands');
  {
    toPlay();
    game.phase = 'command';
    game.hunters.forEach(h => { h.state = 'active'; h.path = null; h.dir = 'left';
                                h.x = tcx(1); h.y = tcy(1); });
    Draw.sticky = false; Draw.tapAdvances = false; Draw.selected = 0;
    start(touch(1, 1 * 8 + 4, 1 * 8 + 4 + 24));
    for (const c of [3, 4, 5, 6]) move(touch(1, c * 8 + 4, 1 * 8 + 4 + 24));
    end([], touch(1, 6 * 8 + 4, 1 * 8 + 4 + 24));
    ok('a drawn stroke orders the ghost it started on',
       game.hunters[0].path && game.hunters[0].path.tiles.length === 6,
       { tiles: game.hunters[0].path && game.hunters[0].path.tiles.length });
    ok('and does not also browse the pile out from under it',
       Draw.selected === 0, { selected: Draw.selected });
  }

  console.log('  -- a thumb that slides has changed its mind');
  {
    game.hunters.forEach(x => { x.path = null; x.dir = 'left'; });
    game.phase = 'command';
    const down = touch(8, 1 * 8 + 4, 5 * 8 + 4 + 24);
    start(down);
    move(touch(8, 3 * 8 + 4, 5 * 8 + 4 + 24));    // well past the drag threshold
    end([], touch(8, 3 * 8 + 4, 5 * 8 + 4 + 24));
    ok('a tap that turns into a slide does not restart the clock',
       game.phase === 'command', { ph: game.phase });
  }

  console.log('  -- the first finger owns the gesture');
  {
    toPlay();
    game.phase = 'command';
    const h = game.hunters[1];
    game.hunters.forEach(x => { x.state = 'active'; x.path = null; x.dir = 'left'; });
    h.x = tcx(1); h.y = tcy(1); h.dir = null;

    const f1 = touch(1, 1 * 8 + 4, 1 * 8 + 4 + 24);
    const f2 = touch(2, 5 * 8 + 4, 5 * 8 + 4 + 24);
    start(f1);
    ok('the trail is live', !!Draw.active && Draw.active.hunter === h);
    const held = Draw.active.tiles.length;

    start(f1, f2);
    ok('a palm landing mid-draw is ignored, not a second gesture',
       !!Draw.active && Draw.active.hunter === h
       && Draw.active.tiles.length === held);
    // and it cannot steer: a move carrying both reads only the first finger
    move(f1, touch(2, 12 * 8 + 4, 5 * 8 + 4 + 24));
    ok('nor can it drag the trail somewhere the drawing finger never went',
       Draw.active.tiles.length === held, { len: Draw.active.tiles.length });

    end([f1], f2);
    ok('and the trail survives its departure', !!Draw.active);
    end([], f1);
    ok('only the drawing finger lifting commits', !!h.path || Draw.active === null);
  }

  console.log('  -- finger-sized targets');
  {
    toPlay();
    game.phase = 'command';
    render();                       // lays out the roster rects for this frame
    const camp = rosterUI.camp;
    const before = game.campChoice;
    // a thumb landing 3 display px above the chip: a miss for a cursor
    const above = { clientX: (camp.x + camp.w / 2) / S(), clientY: (camp.y - S() * 3) / S() };
    API.setTouchMode(false);
    fire(screen, 'mousedown', { button: 0, clientX: above.clientX, clientY: above.clientY });
    fire(API.win, 'mouseup', { button: 0, clientX: above.clientX, clientY: above.clientY });
    ok('a cursor that misses the camp chip misses it', game.campChoice === before,
       { before, after: game.campChoice });

    game.phase = 'command';
    render();
    API.setTouchMode(true);
    start(touch(9, above.clientX, above.clientY));
    end([], touch(9, above.clientX, above.clientY));
    ok('a finger that misses it by the same margin still hits',
       game.campChoice === (before + 1) % 5, { before, after: game.campChoice });
  }

  console.log('  -- the manual speaks the right idiom');
  {
    const { openHelp, closeHelp, HELP_ROWS } = API;
    ok('every touch phrase is a real replacement, not a duplicate',
       HELP_ROWS.every(r => (!r.at || r.at !== r.a) && (!r.bt || r.bt !== r.b)));
    ok('the click instructions have finger counterparts',
       HELP_ROWS[0].at && HELP_ROWS[0].bt && HELP_ROWS[3].bt);
    API.setTouchMode(true);
    openHelp();
    let threw = null;
    try { render(); } catch (e) { threw = e.message; }
    ok('the manual renders in touch mode without throwing', threw === null, { threw });
    closeHelp();
    API.setTouchMode(false);
  }
}

console.log('\n== presentation time is wall time ==');
{
  /* Field report: on a 120Hz screen every blink and pulse ran double, and
     the overdrive flicker became a strobe -- uiFrame counted refreshes, not
     time. Driven through the real frame() with the timestamps a 120Hz
     display hands requestAnimationFrame. This block starts the clock, and
     later ones push it much further (a jump to 1e9 ms for the tag), so
     every section after it stamps fx times relative to API.uiClock --
     never as bare numbers, which would describe a moment long past. */
  const { frame } = API;
  let ts = 10000;
  const run = (hz, seconds) => {
    const n = Math.round(hz * seconds);
    for (let k = 0; k < n; k++) { ts += 1000 / hz; frame(ts); }
  };
  toPlay();
  game.phase = 'command';
  frame(ts);                               // the first frame sets the epoch
  let before = API.uiFrame;
  run(120, 1);
  const at120 = API.uiFrame - before;
  ok('uiFrame advances ~60 per second at 120Hz', at120 >= 59 && at120 <= 61, { at120 });
  before = API.uiFrame;
  run(60, 1);
  const at60 = API.uiFrame - before;
  ok('and ~60 per second at 60Hz', at60 >= 59 && at60 <= 61, { at60 });

  game.shakeT = 10;
  run(120, 4 / 60);                         // four ticks, eight refreshes
  ok('the capture shake counts ticks, not refreshes',
     game.shakeT >= 5 && game.shakeT <= 7, { shakeT: game.shakeT });

  game.phase = 'attract'; game.demo = false;
  game.attract = { page: 0, t: 0, introStep: 0 };
  run(120, 1);
  ok('the attract pages turn at 60 per second at 120Hz',
     game.attract.t >= 59 && game.attract.t <= 61, { t: game.attract.t });
}

console.log('\n== the presentation clock ==');
{
  const { pauseToCommand, fx, springIn, easeOut, fire, screen, stalledHunter,
          resumeFromCommand, render } = API;
  ok('the spring starts at rest and lands home',
     springIn(0) === 0 && springIn(1e6) === 1 && easeOut(0) === 0 && easeOut(1e6) === 1);
  let peak = 0;
  for (let t = 0; t <= 14; t += 0.05) peak = Math.max(peak, springIn(t));
  ok('it overshoots by about six percent, once', peak > 1.04 && peak < 1.08, { peak });

  toPlay();
  game.phase = 'play';
  pauseToCommand({ x: 40, y: 50 });
  ok('a freeze remembers what stopped time',
     game.phase === 'command' && fx.origin.x === 40 && fx.origin.y === 50
     && fx.enterAt === API.uiClock);
  fx.thawAt = -1e9;
  game.hunters.forEach(h => { h.overdue = false; });
  resumeFromCommand();
  ok('a resume stamps the thaw', game.phase === 'play' && fx.thawAt === API.uiClock);
  pauseToCommand();
  ok('and stopping again straight away skips the entrance', fx.skipEnter === true);
  ok('with no origin given it falls back somewhere real',
     Number.isFinite(fx.origin.x) && Number.isFinite(fx.origin.y));

  // a refused PLAY is not a thaw
  const h = game.hunters[0];
  h.state = 'active'; h.path = null; h.dir = null; h.overdue = true;
  fx.thawAt = -1e9;
  resumeFromCommand();
  ok('a refused PLAY does not stamp a thaw',
     game.phase === 'command' && !!stalledHunter() && fx.thawAt === -1e9);
  h.overdue = false;

  // the ghost that ran dry is where time stops
  toPlay();
  game.phase = 'play';
  const g = game.hunters[2];
  g.state = 'active'; g.x = tcx(6); g.y = tcy(5); g.path = null; g.dir = 'left';
  g.needsOrders = true;
  game.update();
  ok('an auto-freeze ripples out of the ghost that caused it',
     game.phase === 'command' && Math.abs(fx.origin.x - g.x) < 2
     && Math.abs(fx.origin.y - g.y) < 2, { origin: fx.origin, g: { x: g.x, y: g.y } });

  // grabbing a ghost mid-play freezes out of that ghost, not the cursor
  toPlay();
  game.phase = 'play';
  API.setTouchMode(false);
  const m = game.hunters[1];
  game.hunters.forEach(x => { x.state = 'active'; x.x = tcx(26); x.y = tcy(29); x.path = null; });
  m.x = tcx(12); m.y = tcy(5);
  const at = { clientX: m.x + 3, clientY: m.y + 3 * 8 + 2 };
  fire(screen, 'mousedown', { button: 0, clientX: at.clientX, clientY: at.clientY });
  ok('a grab freezes out of the grabbed ghost',
     game.phase === 'command' && fx.origin.x === m.x && fx.origin.y === m.y,
     { origin: fx.origin, m: { x: m.x, y: m.y } });
  fire(API.win, 'mouseup', { button: 0, clientX: at.clientX, clientY: at.clientY });

  game.phase = 'command';
  let threw = null;
  try { render(); render(); } catch (e) { threw = e.message; }
  ok('the glass renders mid-entrance without throwing', threw === null, { threw });
}

console.log('\n== the bank swap arrives as a raster split ==');
{
  /* The night bank opens as a band from the row that stopped time, in whole
     tile rows, and the thaw snaps. Read through the same helper every
     bank-dependent draw uses, so walls and pellets cannot disagree. */
  const { pauseToCommand, resumeFromCommand, fx, bankBand, splitBank, SPLIT_TICKS } = API;
  toPlay();
  game.phase = 'play';
  game.hunters.forEach(h => { h.overdue = false; });
  fx.thawAt = -1e9;
  pauseToCommand({ x: tcx(5), y: tcy(10) });
  const at0 = bankBand();
  ok('on the click tick the band is exactly the row that stopped time',
     at0 && at0.lo === 10 && at0.hi === 11, at0);
  let grows = true, whole = true, prev = at0;
  for (let t = 1; t < SPLIT_TICKS; t++) {
    fx.enterAt = API.uiClock - t;
    const b = bankBand();
    if (!b) break;
    if (b.lo > prev.lo || b.hi < prev.hi) grows = false;
    if (b.lo !== Math.floor(b.lo) || b.hi !== Math.floor(b.hi)) whole = false;
    prev = b;
  }
  ok('it only ever opens, in whole tile rows', grows && whole);
  fx.enterAt = API.uiClock - SPLIT_TICKS;
  ok('and within six ticks the whole board is in the night bank', bankBand() === null);

  const calls = (g) => { const seen = []; splitBank(g, dim => seen.push(dim)); return seen; };
  let clipped = 0;
  const g = { save() {}, restore() {}, beginPath() {}, rect() {}, clip() { clipped++; } };
  ok('a finished split paints the night bank alone',
     JSON.stringify(calls(g)) === '[true]' && clipped === 0);
  fx.enterAt = API.uiClock;
  ok('mid-split it paints the live bank, then the night bank under one clip',
     JSON.stringify(calls(g)) === '[false,true]' && clipped === 1);

  fx.skipEnter = true;
  ok('a quick refreeze skips the split', bankBand() === null);
  fx.skipEnter = false;
  resumeFromCommand();
  ok('the thaw snaps straight back to the live bank',
     game.phase === 'play' && JSON.stringify(calls(g)) === '[false]');
  game.phase = 'capture';
  ok('and no split can leak into the capture', bankBand() === null);
  game.phase = 'play';
}

console.log('\n== the siren stops like tape ==');
{
  /* A stand-in audio graph that records every automation call, so the
     order of cancel / anchor / ramp can be checked the way the Web Audio
     timeline would apply it. */
  const { Sound, pauseToCommand, resumeFromCommand } = API;
  const param = (v) => ({
    log: [['set', v, 0]],
    get value() { return this.log.filter(e => e[0] !== 'cancel').pop()[1]; },
    cancelScheduledValues(t) { this.log.push(['cancel', t]); },
    setValueAtTime(x, t) { this.log.push(['set', x, t]); },
    linearRampToValueAtTime(x, t) { this.log.push(['ramp', x, t]); },
  });
  const saved = { ctx: Sound.ctx, siren: Sound.siren, sirenGain: Sound.sirenGain,
    sirenOn: Sound.sirenOn, blip: Sound.blip, muted: Sound.muted };
  Sound.ctx = { currentTime: 5, state: 'running' };
  Sound.siren = { detune: param(0), frequency: param(300) };
  Sound.sirenGain = { gain: param(0.035) };
  Sound.sirenOn = true;
  Sound.muted = false;
  Sound.blip = function () {};
  let valueWrites = 0;
  const gainParam = Sound.sirenGain.gain;
  const target = (p) => p.log.filter(e => e[0] === 'ramp' || e[0] === 'set').pop()[1];
  const cancelsFirst = (p) => {
    // every ramp is preceded, since the last ramp, by a cancel
    let armed = false, okay = true;
    for (const e of p.log) {
      if (e[0] === 'cancel') armed = true;
      else if (e[0] === 'ramp') { if (!armed) okay = false; armed = false; }
    }
    return okay;
  };

  toPlay();
  game.phase = 'play';
  game.frightT = 0;
  game.hunters.forEach(h => { h.overdue = false; });
  pauseToCommand();
  ok('a freeze winds the siren down and out instead of cutting it',
     target(Sound.siren.detune) === -1400 && target(gainParam) === 0
     && Sound.siren.detune.log.some(e => e[0] === 'ramp' && Math.abs(e[2] - 5.18) < 1e-9));
  resumeFromCommand();
  ok('a thaw brings it back up to pitch and level',
     target(Sound.siren.detune) === 0 && target(gainParam) === 0.035);

  // hammer it: whatever the order, the last word wins and nothing is left behind
  for (let i = 0; i < 5; i++) { pauseToCommand(); resumeFromCommand(); }
  ok('rapid freeze and thaw never leave it flat or silent',
     target(Sound.siren.detune) === 0 && target(gainParam) === 0.035
     && cancelsFirst(Sound.siren.detune) && cancelsFirst(gainParam));

  pauseToCommand();
  game.frightT = 100;
  resumeFromCommand();
  ok('under fright it comes back to pitch but stays silent',
     target(Sound.siren.detune) === 0 && target(gainParam) === 0);
  game.frightT = 0;

  pauseToCommand();
  Sound.muted = true;
  resumeFromCommand();
  ok('and mute wins over the thaw', target(gainParam) === 0);
  Sound.muted = false;

  Sound.sirenGain.gain = new Proxy(gainParam, {
    set(t, k, v) { if (k === 'value') valueWrites++; t[k] = v; return true; },
  });
  Sound.setSirenAudible(true);
  ok('audibility is scheduled, never written through .value',
     valueWrites === 0 && target(gainParam) === 0.035);

  Object.assign(Sound, saved);
}

console.log('\n== the room reacts ==');
{
  /* A page to light: a body that records its classes and --accent, and the
     live hint line. The harness document has neither, which is its own
     test -- render() has been running against that all along. */
  const { doc, syncShell, shell, Draw, pauseToCommand, resumeFromCommand, stalledHunter } = API;
  const classes = new Set();
  let writes = 0;
  const body = {
    classList: { toggle(c, on) { writes++; if (on) classes.add(c); else classes.delete(c); } },
    style: { props: {}, setProperty(k, v) { this.props[k] = v; } },
  };
  const live = { textContent: '' };
  const realGet = doc.getElementById;
  doc.body = body;
  doc.getElementById = (id) => (id === 'hint-live' ? live : realGet(id));

  toPlay();
  game.phase = 'play';
  game.hunters.forEach(h => { h.overdue = false; });
  API.setTouchMode(false);
  shell.key = null;
  syncShell();
  ok('in play the room is unlit', !classes.has('frozen') && !classes.has('blocked'));
  pauseToCommand();
  Draw.select(0);
  syncShell();
  ok('a freeze lights the room in the selected ghost\'s color',
     classes.has('frozen') && body.style.props['--accent'] === game.hunters[0].color);
  ok('and the hint line becomes the instruction',
     live.textContent === 'DRAG A GHOST · CLICK EMPTY MAZE TO RUN', { text: live.textContent });
  const n = writes;
  syncShell(); syncShell();
  ok('an unchanged state touches nothing', writes === n);
  Draw.select(2);
  syncShell();
  ok('choosing another ghost relights it', body.style.props['--accent'] === game.hunters[2].color);
  API.setTouchMode(true);
  syncShell();
  ok('a finger gets the TAP wording', live.textContent.includes('TAP EMPTY MAZE'));
  API.setTouchMode(false);

  const h = game.hunters[1];
  h.state = 'active'; h.path = null; h.dir = null; h.overdue = true;
  syncShell();
  ok('an overdue ghost turns the room amber and names itself',
     classes.has('blocked') && !!stalledHunter()
     && live.textContent === h.def.name + ' NEEDS ORDERS', { text: live.textContent });
  h.overdue = false;
  resumeFromCommand();
  syncShell();
  ok('resuming puts the room back', !classes.has('frozen') && !classes.has('blocked'));

  pauseToCommand();
  syncShell();
  game.newGame();
  syncShell();
  ok('a new game starts in an unlit room', !classes.has('frozen') && !classes.has('blocked'));

  delete doc.body;
  doc.getElementById = realGet;
  shell.key = null;
  let threw = null;
  try { syncShell(); } catch (e) { threw = e.message; }
  ok('with no page to light it stays quiet', threw === null, { threw });
}

console.log('\n== the glass only quotes numbers the machine keeps ==');
{
  /* Every figure on the cards and the pill is a promise about the
     simulation, so each one is checked against the simulation itself:
     the catch pays what the pill quoted, a drifting ghost stops where its
     card said, a route takes as long as its card said. */
  const { bountyNow, dotsLeftNow, driftTiles, orderTicks, cardState, BOOST_TICKS } = API;
  const say = (st) => st.lines[0].map(r => r.t || '').join('');

  toPlay();
  game.level = 3;
  game.dotsEaten = 40;
  const quoted = bountyNow();
  const before = game.score;
  game.beginCapture(game.hunters[0]);
  ok('a catch banks exactly the bounty the pill quoted',
     game.captureInfo.banked === quoted && game.score - before >= quoted
     && quoted === (dotTotal() - 40) * 3 && game.captureInfo.dotsLeft === dotsLeftNow(),
     { quoted, banked: game.captureInfo.banked });

  // park everyone else in the den so nothing wanders into the test
  const quiet = (keep) => game.hunters.forEach(x => {
    if (x === keep) return;
    x.state = 'idle'; x.releaseT = 1e6; x.path = null; x.dir = null;
  });
  const runUntil = (cond, max) => {
    let n = 0;
    while (!cond() && n < max) { tick(1); n++; }
    return n;
  };

  toPlay();
  game.phase = 'play';
  game.frightT = 0;
  let h = game.hunters[0];
  quiet(h);
  h.state = 'active'; h.path = null; h.boostT = 0; h.frightImmune = true;
  h.x = tcx(1) + 3; h.y = tcy(1); h.dir = 'right';   // mid-tile, on its way
  const coast = driftTiles(h.tile(), h.dir);
  const card = say(cardState(h));
  runUntil(() => h.dir === null, 600);
  const end = h.tile(), last = coast[coast.length - 1];
  ok('a drifting ghost stops on the tile its card counted to',
     !!last && end.c === last.c && end.r === last.r, { end, last, n: coast.length });
  ok('and the card says so in tiles',
     card === 'STOPS IN ' + coast.length + ' TILES', { card });

  /* Timed with him held still: an energizer eaten mid-run would re-blue
     the ghost and change the answer under the question. */
  const timeRoute = (from, legs, boost) => {
    toPlay();
    game.phase = 'play';
    game.frightT = 0;
    game.evader.update = () => {};
    h = game.hunters[0];   // a new game deals new hunters
    quiet(h);
    h.state = 'active'; h.boostT = boost; h.frightImmune = true; h.dir = null;
    h.x = tcx(from.c); h.y = tcy(from.r);
    let route = [from];
    for (const to of legs) route = route.concat(bfsRoute(route[route.length - 1], to, 200).slice(1));
    h.setOrder(route, false);
    const predicted = orderTicks(h, h.path.tiles, h.path.idx, false);
    const actual = runUntil(() => h.path === null, 3000);
    delete game.evader.update;
    return { predicted: Math.round(predicted), actual, tiles: route.length };
  };
  const row = API.TUNNEL_ROWS[0];
  let r = timeRoute({ c: 1, r: 1 }, [{ c: 6, r: 1 }, { c: 6, r: 5 }, { c: 26, r: 5 }], 0);
  ok('a route takes as long as its card says', Math.abs(r.predicted - r.actual) <= 2, r);
  r = timeRoute({ c: 1, r: 1 }, [{ c: 6, r: 1 }, { c: 6, r: 5 }, { c: 26, r: 5 }], 90);
  ok('overdrive that runs out halfway is counted, not guessed', Math.abs(r.predicted - r.actual) <= 2, r);
  r = timeRoute({ c: 6, r: 8 }, [{ c: 6, r: 11 }, { c: 6, r: row }, { c: 0, r: row }], 0);
  ok('and the crawl through a tunnel mouth is counted at crawling speed',
     Math.abs(r.predicted - r.actual) <= 2, r);

  /* Turned round short of a tile centre, a ghost walks on to the centre
     before it can turn -- the only place it ever does. Frozen mid-stride
     is the ordinary case, and back the way it came an ordinary order. */
  {
    toPlay();
    game.phase = 'play';
    game.frightT = 0;
    game.evader.update = () => {};
    h = game.hunters[0];
    quiet(h);
    h.state = 'active'; h.boostT = 0; h.frightImmune = true;
    const back = [];
    for (const short of [0.5, 2, 3.5]) {
      h.path = null; h.x = tcx(4) - short; h.y = tcy(1); h.dir = 'right';
      h.setOrder([{ c: 4, r: 1 }, { c: 3, r: 1 }, { c: 2, r: 1 }, { c: 1, r: 1 }], false);
      const predicted = orderTicks(h, h.path.tiles, h.path.idx, false);
      const actual = runUntil(() => h.path === null, 600);
      back.push({ short, predicted: Math.round(predicted), actual });
    }
    delete game.evader.update;
    ok('a ghost ordered to turn round mid-tile is timed walking on to the centre first',
       back.every(b => Math.abs(b.predicted - b.actual) <= 1), back);
  }

  /* The coast through the wrap zone: from inside a tunnel, and from the
     wrap zone itself, where a ghost is about to come back in on the side
     it is heading for. Every tunnel row on every board. */
  {
    const seen = [];
    for (let b = 0; b < API.BOARDS.length; b++) {
      for (const row of API.BOARDS[b].tunnels) {
        for (const [c, dir] of [[3, 'left'], [COLS - 4, 'right'], [-1, 'left'], [COLS, 'right'], [-1, 'right']]) {
          toPlay();
          API.setBoard(b);
          game.phase = 'play';
          game.frightT = 0;
          game.evader.update = () => {};
          const g = game.hunters[0];
          quiet(g);
          g.state = 'active'; g.path = null; g.boostT = 0; g.frightImmune = true; g.overdue = false;
          g.x = tcx(c); g.y = tcy(row); g.dir = dir;
          const coast = driftTiles(g.tile(), dir);
          const said = say(cardState(g));
          // the tiles it really crosses, counted off the board as it goes
          let at = g.tile();
          const crossed = [];
          runUntil(() => {
            const now = g.tile();
            if ((now.c !== at.c || now.r !== at.r) && now.c >= 0 && now.c < COLS) crossed.push(now);
            at = now;
            return g.dir === null;
          }, 600);
          delete game.evader.update;
          const stop = g.tile(), last = coast[coast.length - 1];
          const unit = coast.length === 1 ? ' TILE' : ' TILES';
          seen.push({ b, row, c, dir, n: coast.length, crossed: crossed.length, stop, last, said,
            good: !!last && stop.c === last.c && stop.r === last.r
              && crossed.length === coast.length
              && said === 'STOPS IN ' + coast.length + unit });
        }
      }
    }
    API.setBoard(0);
    ok('through a tunnel and out of the wrap zone, a ghost stops where its card counted',
       seen.length >= 20 && seen.every(s => s.good), seen.filter(s => !s.good));
  }

  // the rest of the card's vocabulary, one state at a time
  toPlay();
  const g = game.hunters[1];
  g.state = 'active'; g.path = null; g.dir = null; g.overdue = false; g.boostT = 0;
  game.campChoice = 4; game.campLimit = null;
  let st = cardState(g);
  ok('with the camp limit OFF nothing counts and no ring pretends to',
     st.ring === null && say(st) === 'CAMPED');
  game.campChoice = 3; game.campLimit = 600;
  g.campT = 480;
  st = cardState(g);
  ok('a camped ghost drains its ring toward the limit, amber at the end',
     Math.abs(st.ring.frac - 0.2) < 1e-9 && st.ring.color === API.TOKENS.warn
     && say(st) === '2s LEFT', { frac: st.ring.frac, say: say(st) });
  g.overdue = true;
  st = cardState(g);
  ok('overdue is a full ring, a mark, and the white pill',
     st.overdue === true && st.ring.frac === 1 && st.mark === '!');
  g.overdue = false;
  g.boostT = BOOST_TICKS / 2;
  st = cardState(g);
  ok('overdrive counts down its own clock', st.ring.frac === 0.5 && say(st).startsWith('OVERDRIVE'));
  g.boostT = 0;
  g.state = 'respawn'; g.respawnT = 186;
  st = cardState(g);
  ok('a ghost in the den says when it is back', say(st) === 'BACK IN 3.1s' && st.down === true,
     { say: say(st) });
  g.state = 'eyes';
  st = cardState(g);
  ok('eyes quote no time they cannot keep', st.ring === null && !/[0-9]/.test(say(st)));
}

console.log('\n== the squad cards and the status pill ==');
{
  const { pillState, rosterUI, render, fire, screen, fx, pauseToCommand, resumeFromCommand,
          stalledHunter, Draw } = API;
  const S = () => API.scale;

  // the ladder: first match wins
  toPlay();
  game.phase = 'command';
  [[1, 5], [6, 5], [21, 5], [26, 5]].forEach(([c, r], i) => {
    const x = game.hunters[i];
    x.state = 'active'; x.path = null; x.dir = 'left'; x.overdue = false;
    x.x = tcx(c); x.y = tcy(r);
  });
  const route = (x) => { x.setOrder(bfsRoute(x.tile(), { c: 1, r: 1 }, 80), false); };
  route(game.hunters[0]); route(game.hunters[2]);
  let p = pillState();
  ok('the pill counts the squad', p.kind === 'command' && p.text === 'COMMAND · 2 OF 4 ORDERED',
     { text: p.text });
  game.hunters.forEach(route);
  p = pillState();
  ok('a fully ordered squad is told it can go', p.kind === 'ready' && p.text === 'ALL ORDERED · PLAY');
  const d = game.hunters[3];
  Draw.begin(d);
  Draw.extendToward(d.tile().c - 4, d.tile().r);
  p = pillState();
  ok('the route in hand shows its time and how to commit it',
     Draw.active.tiles.length >= 2 && p.kind === 'drawing'
     && /^[0-9]+\.[0-9]s · RELEASE TO COMMIT$/.test(p.text), { text: p.text });
  const s = game.hunters[1];
  s.path = null; s.dir = null; s.overdue = true;
  p = pillState();
  ok('but an overdue ghost outranks everything',
     p.kind === 'overdue' && p.text === s.def.name + ' NEEDS ORDERS', { text: p.text });
  Draw.active = null;

  // a refused PLAY shakes the pill; a render mid-shake is fine
  fx.refusedAt = -1e9;
  resumeFromCommand();
  let threw = null;
  try { render(); } catch (e) { threw = e.message; }
  ok('a refused PLAY stamps the shake and still renders',
     game.phase === 'command' && fx.refusedAt === API.uiClock && threw === null, { threw });
  s.overdue = false;

  // the board keeps its own voice to itself while frozen
  const rows = [];
  const nctx = API.nativeCtx;
  nctx.fillRect = (x, y, w, h) => { if (y === (17 + 3) * 8 && h === 8 && w > 16) rows.push(w); };
  s.overdue = true;
  render();
  const frozenBanners = rows.length;
  s.overdue = false;
  game.phase = 'ready';
  render();
  nctx.fillRect = () => {};
  ok('frozen time writes nothing into the maze message row',
     frozenBanners === 0 && rows.length === 1, { frozenBanners, ready: rows.length });

  // targets stand still while the cards move
  toPlay();
  game.phase = 'play';
  game.hunters.forEach(x => { x.overdue = false; });
  pauseToCommand();
  fx.skipEnter = false;
  fx.enterAt = API.uiClock;                 // the very first frame of the entrance
  render();
  const early = JSON.stringify(rosterUI);
  fx.enterAt = API.uiClock - 100;           // long settled
  render();
  const late = JSON.stringify(rosterUI);
  ok('hit rects are written at rest, whatever the cards are doing', early === late);

  Draw.selected = 0;
  game.hunters.forEach(x => { x.state = 'active'; x.path = null; x.dir = null; x.overdue = false; });
  resumeFromCommand();
  ok('PLAY thaws', game.phase === 'play');
  render();                                  // the cards are dropping away over play
  ok('and the dropping cards leave the rects alone', JSON.stringify(rosterUI) === late);
  const slot = rosterUI.slots[2];
  API.setTouchMode(false);
  const at = { clientX: (slot.x + slot.w / 2) / S(), clientY: (slot.y + slot.h / 2) / S() };
  fire(screen, 'mousedown', { button: 0, clientX: at.clientX, clientY: at.clientY });
  fire(API.win, 'mouseup', { button: 0, clientX: at.clientX, clientY: at.clientY });
  ok('a click on a leaving card is a click on the glass: it freezes, nothing else',
     game.phase === 'command' && Draw.selected === 0, { phase: game.phase, sel: Draw.selected });

  // squeeze every word as wide as it can get: the pill still clears the ? chip
  const sctx = API.screenCtx;
  sctx.measureText = (t) => ({ width: t.length * S() * 9 });
  game.hunters[1].path = null; game.hunters[1].dir = null; game.hunters[1].overdue = true;
  threw = null;
  try { render(); } catch (e) { threw = e.message; }
  const room = (API.HELP_CHIP.x - API.HELP_CHIP.r - 1 - 224 / 2) * 2 * S();
  ok('the pill never grows into the ? chip, and nothing throws when words overflow',
     threw === null && API.pillAnim.to <= room + 1e-9, { threw, to: API.pillAnim.to, room });
  sctx.measureText = () => ({ width: 0 });
  game.hunters[1].overdue = false;
}

console.log('\n== the freeze wave, the casing and the shadows ==');
{
  const { fx, pauseToCommand, render, surveyWave, WAVE_TICKS, WAVE_FLARE, TOKENS, SHADOW,
          SHADOW_DROP, SHADOW_LIFT, routeOrder, hotBeadsNow, Draw } = API;
  const S = () => API.scale;
  const sctx = API.screenCtx;

  toPlay();
  game.phase = 'play';
  [[1, 5], [6, 5], [21, 5], [26, 5]].forEach(([c, r], i) => {
    const x = game.hunters[i];
    x.state = 'active'; x.path = null; x.dir = 'left'; x.overdue = false;
    x.x = tcx(c); x.y = tcy(r);
  });
  const origin = { x: tcx(13), y: tcy(23) };
  pauseToCommand(origin);
  fx.skipEnter = false;
  const at = (t) => { fx.enterAt = API.uiClock - t; };

  // the wave, three ticks out: a front, a wake, and ground not yet covered
  at(3);
  let wv = surveyWave(S(), 0, 0);
  const cross = [];
  for (let j = 0; j < wv.bands.length; j++) {
    cross.push({ band: wv.bands[j], d: Math.hypot(wv.pts[2 * j] - wv.cx, wv.pts[2 * j + 1] - wv.cy) });
  }
  const ahead = cross.filter(x => x.band < 0), laid = cross.filter(x => x.band >= 0);
  ok('the wave starts where time stopped',
     wv.cx === origin.x * S() && wv.cy === (origin.y + 3 * 8) * S(), { cx: wv.cx, cy: wv.cy });
  ok('it uncovers the grid from there outward',
     ahead.length > 0 && laid.length > 0 && ahead.every(x => x.d > wv.R) && laid.every(x => x.d <= wv.R),
     { ahead: ahead.length, laid: laid.length });
  const lit = laid.filter(x => x.band > 0).sort((a, b) => a.d - b.d);
  ok('the crosses flare as the front passes, freshest furthest out',
     lit.length > 0 && lit.every((x, k) => k === 0 || x.band <= lit[k - 1].band));
  ok('and the whole grid is at most four strokes',
     new Set(laid.map(x => x.band)).size <= 4 && Math.max(...laid.map(x => x.band)) <= 3);

  // the ring: one soft gradient at the origin, never brighter than 0.35
  const fills = [];
  sctx.createRadialGradient = (...a) => ({ a, addColorStop() {} });
  sctx.fill = () => { fills.push({ g: sctx.fillStyle, alpha: sctx.globalAlpha }); };
  const ringFills = () => fills.filter(f => f.g && f.g.a
    && f.g.a[0] === wv.cx && f.g.a[1] === wv.cy && f.g.a[3] === wv.cx);
  render();
  const mid = ringFills();
  ok('one soft ring rides the front, never above 0.35',
     mid.length === 1 && mid[0].alpha > 0 && mid[0].alpha <= 0.35, { n: mid.length, a: mid[0] && mid[0].alpha });

  at(WAVE_TICKS + WAVE_FLARE);
  wv = surveyWave(S(), 0, 0);
  fills.length = 0;
  render();
  ok('once it has passed, the grid is the plain grid and the ring is gone',
     !wv.moving && wv.bands.every(b => b === 0) && ringFills().length === 0);
  at(2);
  fx.skipEnter = true;
  wv = surveyWave(S(), 0, 0);
  ok('a quick refreeze lays the grid at once, with no wave',
     !wv.moving && wv.bands.every(b => b === 0));
  fx.skipEnter = false;

  // the casing: stacked routes, the selected one on top, marks after all edges
  const target = { c: 13, r: 23 };
  game.hunters.forEach(x => { x.setOrder(bfsRoute(x.tile(), target, 80), false); });
  Draw.selected = 1;
  let order = routeOrder(S(), 0, 0);
  ok('routes stack with the selected ghost on top, each keeping its own index',
     order.length === 4 && order[3].h === game.hunters[1]
     && order.every(o => game.hunters[o.i] === o.h));
  Draw.begin(game.hunters[2]);
  Draw.extendToward(game.hunters[2].tile().c + 3, game.hunters[2].tile().r);
  order = routeOrder(S(), 0, 0);
  ok('and the route in hand goes above even that', order[order.length - 1].h === game.hunters[2]);
  Draw.active = null;

  const log = [];
  sctx.stroke = () => { log.push({ k: 'stroke', style: sctx.strokeStyle, w: sctx.lineWidth }); };
  sctx.fill = () => { log.push({ k: 'fill', style: sctx.fillStyle }); };
  at(100);
  render();
  const casings = log.map((e, k) => e.k === 'stroke' && e.style === TOKENS.casing ? k : -1).filter(k => k >= 0);
  const lastCase = casings[casings.length - 1];
  const nextColor = log.slice(lastCase + 1).find(e => e.k === 'stroke' && e.style !== TOKENS.casing);
  const firstBead = log.findIndex(e => e.k === 'fill' && e.style === '#ffffff');
  ok('every frozen route is laid on a dark casing', casings.length === 4, { casings: casings.length });
  ok('the selected route is cased last, so it cuts across the rest',
     nextColor && nextColor.style === game.hunters[1].color, { next: nextColor && nextColor.style });
  ok('and every bead goes down after every casing', firstBead > lastCase, { firstBead, lastCase });
  {
    log.length = 0;
    game.phase = 'play';
    render();
    ok('live play keeps its trails as they were: no casing',
       log.length > 0 && !log.some(e => e.style === TOKENS.casing));
    game.phase = 'command';
  }
  sctx.stroke = () => {}; sctx.fill = () => {};
  sctx.createRadialGradient = () => ({ addColorStop() {} });
  ok('outside a frame the pincer read is always fresh', hotBeadsNow() !== hotBeadsNow());

  // contact shadows: one per body, under the pellets, rising with the glass
  const blits = [];
  sctx.drawImage = (img, ...a) => { blits.push({ img, a }); };
  const shadowsIn = () => blits.filter(b => b.img === SHADOW.rest || b.img === SHADOW.held);
  at(100);
  render();
  let sh = shadowsIn();
  // the pellets come back in the last full-size blit of the frame
  const board = blits.map((b, k) => b.a.length === 4 && b.a[2] === 224 * S() ? k : -1)
    .reduce((m, k) => Math.max(m, k), -1);
  const held = sh.filter(b => b.img === SHADOW.held);
  const h1 = game.hunters[1];
  const heldCy = held[0] && held[0].a[1] + SHADOW.held.height / 2;
  const bodyCy = (h1.y + 3 * 8) * S();
  ok('every body on the glass casts one shadow, the held ghost a larger one',
     sh.length === 5 && held.length === 1 && SHADOW.held.width > SHADOW.rest.width, { n: sh.length });
  ok('the held ghost sits a little higher, by less than one pixel of the board',
     SHADOW_LIFT < 1 && Math.abs(heldCy - bodyCy - (SHADOW_DROP + SHADOW_LIFT) * S()) <= 1,
     { heldCy, bodyCy });
  ok('shadows go down before the pellets come back', board > 0 && blits.indexOf(sh[4]) < board,
     { board, last: blits.indexOf(sh[4]) });
  game.hunters[3].state = 'eyes';
  blits.length = 0; render();
  ok('bare eyes cast nothing', shadowsIn().length === 4);
  game.hunters[3].state = 'active';
  at(0);
  blits.length = 0; render();
  ok('at the instant of the freeze they have not lifted yet', shadowsIn().length === 0);
  game.phase = 'play';
  blits.length = 0; render();
  ok('and live play has none', shadowsIn().length === 0);
  sctx.drawImage = () => {};
}

console.log('\n== planning feedback and the release ==');
{
  const { fire, screen, render, touch, touchEvent, rosterUI, input, fx, Sound, TOKENS,
          pauseToCommand, resumeFromCommand, orderTicks } = API;
  const S = () => API.scale;
  const sctx = API.screenCtx;
  const win = API.win;
  const noop = () => {};
  // native maze px -> client px (the canvas rect is 224x288, HUD above)
  const client = (x, y) => ({ clientX: x, clientY: y + 24 });
  const hover = (x, y) => fire(win, 'mousemove', client(x, y));
  const hoverDisplay = (r) => fire(win, 'mousemove', { clientX: (r.x + r.w / 2) / S(), clientY: (r.y + r.h / 2) / S() });
  const mouseAt = (type, x, y) => fire(type === 'mousedown' ? screen : win, type,
    Object.assign({ button: 0 }, client(x, y)));
  const spread = () => {
    [[1, 5], [6, 5], [21, 5], [26, 5]].forEach(([c, r], i) => {
      const x = game.hunters[i];
      x.state = 'active'; x.path = null; x.dir = 'left'; x.overdue = false;
      x.x = tcx(c); x.y = tcy(r);
    });
  };

  console.log('  -- the cursor says what a click would do');
  API.setTouchMode(false);
  toPlay();
  game.phase = 'play';
  spread();
  pauseToCommand();
  render();                                   // the roster rects go down
  const writes = [];
  const oldStyle = screen.style;
  const style = {};
  Object.defineProperty(style, 'cursor', {
    set(v) { writes.push(v); }, get() { return writes[writes.length - 1]; } });
  screen.style = style;

  const h1 = game.hunters[1];
  Draw.selected = 0; Draw.sticky = false; Draw.tapAdvances = false;
  let picks = 0;
  const realPick = Draw.pickAt;
  Draw.pickAt = function (...a) { picks++; return realPick.apply(this, a); };
  hover(h1.x, h1.y);
  ok('over a ghost the cursor is an open hand', style.cursor === 'grab', { writes });
  ok('and hovering never picks: nothing is reselected, restacked or armed',
     picks === 0 && Draw.selected === 0 && Draw.sticky === false && Draw.tapAdvances === false);
  hover(h1.x + 1, h1.y);
  render(); render();
  hover(112, 100);
  ok('the page hears only when the answer changes, and open floor is the crosshair',
     writes.join() === 'grab,crosshair', { writes });

  const h3 = game.hunters[3];
  h3.setOrder(bfsRoute(h3.tile(), { c: 13, r: 23 }, 80), false);
  hover(tcx(13), tcy(23));
  ok('an arrowhead is a handle too', style.cursor === 'grab', { c: style.cursor });
  h3.path = null;

  const fills = [];
  sctx.fill = () => fills.push(sctx.fillStyle);
  hoverDisplay(rosterUI.play);
  render();
  ok('over PLAY it is a hand, and PLAY lights up under it',
     style.cursor === 'pointer' && input.hoverCtl === 'play' && API.ctlLook('play').hover
     && fills.includes(TOKENS.hover), { c: style.cursor, hov: input.hoverCtl });
  hoverDisplay(rosterUI.camp);
  ok('so does the camp dial', style.cursor === 'pointer' && input.hoverCtl === 'camp');
  hoverDisplay(API.helpUI.btn);
  ok('and the ? chip', style.cursor === 'pointer' && input.hoverCtl === 'help');

  // a press: drawn smaller, hit-tested where it always was
  const rest = JSON.stringify(rosterUI);
  const slot = rosterUI.slots[2];
  const scales = [];
  sctx.scale = (a) => scales.push(a);
  fire(screen, 'mousedown', { button: 0, clientX: (slot.x + slot.w / 2) / S(), clientY: (slot.y + slot.h / 2) / S() });
  ok('a press on a card holds its pressed look while the button is down',
     input.pressedCtl === 'slot2' && API.ctlLook('slot2').pressed && !API.ctlLook('slot2').hover);
  render();
  ok('drawn 3% smaller, hit-tested exactly where it was',
     scales.includes(API.PRESS_SCALE) && JSON.stringify(rosterUI) === rest);
  fire(win, 'mouseup', { button: 0, clientX: (slot.x + slot.w / 2) / S(), clientY: (slot.y + slot.h / 2) / S() });
  ok('and lets go with the button', input.pressedCtl === null);
  fire(screen, 'mousedown', { button: 0, clientX: (slot.x + slot.w / 2) / S(), clientY: (slot.y + slot.h / 2) / S() });
  fire(win, 'mousemove', { clientX: (slot.x + slot.w / 2) / S() + 10, clientY: (slot.y + slot.h / 2) / S() });
  ok('a press that turns into a drag was never a press on a button',
     input.dragMoved && input.pressedCtl === null);
  fire(win, 'mouseup', { button: 0, clientX: (slot.x + slot.w / 2) / S() + 10, clientY: (slot.y + slot.h / 2) / S() });
  sctx.scale = noop;

  hover(h1.x, h1.y);
  mouseAt('mousedown', h1.x, h1.y);
  render();
  ok('holding a route the hand closes', !!Draw.active && style.cursor === 'grabbing', { c: style.cursor });
  mouseAt('mouseup', h1.x, h1.y);
  render();
  ok('and opens again on release', !Draw.active && style.cursor === 'grab', { c: style.cursor });
  Draw.pickAt = realPick;

  hoverDisplay(rosterUI.play);
  API.setTouchMode(true);
  render();
  ok('a finger has no hover at all', input.hoverCtl === null && !API.ctlLook('play').hover);
  API.setTouchMode(false);
  fire(win, 'mouseout', { relatedTarget: null });
  ok('and a mouse that leaves the window leaves nothing lit', input.hoverCtl === null && input.hovering === false);
  screen.style = oldStyle;
  sctx.fill = noop;

  console.log('  -- the tag');
  toPlay();
  game.phase = 'play';
  spread();
  const d = game.hunters[0];
  d.x = tcx(1); d.y = tcy(1); d.dir = null;
  pauseToCommand();
  mouseAt('mousedown', d.x, d.y);
  ok('no tag on a press that has not become a drag', Draw.active && API.dragTag() === null);
  mouseAt('mousemove', tcx(1), tcy(5));
  mouseAt('mousemove', tcx(4), tcy(5));
  let tag = API.dragTag();
  const inHand = Draw.active;
  ok('the drag gets a tag timing the route exactly as the pill does',
     tag && !tag.loop && tag.ticks === API.handTicks(inHand)
     && API.pillState().text.startsWith((tag.ticks / 60).toFixed(1) + 's'),
     { tag: tag && tag.ticks, pill: API.pillState().text });
  let r = API.drawDragTag(sctx, 0, 0);
  ok('beside a cursor it sits just off the head tile, above it',
     r.tx === r.hx + 6 * S() && Math.abs(r.ty + r.h - (r.hy - 6 * S())) < 1e-9, r);
  API.setTouchMode(true);
  r = API.drawDragTag(sctx, 0, 0);
  ok('over a finger it stands 44 CSS px clear, centred',
     Math.abs(r.hy - (r.ty + r.h) - API.TAG_LIFT * API.uiDpr) < 1e-9 && Math.abs(r.tx + r.w / 2 - r.hx) < 1e-9, r);
  API.setTouchMode(false);

  // steady under a shaking hand, eased after a moving head
  API.frame(1e9);                                 // jump the clock: settled
  r = API.drawDragTag(sctx, 0, 0);
  const settled = { x: API.tagAnim.x, y: API.tagAnim.y };
  mouseAt('mousemove', tcx(4) + 2, tcy(5) - 3);
  mouseAt('mousemove', tcx(4) - 3, tcy(5) + 2);
  r = API.drawDragTag(sctx, 0, 0);
  ok('pointer jitter inside the head tile does not move it',
     Math.abs(settled.x - r.tx) < 1e-9 && API.tagAnim.x === settled.x && API.tagAnim.y === settled.y);
  mouseAt('mousemove', tcx(6), tcy(5));
  r = API.drawDragTag(sctx, 0, 0);
  ok('a new head tile moves where it is going, not where it is',
     r.tx !== settled.x && API.tagAnim.x === settled.x);
  API.frame(1e9 + 1000 / 60);
  const part = API.tagAnim.x;
  API.frame(1e9 + 1000 / 60 * 40);
  ok('and it eases there', part > settled.x && part < r.tx && Math.abs(API.tagAnim.x - r.tx) < 0.5,
     { from: settled.x, part, to: r.tx, now: API.tagAnim.x });

  // near the top it goes underneath; wide words still stay on the glass
  mouseAt('mousemove', tcx(1), tcy(5));
  mouseAt('mousemove', tcx(1), tcy(1));
  mouseAt('mousemove', tcx(4), tcy(1));
  r = API.drawDragTag(sctx, 0, 0);
  ok('near the top of the glass it drops below the head', r && r.ty > r.hy, r);
  mouseAt('mousemove', tcx(1), tcy(1));
  mouseAt('mousemove', tcx(1), tcy(5));
  mouseAt('mousemove', tcx(6), tcy(5));
  sctx.measureText = (t) => ({ width: t.length * 140 });
  r = API.drawDragTag(sctx, 0, 0);
  sctx.measureText = () => ({ width: 0 });
  ok('and it never leaves the canvas', r.tx >= S() && r.tx + r.w <= 224 * S() - S() + 1e-9, r);

  // close the loop: the tag reads the lap
  mouseAt('mousemove', tcx(6), tcy(1));
  mouseAt('mousemove', tcx(1), tcy(1));
  tag = API.dragTag();
  ok('an armed loop reads as its lap, walked the way the ghost will walk it',
     Draw.active.closable && tag.loop
     && tag.ticks === orderTicks(d, Draw.active.tiles.slice(0, -1), 0, true), { tag });
  mouseAt('mouseup', tcx(1), tcy(1));
  ok('and the tag goes with the release', API.dragTag() === null && !!d.path && d.path.closed);

  // a pincer: two ghosts on one corridor, one committed, one in hand
  const mate = game.hunters[1];
  d.path = null; d.x = tcx(1); d.y = tcy(1); d.dir = null;
  mate.x = tcx(1); mate.y = tcy(1); mate.dir = null;
  mate.setOrder(bfsRoute(mate.tile(), { c: 6, r: 1 }, 20), false);
  const ons = [], offs = [];
  const realOn = Sound.uiPincerOn, realOff = Sound.uiPincerOff;
  Sound.uiPincerOn = () => ons.push(API.uiClock);
  Sound.uiPincerOff = () => offs.push(API.uiClock);
  Draw.begin(d);
  input.dragMoved = true;
  render();
  ok('a fresh route meeting nobody is silent', ons.length === 0 && offs.length === 0);
  Draw.extendToward(6, 1);
  tag = API.dragTag();
  ok('the tag names the pincer and when this ghost gets there',
     tag.pincer && tag.pincer.with === mate && tag.pincer.ticks > 0 && tag.pincer.ticks <= tag.ticks,
     { p: tag.pincer && tag.pincer.ticks, route: tag.ticks });
  render();
  ok('a pincer locking is heard, once', ons.length === 1 && offs.length === 0);
  render();
  ok('and not again while it holds', ons.length === 1);
  Draw.extendToward(1, 1);
  render();
  Draw.extendToward(6, 1);
  render();
  ok('flickering in and out inside a quarter second is not a drum roll', ons.length === 1 && offs.length === 0);
  API.pincerEar.at = API.uiClock - API.PINCER_GAP;
  Draw.extendToward(1, 1);
  render();
  ok('losing it after a beat is heard as a falling note', offs.length === 1);
  API.pincerEar.at = API.uiClock - API.PINCER_GAP;
  Draw.active = null;
  render();
  ok('letting go of the route is not losing a pincer', offs.length === 1 && ons.length === 1);
  {
    // a change inside the gap is held, not dropped: the last word heard
    // always matches the route in hand once the gap has run out
    Draw.begin(d);
    input.dragMoved = true;
    render();
    API.pincerEar.at = API.uiClock - API.PINCER_GAP;
    Draw.extendToward(6, 1);
    render();
    const locked = ons.length;
    Draw.extendToward(1, 1);
    render();
    ok('a pincer lost straight after it locked is not said inside the gap',
       locked === 2 && ons.length === 2 && offs.length === 1, { ons: ons.length, offs: offs.length });
    API.pincerEar.at = API.uiClock - API.PINCER_GAP;
    render();
    ok('but is said once the gap runs out, so the last note heard is the truth', offs.length === 2);
    Draw.extendToward(6, 1);
    render();
    const held = ons.length;
    API.pincerEar.at = API.uiClock - API.PINCER_GAP;
    render();
    ok('and the same the other way: a lock inside the gap is announced after it',
       held === 2 && ons.length === 3 && offs.length === 2);
    Draw.active = null;
    render();
  }
  Sound.uiPincerOn = realOn; Sound.uiPincerOff = realOff;
  {
    // through the real voice: mute wins
    let oscs = 0;
    const param = { setValueAtTime: noop, exponentialRampToValueAtTime: noop };
    const node = () => ({ connect: noop, frequency: param, gain: param, start: noop, stop: noop });
    const was = { ctx: Sound.ctx, master: Sound.master };
    Sound.ctx = { currentTime: 0, createOscillator: () => { oscs++; return node(); }, createGain: node };
    Sound.master = node();
    Sound.muted = true;
    Sound.uiPincerOn(); Sound.uiPincerOff();
    const muted = oscs;
    Sound.muted = false;
    Sound.uiPincerOn(); Sound.uiPincerOff();
    ok('the chimes are two notes up and one down, and mute silences them', muted === 0 && oscs === 3, { muted, oscs });
    Sound.ctx = was.ctx; Sound.master = was.master;
  }
  d.state = 'idle';
  Draw.begin(d); input.dragMoved = true;
  Draw.active.tiles.push({ c: 13, r: 11 }, { c: 14, r: 11 });
  ok('a ghost still in the den gets no figure it cannot keep', API.dragTag() === null);
  Draw.active = null; d.state = 'active';

  console.log('  -- the ring under a finger');
  const start = (t) => fire(screen, 'touchstart', touchEvent('touchstart', [t], [t]));
  const move = (t) => fire(screen, 'touchmove', touchEvent('touchmove', [t], [t]));
  const end = (t) => fire(screen, 'touchend', touchEvent('touchend', [], [t]));
  const tp = (x, y) => touch(1, x, y + 24);
  toPlay();
  game.phase = 'play';
  spread();
  pauseToCommand();
  API.setTouchMode(true);
  render();
  const P = { x: tcx(13), y: tcy(23) };
  start(tp(P.x, P.y));
  let ring = API.releaseRing(0, 0);
  ok('a finger on open floor draws a ring at exactly the slop radius, round where it landed',
     input.pendingResume && ring && !ring.broken && !ring.blocked
     && ring.r === API.TAP_SLOP_TOUCH * S() && ring.x === P.x * S() && ring.y === (P.y + 24) * S(), ring);
  move(tp(P.x + 11, P.y));
  ok('drifting inside it keeps it whole', !API.releaseRing(0, 0).broken && game.phase === 'command');
  move(tp(P.x + 13, P.y));
  ring = API.releaseRing(0, 0);
  ok('crossing it breaks it, and time stays stopped', ring && ring.broken && game.phase === 'command');
  end(tp(P.x + 13, P.y));
  ok('lifting outside it does not resume', game.phase === 'command');
  fx.release.brokeAt = API.uiClock - 4;
  const fading = API.releaseRing(0, 0);
  fx.release.brokeAt = API.uiClock - 8;
  ok('a broken ring fades out within eight ticks',
     fading && fading.a > 0 && fading.a < 1 && API.releaseRing(0, 0) === null);

  // the ring and the outcome, either side of the line
  const verdicts = [];
  for (const dx of [0, 6, 11.9, 12, 12.1, 18, 30]) {
    if (game.phase === 'play') pauseToCommand();
    start(tp(P.x, P.y));
    move(tp(P.x + dx, P.y));
    const whole = !API.releaseRing(0, 0).broken;
    end(tp(P.x + dx, P.y));
    const went = game.phase === 'play';
    verdicts.push({ dx, whole, went, after: !!(went && API.releaseRing(0, 0)) });
  }
  ok('a whole ring always means the lift resumed; a broken one always that it did not',
     verdicts.every(v => v.whole === v.went && !v.after)
     && verdicts.filter(v => v.went).length === 4, verdicts);

  if (game.phase === 'play') pauseToCommand();
  const g0 = game.hunters[0];
  start(tp(g0.x, g0.y));
  ok('no ring on a ghost', fx.release === null && API.releaseRing(0, 0) === null && !!Draw.active);
  end(tp(g0.x, g0.y));
  render();
  const s3 = rosterUI.slots[3];
  start(touch(1, (s3.x + s3.w / 2) / S(), (s3.y + s3.h / 2) / S()));
  ok('none on a card, which takes the press itself', fx.release === null && input.pressedCtl === 'slot3');
  end(touch(1, (s3.x + s3.w / 2) / S(), (s3.y + s3.h / 2) / S()));
  const pl = rosterUI.play;
  start(touch(1, (pl.x + pl.w / 2) / S(), (pl.y + pl.h / 2) / S()));
  ok('and none on PLAY, which goes on the press', fx.release === null && game.phase === 'play');
  end(touch(1, (pl.x + pl.w / 2) / S(), (pl.y + pl.h / 2) / S()));
  pauseToCommand();
  const late = game.hunters[2];
  late.dir = null; late.overdue = true;
  start(tp(P.x, P.y));
  ring = API.releaseRing(0, 0);
  ok('with a ghost overdue the ring says the lift will be refused', ring && ring.blocked);
  end(tp(P.x, P.y));
  ok('and it is', game.phase === 'command' && API.releaseRing(0, 0) === null);
  late.overdue = false; late.dir = 'left';
  API.setTouchMode(false);

  console.log('  -- the release');
  toPlay();
  game.phase = 'play';
  spread();
  pauseToCommand();
  game.hunters.forEach(x => x.setOrder(bfsRoute(x.tile(), { c: 13, r: 23 }, 80), false));
  resumeFromCommand();
  ok('PLAY is still instant', game.phase === 'play' && fx.thawAt === API.uiClock);
  const strokes = [];
  let pts = [];
  sctx.beginPath = () => { pts = []; };
  sctx.moveTo = (x, y) => pts.push({ x, y });
  sctx.lineTo = (x, y) => pts.push({ x, y });
  sctx.stroke = () => strokes.push({ style: sctx.strokeStyle, w: sctx.lineWidth, a: sctx.globalAlpha, pts: pts.slice() });
  const w = Math.max(2, S() * 0.85);
  const comets = () => strokes.filter(s => s.style === TOKENS.ink && Math.abs(s.w - w * 1.1) < 1e-9);
  const glowOf = (h) => strokes.find(s => s.style === h.color && Math.abs(s.w - w * 4.5) < 1e-9);
  const thawed = (t) => { fx.thawAt = API.uiClock - t; strokes.length = 0; render(); };
  thawed(4);
  ok('every committed order is sent down its line: one comet each', comets().length === 4,
     { n: comets().length });
  const early = glowOf(game.hunters[0]).a;
  thawed(API.TRANSMIT_TICKS - 0.01);
  const lands = game.hunters.every(h => {
    const tip = h.path.tiles[h.path.tiles.length - 1];
    const tx = tcx(tip.c) * S(), ty = (tcy(tip.r) + 24) * S();
    return comets().some(c => { const e = c.pts[c.pts.length - 1]; return Math.hypot(e.x - tx, e.y - ty) < 1; });
  });
  ok('and each arrives at its arrowhead as the transmit ends', lands);
  thawed(API.TRANSMIT_TICKS);
  const settledA = glowOf(game.hunters[0]).a;
  ok('then it is gone, and the trails have come down to live brightness',
     comets().length === 0 && early > settledA && Math.abs(settledA - 0.13 * 0.5) < 1e-9,
     { early, settledA });

  const tr = [];
  sctx.translate = (x, y) => tr.push({ x, y, a: sctx.globalAlpha });
  const shellAt = (h) => tr.filter(t => Math.abs(t.x - h.x * S()) < 1e-6 && Math.abs(t.y - (h.y + 24) * S()) < 1e-6);
  const g = game.hunters[0];
  g.x += 3;                                  // it has already moved on
  fx.thawAt = API.uiClock - 2; tr.length = 0; render();
  const peel = shellAt(g);
  ok('the lifted shells stay on at the live positions, fading into the sprites',
     peel.length === 1 && peel[0].a > 0 && peel[0].a < 1 && Math.abs(peel[0].a - API.shellAlpha()) < 1e-12,
     { n: peel.length, a: peel[0] && peel[0].a });
  fx.thawAt = API.uiClock - 8; tr.length = 0; render();
  ok('and are gone within eight ticks', shellAt(g).length === 0);

  fx.thawAt = API.uiClock - 3;
  pauseToCommand();
  strokes.length = 0; tr.length = 0; render();
  ok('a refreeze cancels all of it at once: no comets, the shells straight back to frozen',
     API.transmitT() === -1 && comets().length === 0 && shellAt(g).length === 1 && shellAt(g)[0].a === 1);
  sctx.beginPath = noop; sctx.moveTo = noop; sctx.lineTo = noop; sctx.stroke = noop; sctx.translate = noop;
}

console.log('\n== time stops where it was asked to ==');
{
  /* Every way of stopping time, through the real handlers, and where the
     glass says it stopped from: the ghost a key talks to, the ? chip, the
     point a mouse pressed. The wave and the bank split both start there,
     so a wrong answer here is a freeze that ripples out of the wrong ghost. */
  const { fx, fire, screen, HELP_CHIP, closeHelp, helpUI, render } = API;
  const win = API.win;
  const S = () => API.scale;
  const setup = () => {
    toPlay();
    game.phase = 'play';
    [[1, 5], [6, 5], [21, 5], [26, 5]].forEach(([c, r], i) => {
      const x = game.hunters[i];
      x.state = 'active'; x.path = null; x.dir = 'left'; x.overdue = false;
      x.x = tcx(c); x.y = tcy(r);
    });
    Draw.selected = 0; Draw.sticky = false;
    fx.thawAt = -1e9;
    API.setTouchMode(false);
    render();                                  // the ? chip's rect goes down
  };
  const key = (code) => fire(win, 'keydown', { code, repeat: false, preventDefault() {} });
  const mouse = (button, x, y) => {
    fire(screen, 'mousedown', { button, clientX: x, clientY: y });
    fire(win, 'mouseup', { button, clientX: x, clientY: y });
  };
  const ghost = (i) => () => ({ x: game.hunters[i].x, y: game.hunters[i].y });
  const cases = [
    ['Space', () => key('Space'), ghost(0)],
    ['P', () => key('KeyP'), ghost(0)],
    ['a digit', () => key('Digit3'), ghost(2)],
    ['Tab', () => key('Tab'), ghost(1)],
    ['H', () => { key('KeyH'); closeHelp(); }, () => ({ x: HELP_CHIP.x, y: HELP_CHIP.y - 24 })],
    ['the ? chip', () => {
      const b = helpUI.btn;
      mouse(0, (b.x + b.w / 2) / S(), (b.y + b.h / 2) / S());
      closeHelp();
    }, () => ({ x: HELP_CHIP.x, y: HELP_CHIP.y - 24 })],
    ['a right-click', () => mouse(2, 100, 124), () => ({ x: 100, y: 100 })],
    ['a click on open floor', () => mouse(0, tcx(13), tcy(23) + 24), () => ({ x: tcx(13), y: tcy(23) })],
  ];
  const wrong = [];
  for (const [name, act, want] of cases) {
    setup();
    act();
    const w = want();
    if (game.phase !== 'command' || fx.origin.x !== w.x || fx.origin.y !== w.y) {
      wrong.push({ name, phase: game.phase, origin: fx.origin, want: w });
    }
  }
  ok('each way of stopping time starts the freeze from the right place', wrong.length === 0, wrong);

  // looking is not touching: nothing the cursor passes over is selected
  setup();
  key('Space');
  render();
  const h3 = game.hunters[3];
  h3.setOrder(bfsRoute(h3.tile(), { c: 13, r: 23 }, 80), false);
  const tip = h3.path.tiles[h3.path.tiles.length - 1];
  const over = (dx, dy) => { fire(win, 'mousemove', { clientX: dx, clientY: dy }); render(); };
  const mid = (r) => [(r.x + r.w / 2) / S(), (r.y + r.h / 2) / S()];
  over(...mid(API.rosterUI.slots[2]));
  over(...mid(API.rosterUI.play));
  over(tcx(tip.c), tcy(tip.r) + 24);
  over(game.hunters[1].x, game.hunters[1].y + 24);
  ok('the cursor passing over cards, PLAY, an arrowhead and a ghost selects nothing',
     Draw.selected === 0 && Draw.sticky === false && !Draw.active && game.phase === 'command');

  // a round that starts from READY was never frozen, so it is no thaw
  fx.thawAt = -1e9;
  toPlay();
  ok('only a real resume stamps a thaw: a new round from READY does not', fx.thawAt === -1e9);
}

console.log('\n== reduced motion snaps everything ==');
{
  /* prefers-reduced-motion, flipped live the way a browser's own list
     flips: every entrance lands at once, every exit is already gone, and
     nothing about the state it shows is different. */
  const { reducedMotionMQ: mq, fx, pauseToCommand, resumeFromCommand, bankBand, fxIn,
          springIn, easeOut, transmitT, shellAlpha, releaseRing, surveyWave, render,
          input, drawDragTag, tagAnim } = API;
  const S = () => API.scale;
  const sctx = API.screenCtx;
  toPlay();
  game.phase = 'play';
  [[1, 5], [6, 5], [21, 5], [26, 5]].forEach(([c, r], i) => {
    const x = game.hunters[i];
    x.state = 'active'; x.path = null; x.dir = 'left'; x.overdue = false;
    x.x = tcx(c); x.y = tcy(r);
  });
  fx.thawAt = -1e9;
  mq.matches = true;
  pauseToCommand({ x: tcx(5), y: tcy(10) });
  ok('the night bank arrives whole, on the click tick', game.phase === 'command' && bankBand() === null);
  ok('the glass is simply there', fxIn() === 1 && springIn(0) === 1 && easeOut(0) === 1);
  const wv = surveyWave(S(), 0, 0);
  ok('the grid is laid at once, with no wave', !wv.moving && wv.bands.every(b => b === 0));

  const d = game.hunters[0];
  Draw.begin(d);
  input.dragMoved = true;
  Draw.extendToward(d.tile().c + 4, d.tile().r);
  drawDragTag(sctx, 0, 0);
  Draw.extendToward(d.tile().c + 5, d.tile().r);
  const r = drawDragTag(sctx, 0, 0);
  ok('the tag jumps to a new head instead of easing there',
     !!r && tagAnim.x === r.tx && tagAnim.y === r.ty, r);
  Draw.active = null;
  input.dragMoved = false;

  fx.release = { x: tcx(13), y: tcy(23), brokeAt: API.uiClock };
  ok('a broken release ring is gone the moment it breaks', releaseRing(0, 0) === null);
  fx.release = null;

  let threw = null;
  try { render(); } catch (e) { threw = e.message; }
  resumeFromCommand();
  ok('a thaw sends no comets and peels no shells', game.phase === 'play'
     && transmitT() === -1 && shellAlpha() === 0);
  try { render(); } catch (e) { threw = threw || e.message; }
  ok('and all of it renders', threw === null, { threw });

  mq.matches = false;
  fx.thawAt = -1e9;
  pauseToCommand({ x: tcx(5), y: tcy(10) });
  ok('turned back off, the next freeze has its motion again', bankBand() !== null && fxIn() < 1);
  resumeFromCommand();
}

console.log('\n== the glass on a phone ==');
{
  /* The harness window is 900x1000 at dpr 1, where every caption's floor
     and its resting size are the same 11px and nothing ever has to fit.
     Phones are where the CSS floors win, so these checks resize to real
     phone viewports and measure with a face that has widths. */
  const { fx, pauseToCommand, render, rosterUI, pillAnim, HELP_CHIP, BOOST_TICKS, fire,
          tagAnim, plateShadows } = API;
  const win = API.win;
  const S = () => API.scale;
  const device = (w, h, dpr) => {
    win.innerWidth = w; win.innerHeight = h;
    if (dpr === undefined) delete win.devicePixelRatio; else win.devicePixelRatio = dpr;
    fire(win, 'resize', {});
    return API.screenCtx;                     // layout() hands out a new context
  };
  /* A stand-in for system-ui: capitals and figures about 0.62em, spaces and
     points about 0.3, plus whatever tracking the context is carrying. */
  const metrics = (ctx) => {
    ctx.letterSpacing = '0px';
    ctx.measureText = (t) => {
      const m = /(\d+)px/.exec(ctx.font || '');
      const px = m ? Number(m[1]) : 10;
      const ls = parseFloat(ctx.letterSpacing) || 0;
      let w = 0;
      for (const ch of t) w += (ch === ' ' || ch === '.' ? 0.3 : 0.62) * px + ls;
      return { width: w };
    };
    return ctx;
  };
  const settle = () => { fx.skipEnter = false; fx.enterAt = API.uiClock - 100; };
  const spread = () => {
    [[1, 5], [6, 5], [21, 5], [26, 5]].forEach(([c, r], i) => {
      const x = game.hunters[i];
      x.state = 'active'; x.path = null; x.dir = null; x.overdue = false;
      x.boostT = 0; x.campT = 0; x.x = tcx(c); x.y = tcy(r);
    });
    game.campChoice = 3; game.campLimit = 600; game.frightT = 0;
  };
  toPlay();
  game.phase = 'play';
  spread();
  fx.thawAt = -1e9;
  pauseToCommand();
  Draw.selected = 0;

  console.log('  -- the pill keeps to its row');
  const rows = [];
  for (const [w, h] of [[360, 800], [375, 667], [390, 844], [412, 915], [1366, 650], [900, 1000]]) {
    for (const dpr of [1, 1.25, 1.5, 2, 2.625, 3]) {
      const ctx = metrics(device(w, h, dpr));
      settle();
      const ops = [];
      ctx.rect = (x, y, rw, rh) => ops.push({ k: 'rect', bottom: y + rh });
      ctx.clip = () => ops.push({ k: 'clip' });
      ctx.fill = () => ops.push({ k: 'fill' });
      ctx.stroke = () => ops.push({ k: 'stroke' });
      ctx.drawImage = () => ops.push({ k: 'img' });
      const p = API.drawStatusPill(ctx, 0, 0, false);
      const floor = 24 * S();
      const clipAt = ops.findIndex(o => o.k === 'clip');
      const paintAt = ops.findIndex(o => o.k !== 'rect' && o.k !== 'clip');
      const clipRect = ops.slice(0, clipAt).reverse().find(o => o.k === 'rect');
      rows.push({ w, h, dpr, S: S(), top: p.y / S(), bottom: (p.y + p.h) / S(),
        good: p.y >= 16 * S() && p.y + p.h <= floor && clipAt >= 0 && clipAt < paintAt
          && !!clipRect && clipRect.bottom <= floor && API.TYPE.pillCap.max * 0.7 <= p.h
          && API.TYPE.pillCap.min >= Math.ceil(9 * dpr) - 1e-9 });
    }
  }
  ok('the capsule and its words sit inside HUD row 2 at every scale and density,'
     + ' and all it paints, shadow too, is clipped above the maze',
     rows.length === 36 && rows.every(r => r.good), rows.filter(r => !r.good));

  console.log('  -- every card state fits its card');
  const states = [
    ['STOPS IN', g => { g.x = tcx(1); g.y = tcy(1); g.dir = 'right'; }],
    ['STOPPING', g => { g.x = tcx(1); g.y = tcy(1); g.dir = 'up'; }],
    ['LEAVING DEN', g => { g.state = 'exitingDen'; }],
    ['HEADING HOME', g => { g.state = 'eyes'; }],
    ['BACK IN', g => { g.state = 'respawn'; g.respawnT = 186; }],
    ['OUT IN', g => { g.state = 'idle'; g.releaseT = 400; g.releaseFrom = 600; }],
    ['OVERDRIVE', g => { g.boostT = BOOST_TICKS / 2; }],
    ['overdue', g => { g.overdue = true; }],
    ['CAMPED', () => { game.campChoice = 4; game.campLimit = null; }],
    ['LEFT', () => {}],
    ['ROUTE', g => { g.setOrder(bfsRoute(g.tile(), { c: 26, r: 29 }, 200), false); }],
    ['LOOP', g => {
      let ring = [{ c: 1, r: 5 }];
      for (const to of [{ c: 6, r: 5 }, { c: 6, r: 1 }, { c: 1, r: 1 }, { c: 1, r: 5 }]) {
        ring = ring.concat(bfsRoute(ring[ring.length - 1], to, 80).slice(1));
      }
      g.setOrder(ring.slice(0, -1), true);
    }],
  ];
  const spill = [];
  /* A small phone on its side (667x375 at dpr 2) is scale 2 with a 2x
     floor: a card 42 CSS px wide, a name slot of 27. No five-letter name
     fits that at a legible size, so that class is held to the weaker
     promise: whatever does not fit is cut at its own card's edge, never
     painted onto the next one. */
  const cramped = [];
  for (const [w, h, dpr] of [[360, 780, 3], [412, 915, 2.625], [375, 667, 2], [390, 844, 3],
                             [430, 932, 3], [1280, 720, 1.5], [1366, 650, 1], [900, 1000, 1],
                             [667, 375, 2]]) {
    const ctx = metrics(device(w, h, dpr));
    const small = S() <= 2 && dpr >= 2;
    const drawn = [];
    let clip = null, lastRect = null;
    ctx.rect = (x, y, rw, rh) => { lastRect = { x, y, w: rw, h: rh }; };
    ctx.clip = () => { clip = lastRect; };
    ctx.fillText = (t, x, y) => drawn.push({ t, x, y, align: ctx.textAlign, w: ctx.measureText(t).width, clip });
    for (const [label, put] of states) {
      spread();
      put(game.hunters[0]);
      Draw.active = null;
      drawn.length = 0;
      settle();
      render();
      const camp = rosterUI.camp;
      for (const d of drawn) {
        const slot = rosterUI.slots.find(s => d.x >= s.x && d.x < s.x + s.w
          && d.y >= s.y - 2 * S() && d.y <= s.y + s.h + S());
        if (slot && d.align === 'left' && small) {
          if (!d.clip || d.clip.x !== slot.x || d.clip.w !== slot.w) cramped.push({ w, dpr, label, t: d.t });
        } else if (slot && d.align === 'left' && d.x + d.w > slot.x + slot.w + 0.5) {
          spill.push({ w, dpr, label, t: d.t, over: (d.x + d.w - slot.x - slot.w) / dpr });
        }
        if (camp && d.y >= camp.y && d.y <= camp.y + camp.h && d.x >= camp.x && d.x <= camp.x + camp.w) {
          const l = d.align === 'right' ? d.x - d.w : d.x, r = d.align === 'right' ? d.x : d.x + d.w;
          if (l < camp.x - 0.5 || r > camp.x + camp.w + 0.5) spill.push({ w, dpr, label, t: d.t, camp: true });
        }
      }
      const room = (HELP_CHIP.x - HELP_CHIP.r - 1 - 224 / 2) * 2 * S();
      if (pillAnim.to > room + 1e-9) spill.push({ w, dpr, label, pill: pillAnim.to, room });
    }
  }
  ok('every status, name and camp label ends inside its own card on every phone',
     spill.length === 0, spill.slice(0, 8));
  ok('and where a card is too small for words, they are cut at its own edge',
     cramped.length === 0, cramped.slice(0, 8));

  console.log('  -- a new scale starts the glass afresh');
  metrics(device(900, 1000));
  settle();
  render();
  render();
  const before = pillAnim.to;
  tagAnim.on = true;
  metrics(device(1400, 1800));                // scale 3 -> 6, mid-freeze
  const tagKept = tagAnim.on;
  render();
  ok('a resize mid-freeze snaps the pill to its new width instead of springing from the old one',
     S() === 6 && pillAnim.from === pillAnim.to && pillAnim.to !== before,
     { before, from: pillAnim.from, to: pillAnim.to });
  ok('and the tag forgets where it was', tagKept === false);

  console.log('  -- no live blur on the glass');
  let ctx = metrics(device(375, 667, 2));
  let blurs = 0;
  Object.defineProperty(ctx, 'shadowBlur', {
    configurable: true, get() { return 0; }, set(v) { if (v > 0) blurs++; } });
  const d0 = game.hunters[0];
  spread();
  Draw.begin(d0);
  API.input.dragMoved = true;
  Draw.extendToward(d0.tile().c + 4, d0.tile().r);
  settle();
  const blitted = () => {
    const seen = new Set();
    ctx.drawImage = (img) => { if ([...plateShadows.values()].includes(img)) seen.add(img); };
    render();
    return seen;
  };
  const first = blitted();
  const baked = plateShadows.size;
  fx.enterAt = API.uiClock - 2;               // mid-entrance: the cards are still rising
  const rising = blitted();
  settle();
  const again = blitted();
  ok('a frozen frame, tag and all, asks the canvas for no shadow blur', blurs === 0, { blurs });
  ok('every plate\'s shadow is baked once and reused frame after frame',
     baked > 0 && baked <= 8 && plateShadows.size === baked && again.size === first.size
     && [...again, ...rising].every(img => first.has(img)), { baked, now: plateShadows.size });
  ctx.drawImage = () => {};
  Draw.active = null;
  API.input.dragMoved = false;
  device(900, 1000);
  ok('and a new scale throws the bakes away', plateShadows.size === 0);
  {
    // three slices: two ends and a stretched middle, meeting edge to edge
    const cuts = [];
    const rec = { drawImage: (cv, sx, sy, sw, sh, dx, dy, dw, dh) => cuts.push({ sw, dx, dw }) };
    API.drawPlateShadow(rec, 10, 20, 300, 39, 6, 7.5, API.TOKENS.glass);
    const s = API.plateShadow(300, 39, 6, 7.5, API.TOKENS.glass);
    ok('a long plate\'s shadow is its two ends and one stretched column, edge to edge',
       cuts.length === 3 && cuts[1].sw === 1
       && cuts[0].dx === 10 - s.m && cuts[0].dx + cuts[0].dw === cuts[1].dx
       && cuts[1].dx + cuts[1].dw === cuts[2].dx && cuts[2].dx + cuts[2].dw === 10 + 300 + s.m, cuts);
    cuts.length = 0;
    rec.drawImage = (cv, dx) => cuts.push({ dx });
    API.drawPlateShadow(rec, 10, 20, 12, 39, 6, 7.5, API.TOKENS.glass);
    ok('and one too short to have a middle is baked whole', cuts.length === 1);
  }

  console.log('  -- fitText, directly');
  device(1400, 1800);                         // S 6 at dpr 1: every role has room to shrink
  const T = API.TYPE;
  const fake = () => ({
    font: '', letterSpacing: '0px', drawn: [],
    save() {}, restore() {},
    measureText(t) {
      const px = Number(/(\d+)px/.exec(this.font)[1]);
      const ls = parseFloat(this.letterSpacing) || 0;
      let w = 0;
      for (const ch of t) w += (ch === '1' || ch === '.' ? 0.3 : 0.6) * px + ls;
      return { width: w };
    },
    fillText(t) { this.drawn.push({ t, px: Number(/(\d+)px/.exec(this.font)[1]), ls: this.letterSpacing }); },
  });
  const fit = (text, short, maxW, role) => {
    const c = fake();
    const w = API.fitText(c, text, short, 0, 0, role || 'caption', maxW, '#fff');
    return Object.assign({ w, n: c.drawn.length }, c.drawn[0]);
  };
  const C = T.caption;
  ok('here a caption can shrink', C.min < C.max, C);
  let f = fit('ABCDEFGHIJ', null, 1e4);
  ok('with room to spare: the whole text at its resting size', f.t === 'ABCDEFGHIJ' && f.px === C.max);
  f = fit('ABCDEFGHIJ', null, 10 * 0.6 * 15 + 0.01);
  ok('a tight fit shrinks a pixel at a time and stops at the first that fits',
     f.t === 'ABCDEFGHIJ' && f.px === 15, f);
  f = fit('ABCDEFGHIJ', 'SHORT', 10 * 0.6 * (C.min - 1));
  ok('past the floor it takes the short label, at the largest size that fits',
     f.t === 'SHORT' && f.px === Math.min(C.max, 20), f);
  f = fit('ABCDEFGHIJ', ['MEDIUM', 'MED', 'M'], 3 * 0.6 * C.min + 0.01);
  ok('a list of labels is tried in order', f.t === 'MED' && f.px === C.min, f);
  f = fit('ABCDEFGHIJ', ['MEDIUM', 'MED'], 1);
  ok('when nothing fits, the last label is set at the floor, never smaller', f.t === 'MED' && f.px === C.min, f);
  f = fit('CAMP LIMIT', ['CAMP', ''], 3);
  ok('an empty last label leaves the words out, and takes no width', f.n === 1 && f.t === '' && f.w === 0, f);
  const one = fit('1.1s', null, 2.1 * 15 + 0.01), eight = fit('8.8s', null, 2.1 * 15 + 0.01);
  ok('a countdown keeps one size whatever its digits', one.px === eight.px && one.px === 15, { one, eight });
  f = fit('ABCDEFGHIJKLMNOPQRSTUVWXYZ', null, 0);
  ok('no width means no limit', f.px === C.max);
  const Ti = T.title;
  f = fit('EMBER', 'EMB', 5 * 0.6 * Ti.min + 0.01, 'title');
  ok('a tracked name gives up its tracking at the floor before it gives up a letter',
     f.t === 'EMBER' && f.px === Ti.min && f.ls === '0px', f);

  device(900, 1000);                          // back to the harness's own window
  ok('the harness window is itself again', S() === 3 && API.uiDpr === 1);
}

console.log('\n' + (fail === 0 ? 'ALL ' + pass + ' CHECKS PASSED' : pass + ' passed, ' + fail + ' FAILED'));
process.exit(fail === 0 ? 0 : 1);
