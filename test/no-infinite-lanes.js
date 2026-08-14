// The wall-stop rule is the spine of the game: a hunter with no order must
// eventually meet a wall and stop. A corridor that wraps the full width would
// let it circle the board forever and quietly cancel that rule.
//
// Later boards add more wrap tunnels, so this walks every open tile in every
// heading on EVERY board in the rotation and proves each run terminates.
const API = require('./harness.js');
const { COLS, MAZE_ROWS, isOpen, BOARDS, setBoard } = API;

const DIRS4 = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const wrap = (c) => ((c % COLS) + COLS) % COLS;

let fail = false;
BOARDS.forEach((board, bi) => {
  setBoard(bi);
  const TUNNEL_ROWS = board.tunnels;
  let runs = 0, endless = [], longest = { len: 0 };
  for (let r = 0; r < MAZE_ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!isOpen(c, r)) continue;
      for (const d of Object.keys(DIRS4)) {
        const [dc, dr] = DIRS4[d];
        let cc = c, rr = r, steps = 0;
        const seen = new Set();
        while (steps < 500) {
          let nc = cc + dc, nr = rr + dr;
          if (TUNNEL_ROWS.includes(rr)) nc = wrap(nc);
          if (!isOpen(nc, nr)) break;              // wall: the hunter stops
          cc = nc; rr = nr; steps++;
          const k = rr * COLS + cc;
          if (seen.has(k)) { endless.push({ c, r, d }); break; }
          seen.add(k);
        }
        if (steps >= 500) endless.push({ c, r, d, note: 'no wall in 500 steps' });
        if (steps > longest.len) longest = { len: steps, from: { c, r }, d };
        runs++;
      }
    }
  }

  console.log('board ' + (bi + 1) + ' (tunnels [' + board.tunnels + ']): '
    + runs + ' runs traced, longest ' + longest.len + ' tiles from '
    + JSON.stringify(longest.from) + ' heading ' + longest.d);
  if (endless.length) {
    fail = true;
    console.log('FAIL: ' + endless.length + ' runs never meet a wall:');
    endless.slice(0, 8).forEach(e => console.log('   ' + JSON.stringify(e)));
  }
});

setBoard(0);
if (fail) process.exit(1);
console.log('PASS: every straight run on every board ends at a wall.');
