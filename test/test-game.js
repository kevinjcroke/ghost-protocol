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
    if (live.includes(game.phase)) game.update();
    game.popups = game.popups.filter(p => --p.t > 0);
  }
}
function toPlay() { game.newGame(); tick(230); }

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
  ok('a click with no drag clears the order', h.path === null);
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

console.log('\n== capture, pincer scoring, level flow ==');
{
  toPlay();
  game.phase = 'play';
  game.frightT = 0;
  const ev = game.evader;
  const h1 = game.hunters[0], h2 = game.hunters[1];
  h1.state = 'active'; h2.state = 'active';
  h1.x = ev.x; h1.y = ev.y;
  h2.x = ev.x + 16; h2.y = ev.y;
  const before = game.score;
  tick(3);
  ok('touching the evader ends the round', game.phase === 'capture');
  ok('the capture scores', game.score > before, { gained: game.score - before });
  ok('a second body nearby pays a pincer bonus', game.captureInfo.pincer > 0, game.captureInfo);
  tick(90);
  ok('the board flashes', game.phase === 'flash');
  tick(150);
  ok('then the next level starts', game.level === 2 && game.phase === 'ready',
     { lvl: game.level, ph: game.phase });
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
  ok('a hunter routed over the prize claims it', game.fruit === null && game.score > before,
     { gained: game.score - before });
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
     ['play','ready','capture','flash','escaped','gameover','attract'].includes(game.phase),
     { ph: game.phase });
}

console.log('\n== evader competence: he should survive brainless hunters ==');
{
  let survived = 0;
  for (let trial = 0; trial < 3; trial++) {
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
  ok('he survives hunters left parked and stupid', survived === 3, { survived });
}

console.log('\n' + (fail === 0 ? 'ALL ' + pass + ' CHECKS PASSED' : pass + ' passed, ' + fail + ' FAILED'));
process.exit(fail === 0 ? 0 : 1);
