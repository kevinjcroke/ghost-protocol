// Maze validator for Ghost Protocol's original layout.
const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'game.js'), 'utf8');
const m = src.match(/const MAZE_SRC = \[([\s\S]*?)\];/);
const rows = [...m[1].matchAll(/'([^']*)'/g)].map(x => x[1]);
const COLS = 28, ROWS = rows.length;
const TUNNELS = [14];
let errs = [], warn = [];

if (ROWS !== 31) errs.push(`rows=${ROWS} expected 31`);
rows.forEach((r, i) => { if (r.length !== COLS) errs.push(`row ${i} len ${r.length}`); });

// mirror symmetry (door '-' mirrors to '-')
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS / 2; c++) {
  const a = rows[r][c], b = rows[r][COLS - 1 - c];
  const wa = a === '#', wb = b === '#';
  if (wa !== wb || (a === '-') !== (b === '-')) errs.push(`asym ${r},${c} '${a}' vs '${b}'`);
}

const open = (c, r) => {
  if (r < 0 || r >= ROWS) return false;
  if (c < 0 || c >= COLS) return TUNNELS.includes(r);
  const ch = rows[r][c];
  return ch !== '#' && ch !== '-';
};
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
console.log(`dots=${dots} energizers=${energ} openTiles=${total}`);
if (energ !== 4) errs.push(`energizers=${energ}`);

if (errs.length) { console.log('ERRORS:'); errs.forEach(e => console.log(' -', e)); process.exit(1); }
console.log('MAZE-OK');
