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
  setup();
  const h = game.hunters.find(x => x.state === 'active') || game.hunters[0];
  h.state = 'active';
  const ev = game.evader;
  let hDist = 0, eDist = 0;
  let hp = { x: h.x, y: h.y }, ep = { x: ev.x, y: ev.y };
  for (let i = 0; i < ticks; i++) {
    game.update();
    if (game.phase !== 'play') break;
    const hd = Math.abs(h.x - hp.x) + Math.abs(h.y - hp.y);
    const ed = Math.abs(ev.x - ep.x) + Math.abs(ev.y - ep.y);
    if (hd < 5) hDist += hd;      // ignore tunnel-wrap jumps
    if (ed < 5) eDist += ed;
    hp = { x: h.x, y: h.y }; ep = { x: ev.x, y: ev.y };
  }
  return { hunter: hDist / 8, evader: eDist / 8, ratio: eDist / Math.max(hDist, 0.001) };
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
console.log('level   hunter   evader   ratio');
for (const L of [1, 2, 4, 8, 12, 20]) {
  const r = measure(L, keepMoving, 600);
  console.log(String(L).padStart(5) + r.hunter.toFixed(1).padStart(9)
    + r.evader.toFixed(1).padStart(9) + r.ratio.toFixed(2).padStart(8));
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
