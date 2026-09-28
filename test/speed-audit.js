// The evader-to-hunter speed ratio is the biggest single lever on how the
// game feels, so it should be a number we chose, not one we inherited.
// Measures actual tiles covered per 600 ticks in each state.
const API = require('./harness.js');
const { game, tcx, tcy } = API;

function measure(level, setup, ticks) {
  game.level = level;
  game.startLevel(true);
  for (let i = 0; i < 240; i++) game.update();   // clear READY
  game.phase = 'play';
  /* No camp limit for the run. The harness's is 0S, so the first released
     ghost to wall-stop went overdue on its first parked tick, froze the
     game, and the break below ended a "10 second" window about two
     seconds in. Parked ghosts are fine here; only the one ghost we time
     has to keep moving, and keepMoving sees to that. */
  const limit = game.campLimit;
  game.campLimit = null;
  setup();
  const h = game.hunters.find(x => x.state === 'active') || game.hunters[0];
  h.state = 'active';
  const ev = game.evader;
  let hDist = 0, eDist = 0, ran = 0;
  let hp = { x: h.x, y: h.y }, ep = { x: ev.x, y: ev.y };
  for (let i = 0; i < ticks; i++) {
    if (game.phase === 'command') game.phase = 'play';   // a route run dry still asks
    API.releaseDen();   // the den only opens on orders: draw the others out
    game.update();
    if (game.phase === 'command') game.phase = 'play';
    if (game.phase !== 'play') break;                    // capture, escape: the run is over
    ran++;
    const hd = Math.abs(h.x - hp.x) + Math.abs(h.y - hp.y);
    const ed = Math.abs(ev.x - ep.x) + Math.abs(ev.y - ep.y);
    if (hd < 5) hDist += hd;      // ignore tunnel-wrap jumps
    if (ed < 5) eDist += ed;
    hp = { x: h.x, y: h.y }; ep = { x: ev.x, y: ev.y };
  }
  game.campLimit = limit;
  // per `ticks`, whatever length the run actually got to, and that length shown
  const k = ticks / Math.max(ran, 1);
  return { hunter: hDist / 8 * k, evader: eDist / 8 * k, ratio: eDist / Math.max(hDist, 0.001), ran };
}

/* Keep a hunter permanently under orders so it never stalls on a wall, or it
   measures as slow for the wrong reason. */
function keepMoving() {
  const { bfsRoute } = API;
  const h = game.hunters[0];
  h.state = 'active';
  h.x = tcx(1); h.y = tcy(1); h.dir = null;
  // a genuine circuit: consecutive tiles must always be adjacent
  const corners = [{ c: 1, r: 1 }, { c: 12, r: 1 }, { c: 12, r: 29 }, { c: 1, r: 29 }];
  let tiles = [];
  for (let i = 0; i < corners.length; i++) {
    const leg = bfsRoute(corners[i], corners[(i + 1) % corners.length]);
    tiles = tiles.concat(i === 0 ? leg : leg.slice(1));
  }
  tiles.pop();                       // last tile equals the first: close it
  h.setOrder(tiles, true);
}

console.log('tiles covered per 600 ticks (10 seconds)\n');
console.log('level   hunter   evader   ratio   ticks measured');
for (const L of [1, 2, 4, 8, 12, 20]) {
  const r = measure(L, keepMoving, 600);
  console.log(String(L).padStart(5) + r.hunter.toFixed(1).padStart(9)
    + r.evader.toFixed(1).padStart(9) + r.ratio.toFixed(2).padStart(8)
    + String(r.ran).padStart(10));
}

console.log('\nconfigured speeds (px per tick):');
for (const L of [1, 4, 8, 20]) {
  const p = API.game.constructor === Object ? null : null;
  game.level = L; game.startLevel(true);
  const q = game.params;
  console.log('  L' + String(L).padEnd(3)
    + ' hunter ' + q.hunterSpeed.toFixed(3)
    + '  evader ' + q.evaderSpeed.toFixed(3)
    + '  ratio ' + (q.evaderSpeed / q.hunterSpeed).toFixed(2)
    + '  | frightened hunter ' + q.hunterFrightSpeed.toFixed(3)
    + ' vs fleeing evader ' + q.evaderFrightSpeed.toFixed(3)
    + '  ratio ' + (q.evaderFrightSpeed / q.hunterFrightSpeed).toFixed(2)
    + '  | hunter in tunnel ' + q.hunterTunnelSpeed.toFixed(3));
}
