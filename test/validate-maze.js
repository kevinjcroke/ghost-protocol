// Maze validator for Ghost Protocol's original layouts. Every board in the
// rotation must obey the same rules, and every board must agree on the tiles
// the game hard-codes: the den block, the den exit, the fruit seam, and the
// evader spawn.
const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'game.js'), 'utf8');
const boards = [...src.matchAll(/const MAZE_SRC\w* = \[([\s\S]*?)\];/g)]
  .map(m => [...m[1].matchAll(/'([^']*)'/g)].map(x => x[1]));
const tunnelSets = [...src.matchAll(/tunnels:\s*\[([^\]]*)\]/g)]
  .map(m => m[1].split(',').map(Number));
const COLS = 28;
if (!boards.length) { console.log('ERROR: no MAZE_SRC arrays found'); process.exit(1); }
if (boards.length !== tunnelSets.length) {
  console.log(`ERROR: ${boards.length} boards but ${tunnelSets.length} tunnel sets in BOARDS`);
  process.exit(1);
}

// the den block every board must share (cols 10..17, rows 12..16)
const DEN_ROWS = ['###--###', '#      #', '#      #', '#      #', '########'];

let anyErr = false;
boards.forEach((rows, bi) => {
  const TUNNELS = tunnelSets[bi];
  const ROWS = rows.length;
  let errs = [];

  if (ROWS !== 31) errs.push(`rows=${ROWS} expected 31`);
  rows.forEach((r, i) => { if (r.length !== COLS) errs.push(`row ${i} len ${r.length}`); });

  // mirror symmetry (door '-' mirrors to '-')
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS / 2; c++) {
    const a = rows[r][c], b = rows[r][COLS - 1 - c];
    const wa = a === '#', wb = b === '#';
    if (wa !== wb || (a === '-') !== (b === '-')) errs.push(`asym ${r},${c} '${a}' vs '${b}'`);
  }

  // shared den block and hard-coded anchor tiles
  for (let i = 0; i < 5; i++) {
    const got = rows[12 + i] && rows[12 + i].slice(10, 18);
    if (got !== DEN_ROWS[i]) errs.push(`den row ${12 + i}: '${got}'`);
  }

  const open = (c, r) => {
    if (r < 0 || r >= ROWS) return false;
    if (c < 0 || c >= COLS) return TUNNELS.includes(r);
    const ch = rows[r][c];
    return ch !== '#' && ch !== '-';
  };
  for (const [c, r, what] of [[13, 11, 'den exit'], [14, 11, 'den exit'],
                              [13, 17, 'fruit seam'], [13, 23, 'evader spawn']])
    if (!open(c, r)) errs.push(`${what} (${c},${r}) blocked`);

  // tunnel rows open at the edges; all other rows walled there
  for (let r = 0; r < ROWS; r++) {
    const isT = TUNNELS.includes(r);
    const edges = rows[r][0] === '#' && rows[r][COLS - 1] === '#';
    if (isT && edges) errs.push(`tunnel row ${r} walled at edges`);
    if (!isT && !edges) errs.push(`row ${r} open at edge but not a tunnel`);
  }

  const inDen = (c, r) => c >= 11 && c <= 16 && r >= 13 && r <= 15;

  // connectivity (excluding den interior)
  let start = null, total = 0;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++)
    if (open(c, r) && !inDen(c, r)) { total++; if (!start) start = [c, r]; }
  const seen = new Set([start.join()]);
  const q = [start];
  while (q.length) {
    const [c, r] = q.pop();
    for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      let nc = c + dc, nr = r + dr;
      if (TUNNELS.includes(r)) nc = ((nc % COLS) + COLS) % COLS;
      if (nc < 0 || nc >= COLS) continue;
      if (!open(nc, nr) || inDen(nc, nr)) continue;
      const k = [nc, nr].join();
      if (!seen.has(k)) { seen.add(k); q.push([nc, nr]); }
    }
  }
  if (seen.size !== total) errs.push(`connectivity ${seen.size}/${total}`);

  // dead ends (tiles with <2 open neighbors), outside den
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (!open(c, r) || inDen(c, r)) continue;
    let n = 0;
    for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      let nc = c + dc, nr = r + dr;
      if (TUNNELS.includes(r)) nc = ((nc % COLS) + COLS) % COLS;
      if (nc < 0 || nc >= COLS) { if (TUNNELS.includes(r)) n++; continue; }
      if (open(nc, nr) && !inDen(nc, nr)) n++;
    }
    if (n < 2) errs.push(`dead end at c${c},r${r}`);
  }

  // 2x2 open areas (corridor must be 1 wide) except the door forecourt
  for (let r = 0; r < ROWS - 1; r++) for (let c = 0; c < COLS - 1; c++) {
    const all = open(c,r) && open(c+1,r) && open(c,r+1) && open(c+1,r+1);
    const doorZone = r >= 11 && r <= 12 && c >= 12 && c <= 14;
    if (all && !doorZone && !(inDen(c,r)||inDen(c+1,r+1))) errs.push(`2x2 open at ${c},${r}`);
  }

  // dots
  let dots = 0, energ = 0;
  for (const row of rows) for (const ch of row) { if (ch === '.') dots++; if (ch === 'o') energ++; }
  console.log(`board ${bi + 1}: tunnels=[${TUNNELS}] dots=${dots} energizers=${energ} openTiles=${total}`);
  if (energ !== 4) errs.push(`energizers=${energ}`);

  errs = [...new Set(errs)];
  if (errs.length) {
    anyErr = true;
    console.log('ERRORS:');
    errs.slice(0, 20).forEach(e => console.log(' -', e));
    if (errs.length > 20) console.log(` ...and ${errs.length - 20} more`);
  }
});

if (anyErr) process.exit(1);
console.log('MAZE-OK x' + boards.length);
