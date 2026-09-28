// Autopsy: how does a single chasing hunter catch the evader at high level?
// Runs babysit trials at one level and, on each capture, reports the terrain
// and the evader's recent margin history so the failure mode is visible.
const API = require('./harness.js');
const { game, tcx, tcy, COLS, bfsRoute, neighborsOf, wrapCol } = API;

const LEVEL = Number(process.argv[2] || 12);
const TRIALS = Number(process.argv[3] || 4);

function orderTo(h, target) {
  const ht = h.tile();
  if (ht.c < 0 || ht.c >= COLS) return false;
  const route = bfsRoute({ c: wrapCol(ht.c), r: ht.r }, target);
  if (!route || route.length < 2) return false;
  h.setOrder(route, false);
  return true;
}

for (let trial = 0; trial < TRIALS; trial++) {
  game.level = LEVEL; game.contracts = 3;
  game.startLevel(true);
  let t = 0;
  while (t < 240) { game.update(); t++; }
  const ev = game.evader;
  const hist = [];   // rolling window of {tile, exits, nearest}
  let result = 'timeout';
  while (t < 12000) {
    if (t % 150 === 0) {
      const h = game.hunters.find(x => x.state === 'active');
      const et = ev.tile();
      if (h && et.c >= 0 && et.c < COLS) orderTo(h, { c: wrapCol(et.c), r: et.r });
    }
    if (game.phase === 'command') game.phase = 'play';
    if (game.phase === 'play') API.releaseDen();   // the den only opens on orders
    game.update(); t++;
    if (t % 10 === 0) {
      const et = ev.tile();
      let nearest = 999, nearestMoving = 999;
      game.hunters.forEach((h, i) => {
        if (h.state !== 'active') return;
        const dg = game.hunterDistGrids[i];
        const d = dg && et.c >= 0 && et.c < COLS ? dg[et.r * COLS + wrapCol(et.c)] : -1;
        if (d >= 0) {
          nearest = Math.min(nearest, d);
          if (h.path || h.dir) nearestMoving = Math.min(nearestMoving, d);
        }
      });
      const exits = et.c >= 0 && et.c < COLS ? neighborsOf(wrapCol(et.c), et.r).length : 2;
      hist.push({ t, tile: { ...et }, exits, nearest, nearestMoving, fright: game.frightT });
      if (hist.length > 30) hist.shift();
    }
    if (game.phase === 'capture' || game.phase === 'flash') { result = 'caught'; break; }
    if (game.phase === 'escaped') { result = 'escaped'; break; }
  }
  console.log('\n=== trial ' + trial + ': ' + result + ' at t=' + t + ' ===');
  if (result === 'caught') {
    const parked = game.hunters.filter(h => h.state === 'active' && !h.path && !h.dir).length;
    console.log('parked hunters at capture: ' + parked);
    console.log('last 12 samples (t, tile, exits, nearestAnyHunter, nearestMoving, fright):');
    hist.slice(-12).forEach(s => console.log(
      '  t=' + s.t + '  (' + s.tile.c + ',' + s.tile.r + ')  exits=' + s.exits
      + '  near=' + s.nearest + '  nearMoving=' + s.nearestMoving
      + (s.fright ? '  FRIGHT=' + s.fright : '')));
  }
}
