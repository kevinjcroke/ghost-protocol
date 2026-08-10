/* ==========================================================================
   GHOST PROTOCOL
   A reverse-arcade hunt: you command the ghosts, the AI runs for its life.
   Vanilla JS + Canvas 2D. No build step, no external assets.
   Movement model and speed ratios studied from bward2/pacman-js (MIT).
   All art, maze layout, audio, and code here are original.
   ========================================================================== */
'use strict';

/* ----------------------------- constants ------------------------------- */

const TILE = 8;                 // hardware tile size, px
const COLS = 28;                // playfield tiles across
const MAZE_ROWS = 31;           // playfield tiles down
const HUD_TOP = 3;              // HUD rows above maze
const HUD_BOT = 2;              // HUD rows below maze
const ROWS = MAZE_ROWS + HUD_TOP + HUD_BOT;      // 36
const NATIVE_W = COLS * TILE;   // 224
const NATIVE_H = ROWS * TILE;   // 288
const TICK_HZ = 60;
const TICK_MS = 1000 / TICK_HZ;

const DIRS = {
  up:    { x: 0, y: -1 },
  down:  { x: 0, y: 1 },
  left:  { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};
const DIR_NAMES = ['up', 'down', 'left', 'right'];
const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };

/* Fixed palette. Everything drawn must come from this table. */
/* Every channel is snapped to the eight rungs a period resistor ladder could
   drive -- 00 21 47 51 97 C8 F0 FF -- so no value here is off a modern color
   picker. Nothing on screen may use a color outside this table; test/
   palette-lock.js enforces that. */
const PAL = {
  black:   '#000000',
  wall:    '#2121F0',
  door:    '#FF97C8',
  dot:     '#F0C897',
  white:   '#FFFFFF',
  yellow:  '#FFF021',
  red:     '#FF2100',
  magenta: '#FF51FF',
  cyan:    '#21FFFF',
  orange:  '#FF9700',
  fright:  '#2121C8',
  eyeWhite:'#FFFFFF',
  pupil:   '#2121F0',
  peach:   '#F0C897',
  green:   '#21FF51',
  grid:    '#002151',
  /* second hardware palette bank, used when time is frozen. A real board
     swapped palette entries; it could not alpha-blend a framebuffer. */
  wallDim: '#002197',
  dotDim:  '#C89751',   // one ladder step down per channel: dims without hue shift
  doorDim: '#975147',
};
PAL.frightW = PAL.white;   // the flash is plain white, not a second near-white

const HUNTER_DEFS = [
  { key: 'raze',  color: PAL.red,     name: 'RAZE',  nick: 'HAMMER'  },
  { key: 'mist',  color: PAL.magenta, name: 'MIST',  nick: 'SHADOW'  },
  { key: 'volt',  color: PAL.cyan,    name: 'VOLT',  nick: 'STATIC'  },
  { key: 'ember', color: PAL.orange,  name: 'EMBER', nick: 'CINDER'  },
];

/* ------------------------------- maze ----------------------------------
   Original layout. 28x31. Mirror-symmetric.
   '#' wall  '.' dot  'o' energizer  ' ' open (no dot)  '-' den door
   Row 11 and row 20 are wrap tunnels.
------------------------------------------------------------------------- */

/* The den sits astride the one wrapping row, which matters more than it
   looks: a tunnel row open across the full width would let an unordered
   hunter circle the board forever without ever meeting a wall, and the rule
   that an unordered hunter eventually stops dead is the whole game. Every
   straight run in here terminates in a wall. */
const MAZE_SRC = [
  '############################',
  '#............##............#',
  '#.####.#####.##.#####.####.#',
  '#o####.#####.##.#####.####o#',
  '#.####.#####.##.#####.####.#',
  '#..........................#',
  '#.####.##############.####.#',
  '#.####.##############.####.#',
  '#.####................####.#',
  '#.####.#####.##.#####.####.#',
  '#.####.#####.##.#####.####.#',
  '#......#####....#####......#',
  '#.####.######--######.####.#',
  '#.####.####      ####.####.#',
  ' ......####      ####...... ',
  '#.####.####      ####.####.#',
  '#.####.##############.####.#',
  '#..........................#',
  '#.####.#####.##.#####.####.#',
  '#.####.#####.##.#####.####.#',
  '#............##............#',
  '#.####.##############.####.#',
  '#.####.##############.####.#',
  '#..........................#',
  '#.####.#####.##.#####.####.#',
  '#.####.#####.##.#####.####.#',
  '#.####................####.#',
  '#o####.#####.##.#####.####o#',
  '#.####.#####.##.#####.####.#',
  '#............##............#',
  '############################',
];

const TUNNEL_ROWS = [14];
const DEN = { top: 12, bottom: 16, left: 10, right: 17,  // wall bounds
              inTop: 13, inBottom: 15, inLeft: 11, inRight: 16 };
const DOOR_ROW = 12, DOOR_C0 = 13, DOOR_C1 = 14;
const DEN_EXIT_X = 112;         // px, seam between cols 13/14
const DEN_EXIT_ROW = 11;        // tunnel row above the door
const FRUIT_TILE = { c: 13, r: 17 };  // fruit renders centered on seam
const EVADER_SPAWN = { c: 13, r: 23 };

/* walls[r][c] true if solid for normal movement (door counts as wall) */
let walls = [];
let dots = [];        // current dots: 0 none, 1 dot, 2 energizer
let dotTotal = 0;
function buildMaze() {
  walls = []; dots = []; dotTotal = 0;
  for (let r = 0; r < MAZE_ROWS; r++) {
    const wrow = [], drow = [];
    for (let c = 0; c < COLS; c++) {
      const ch = MAZE_SRC[r][c];
      wrow.push(ch === '#' || ch === '-');
      let d = 0;
      if (ch === '.') d = 1;
      else if (ch === 'o') d = 2;
      if (d) dotTotal++;
      drow.push(d);
    }
    walls.push(wrow); dots.push(drow);
  }
}

function inBounds(c, r) { return r >= 0 && r < MAZE_ROWS && c >= 0 && c < COLS; }
function isOpen(c, r) {
  if (r < 0 || r >= MAZE_ROWS) return false;
  if (c < 0 || c >= COLS) return TUNNEL_ROWS.includes(r);  // wrap zone
  return !walls[r][c];
}
function wrapCol(c) { return ((c % COLS) + COLS) % COLS; }
function isDoor(c, r) { return r === DOOR_ROW && (c === DOOR_C0 || c === DOOR_C1); }
function inDen(c, r) {
  return c >= DEN.inLeft && c <= DEN.inRight && r >= DEN.inTop && r <= DEN.inBottom;
}
/* tile center in playfield px */
function tcx(c) { return c * TILE + TILE / 2; }
function tcy(r) { return r * TILE + TILE / 2; }

/* --------------------------- bitmap font --------------------------------
   Original 7x7 blocky arcade-style face, 8x8 cell.
------------------------------------------------------------------------- */

const FONT_SRC = {
  A: ['  ###  ',' ## ## ','##   ##','##   ##','#######','##   ##','##   ##'],
  B: ['###### ','##   ##','##   ##','###### ','##   ##','##   ##','###### '],
  C: [' ##### ','##   ##','##     ','##     ','##     ','##   ##',' ##### '],
  D: ['###### ','##   ##','##   ##','##   ##','##   ##','##   ##','###### '],
  E: ['#######','##     ','##     ','#####  ','##     ','##     ','#######'],
  F: ['#######','##     ','##     ','#####  ','##     ','##     ','##     '],
  G: [' ##### ','##   ##','##     ','##  ###','##   ##','##   ##',' ##### '],
  H: ['##   ##','##   ##','##   ##','#######','##   ##','##   ##','##   ##'],
  I: ['###### ','  ##   ','  ##   ','  ##   ','  ##   ','  ##   ','###### '],
  J: ['   ####','    ## ','    ## ','    ## ','    ## ','##  ## ',' ####  '],
  K: ['##   ##','##  ## ','## ##  ','####   ','## ##  ','##  ## ','##   ##'],
  L: ['##     ','##     ','##     ','##     ','##     ','##     ','#######'],
  M: ['##   ##','### ###','#######','## # ##','##   ##','##   ##','##   ##'],
  N: ['##   ##','###  ##','#### ##','## ####','##  ###','##   ##','##   ##'],
  O: [' ##### ','##   ##','##   ##','##   ##','##   ##','##   ##',' ##### '],
  P: ['###### ','##   ##','##   ##','###### ','##     ','##     ','##     '],
  Q: [' ##### ','##   ##','##   ##','##   ##','## # ##','##  ## ',' ### ##'],
  R: ['###### ','##   ##','##   ##','###### ','## ##  ','##  ## ','##   ##'],
  S: [' ######','##     ','##     ',' ##### ','     ##','     ##','###### '],
  T: ['#######','  ##   ','  ##   ','  ##   ','  ##   ','  ##   ','  ##   '],
  U: ['##   ##','##   ##','##   ##','##   ##','##   ##','##   ##',' ##### '],
  V: ['##   ##','##   ##','##   ##','##   ##',' ## ## ',' ## ## ','  ###  '],
  W: ['##   ##','##   ##','##   ##','## # ##','#######','### ###','##   ##'],
  X: ['##   ##',' ## ## ','  ###  ','  ###  ','  ###  ',' ## ## ','##   ##'],
  Y: ['##   ##','##   ##',' ## ## ','  ###  ','  ##   ','  ##   ','  ##   '],
  Z: ['#######','     ##','    ## ','   ##  ','  ##   ',' ##    ','#######'],
  '0': [' ##### ','##   ##','##   ##','##   ##','##   ##','##   ##',' ##### '],
  '1': ['  ##   ',' ###   ','  ##   ','  ##   ','  ##   ','  ##   ','###### '],
  '2': [' ##### ','##   ##','     ##','   ### ','  ##   ',' ##    ','#######'],
  '3': [' ##### ','##   ##','     ##','  #### ','     ##','##   ##',' ##### '],
  '4': ['   ### ','  #### ',' ## ## ','##  ## ','#######','    ## ','    ## '],
  '5': ['#######','##     ','###### ','     ##','     ##','##   ##',' ##### '],
  '6': [' ##### ','##     ','##     ','###### ','##   ##','##   ##',' ##### '],
  '7': ['#######','     ##','    ## ','   ##  ','  ##   ','  ##   ','  ##   '],
  '8': [' ##### ','##   ##','##   ##',' ##### ','##   ##','##   ##',' ##### '],
  '9': [' ##### ','##   ##','##   ##',' ######','     ##','     ##',' ##### '],
  '!': ['  ##   ','  ##   ','  ##   ','  ##   ','  ##   ','       ','  ##   '],
  '.': ['       ','       ','       ','       ','       ','  ##   ','  ##   '],
  ',': ['       ','       ','       ','       ','  ##   ','  ##   ',' ##    '],
  '-': ['       ','       ','       ',' ##### ','       ','       ','       '],
  ':': ['       ','  ##   ','  ##   ','       ','  ##   ','  ##   ','       '],
  '/': ['     ##','    ## ','   ##  ','  ##   ',' ##    ','##     ','       '],
  '"': [' ## ## ',' ## ## ','       ','       ','       ','       ','       '],
  "'": ['  ##   ','  ##   ','       ','       ','       ','       ','       '],
  '>': [' ##    ','  ##   ','   ##  ','    ## ','   ##  ','  ##   ',' ##    '],
  '@': [' ##### ','##   ##','## ####','## # ##','## ####','##     ',' ##### '],
  'c': ['  ###  ',' #   # ','# ### #','# #   #','# ### #',' #   # ','  ###  '],  // (c)
  '*': ['       ','## # ##',' ##### ','#######',' ##### ','## # ##','       '],
  '?': [' ##### ','##   ##','    ## ','   ##  ','  ##   ','       ','  ##   '],
  ' ': ['       ','       ','       ','       ','       ','       ','       '],
};

/* pre-rendered glyph canvases per color */
const glyphCache = new Map();
function glyph(ch, color) {
  const key = ch + '|' + color;
  let g = glyphCache.get(key);
  if (g) return g;
  const src = FONT_SRC[ch] || FONT_SRC['?'];
  g = document.createElement('canvas');
  g.width = 8; g.height = 8;
  const c = g.getContext('2d');
  c.fillStyle = color;
  for (let y = 0; y < 7; y++) {
    for (let x = 0; x < 7; x++) {
      if (src[y][x] === '#') c.fillRect(x, y, 1, 1);
    }
  }
  glyphCache.set(key, g);
  return g;
}
function drawText(ctx, text, x, y, color) {
  for (let i = 0; i < text.length; i++) {
    ctx.drawImage(glyph(text[i], color), x + i * 8, y);
  }
}
function drawTextCentered(ctx, text, cx, y, color) {
  drawText(ctx, text, Math.round(cx - text.length * 4), y, color);
}

/* --------------------------- maze rendering -----------------------------
   Neon-outline walls, arcade style: 1px strokes along wall/path
   boundaries, corners knocked out for a rounded look.
------------------------------------------------------------------------- */

let mazeLayer = null;   // pre-rendered maze walls (no dots)
function solidAt(c, r) {
  // For outline purposes: outside the maze counts as solid except tunnels
  if (r < 0 || r >= MAZE_ROWS) return true;
  if (c < 0 || c >= COLS) return !TUNNEL_ROWS.includes(r);
  return walls[r][c] && !isDoor(c, r);
}

/* Distance from each wall pixel to the nearest walkable pixel. The wall art
   is the level sets of this field: a line at distance 1 and another at 3,
   which is what a double-line rounded maze tile set looks like once drawn. */
let wallDist = null;
function buildWallDistance() {
  const H = MAZE_ROWS * TILE;
  const R = 5;
  wallDist = new Float32Array(NATIVE_W * H);
  const openPx = (x, y) => {
    if (y < 0 || y >= H) return false;
    const r = Math.floor(y / TILE);
    if (x < 0 || x >= NATIVE_W) return TUNNEL_ROWS.includes(r);
    return !solidAt(Math.floor(x / TILE), r);
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < NATIVE_W; x++) {
      if (openPx(x, y)) { wallDist[y * NATIVE_W + x] = 0; continue; }
      let best = 99;
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          if (!openPx(x + dx, y + dy)) continue;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < best) best = d;
        }
      }
      wallDist[y * NATIVE_W + x] = best;
    }
  }
}

function renderMazeLayer(color, doorColor) {
  const H = MAZE_ROWS * TILE;
  const cv = makeCanvas(NATIVE_W, H);
  const g = cv.getContext('2d');
  const openPx = (x, y) => {
    if (y < 0 || y >= H) return false;
    const r = Math.floor(y / TILE);
    if (x < 0 || x >= NATIVE_W) return TUNNEL_ROWS.includes(r);
    return !solidAt(Math.floor(x / TILE), r);
  };
  // Lay both strokes down as a mask first.
  const on = new Uint8Array(NATIVE_W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < NATIVE_W; x++) {
      const d = wallDist[y * NATIVE_W + x];
      if (d === 0) continue;
      if (d < 1.5 || (d >= 2.5 && d < 3.5)) on[y * NATIVE_W + x] = 1;
    }
  }
  /* Then round every convex corner of the mask the same way, so the inner and
     outer strokes stay concentric. Chamfering only the outer one is the tell
     that these are stroked rectangles rather than a corner tile. */
  const at = (x, y) => (x < 0 || x >= NATIVE_W || y < 0 || y >= H)
    ? 0 : on[y * NATIVE_W + x];
  const tips = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < NATIVE_W; x++) {
      if (!at(x, y)) continue;
      const u = at(x, y - 1), d2 = at(x, y + 1), l = at(x - 1, y), r = at(x + 1, y);
      // exactly one horizontal and one vertical neighbour: an outside corner
      if (u + d2 === 1 && l + r === 1) {
        const dx = r ? 1 : -1, dy = d2 ? 1 : -1;
        if (!at(x - dx, y - dy)) tips.push(y * NATIVE_W + x);
      }
    }
  }
  tips.forEach(i => { on[i] = 0; });

  g.fillStyle = color;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < NATIVE_W; x++) {
      if (on[y * NATIVE_W + x]) g.fillRect(x, y, 1, 1);
    }
  }
  // den door: a bright barred gate across the two door tiles
  g.fillStyle = doorColor;
  g.fillRect(DOOR_C0 * TILE, DOOR_ROW * TILE + 3, TILE * 2, 2);
  return cv;
}

/* ------------------------------ sprites ---------------------------------
   All pixel art original. Grids use:
   '#' body   'V' visor slot   '.' empty   plus per-sprite accent chars.
------------------------------------------------------------------------- */

/* Hunter: a "specter" — peaked crown, wide scanning visor, flame skirt.
   14x14, two skirt frames. */
const HUNTER_BODY = [
  [ // frame A — hem wave to the left
    '.....####.....',
    '...########...',
    '..##########..',
    '.############.',
    '##############',
    '##############',
    '##############',
    '##############',
    '##############',
    '##############',
    '##############',
    '#..###..###..#',
    '#...##...##...',
    '#...##...##...',
  ],
  [ // frame B — the same wave shifted two pixels right
    '.....####.....',
    '...########...',
    '..##########..',
    '.############.',
    '##############',
    '##############',
    '##############',
    '##############',
    '##############',
    '##############',
    '##############',
    '###..###..###.',
    '.##...##...##.',
    '.##...##...##.',
  ],
];
/* Eye whites: two 4x4 blocks. Pupils are 2x2 and shove toward the heading. */
const EYE_W = 4, EYE_H = 4, EYE_Y = 5;
const EYE_X = [2, 8];
const PUPIL_OFF = {
  left:  { x: 0, y: 1 },
  right: { x: 2, y: 1 },
  up:    { x: 1, y: 0 },
  down:  { x: 1, y: 2 },
};
/* Frightened face: dot eyes + jagged mouth, drawn in peach on the blue body */
const FRIGHT_FACE = [
  { x: 3, y: 5, w: 2, h: 2 }, { x: 9, y: 5, w: 2, h: 2 },  // eyes
];
/* Period 4, not 2: a one-pixel zigzag aliases into a dim uniform band on a
   CRT and shimmers as the sprite moves. */
const FRIGHT_MOUTH_Y = 9;
const FRIGHT_MOUTH = [1, 5, 9];

function makeCanvas(w, h) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  return cv;
}

function renderHunterFrame(color, frame, dir, mode) {
  // mode: 'normal' | 'fright' | 'frightFlash' | 'eyes'
  const cv = makeCanvas(16, 16);
  const g = cv.getContext('2d');
  const ox = 1, oy = 1;
  const p = PUPIL_OFF[dir] || PUPIL_OFF.left;
  if (mode === 'eyes') {
    // eyes only, floating home
    g.fillStyle = PAL.eyeWhite;
    EYE_X.forEach(ex => g.fillRect(ox + ex, oy + EYE_Y, EYE_W, EYE_H));
    g.fillStyle = PAL.pupil;
    EYE_X.forEach(ex => g.fillRect(ox + ex + p.x, oy + EYE_Y + p.y, 2, 2));
    return cv;
  }
  const body = (mode === 'fright') ? PAL.fright
             : (mode === 'frightFlash') ? PAL.frightW : color;
  const grid = HUNTER_BODY[frame];
  g.fillStyle = body;
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (grid[y][x] === '#') g.fillRect(ox + x, oy + y, 1, 1);
    }
  }
  if (mode === 'fright' || mode === 'frightFlash') {
    /* Outline the frightened body. Its blue sits close to the maze blue by
       design -- the era relied on the same trick -- but without an outline
       the skirt welds itself to the wall stroke underneath and the
       silhouette dissolves exactly when the player needs to track four of
       them at once. */
    if (mode === 'fright') {
      g.fillStyle = PAL.peach;
      for (let y = 0; y < grid.length; y++) {
        for (let x = 0; x < grid[y].length; x++) {
          if (grid[y][x] === '#') continue;
          const near = (yy, xx) => grid[yy] && grid[yy][xx] === '#';
          if (near(y - 1, x) || near(y + 1, x) || near(y, x - 1) || near(y, x + 1)) {
            g.fillRect(ox + x, oy + y, 1, 1);
          }
        }
      }
    }
    g.fillStyle = (mode === 'fright') ? PAL.peach : PAL.red;
    FRIGHT_FACE.forEach(e => g.fillRect(ox + e.x, oy + e.y, e.w, e.h));
    FRIGHT_MOUTH.forEach(mx => {
      g.fillRect(ox + mx, oy + FRIGHT_MOUTH_Y + 1, 2, 1);
      g.fillRect(ox + mx + 2, oy + FRIGHT_MOUTH_Y, 2, 1);
    });
  } else {
    g.fillStyle = PAL.eyeWhite;
    EYE_X.forEach(ex => g.fillRect(ox + ex, oy + EYE_Y, EYE_W, EYE_H));
    g.fillStyle = PAL.pupil;
    EYE_X.forEach(ex => g.fillRect(ox + ex + p.x, oy + EYE_Y + p.y, 2, 2));
  }
  return cv;
}

/* Evader: "GOB" — a jag-mouthed yellow glutton. 13-wide, faces right.
   Three mouth frames: closed / half / open, with visible teeth. */
/* 14x14 to match the hunters exactly: the two species have to share a size
   and a centerline or they cannot both sit on one corridor. */
const GOB_FRAMES = [
  [ // closed: full disc, mouth a thin seam
    '....######....',
    '..##########..',
    '.############.',
    '.#####EE#####.',
    '##############',
    '##############',
    '##############',
    '#######.......',
    '##############',
    '##############',
    '.############.',
    '.############.',
    '..##########..',
    '....######....',
  ],
  [ // half open: about 45 degrees
    '....######....',
    '..##########..',
    '.############.',
    '.#####EE#####.',
    '##############',
    '############..',
    '##########....',
    '#######.......',
    '##########....',
    '############..',
    '.############.',
    '.############.',
    '..##########..',
    '....######....',
  ],
  [ // wide open: a true 90 degree gape
    '....######....',
    '..##########..',
    '.############.',
    '.#####EE#####.',
    '##########....',
    '#########.....',
    '########......',
    '#######.......',
    '########......',
    '#########.....',
    '##########....',
    '.############.',
    '..##########..',
    '....######....',
  ],
];

function renderGobFrame(frame, dir) {
  const cv = makeCanvas(16, 16);
  const g = cv.getContext('2d');
  g.save();
  g.translate(8, 8);
  if (dir === 'left') g.scale(-1, 1);
  else if (dir === 'up') g.rotate(-Math.PI / 2);
  else if (dir === 'down') g.rotate(Math.PI / 2);
  g.translate(-8, -8);
  const grid = GOB_FRAMES[frame];
  const ox = 1, oy = 1;   // same 14x14 footprint and center as a hunter
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      const ch = grid[y][x];
      if (ch === '#') { g.fillStyle = PAL.yellow; g.fillRect(ox + x, oy + y, 1, 1); }
      else if (ch === 'E') { g.fillStyle = PAL.black; g.fillRect(ox + x, oy + y, 1, 1); }
    }
  }
  g.restore();
  return cv;
}

/* Original fruit/bonus set (level markers): cherry, berry, citrus, gem, star */
const FRUIT_ART = [
  { key: 'cherry', grid: [
    '......gg....',
    '.....gg.....',
    '....gg......',
    '...g.g......',
    '..rrr.rrr...',
    '.rrrrr.rrrr.',
    '.rrWrr.rrWr.',
    '.rrrrr.rrrr.',
    '..rrr...rr..',
  ]},
  { key: 'berry', grid: [
    '....ggg.....',
    '..mmmmmmm...',
    '.mmWmmmWmm..',
    '.mmmmWmmmm..',
    '.mWmmmmmWm..',
    '..mmmWmmm...',
    '...mmmmm....',
    '....mmm.....',
    '.....m......',
  ]},
  { key: 'citrus', grid: [
    '.....gg.....',
    '....g.......',
    '..oooooo....',
    '.oooooooo...',
    '.oooooooo...',
    '.oWooooooo..',
    '.oooooooo...',
    '..oooooo....',
    '............',
  ]},
  { key: 'gem', grid: [
    '............',
    '...cccccc...',
    '..cWcccccc..',
    '.cccccccccc.',
    '..cccccccc..',
    '...cccccc...',
    '....cccc....',
    '.....cc.....',
    '............',
  ]},
  { key: 'star', grid: [
    '.....yy.....',
    '.....yy.....',
    '..yyyyyyyy..',
    '...yyyyyy...',
    '....yyyy....',
    '...yy..yy...',
    '..yy....yy..',
    '............',
    '............',
  ]},
];
const FRUIT_COLORS = { r: PAL.red, g: PAL.green, m: PAL.magenta, o: PAL.orange, c: PAL.cyan, y: PAL.yellow, W: PAL.white };
const FRUIT_POINTS = [100, 300, 500, 700, 1000];

function renderFruit(idx) {
  const cv = makeCanvas(16, 16);
  const g = cv.getContext('2d');
  const grid = FRUIT_ART[idx % FRUIT_ART.length].grid;
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      const ch = grid[y][x];
      if (ch !== '.') { g.fillStyle = FRUIT_COLORS[ch] || PAL.white; g.fillRect(x + 2, y + 3, 1, 1); }
    }
  }
  return cv;
}

/* Hunter dissolve frames (lost to an energized evader): deterministic decay */
function renderHunterDissolve(color, step, steps) {
  const cv = makeCanvas(16, 16);
  const g = cv.getContext('2d');
  const grid = HUNTER_BODY[0];
  const keep = 1 - step / steps;
  let seed = 1234 + step * 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  g.fillStyle = color;
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (grid[y][x] !== '.' && rnd() < keep) {
        g.fillRect(1 + x, 1 + y - step, 1, 1);  // drift upward as it dissolves
      }
    }
  }
  return cv;
}

/* Purpose-drawn 8x8 HUD icons. Downscaling the 16x16 sprites would throw
   away every other pixel and mangle the faces. */
const MINI_HUNTER = [
  '..####..',
  '.######.',
  '########',
  '#WW##WW#',
  '#WW##WW#',
  '########',
  '########',
  '#.##.##.',
];
const MINI_GOB = [
  '..####..',
  '.######.',
  '#####...',
  '####....',
  '#####...',
  '.######.',
  '..####..',
  '........',
];
function renderMini(grid, colors) {
  const cv = makeCanvas(8, 8);
  const g = cv.getContext('2d');
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      const c = colors[grid[y][x]];
      if (c) { g.fillStyle = c; g.fillRect(x, y, 1, 1); }
    }
  }
  return cv;
}

/* Sprite bank, built once at boot */
const SPRITES = { hunters: {}, gob: {}, fruit: [], dissolve: {}, minis: {} };
function buildSprites() {
  HUNTER_DEFS.forEach(h => {
    const bank = { normal: {}, fright: [], frightFlash: [], eyes: {} };
    DIR_NAMES.forEach(d => {
      bank.normal[d] = [renderHunterFrame(h.color, 0, d, 'normal'),
                        renderHunterFrame(h.color, 1, d, 'normal')];
      bank.eyes[d] = renderHunterFrame(h.color, 0, d, 'eyes');
    });
    bank.fright = [renderHunterFrame(h.color, 0, 'left', 'fright'),
                   renderHunterFrame(h.color, 1, 'left', 'fright')];
    bank.frightFlash = [renderHunterFrame(h.color, 0, 'left', 'frightFlash'),
                        renderHunterFrame(h.color, 1, 'left', 'frightFlash')];
    SPRITES.hunters[h.key] = bank;
    const steps = 6, dis = [];
    for (let s = 0; s < steps; s++) dis.push(renderHunterDissolve(h.color, s, steps));
    SPRITES.dissolve[h.key] = dis;
    SPRITES.minis[h.key] = renderMini(MINI_HUNTER, { '#': h.color, W: PAL.white });
  });
  DIR_NAMES.forEach(d => {
    SPRITES.gob[d] = [0, 1, 2].map(f => renderGobFrame(f, d));
  });
  for (let i = 0; i < FRUIT_ART.length; i++) SPRITES.fruit.push(renderFruit(i));
  SPRITES.minis.gob = renderMini(MINI_GOB, { '#': PAL.yellow });
}

/* ------------------------------- audio ----------------------------------
   All-synthesized original sounds. Nothing sampled.
------------------------------------------------------------------------- */

const Sound = {
  ctx: null, master: null, muted: false,
  siren: null, sirenGain: null, sirenNext: 0, sirenLevel: 0, sirenOn: false,
  chompFlip: false,

  ensure() {
    if (this.ctx) return true;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.45;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 8000;   // cabinet speaker
      this.master.connect(lp); lp.connect(this.ctx.destination);
      return true;
    } catch (e) { return false; }
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },

  blip(freq0, freq1, dur, type, vol, when) {
    if (!this.ctx || this.muted) return;
    const t = (when || this.ctx.currentTime);
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq0, t);
    if (freq1 !== freq0) o.frequency.exponentialRampToValueAtTime(Math.max(freq1, 1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },

  noiseBurst(dur, vol, when) {
    if (!this.ctx || this.muted) return;
    const t = when || this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(g); g.connect(this.master);
    src.start(t);
  },

  /* rising four-stage siren: the board's threat clock */
  startSiren() {
    if (!this.ctx || this.sirenOn) return;
    this.siren = this.ctx.createOscillator();
    this.sirenGain = this.ctx.createGain();
    this.siren.type = 'square';
    this.sirenGain.gain.value = this.muted ? 0 : 0.035;
    this.siren.connect(this.sirenGain); this.sirenGain.connect(this.master);
    this.siren.start();
    this.sirenNext = this.ctx.currentTime;
    this.sirenOn = true;
  },
  stopSiren() {
    if (this.siren) { try { this.siren.stop(); } catch (e) {} }
    this.siren = null; this.sirenOn = false;
  },
  tickSiren(level) {  // level 0..3
    if (!this.ctx || !this.sirenOn) return;
    this.sirenLevel = level;
    const t = this.ctx.currentTime;
    if (this.sirenNext > t + 0.1) return;
    const base = 300 + level * 110;
    const span = 130 + level * 30;
    const cyc = Math.max(0.42 - level * 0.06, 0.2);
    const s = Math.max(this.sirenNext, t);
    this.siren.frequency.setValueAtTime(base, s);
    this.siren.frequency.linearRampToValueAtTime(base + span, s + cyc / 2);
    this.siren.frequency.linearRampToValueAtTime(base, s + cyc);
    this.sirenNext = s + cyc;
  },
  setSirenAudible(on) {
    if (this.sirenGain) this.sirenGain.gain.value = (on && !this.muted) ? 0.035 : 0;
  },

  chomp() {
    this.chompFlip = !this.chompFlip;
    if (this.chompFlip) this.blip(160, 65, 0.07, 'square', 0.12);
    else this.blip(65, 160, 0.07, 'square', 0.12);
  },
  fruit() { this.blip(500, 900, 0.08, 'square', 0.15); this.blip(900, 1400, 0.09, 'square', 0.14, this.ctx && this.ctx.currentTime + 0.09); },
  energize() { this.blip(90, 400, 0.4, 'sawtooth', 0.14); },
  frightPulse(step) { this.blip(step % 2 ? 210 : 260, step % 2 ? 150 : 200, 0.09, 'sawtooth', 0.05); },
  eyesPulse(step) { this.blip(step % 2 ? 750 : 950, step % 2 ? 950 : 750, 0.06, 'sine', 0.06); },
  hunterLost() {  // our ghost dissolves — the reversed death spiral
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 10; i++) {
      this.blip(820 - i * 70, 700 - i * 65, 0.1, 'square', 0.12, t + i * 0.1);
    }
    this.noiseBurst(0.25, 0.12, t + 1.02);
  },
  capture() {  // we caught him
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    [220, 330, 440, 660, 880].forEach((f, i) => this.blip(f, f * 1.4, 0.1, 'square', 0.14, t + i * 0.07));
    this.noiseBurst(0.35, 0.16, t + 0.4);
    this.blip(1200, 200, 0.5, 'sawtooth', 0.1, t + 0.42);
  },
  uiFreeze() { this.blip(700, 350, 0.06, 'triangle', 0.1); },
  uiThaw() { this.blip(350, 700, 0.06, 'triangle', 0.1); },
  uiCommit() { this.blip(950, 950, 0.03, 'square', 0.08); },
  uiClear() { this.blip(300, 140, 0.08, 'square', 0.07); },

  /* original start-of-round jingle (composed for this game) */
  jingle() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + 0.05;
    const N = { A3: 220, C4: 261.6, D4: 293.7, E4: 329.6, G4: 392, A4: 440, C5: 523.3, E5: 659.3, D5: 587.3, B4: 493.9 };
    const lead = [
      [N.A3, 0.00, 0.14], [N.E4, 0.15, 0.14], [N.A4, 0.30, 0.14], [N.C5, 0.45, 0.20],
      [N.B4, 0.70, 0.12], [N.G4, 0.84, 0.12], [N.E4, 0.98, 0.18],
      [N.A3, 1.25, 0.14], [N.D4, 1.40, 0.14], [N.A4, 1.55, 0.14], [N.D5, 1.70, 0.20],
      [N.C5, 1.95, 0.12], [N.E5, 2.09, 0.26],
      [N.A4, 2.45, 0.12], [N.C5, 2.59, 0.12], [N.E5, 2.73, 0.34],
    ];
    lead.forEach(([f, at, d]) => this.blip(f, f, d, 'square', 0.12, t + at));
    const bass = [
      [N.A3 / 2, 0.0, 0.3], [N.A3 / 2, 0.45, 0.3], [N.D4 / 2, 1.25, 0.3],
      [N.D4 / 2, 1.7, 0.3], [N.A3 / 2, 2.45, 0.55],
    ];
    bass.forEach(([f, at, d]) => this.blip(f, f, d, 'triangle', 0.14, t + at));
  },
  levelClear() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    [330, 415, 494, 659, 831, 988].forEach((f, i) => this.blip(f, f, 0.12, 'square', 0.12, t + i * 0.11));
  },
};

/* ---------------------------- movement core ----------------------------- */

function tileOfPx(x, y) {
  return { c: Math.floor(x / TILE), r: Math.floor(y / TILE) };
}
/* Step an entity `speed` px along `dir`, snapping at tile centers where a
   decision callback may change direction. Returns true if it moved. */
function stepEntity(e, decide) {
  let remaining = e.speed;
  let moved = false;
  let guard = 0;
  while (remaining > 0.0001 && guard++ < 4) {
    if (!e.dir) {
      decide(e, true);       // stopped: give decision a chance to start us
      if (!e.dir) break;
    }
    const d = DIRS[e.dir];
    // distance to the next tile-center line along our axis
    let dist;
    if (d.x !== 0) {
      const cx = Math.floor(e.x / TILE) * TILE + TILE / 2;
      dist = d.x > 0 ? (e.x < cx ? cx - e.x : cx + TILE - e.x)
                     : (e.x > cx ? e.x - cx : e.x - (cx - TILE));
    } else {
      const cy = Math.floor(e.y / TILE) * TILE + TILE / 2;
      dist = d.y > 0 ? (e.y < cy ? cy - e.y : cy + TILE - e.y)
                     : (e.y > cy ? e.y - cy : e.y - (cy - TILE));
    }
    if (dist > remaining) {
      e.x += d.x * remaining; e.y += d.y * remaining;
      remaining = 0; moved = true;
    } else {
      e.x += d.x * dist; e.y += d.y * dist;
      remaining -= dist; moved = moved || dist > 0;
      // snap exactly to center to kill float drift
      e.x = Math.round(e.x * 2) / 2; e.y = Math.round(e.y * 2) / 2;
      // tunnel wrap
      const t = e.tile();
      if (TUNNEL_ROWS.includes(t.r)) {
        if (e.x < -TILE / 2) e.x += NATIVE_W + TILE;
        else if (e.x > NATIVE_W + TILE / 2) e.x -= NATIVE_W + TILE;
      }
      decide(e, false);      // at a center: may turn or stop
      if (!e.dir) break;
      const nd = DIRS[e.dir];
      const nt = e.tile();
      if (!isOpen(nt.c + nd.x, nt.r + nd.y)) { e.dir = null; break; }
    }
  }
  return moved;
}

/* ------------------------------- hunters -------------------------------- */

const EYE_TARGET = { c: 13, r: DEN_EXIT_ROW };

class Hunter {
  constructor(def, slot) {
    this.def = def;
    this.key = def.key;
    this.color = def.color;
    this.slot = slot;           // 0 starts outside, 1..3 in den
    this.reset();
  }
  reset() {
    this.state = this.slot === 0 ? 'active' : 'idle';
    this.dir = this.slot === 0 ? 'left' : null;
    if (this.slot === 0) {
      this.x = DEN_EXIT_X; this.y = tcy(DEN_EXIT_ROW);
      this.script = [{ x: DEN_EXIT_X - 4, y: tcy(DEN_EXIT_ROW) }];
      this.state = 'exiting'; this.exitHeading = 'left';
    } else {
      const xs = [0, 94, 112, 130];
      this.x = xs[this.slot]; this.y = tcy(14);
      this.bob = this.slot * 20;
    }
    this.path = null;           // {tiles:[{c,r}], closed, idx}
    this.speed = 0;
    this.boostT = 0;            // prize overdrive ticks
    this.frame = 0; this.animT = 0;
    this.respawnT = 0;
    this.releaseT = 60 + this.slot * 120;   // den release timing
    this.dissolveT = -1;
  }
  tile() { return tileOfPx(this.x, this.y); }
  isThreat() { return this.state === 'active'; }
  /* A hunter waiting in the den can still be given orders -- it just starts
     walking them when it gets out. Refusing the click reads as a dead
     control, and the player has nothing else to do while it waits. */
  isCommandable() { return this.state !== 'dissolving' && this.state !== 'eyes'; }
  inDenStates() {
    return this.state === 'idle' || this.state === 'respawn'
        || this.state === 'enteringDen' || this.state === 'exitingDen'
        || this.state === 'exiting';
  }

  clearOrder() { this.path = null; }
  setOrder(tiles, closed) {
    this.path = { tiles: tiles.slice(), closed, idx: 0 };
    // if the first tile is where we already are, aim at the next one
    const t = this.tile();
    if (this.path.tiles.length && this.path.tiles[0].c === t.c && this.path.tiles[0].r === t.r) {
      this.path.idx = 1;
      if (this.path.idx >= this.path.tiles.length) this.path = null;
    }
  }

  /* decision at a tile center (or when stopped) */
  decide(e, wasStopped) {
    const t = this.tile();
    if (this.path) {
      let { tiles, idx } = this.path;
      if (idx >= tiles.length) {
        if (this.path.closed) { idx = this.path.idx = 0; }
        else { this.path = null; return; }  // run off the end: keep heading
      }
      let goal = tiles[idx];
      if (goal.c === t.c && goal.r === t.r) {
        this.path.idx++;
        if (this.path.idx >= tiles.length) {
          if (this.path.closed) this.path.idx = 0;
          else { this.path = null; return; }
        }
        goal = tiles[this.path.idx];
      }
      // pick the direction toward the goal tile (always adjacent by construction)
      let dc = goal.c - t.c, dr = goal.r - t.r;
      // tunnel wrap shortcuts
      if (dc > COLS / 2) dc -= COLS;
      if (dc < -COLS / 2) dc += COLS;
      if (Math.abs(dc) + Math.abs(dr) !== 1) {
        // desynced (should not happen): drop the order, wall rule applies
        this.path = null; return;
      }
      this.dir = dc === 1 ? 'right' : dc === -1 ? 'left' : dr === 1 ? 'down' : 'up';
      return;
    }
    // no order: continue straight until a wall stops us (the cruelty rule)
    if (this.dir) {
      const d = DIRS[this.dir];
      if (!isOpen(t.c + d.x, t.r + d.y)) this.dir = null;
    }
  }

  update(game) {
    this.animT++;
    if (this.animT % 8 === 0) this.frame ^= 1;

    if (this.state === 'idle') {
      this.bob++;
      this.y = tcy(14) + Math.round(Math.sin(this.bob / 12) * 2);
      if (this.releaseT > 0) this.releaseT--;
      else this.beginExit();
      return;
    }
    if (this.state === 'exitingDen') {
      // slide to seam, rise through the door
      const spd = 0.6;
      if (Math.abs(this.x - DEN_EXIT_X) > spd) {
        this.x += Math.sign(DEN_EXIT_X - this.x) * spd;
        this.dir = this.x < DEN_EXIT_X ? 'right' : 'left';
      } else {
        this.x = DEN_EXIT_X;
        this.dir = 'up';
        this.y -= spd;
        if (this.y <= tcy(DEN_EXIT_ROW)) {
          this.y = tcy(DEN_EXIT_ROW);
          this.state = 'exiting';
          this.exitHeading = (game.releaseFlip = !game.releaseFlip) ? 'left' : 'right';
        }
      }
      return;
    }
    if (this.state === 'exiting') {
      /* Slide off the door seam onto the grid. With an order queued, land
         exactly on the trail's anchor tile so the order survives the trip
         out -- landing a tile away silently voided it. With no order, drift
         to the side chute and head up it, so a respawned ghost visibly
         rejoins the field instead of wall-stopping one tile from the door
         and looking like it never left the box at all. */
      const hasOrder = !!this.path;
      const targetC = hasOrder ? DOOR_C0 : (this.exitHeading === 'left' ? 12 : 15);
      const targetX = tcx(targetC);
      const spd = 0.6;
      this.dir = this.x < targetX ? 'right' : 'left';
      if (Math.abs(this.x - targetX) > spd) this.x += Math.sign(targetX - this.x) * spd;
      else {
        this.x = targetX;
        this.state = 'active';
        this.dir = hasOrder ? null : 'up';   // null: the order decides
      }
      return;
    }
    if (this.state === 'eyes') {
      this.speed = game.params.eyeSpeed;
      const t = this.tile();
      if (t.c === EYE_TARGET.c && t.r === EYE_TARGET.r
          && Math.abs(this.x - tcx(EYE_TARGET.c)) < 1 && Math.abs(this.y - tcy(EYE_TARGET.r)) < 1) {
        this.state = 'enteringDen';
        this.dir = null;
        return;
      }
      stepEntity(this, () => {
        const tt = this.tile();
        const route = bfsRoute(tt, EYE_TARGET);
        if (route && route.length > 1) {
          const n = route[1];
          let dc = n.c - tt.c, dr = n.r - tt.r;
          if (dc > COLS / 2) dc -= COLS; if (dc < -COLS / 2) dc += COLS;
          this.dir = dc === 1 ? 'right' : dc === -1 ? 'left' : dr === 1 ? 'down' : 'up';
        } else this.dir = null;
      });
      if (this.animT % 14 === 0) Sound.eyesPulse(this.animT / 14 | 0);
      return;
    }
    if (this.state === 'enteringDen') {
      const spd = 1.0;
      if (Math.abs(this.x - DEN_EXIT_X) > spd) { this.x += Math.sign(DEN_EXIT_X - this.x) * spd; this.dir = this.x < DEN_EXIT_X ? 'right' : 'left'; }
      else if (this.y < tcy(14)) { this.x = DEN_EXIT_X; this.y += spd; this.dir = 'down'; }
      else {
        this.y = tcy(14);
        this.state = 'respawn';
        this.respawnT = game.params.respawnTicks;
        this.bob = 0;
      }
      return;
    }
    if (this.state === 'respawn') {
      this.bob++;
      this.y = tcy(14) + Math.round(Math.sin(this.bob / 12) * 2);
      if (--this.respawnT <= 0) this.beginExit();
      return;
    }
    if (this.state !== 'active') return;

    // active
    if (this.boostT > 0) this.boostT--;
    const fright = game.frightT > 0;
    const t = this.tile();
    const inTunnel = TUNNEL_ROWS.includes(t.r) && (t.c <= 6 || t.c >= 21);
    this.speed = fright ? game.params.hunterFrightSpeed
               : inTunnel ? game.params.hunterTunnelSpeed
               : game.params.hunterSpeed;
    if (this.boostT > 0 && !fright) this.speed *= 1.22;   // prize overdrive
    stepEntity(this, (e, ws) => this.decide(e, ws));
  }

  beginExit() {
    this.state = 'exitingDen';
    this.dir = 'up';
    // any order queued while it waited survives the trip out
  }

  /* struck while frightened */
  dissolve() {
    this.state = 'dissolving';
    this.dissolveT = 0;
    this.path = null;
  }

  draw(g, game) {
    const x = Math.round(this.x - 8), y = Math.round(this.y - 8) + HUD_TOP * TILE;
    const bank = SPRITES.hunters[this.key];
    if (this.state === 'dissolving') {
      const f = Math.min(5, this.dissolveT / 6 | 0);
      g.drawImage(SPRITES.dissolve[this.key][f], x, y);
      return;
    }
    if (this.state === 'eyes' || this.state === 'enteringDen') {
      g.drawImage(bank.eyes[this.dir || 'left'], x, y);
      return;
    }
    const fright = game.frightT > 0 && this.state !== 'idle' && this.state !== 'respawn'
                   && this.state !== 'exitingDen' && this.state !== 'exiting';
    if (fright) {
      const flashing = game.frightT < 120 && ((game.frightT / 12 | 0) % 2 === 0);
      const arr = flashing ? bank.frightFlash : bank.fright;
      g.drawImage(arr[this.frame], x, y);
    } else {
      g.drawImage(bank.normal[this.dir || 'left'][this.frame], x, y);
    }
  }
}

/* ------------------------------ BFS helpers ----------------------------- */

function neighborsOf(c, r) {
  const out = [];
  for (const dn of DIR_NAMES) {
    const d = DIRS[dn];
    let nc = c + d.x, nr = r + d.y;
    if (TUNNEL_ROWS.includes(r)) nc = wrapCol(nc);
    if (isOpen(nc, nr) && !(nc >= 0 && nc < COLS && inDen(nc, nr))) out.push({ c: nc, r: nr, dir: dn });
  }
  return out;
}
/* distance grid from a start tile (through corridors, den excluded) */
function bfsDistFrom(start) {
  const dist = new Int16Array(COLS * MAZE_ROWS).fill(-1);
  const q = [start];
  dist[start.r * COLS + start.c] = 0;
  let head = 0;
  while (head < q.length) {
    const cur = q[head++];
    const d0 = dist[cur.r * COLS + cur.c];
    for (const n of neighborsOf(cur.c, cur.r)) {
      if (n.c < 0 || n.c >= COLS) continue;
      const i = n.r * COLS + n.c;
      if (dist[i] === -1) { dist[i] = d0 + 1; q.push(n); }
    }
  }
  return dist;
}
/* shortest route between two tiles; returns array of tiles or null */
function bfsRoute(from, to, maxDepth) {
  if (from.c === to.c && from.r === to.r) return [from];
  const prev = new Map();
  const key = (c, r) => r * COLS + c;
  const q = [{ c: wrapCol(from.c), r: from.r, d: 0 }];
  const seen = new Set([key(wrapCol(from.c), from.r)]);
  let head = 0;
  while (head < q.length) {
    const cur = q[head++];
    if (maxDepth && cur.d >= maxDepth) continue;
    for (const n of neighborsOf(cur.c, cur.r)) {
      const nc = wrapCol(n.c);
      const k = key(nc, n.r);
      if (seen.has(k)) continue;
      seen.add(k);
      prev.set(k, key(cur.c, cur.r));
      if (nc === wrapCol(to.c) && n.r === to.r) {
        const route = [{ c: nc, r: n.r }];
        let pk = prev.get(k);
        while (pk !== undefined) {
          route.unshift({ c: pk % COLS, r: pk / COLS | 0 });
          pk = prev.get(pk);
        }
        return route;
      }
      q.push({ c: nc, r: n.r, d: cur.d + 1 });
    }
  }
  return null;
}

/* ------------------------- drag-to-draw path system ---------------------
   The soul of the game. A hand-drawn trail through the corridors:
   - tip follows the cursor tile by tile, orthogonally, walls refuse it
   - immediate backtrack retracts (undo); long-way-around re-entry crosses
   - tip returned to start + release = closed patrol loop
   - timing beads mark equal travel-time points across all four trails
------------------------------------------------------------------------- */

/* One bead per this many ticks of travel. Dense enough that a bead is worth
   about two tiles, which is the precision a pincer is actually decided by. */
const BEAD_TICKS = 15;

const Draw = {
  active: null,     // { hunter, tiles:[{c,r}], closable }
  erase: null,      // { hunter } during right-drag erase
  selected: 0,      // roster slot the number keys point at
  lastPicked: -1,   // for cycling through a stack of ghosts on one tile

  /* Ghosts pile up -- three of them leave the den on the same tile, and a
     click can only ever land on one. So clicking a stack cycles through it,
     and every ghost keeps a permanent number that selects it outright. */
  pickAt(px, py) {
    const near = [];
    game.hunters.forEach((h, i) => {
      if (!h.isCommandable()) return;
      const dx = h.x - px, dy = h.y - py;
      const d2 = dx * dx + dy * dy;
      if (d2 < 144) near.push({ h, i, d2 });
    });
    if (!near.length) return null;
    near.sort((a, b) => a.d2 - b.d2);
    // if several are stacked here, take the one after whoever we took last
    const stacked = near.filter(n => n.d2 < 64);
    const pool = stacked.length > 1 ? stacked : near;
    let choice = pool[0];
    if (pool.length > 1) {
      const at = pool.findIndex(n => n.i === this.lastPicked);
      choice = pool[(at + 1) % pool.length];
    }
    this.lastPicked = choice.i;
    this.selected = choice.i;
    return choice.h;
  },

  begin(hunter) {
    const t = hunter.tile();
    const anchor = this.anchorFor(hunter);
    this.active = { hunter, tiles: [anchor], closable: false };
  },
  /* start the trail at the tile the hunter will next be centered in */
  anchorFor(hunter) {
    // one still in the den will emerge at the door, so draw from there
    if (hunter.inDenStates()) return { c: DOOR_C0, r: DEN_EXIT_ROW };
    const t = hunter.tile();
    if (hunter.dir) {
      const d = DIRS[hunter.dir];
      const cx = tcx(t.c), cy = tcy(t.r);
      const past = (d.x !== 0) ? (hunter.x - cx) * d.x > 0.01 : (hunter.y - cy) * d.y > 0.01;
      if (past && isOpen(t.c + d.x, t.r + d.y)) {
        return { c: wrapCol(t.c + d.x), r: t.r + d.y };
      }
    }
    return { c: t.c, r: t.r };
  },

  /* The tip crawls toward the cursor one adjacent tile at a time. It never
     pathfinds: if the cursor is somewhere the tip cannot reach by continuing
     along the corridor it is in, the tip stops and waits at the last legal
     tile until the cursor comes somewhere it can follow. Routing around a
     wall on the player's behalf turns a fourteen-tile order into a
     forty-tile horseshoe they never drew. */
  extendToward(mc, mr) {
    const a = this.active;
    if (!a) return;
    let guard = 0;
    while (guard++ < 40) {
      const tip = a.tiles[a.tiles.length - 1];
      let dc = wrapCol(mc) - tip.c;
      if (dc > COLS / 2) dc -= COLS;
      if (dc < -COLS / 2) dc += COLS;
      const dr = mr - tip.r;
      if (dc === 0 && dr === 0) break;

      // try the axis with further to go first, then the other one
      const horiz = { x: Math.sign(dc), y: 0 };
      const vert = { x: 0, y: Math.sign(dr) };
      const order = Math.abs(dc) >= Math.abs(dr) ? [horiz, vert] : [vert, horiz];

      let stepped = false;
      for (const s of order) {
        if (!s.x && !s.y) continue;
        const nc = wrapCol(tip.c + s.x), nr = tip.r + s.y;
        if (!isOpen(nc, nr) || inDen(nc, nr)) continue;
        const prev = a.tiles.length >= 2 ? a.tiles[a.tiles.length - 2] : null;
        if (prev && prev.c === nc && prev.r === nr) a.tiles.pop();  // retract
        else a.tiles.push({ c: nc, r: nr });
        stepped = true;
        break;
      }
      if (!stepped) break;            // hemmed in: the tip waits
    }
    const tip = a.tiles[a.tiles.length - 1];
    a.closable = a.tiles.length >= 5
      && tip.c === a.tiles[0].c && tip.r === a.tiles[0].r;
  },

  commit(dragMoved) {
    const a = this.active;
    this.active = null;
    if (!a) return;
    if (a.tiles.length < 2) {
      // A real click with no drag clears the order. A drag that never found
      // a legal tile (into a wall, say) must leave the old order alone --
      // silently disarming a ghost the player never meant to touch is cruel
      // in the wrong way.
      if (!dragMoved) { a.hunter.clearOrder(); Sound.uiClear(); }
      return;
    }
    let tiles = a.tiles;
    let closed = false;
    if (a.closable) {
      tiles = tiles.slice(0, tiles.length - 1);   // drop dup start tile
      closed = true;
    }
    a.hunter.setOrder(tiles, closed);
    Sound.uiCommit();
  },

  beginErase(game, mc, mr, px, py) {
    // find the nearest committed path point within reach
    let best = null;
    for (const h of game.hunters) {
      if (!h.path) continue;
      h.path.tiles.forEach((t, i) => {
        const dx = tcx(t.c) - px, dy = tcy(t.r) - py;
        const d2 = dx * dx + dy * dy;
        if (d2 < 100 && (!best || d2 < best.d2)) best = { hunter: h, i, d2 };
      });
    }
    if (best) {
      this.erase = { hunter: best.hunter };
      this.eraseAt(best.hunter, best.i);
    }
  },
  eraseSweep(px, py) {
    if (!this.erase) return;
    const h = this.erase.hunter;
    if (!h.path) return;
    h.path.tiles.forEach((t, i) => {
      const dx = tcx(t.c) - px, dy = tcy(t.r) - py;
      if (dx * dx + dy * dy < 100) this.eraseAt(h, i);
    });
  },
  eraseAt(h, i) {
    if (!h.path) return;
    if (i <= h.path.idx || i < 1) { h.clearOrder(); Sound.uiClear(); return; }
    h.path.tiles = h.path.tiles.slice(0, i);
    h.path.closed = false;
  },
  endErase() { this.erase = null; },
};

/* --- path geometry helpers for rendering --- */

/* walk `dist` px along a polyline of tile centers; returns {x,y} or null.
   Segments that jump across the tunnel are skipped visually. */
function pointAlong(tiles, dist) {
  let acc = 0;
  for (let i = 1; i < tiles.length; i++) {
    const a = tiles[i - 1], b = tiles[i];
    let dc = b.c - a.c;
    if (Math.abs(dc) > 1) { acc += TILE; continue; }   // wrap seam
    const seg = TILE;
    if (acc + seg >= dist) {
      const f = (dist - acc) / seg;
      return { x: tcx(a.c) + (b.c - a.c) * TILE * f, y: tcy(a.r) + (b.r - a.r) * TILE * f, i };
    }
    acc += seg;
  }
  return null;
}

/* Where a hunter actually ends up: running off an open path it keeps its last
   heading until a wall stops it. Showing that coast removes the game's most
   common surprise without softening the rule. */
function runOutFrom(tiles) {
  if (tiles.length < 2) return [];
  const tip = tiles[tiles.length - 1], back = tiles[tiles.length - 2];
  let dc = tip.c - back.c, dr = tip.r - back.r;
  if (dc > 1) dc = -1; if (dc < -1) dc = 1;
  const out = [];
  let c = tip.c, r = tip.r, guard = 0;
  while (guard++ < 40) {
    const nc = wrapCol(c + dc), nr = r + dr;
    if (!isOpen(nc, nr) || inDen(nc, nr)) break;
    out.push({ c: nc, r: nr });
    c = nc; r = nr;
  }
  return out;
}

/* draw one trail (committed or in-progress) */
function drawTrail(g, tiles, color, opts) {
  const { fromIdx = 0, closed = false, ants = 0, faint = false, beads = null,
          closable = false, runOut = null } = opts || {};
  const yOff = HUD_TOP * TILE;
  // the coast past the arrowhead, sparser so it reads as "and then it drifts"
  if (runOut && runOut.length) {
    g.fillStyle = color;
    const chain = [tiles[tiles.length - 1]].concat(runOut);
    for (let i = 1; i < chain.length; i++) {
      const a = chain[i - 1], b = chain[i];
      const ddc = b.c - a.c, ddr = b.r - a.r;
      if (Math.abs(ddc) > 1) continue;
      for (let s = 0; s < TILE; s += 4) {
        g.fillRect(Math.round(tcx(a.c) + ddc * s), Math.round(tcy(a.r) + ddr * s) + yOff, 1, 1);
      }
    }
    const end = chain[chain.length - 1];
    g.fillRect(tcx(end.c) - 2, tcy(end.r) - 2 + yOff, 5, 1);
    g.fillRect(tcx(end.c) - 2, tcy(end.r) + 2 + yOff, 5, 1);
  }
  /* A 1px dash on an 8px period. Pellets are 2x2 on the same lattice, so the
     order line has to differ in weight, not just hue -- at 2x2 in a corridor
     full of food the two read as the same object. */
  g.fillStyle = color;
  const start = Math.max(1, fromIdx);
  const all = closed ? tiles.concat([tiles[0]]) : tiles;
  for (let i = start; i < all.length; i++) {
    const a = all[i - 1], b = all[i];
    const dc = b.c - a.c, dr = b.r - a.r;
    if (Math.abs(dc) > 1) continue;                    // wrap seam: no line
    for (let s = 0; s < TILE; s++) {
      // phase is keyed to absolute position so the dash never drifts
      const x = tcx(a.c) + dc * s, y = tcy(a.r) + dr * s;
      const along = (dc !== 0 ? x : y) + ants;
      if ((((along % 8) + 8) % 8) >= 4) continue;
      if (faint && (((along / 4) | 0) % 2 === 0)) continue;
      g.fillRect(Math.round(x), Math.round(y) + yOff, 1, 1);
    }
  }
  if (!tiles.length) return;
  // start marker
  const s0 = tiles[0];
  if (!closed) {
    g.fillStyle = closable ? PAL.white : color;
    g.fillRect(tcx(s0.c) - 3, tcy(s0.r) - 3 + yOff, 6, 1);
    g.fillRect(tcx(s0.c) - 3, tcy(s0.r) + 2 + yOff, 6, 1);
    g.fillRect(tcx(s0.c) - 3, tcy(s0.r) - 3 + yOff, 1, 6);
    g.fillRect(tcx(s0.c) + 2, tcy(s0.r) - 3 + yOff, 1, 6);
  }
  // arrowhead at the tip pointing along the final segment
  if (!closed && tiles.length >= 2) {
    const tip = tiles[tiles.length - 1], back = tiles[tiles.length - 2];
    let dc = tip.c - back.c, dr = tip.r - back.r;
    if (dc > 1) dc = -1; if (dc < -1) dc = 1;
    const tx = tcx(tip.c), ty = tcy(tip.r) + yOff;
    g.fillStyle = color;
    if (dc === 1) { g.fillRect(tx, ty - 1, 1, 3); g.fillRect(tx + 1, ty - 2, 1, 5); g.fillRect(tx + 2, ty, 1, 1); g.fillRect(tx + 3, ty, 1, 1); }
    else if (dc === -1) { g.fillRect(tx, ty - 1, 1, 3); g.fillRect(tx - 1, ty - 2, 1, 5); g.fillRect(tx - 2, ty, 1, 1); g.fillRect(tx - 3, ty, 1, 1); }
    else if (dr === 1) { g.fillRect(tx - 1, ty, 3, 1); g.fillRect(tx - 2, ty + 1, 5, 1); g.fillRect(tx, ty + 2, 1, 1); g.fillRect(tx, ty + 3, 1, 1); }
    else { g.fillRect(tx - 1, ty, 3, 1); g.fillRect(tx - 2, ty - 1, 5, 1); g.fillRect(tx, ty - 2, 1, 1); g.fillRect(tx, ty - 3, 1, 1); }
  }
  /* Timing beads: equal travel time, not equal distance. They have to be a
     different SHAPE from the 1px dash or they disappear into it, and a
     coincidence has to be white -- highlighting it in a hunter's own colour
     just reads as two trails crossing. */
  if (beads) {
    const walkTiles = closed ? tiles.concat([tiles[0]]) : tiles;
    for (let k = 1; k <= beads.count; k++) {
      const p = pointAlong(walkTiles, k * beads.spacing);
      if (!p) break;
      const x = Math.round(p.x), y = Math.round(p.y) + yOff;
      const hot = beads.hot && beads.hot.has(k);
      if (hot) {
        // a solid pip with a ring: this is where two hunters coincide in time
        g.fillStyle = PAL.white;
        g.fillRect(x - 1, y - 3, 3, 1); g.fillRect(x - 1, y + 3, 3, 1);
        g.fillRect(x - 3, y - 1, 1, 3); g.fillRect(x + 3, y - 1, 1, 3);
        g.fillRect(x - 1, y - 1, 3, 3);
      } else {
        g.fillStyle = color;
        g.fillRect(x - 1, y, 3, 1);     // a cross reads as a mark, not a dash
        g.fillRect(x, y - 1, 1, 3);
      }
    }
  }
}

/* which bead indices coincide (same travel time, near in space) across trails */
function computeHotBeads(game) {
  const lists = [];
  for (const h of game.hunters) {
    const src = (Draw.active && Draw.active.hunter === h) ? { tiles: Draw.active.tiles, closed: false }
              : h.path ? { tiles: h.path.tiles.slice(h.path.idx ? h.path.idx - 1 : 0), closed: h.path.closed }
              : null;
    if (!src || src.tiles.length < 2) { lists.push(null); continue; }
    const spacing = Math.max(2, game.params.hunterSpeed * BEAD_TICKS);
    const walk = src.closed ? src.tiles.concat([src.tiles[0]]) : src.tiles;
    const pts = [];
    for (let k = 1; k <= 40; k++) {
      const p = pointAlong(walk, k * spacing);
      if (!p) break;
      pts.push(p);
    }
    lists.push({ pts, spacing, hot: new Set() });
  }
  for (let i = 0; i < lists.length; i++) {
    for (let j = i + 1; j < lists.length; j++) {
      if (!lists[i] || !lists[j]) continue;
      const n = Math.min(lists[i].pts.length, lists[j].pts.length);
      for (let k = 0; k < n; k++) {
        const a = lists[i].pts[k], b = lists[j].pts[k];
        const dx = a.x - b.x, dy = a.y - b.y;
        if (dx * dx + dy * dy < 20 * 20) {
          lists[i].hot.add(k + 1); lists[j].hot.add(k + 1);
        }
      }
    }
  }
  return lists;
}

/* ------------------------------ the evader ------------------------------
   He is not a wander-bot. He simulates your hunters' committed orders,
   scores escape corridors by threat margin and exit count, farms dots when
   safe, sprints for energizers when cornered, abuses the tunnels, and
   ignores any hunter you left parked and stupid.
------------------------------------------------------------------------- */

const HORIZON = 110;   // ticks of hunter future we bother predicting

/* Simulate a hunter's deterministic future; tile occupied at each tick. */
function hunterFuture(h, game) {
  const out = [];
  if (!h.isThreat()) return out;
  const sim = {
    x: h.x, y: h.y, dir: h.dir, speed: h.speed || game.params.hunterSpeed,
    path: h.path ? { tiles: h.path.tiles, closed: h.path.closed, idx: h.path.idx } : null,
    tile() { return tileOfPx(this.x, this.y); },
  };
  const decide = (e) => {
    const t = sim.tile();
    if (sim.path) {
      let { tiles } = sim.path;
      if (sim.path.idx >= tiles.length) {
        if (sim.path.closed) sim.path.idx = 0; else { sim.path = null; }
      }
      if (sim.path) {
        let goal = tiles[sim.path.idx];
        if (goal.c === t.c && goal.r === t.r) {
          sim.path.idx++;
          if (sim.path.idx >= tiles.length) {
            if (sim.path.closed) sim.path.idx = 0; else { sim.path = null; }
          }
          if (sim.path) goal = tiles[sim.path.idx];
        }
        if (sim.path) {
          let dc = goal.c - t.c, dr = goal.r - t.r;
          if (dc > COLS / 2) dc -= COLS; if (dc < -COLS / 2) dc += COLS;
          if (Math.abs(dc) + Math.abs(dr) === 1) {
            sim.dir = dc === 1 ? 'right' : dc === -1 ? 'left' : dr === 1 ? 'down' : 'up';
            return;
          }
          sim.path = null;
        }
      }
    }
    if (sim.dir) {
      const d = DIRS[sim.dir];
      if (!isOpen(t.c + d.x, t.r + d.y)) sim.dir = null;
    }
  };
  for (let t = 0; t < HORIZON; t++) {
    stepEntity(sim, decide);
    const tt = sim.tile();
    out.push(tt.r * COLS + wrapCol(tt.c));
  }
  return out;
}

class Evader {
  constructor(spawn) {
    this.spawnTile = spawn;
    this.reset();
  }
  reset() {
    this.x = tcx(this.spawnTile.c) + TILE / 2;   // straddle the center seam
    this.y = tcy(this.spawnTile.r);
    this.dir = 'left';
    this.frame = 0; this.animT = 0;
    this.feintT = 0;
    this.decisionSeed = ((Date.now() * 7919) % 2147483645) + 1;
    this.alive = true;
  }
  tile() { return tileOfPx(this.x, this.y); }
  rnd() {
    this.decisionSeed = (this.decisionSeed * 16807) % 2147483647;
    return this.decisionSeed / 2147483647;
  }

  update(game) {
    if (!this.alive) return;
    this.animT++;
    const fright = game.frightT > 0;
    const t = this.tile();
    const inTunnel = TUNNEL_ROWS.includes(t.r) && (t.c <= 6 || t.c >= 21);
    this.speed = fright ? game.params.evaderFrightSpeed
               : inTunnel ? game.params.evaderSpeed          // he owns the tunnels
               : game.params.evaderSpeed * (1 + game.boldness() * 0.06);
    const moved = stepEntity(this, (e, ws) => this.decide(game, ws));
    if (moved && this.animT % 4 === 0) this.frame = (this.frame + 1) % 4;

    // eat what's under us when near a tile center
    const tt = this.tile();
    if (tt.c >= 0 && tt.c < COLS
        && Math.abs(this.x - tcx(tt.c)) < 3 && Math.abs(this.y - tcy(tt.r)) < 3) {
      const d = dots[tt.r][tt.c];
      if (d) {
        dots[tt.r][tt.c] = 0;
        game.dotsEaten++;
        Sound.chomp();
        if (d === 2) game.triggerFright();
      }
      if (game.fruit && tt.r === FRUIT_TILE.r && (tt.c === 13 || tt.c === 14)) {
        game.takeFruit(null);
      }
    }
  }

  /* --- the brain --- */
  decide(game, wasStopped) {
    const t = this.tile();
    if (t.c < 0 || t.c >= COLS) return;   // mid-tunnel: keep going
    const opts = neighborsOf(t.c, t.r);
    if (!opts.length) { this.dir = null; return; }

    if (this.feintT > 0) this.feintT--;

    const myTicksPerTile = TILE / this.speed;

    // immediate danger? then reversal is allowed
    const danger = this.dangerAt(t.c, t.r, 0, game, myTicksPerTile) < 10;
    let cands = opts.filter(o => o.dir !== OPP[this.dir]);
    if (!cands.length || danger) cands = opts;
    // never step onto a statue: that tile is a wall that kills
    const notParked = cands.filter(o =>
      !(game.parkedTiles && game.parkedTiles.has(o.r * COLS + wrapCol(o.c))));
    if (notParked.length) cands = notParked;

    let best = null, bestScore = -Infinity, second = null, secondScore = -Infinity;
    for (const o of cands) {
      const s = this.scoreRoute(game, o, t, myTicksPerTile, game.params.lookahead);
      if (s > bestScore) { second = best; secondScore = bestScore; best = o; bestScore = s; }
      else if (s > secondScore) { second = o; secondScore = s; }
    }
    /* Feint: when two lines are nearly as good AND he is comfortable, take
       the second one -- it reads as a juke at a junction. It must never fire
       under pressure. Gambling while threatened is not cunning, it is noise,
       and it made him play worse at exactly the levels where he is supposed
       to feel like he is reading your mind. */
    const comfortable = bestScore > 140;
    if (second && comfortable && bestScore < 900
        && bestScore - secondScore < 6
        && this.rnd() < game.params.gamble && this.feintT === 0) {
      best = second;
      this.feintT = 2;     // re-think at the next center: reads as a juke
    }
    if (best) this.dir = best.dir;
  }

  /* threat cost of standing on a tile at +ticks from now (0 = deadly) */
  dangerAt(c, r, ticks, game, myTpt) {
    let worst = 1000;
    const idx = r * COLS + wrapCol(c);
    for (let i = 0; i < game.hunters.length; i++) {
      const h = game.hunters[i];
      if (!h.isThreat()) continue;
      const parked = !h.path && !h.dir;
      if (game.frightT > ticks * 1.0) continue;      // they're food right now
      if (parked) {
        // a statue only matters if we would actually touch it
        const ht = h.tile();
        if (ht.c === c && ht.r === r) return 0;
        continue;
      }
      const fut = game.hunterFutures[i];
      const tt = Math.min(HORIZON - 1, Math.round(ticks));
      // occupied on/near our arrival tick? (only within his precognition horizon)
      if (tt < game.params.horizon) {
        for (let w = -3; w <= 3; w++) {
          const k = tt + w;
          if (k >= 0 && k < fut.length && fut[k] === idx) {
            worst = Math.min(worst, Math.abs(w));
          }
        }
      }
      // static reachability margin as a fallback
      const dg = game.hunterDistGrids[i];
      if (!dg) continue;
      const hd = dg[idx];
      if (hd >= 0) {
        const hunterTicks = hd * (TILE / (h.speed || game.params.hunterSpeed));
        worst = Math.min(worst, Math.max(0, hunterTicks - ticks));
      }
    }
    return worst;
  }

  /* walk a corridor from a starting move; score margin + options + snacks */
  scoreRoute(game, firstMove, from, myTpt, depth) {
    let c = firstMove.c, r = firstMove.r, dir = firstMove.dir;
    let ticks = myTpt;
    let minMargin = this.dangerAt(c, r, ticks, game, myTpt);
    let snacks = 0, energ = 0, fruitBonus = 0, tunnelBonus = 0;
    let steps = 1;
    let prevDir = dir;
    const seen = new Set();
    while (steps < 14) {
      if (c >= 0 && c < COLS) {
        const d = dots[r] ? dots[r][wrapCol(c)] : 0;
        if (d === 1) snacks++;
        else if (d === 2) energ++;
        if (game.fruit && r === FRUIT_TILE.r && (wrapCol(c) === 13 || wrapCol(c) === 14)) fruitBonus = 1;
      }
      if (TUNNEL_ROWS.includes(r) && (c <= 1 || c >= COLS - 2)) tunnelBonus = 1;
      const exits = neighborsOf(wrapCol(c), r).filter(n => n.dir !== OPP[prevDir]
        && !(game.parkedTiles && game.parkedTiles.has(n.r * COLS + wrapCol(n.c))));
      if (exits.length !== 1) {   // junction or dead-end: stop the walk
        // junction quality: more ways out = better
        const margin2 = minMargin + exits.length * 2;
        let score = Math.min(minMargin, 60) * 3 + exits.length * 5
          + snacks * 1.2 + fruitBonus * (minMargin > 20 ? 14 : 0);
        /* When it is genuinely safe, head toward whatever food is left. The
           gate matters: chasing dots with a hunter three tiles away is how
           he used to walk himself into corners, and a lone chaser could farm
           that mistake all the way to a capture. */
        if (minMargin > 30 && game.foodDist && c >= 0 && c < COLS) {
          const fd = game.foodDist[r * COLS + wrapCol(c)];
          if (fd >= 0) score += Math.max(0, 24 - fd) * 0.8;
        }
        // cornered? an energizer run is worth everything
        if (energ) score += (minMargin < 25 ? 80 : game.frightT > 0 ? -40 : 6);
        if (tunnelBonus && minMargin < 30) score += 18;
        // fright: hunt the nearest edible hunter instead of running
        if (game.frightT > 60) {
          for (let i = 0; i < game.hunters.length; i++) {
            const h = game.hunters[i];
            if (!h.isThreat()) continue;
            const dg = game.hunterDistGrids[i];
            if (!dg) continue;
            const hd = dg[r * COLS + wrapCol(c)];
            if (hd >= 0 && hd < 8) score += (8 - hd) * 6;
          }
        }
        if (depth > 1 && exits.length > 0 && minMargin > 0) {
          let bestChild = -Infinity;
          for (const ex of exits) {
            const s = this.scoreRoute(game, ex, { c: wrapCol(c), r }, myTpt, depth - 1);
            if (s > bestChild) bestChild = s;
          }
          if (bestChild > -Infinity) score += bestChild * 0.45;
        }
        return score;
      }
      prevDir = exits[0].dir;
      c = exits[0].c; r = exits[0].r;
      const key = r * COLS + wrapCol(c);
      if (game.parkedTiles && game.parkedTiles.has(key)) {
        /* A statue seals this corridor -- it is a cul-de-sac, not poison.
           With a healthy margin he strolls in, eats, and strolls out: that
           is what exploiting a parked ghost means. Anything less than a
           comfortable margin and the sealed corridor repels hard, because a
           cul-de-sac is exactly where a second body turns him into a score.
           (Flat-refusing every sealed corridor was worse: it shrank his map
           so badly that one chaser could herd him around the perimeter.) */
        const sealed = Math.min(minMargin, 60) * 3 + snacks * 1.2 - 6;
        return minMargin < 30 ? sealed - 70 : sealed;
      }
      if (seen.has(key)) break;
      seen.add(key);
      ticks += myTpt;
      steps++;
      const m = this.dangerAt(wrapCol(c), r, ticks, game, myTpt);
      if (m < minMargin) minMargin = m;
      if (minMargin === 0) return -500 + steps;   // predicted collision
    }
    return Math.min(minMargin, 60) * 3 + snacks;
  }

  draw(g, game) {
    if (!this.alive) return;
    const x = Math.round(this.x - 8), y = Math.round(this.y - 8) + HUD_TOP * TILE;
    const seq = [0, 1, 2, 1];
    const f = seq[this.frame % 4];
    g.drawImage(SPRITES.gob[this.dir || 'left'][f], x, y);
  }
}

/* ------------------------------ level params ---------------------------- */

/* The speed ratios are the game's thesis, so they are chosen, not inherited.
   Hunters run at near parity with the evader -- he keeps only a couple of
   percent. Their real handicap is that they cannot improvise: they walk what
   was drawn and nothing else, while he re-decides at every junction and can
   read the orders already committed. Making them outright slow instead was
   worse: it meant nothing could ever be run down, so three of the four
   hunters were irrelevant and the player spent the middle of every board
   watching rather than playing.
   test/speed-audit.js measures what these actually produce in play. */
function levelParams(n) {
  const base = 1.26;   // px per tick at full arcade speed
  return {
    evaderSpeed: Math.min(0.84 + 0.02 * (n - 1), 1.06) * base,
    evaderFrightSpeed: Math.min(0.95 + 0.01 * (n - 1), 1.05) * base,
    hunterSpeed: Math.min(0.82 + 0.015 * (n - 1), 0.96) * base,
    hunterTunnelSpeed: 0.55 * base,
    hunterFrightSpeed: 0.68 * base,
    eyeSpeed: 1.9 * base,
    frightTicks: Math.max(420 - 35 * (n - 1), 120),
    respawnTicks: Math.max(420 - 20 * (n - 1), 180),
    lookahead: Math.min(1 + Math.floor((n - 1) / 2), 4),
    gamble: Math.min(0.12 + 0.05 * (n - 1), 0.55),
    /* how many ticks of your committed orders he can read (precognition) */
    horizon: n <= 1 ? 0 : n === 2 ? 40 : n === 3 ? 70 : HORIZON,
  };
}

/* ------------------------------- the game ------------------------------- */

const game = {
  phase: 'boot',        // boot attract ready play command capture flash escaped gameover
  level: 1,
  score: 0,
  high: 0,
  contracts: 3,
  extraAwarded: false,
  tick: 0,
  phaseT: 0,
  frightT: 0,
  frightPulseT: 0,
  dotsEaten: 0,
  fruit: null,          // {idx, timer}
  lastFruitAt: -1,
  fruitHistory: [],
  hunters: [],
  evader: null,
  params: levelParams(1),
  hunterFutures: [[], [], [], []],
  parkedTiles: new Set(),
  foodDist: null,
  hunterDistGrids: [null, null, null, null],
  releaseFlip: false,
  popups: [],           // {x, y, text, color, t}
  message: null,        // {text, color, t}
  attract: { page: 0, t: 0, introStep: 0 },
  demo: false,
  hint: true,
  captureInfo: null,
  flashT: 0,
  shakeT: 0,
  pressureT: 0,

  boldness() { return Math.min(1, this.dotsEaten / Math.max(1, dotTotal)); },

  sirenStage() {
    const p = this.boldness();
    return p > 0.8 ? 3 : p > 0.55 ? 2 : p > 0.3 ? 1 : 0;
  },

  resetActors() {
    this.hunters = HUNTER_DEFS.map((d, i) => new Hunter(d, i));
    this.evader = new Evader(EVADER_SPAWN);
    this.frightT = 0;
    this.fruit = null;
  },

  startLevel(rebuildDots) {
    this.params = levelParams(this.level);
    if (rebuildDots) { buildMaze(); this.dotsEaten = 0; }
    this.resetActors();
    this.lastFruitAt = -1;
    this.phase = 'ready';
    this.phaseT = 0;
    this.demo = false;
    Sound.jingle();
  },

  newGame() {
    this.level = 1;
    this.score = 0;
    this.contracts = 3;
    this.extraAwarded = false;
    this.fruitHistory = [];
    this.hint = true;
    buildMaze();
    this.dotsEaten = 0;
    this.startLevel(false);
  },

  addScore(n) {
    this.score += n;
    if (this.score > this.high) {
      this.high = this.score;
      try { localStorage.setItem('ghostProtocolHigh', String(this.high)); } catch (e) {}
    }
    if (!this.extraAwarded && this.score >= 10000) {
      this.extraAwarded = true;
      this.contracts++;
      this.popup(NATIVE_W / 2, 130, 'EXTRA UNIT', PAL.white);
    }
  },
  popup(x, y, text, color) {
    this.popups.push({ x, y, text, color, t: 90 });
  },

  triggerFright() {
    this.frightT = this.params.frightTicks;
    Sound.energize();
    // frightened hunters do NOT reverse or flee by themselves: your problem
  },

  /* The prize under the den is contested: route a hunter over it and that
     hunter gets the points AND a burst of speed -- for a few seconds it can
     actually run him down. He is always closer, so denying him is work, but
     now the work buys a weapon rather than just subtracting his snack. */
  takeFruit(byHunter) {
    if (!this.fruit) return;
    const pts = FRUIT_POINTS[this.fruit.idx % FRUIT_POINTS.length];
    this.fruit = null;
    Sound.fruit();
    if (byHunter) {
      this.addScore(pts);
      byHunter.boostT = 480;   // 8 seconds of overdrive
      this.popup(DEN_EXIT_X, tcy(FRUIT_TILE.r), String(pts), PAL.cyan);
      this.popup(byHunter.x, byHunter.y - 10, byHunter.def.name + ' FAST', byHunter.color);
    } else {
      this.popup(DEN_EXIT_X, tcy(FRUIT_TILE.r), 'HE TOOK IT', PAL.magenta);
    }
  },

  spawnFruitMaybe() {
    if (this.fruit) {
      if (--this.fruit.timer <= 0) this.fruit = null;
      return;
    }
    if ((this.dotsEaten === 70 || this.dotsEaten === 170)
        && this.lastFruitAt !== this.dotsEaten) {
      this.lastFruitAt = this.dotsEaten;
      this.fruit = { idx: (this.level - 1) % FRUIT_ART.length, timer: 600 };
    }
  },

  /* Distance from every tile to the nearest remaining dot. Without this he
     evaluates only the corridor he can see down, so once the board is nearly
     clear he mills around in emptied corridors instead of finishing it --
     which reads as the AI losing interest exactly when it should be closing
     the game out. */
  refreshFoodModel() {
    const dist = new Int16Array(COLS * MAZE_ROWS).fill(-1);
    const q = [];
    for (let r = 0; r < MAZE_ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (dots[r][c]) { dist[r * COLS + c] = 0; q.push({ c, r }); }
      }
    }
    let head = 0;
    while (head < q.length) {
      const cur = q[head++];
      const d0 = dist[cur.r * COLS + cur.c];
      for (const n of neighborsOf(cur.c, cur.r)) {
        if (n.c < 0 || n.c >= COLS) continue;
        const i = n.r * COLS + n.c;
        if (dist[i] === -1) { dist[i] = d0 + 1; q.push(n); }
      }
    }
    this.foodDist = dist;
  },

  refreshThreatModel() {
    this.parkedTiles = new Set();
    for (let i = 0; i < this.hunters.length; i++) {
      const h = this.hunters[i];
      const t = h.tile();
      this.hunterDistGrids[i] = bfsDistFrom({
        c: Math.max(0, Math.min(COLS - 1, wrapCol(t.c))),
        r: Math.max(0, Math.min(MAZE_ROWS - 1, t.r)),
      });
      this.hunterFutures[i] = h.isThreat() ? hunterFuture(h, this) : [];
      // a parked hunter is a wall that kills: the evader's routing has to
      // treat its tile as impassable, not as a distant threat
      if (h.isThreat() && !h.path && !h.dir && t.c >= 0 && t.c < COLS) {
        this.parkedTiles.add(t.r * COLS + wrapCol(t.c));
      }
    }
  },

  checkCollisions() {
    const et = this.evader.tile();
    for (const h of this.hunters) {
      if (h.state !== 'active') continue;
      const ht = h.tile();
      const dx = h.x - this.evader.x, dy = h.y - this.evader.y;
      const touching = (ht.c === et.c && ht.r === et.r) || (dx * dx + dy * dy < 36);
      if (!touching) continue;
      if (this.frightT > 0) {
        // he eats our hunter
        h.dissolve();
        Sound.hunterLost();
        this.popup(h.x, h.y - 6, h.def.name + ' DOWN', PAL.fright);
        this.shakeT = 10;
      } else {
        this.beginCapture(h);
        return;
      }
    }
  },

  beginCapture(hunter) {
    this.phase = 'capture';
    this.phaseT = 0;
    Sound.stopSiren();
    Sound.capture();
    // pincer scoring: every other hunter converging on the kill
    let bonusHunters = 0;
    const et = this.evader.tile();
    const dirsSeen = new Set();
    for (const h of this.hunters) {
      if (h.state !== 'active') continue;
      const ht = h.tile();
      const dist = Math.abs(ht.c - et.c) + Math.abs(ht.r - et.r);
      if (dist <= 8) {
        bonusHunters++;
        dirsSeen.add(ht.c - et.c > 0 ? 'e' : ht.c - et.c < 0 ? 'w' : ht.r - et.r > 0 ? 's' : 'n');
      }
    }
    const base = 1000 * this.level;
    const pincer = Math.max(0, bonusHunters - 1) * 400 + Math.max(0, dirsSeen.size - 1) * 300;
    this.captureInfo = { base, pincer, hunters: bonusHunters, dirs: dirsSeen.size };
    this.addScore(base + pincer);
    this.popup(this.evader.x, this.evader.y - 10, String(base + pincer), PAL.cyan);
    if (pincer > 0) this.popup(this.evader.x, this.evader.y - 20, 'PINCER', PAL.white);
    this.evader.alive = true;   // shown spinning during capture phase
  },

  pressureScore() {
    if (++this.pressureT < 30) return;
    this.pressureT = 0;
    const et = this.evader.tile();
    let near = 0;
    for (let i = 0; i < this.hunters.length; i++) {
      const h = this.hunters[i];
      if (!h.isThreat() || (!h.path && !h.dir)) continue;   // parked earns nothing
      const dg = this.hunterDistGrids[i];
      const d = dg ? dg[et.r * COLS + wrapCol(et.c)] : -1;
      if (d >= 0 && d <= 6) near++;
    }
    if (near >= 2) this.addScore(near * 10);
  },

  /* one 60 Hz game tick (only in live phases) */
  update() {
    this.tick++;
    if (this.phase === 'ready') {
      if (++this.phaseT > 210) {
        this.phase = 'play';
        Sound.startSiren();
      }
      return;
    }
    if (this.phase === 'capture') {
      this.phaseT++;
      if (this.phaseT === 80) { this.phase = 'flash'; this.flashT = 0; Sound.levelClear(); }
      return;
    }
    if (this.phase === 'flash') {
      if (++this.flashT > 120) {
        this.level++;
        this.fruitHistory.push((this.level - 2) % FRUIT_ART.length);
        if (this.fruitHistory.length > 7) this.fruitHistory.shift();
        this.startLevel(true);
      }
      return;
    }
    if (this.phase === 'escaped') {
      this.phaseT++;
      if (this.phaseT > 180) {
        if (this.contracts > 0) this.startLevel(true);
        else { this.phase = 'gameover'; this.phaseT = 0; }
      }
      return;
    }
    if (this.phase === 'gameover') {
      if (++this.phaseT > 300) enterAttract();
      return;
    }
    if (this.phase !== 'play') return;

    // fright clock
    if (this.frightT > 0) {
      this.frightT--;
      if (++this.frightPulseT % 9 === 0) Sound.frightPulse(this.frightPulseT / 9 | 0);
      Sound.setSirenAudible(false);
      if (this.frightT === 0) Sound.setSirenAudible(true);
    }

    this.refreshThreatModel();
    if (this.tick % 20 === 0 || !this.foodDist) this.refreshFoodModel();

    for (const h of this.hunters) {
      if (h.state === 'dissolving') {
        if (++h.dissolveT > 36) { h.state = 'eyes'; h.dir = 'up'; }
        continue;
      }
      h.update(this);
    }
    if (this.demo) this.demoDirector();
    this.evader.update(this);
    this.checkCollisions();
    if (this.phase !== 'play') return;

    this.spawnFruitMaybe();
    if (this.fruit) {
      for (const h of this.hunters) {
        if (h.state !== 'active') continue;
        const ht = h.tile();
        if (ht.r === FRUIT_TILE.r && (ht.c === 13 || ht.c === 14)) {
          this.takeFruit(h);
          break;
        }
      }
    }
    this.pressureScore();
    Sound.tickSiren(this.sirenStage());

    if (this.dotsEaten >= dotTotal) {
      // he cleared the board: we lose a contract
      this.contracts--;
      this.phase = 'escaped';
      this.phaseT = 0;
      Sound.stopSiren();
      Sound.hunterLost();
    }
  },

  /* attract-mode demo: keep hunters on rotating patrol circuits */
  demoDirector() {
    if (this.tick % 240 !== 5) return;
    const circuits = [
      [{ c: 1, r: 1 }, { c: 12, r: 1 }, { c: 12, r: 7 }, { c: 1, r: 7 }],
      [{ c: 15, r: 1 }, { c: 26, r: 1 }, { c: 26, r: 7 }, { c: 15, r: 7 }],
      [{ c: 1, r: 17 }, { c: 12, r: 20 }, { c: 12, r: 29 }, { c: 1, r: 29 }],
      [{ c: 15, r: 20 }, { c: 26, r: 23 }, { c: 26, r: 29 }, { c: 15, r: 29 }],
    ];
    this.hunters.forEach((h, i) => {
      if (h.state !== 'active' || h.path) return;
      const cs = circuits[i];
      const t = h.tile();
      let route = [];
      let cur = { c: wrapCol(t.c), r: t.r };
      // route to the circuit, then around it
      for (let k = 0; k < cs.length + 1; k++) {
        const target = cs[k % cs.length];
        const leg = bfsRoute(cur, target);
        if (!leg) return;
        route = route.concat(k === 0 ? leg : leg.slice(1));
        cur = target;
      }
      h.setOrder(route, false);
    });
  },
};

function enterAttract() {
  game.phase = 'attract';
  game.attract = { page: 0, t: 0, introStep: 0 };
  game.demo = false;
  Sound.stopSiren();
  buildMaze();
}

/* ------------------------------- input ---------------------------------- */

const input = {
  mx: 0, my: 0,          // native px within playfield space (y excludes HUD)
  leftDown: false, rightDown: false,
  dragOrigin: null, dragMoved: false,
};

let screenCanvas, screenCtx, native, nativeCtx, dotScratch, scale = 2;
let scanlines = null, vignette = null;

function toNative(ev) {
  const rect = screenCanvas.getBoundingClientRect();
  const x = (ev.clientX - rect.left) / scale;
  const y = (ev.clientY - rect.top) / scale;
  return { x, y: y - HUD_TOP * TILE };
}
function toDisplay(ev) {
  const rect = screenCanvas.getBoundingClientRect();
  return {
    x: (ev.clientX - rect.left) * (screenCanvas.width / rect.width),
    y: (ev.clientY - rect.top) * (screenCanvas.height / rect.height),
  };
}
function inRect(p, r) {
  return r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

function pauseToCommand() {
  if (game.phase === 'play') {
    game.phase = 'command';
    Sound.uiFreeze();
    Sound.setSirenAudible(false);
    game.hint = false;
  }
}
function resumeFromCommand() {
  if (game.phase === 'command') {
    if (Draw.active) Draw.commit(input.dragMoved);
    Draw.endErase();
    game.phase = 'play';
    Sound.uiThaw();
    if (game.frightT <= 0) Sound.setSirenAudible(true);
  }
}

function bindInput() {
  window.addEventListener('keydown', (ev) => {
    if (ev.repeat) return;
    Sound.ensure(); Sound.resume();
    if (ev.code === 'Space' || ev.code === 'KeyP') {
      ev.preventDefault();
      if (game.phase === 'attract' || game.phase === 'gameover') { game.newGame(); return; }
      if (game.phase === 'play') pauseToCommand();
      else if (game.phase === 'command') resumeFromCommand();
    } else if (ev.code === 'Escape') {
      resumeFromCommand();
    } else if (ev.code >= 'Digit1' && ev.code <= 'Digit4') {
      // pick a ghost by number, even if it is buried under the other three
      const i = Number(ev.code.slice(5)) - 1;
      if (game.hunters[i] && game.hunters[i].isCommandable()) {
        if (game.phase === 'play') pauseToCommand();
        Draw.selected = i;
        Draw.lastPicked = i;
      }
    } else if (ev.code === 'Tab') {
      ev.preventDefault();
      if (game.phase === 'command' || game.phase === 'play') {
        if (game.phase === 'play') pauseToCommand();
        for (let n = 1; n <= 4; n++) {
          const i = (Draw.selected + n) % game.hunters.length;
          if (game.hunters[i].isCommandable()) { Draw.selected = i; Draw.lastPicked = i; break; }
        }
      }
    } else if (ev.code === 'KeyM') {
      Sound.muted = !Sound.muted;
      Sound.setSirenAudible(!Sound.muted && game.phase === 'play' && game.frightT <= 0);
    }
  });
  screenCanvas.addEventListener('contextmenu', ev => ev.preventDefault());
  screenCanvas.addEventListener('mousedown', (ev) => {
    Sound.ensure(); Sound.resume();
    const p = toNative(ev);
    input.mx = p.x; input.my = p.y;
    if (game.phase === 'attract' || game.phase === 'gameover') { game.newGame(); return; }
    if (ev.button === 2) {
      input.rightDown = true;
      if (game.phase === 'play') { pauseToCommand(); return; }
      if (game.phase === 'command') Draw.beginErase(game, Math.floor(p.x / TILE), Math.floor(p.y / TILE), p.x, p.y);
      return;
    }
    if (ev.button !== 0) return;
    input.leftDown = true;
    input.dragOrigin = { x: p.x, y: p.y };
    input.dragMoved = false;
    if (game.phase !== 'play' && game.phase !== 'command') return;
    // roster buttons live in display space, above the glass
    if (game.phase === 'command') {
      const dp = toDisplay(ev);
      if (inRect(dp, rosterUI.play)) { resumeFromCommand(); return; }
      const slot = rosterUI.slots.find(s => inRect(dp, s));
      if (slot) {
        const h = game.hunters[slot.i];
        if (h && h.isCommandable()) {
          Draw.selected = slot.i;
          Draw.lastPicked = slot.i;   // floats it to the front of any pile
          Sound.uiCommit();
        }
        return;
      }
    }
    const picked = Draw.pickAt(p.x, p.y);
    // grabbing a ghost mid-play stops the clock by itself: that is the
    // whole control scheme, and it has to be discoverable by grabbing one
    if (picked && game.phase === 'play') pauseToCommand();
    if (picked && game.phase === 'command') Draw.begin(picked);
    else if (!picked && game.phase === 'command') {
      // clicking open floor draws for whoever the roster has selected, so a
      // buried ghost is still reachable
      const sel = game.hunters[Draw.selected];
      if (sel && sel.isCommandable()) Draw.begin(sel);
    }
  });
  window.addEventListener('mousemove', (ev) => {
    const p = toNative(ev);
    input.mx = p.x; input.my = p.y;
    if (input.leftDown && input.dragOrigin) {
      const dx = p.x - input.dragOrigin.x, dy = p.y - input.dragOrigin.y;
      if (dx * dx + dy * dy > 36) input.dragMoved = true;
    }
    if (game.phase !== 'command') return;
    if (Draw.active) {
      Draw.extendToward(Math.floor(p.x / TILE), Math.floor(p.y / TILE));
    } else if (input.rightDown) {
      Draw.eraseSweep(p.x, p.y);
    }
  });
  window.addEventListener('mouseup', (ev) => {
    if (ev.button === 2) { input.rightDown = false; Draw.endErase(); return; }
    if (ev.button !== 0) return;
    input.leftDown = false;
    if (game.phase === 'command' && Draw.active) Draw.commit(input.dragMoved);
    input.dragOrigin = null;
  });
  window.addEventListener('resize', layout);
}

/* ------------------------------ rendering ------------------------------- */

function layout() {
  scale = Math.max(1, Math.floor(Math.min(
    window.innerWidth / NATIVE_W, window.innerHeight / NATIVE_H)));
  screenCanvas.width = NATIVE_W * scale;
  screenCanvas.height = NATIVE_H * scale;
  screenCtx = screenCanvas.getContext('2d');
  screenCtx.imageSmoothingEnabled = false;
  /* BEGIN CRT PASS -- everything below models the glass, not the board. It
     runs on the scaled-up display canvas and never touches the palette. */
  // scanline overlay
  scanlines = makeCanvas(NATIVE_W * scale, NATIVE_H * scale);
  const sg = scanlines.getContext('2d');
  sg.fillStyle = 'rgba(0,0,0,0.22)';
  for (let y = 0; y < NATIVE_H; y++) {
    sg.fillRect(0, y * scale + scale - 1, NATIVE_W * scale, 1);
  }
  if (scale >= 3) {
    sg.fillStyle = 'rgba(0,0,0,0.10)';
    for (let x = 0; x < NATIVE_W; x++) sg.fillRect(x * scale + scale - 1, 0, 1, NATIVE_H * scale);
  }
  // vignette
  vignette = makeCanvas(NATIVE_W * scale, NATIVE_H * scale);
  const vg = vignette.getContext('2d');
  const grad = vg.createRadialGradient(
    NATIVE_W * scale / 2, NATIVE_H * scale / 2, NATIVE_H * scale * 0.35,
    NATIVE_W * scale / 2, NATIVE_H * scale / 2, NATIVE_H * scale * 0.72);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.35)');
  vg.fillStyle = grad;
  vg.fillRect(0, 0, NATIVE_W * scale, NATIVE_H * scale);
  /* END CRT PASS */
}

function drawDots(g, color) {
  const yOff = HUD_TOP * TILE;
  g.fillStyle = color || PAL.dot;
  const blinkOn = (uiFrame / 12 | 0) % 2 === 0;
  for (let r = 0; r < MAZE_ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const d = dots[r][c];
      if (d === 1) {
        g.fillRect(c * TILE + 3, r * TILE + 3 + yOff, 2, 2);
      } else if (d === 2 && blinkOn) {
        // a full 8x8 energizer: it has to dominate the pellet field
        const x = c * TILE, y = r * TILE + yOff;
        g.fillRect(x + 2, y, 4, 8);
        g.fillRect(x + 1, y + 1, 6, 6);
        g.fillRect(x, y + 2, 8, 4);
      }
    }
  }
}

function drawHUD(g) {
  const oneUpOn = game.phase === 'attract' || (uiFrame / 16 | 0) % 2 === 0;
  if (oneUpOn) drawText(g, '1UP', 24, 0, PAL.white);
  drawText(g, 'HIGH SCORE', 72, 0, PAL.white);
  const sc = game.score === 0 ? '00' : String(game.score);
  drawText(g, sc.padStart(7, ' '), 0, 8, PAL.white);
  const hs = game.high === 0 ? '00' : String(game.high);
  drawText(g, hs.padStart(7, ' '), 72, 8, PAL.white);
  /* The status row sits on whole tiles like everything else on the board.
     Packing icons at their content width put them at x=26 and x=36, which no
     tile pointer can address -- and it read as a modern layout function
     sitting two rows under a perfect character grid.
     In command mode the roster owns this strip, so the row yields to it. */
  if (game.phase === 'command') return;
  const by = (HUD_TOP + MAZE_ROWS) * TILE;
  for (let i = 0; i < Math.max(0, game.contracts); i++) {
    g.drawImage(SPRITES.minis[HUNTER_DEFS[0].key], (2 + i) * TILE, by);
  }
  const shown = Math.min(game.level, 6);
  for (let i = 0; i < shown; i++) {
    const idx = (game.level - shown + i) % FRUIT_ART.length;
    g.drawImage(SPRITES.fruit[idx], (COLS - 2 - (shown - i) * 2) * TILE, by - 4);
  }
}

function drawCommandOverlay(g) {
  const yOff = HUD_TOP * TILE;
  // command grid pips at open-tile corners
  g.fillStyle = PAL.grid;
  for (let r = 0; r <= MAZE_ROWS; r++) {
    for (let c = 0; c <= COLS; c++) {
      const open = isOpen(c, r) || isOpen(c - 1, r) || isOpen(c, r - 1) || isOpen(c - 1, r - 1);
      if (open) g.fillRect(c * TILE, r * TILE + yOff, 1, 1);
    }
  }
  const blink = (uiFrame / 20 | 0) % 2 === 0;

  /* The order trails themselves are not drawn here. They belong to the
     command layer, which is rendered above the glass at display resolution
     -- see drawOrderLayer. The board is 1981; the orders are not. */
  game.hunters.forEach((h, i) => {
    // ring the commandable hunters; mark the parked-and-stupid ones
    if (h.isCommandable()) {
      const hx = Math.round(h.x), hy = Math.round(h.y) + yOff;
      if (!h.path && !h.dir && blink) {
        drawText(g, '!', hx - 4, hy - 16, PAL.white);
      }
      if (blink && !Draw.active) {
        // selection brackets: corners only, so the sprite stays readable
        g.fillStyle = PAL.white;
        for (const sx of [-9, 8]) {
          for (const sy of [-9, 8]) {
            g.fillRect(hx + sx, hy + sy, 1, 1);
            g.fillRect(hx + sx + (sx < 0 ? 1 : -3), hy + sy, 3, 1);
            g.fillRect(hx + sx, hy + sy + (sy < 0 ? 1 : -3), 1, 3);
          }
        }
      }
    }
  });
}

/* The selected ghost draws last, so picking one from the roster visibly
   floats it to the top of whatever pile it is standing in. */
function hunterDrawOrder() {
  const order = game.hunters.slice();
  const sel = game.hunters[Draw.selected];
  if (sel) {
    const at = order.indexOf(sel);
    if (at >= 0) { order.splice(at, 1); order.push(sel); }
  }
  return order;
}

function drawPlayfield(g) {
  const yOff = HUD_TOP * TILE;
  const frozen = game.phase === 'command';
  // maze — frozen time swaps to the second palette bank rather than dimming
  if (game.phase === 'flash') {
    const on = (game.flashT / 12 | 0) % 2 === 0;
    g.drawImage(on ? mazeLayerWhite : mazeLayer, 0, yOff);
  } else {
    g.drawImage(frozen ? mazeLayerDim : mazeLayer, 0, yOff);
  }
  if (game.phase !== 'flash') drawDots(g, frozen ? PAL.dotDim : PAL.dot);
  // fruit
  if (game.fruit) {
    g.drawImage(SPRITES.fruit[game.fruit.idx % SPRITES.fruit.length],
      DEN_EXIT_X - 8, tcy(FRUIT_TILE.r) - 8 + yOff);
  }
  // faint trails during live play
  if (game.phase === 'play') {
    game.hunters.forEach((h) => {
      if (!h.path) return;
      const tiles = h.path.closed ? h.path.tiles : h.path.tiles.slice(Math.max(0, h.path.idx - 1));
      drawTrail(g, tiles, h.color, { closed: h.path.closed, ants: -(uiFrame >> 2), faint: true });
    });
  }
  /* The order overlay belongs to the background layer, so it goes down before
     the sprites: hardware gave sprites priority, and a lattice dot punched
     through a hunter's eye is the one artifact that cannot be explained. */
  if (game.phase === 'command') drawCommandOverlay(g);
  // actors
  if (game.phase === 'capture') {
    // spin the caught evader
    const t = game.phaseT;
    const dirSeq = ['right', 'down', 'left', 'up'];
    const d = dirSeq[(t / 6 | 0) % 4];
    if (t < 60) {
      const f = t < 40 ? 2 : 1;
      g.drawImage(SPRITES.gob[d][f],
        Math.round(game.evader.x - 8), Math.round(game.evader.y - 8) + yOff);
    }
    hunterDrawOrder().forEach(h => h.draw(g, game));
  } else if (game.phase !== 'flash') {
    game.evader.draw(g, game);
    hunterDrawOrder().forEach(h => h.draw(g, game));
  } else {
    hunterDrawOrder().forEach(h => h.draw(g, game));
  }
  // popups, held inside the screen so an edge capture still reads
  game.popups.forEach(p => {
    const half = p.text.length * 4;
    const x = Math.max(half + 2, Math.min(NATIVE_W - half - 2, p.x));
    drawTextCentered(g, p.text, x, Math.max(0, p.y + yOff - (90 - p.t) / 6), p.color);
  });
  /* The message slot: the one place on the board where text belongs, the
     same row the round-start banner uses. Everything routes through here. */
  if (game.phase === 'ready') {
    drawMessage(g, 'READY!', PAL.yellow);
  } else if (game.phase === 'escaped') {
    drawMessage(g, 'TARGET ESCAPED', PAL.red);
  } else if (game.phase === 'gameover') {
    drawMessage(g, 'GAME  OVER', PAL.red);
  } else if (game.phase === 'command') {
    if ((uiFrame / 20 | 0) % 2 === 0) drawMessage(g, 'COMMAND', PAL.cyan);
  } else if (game.phase === 'play' && game.hint && game.tick < 1200
             && (uiFrame / 24 | 0) % 2 === 0) {
    drawMessage(g, 'GRAB A GHOST', PAL.peach);
  }
}

/* The board's one message slot. Text occupies whole tile cells and blanks
   whatever they held, the way a tilemap banner did, so the letters never
   crowd a maze line or sit in a lane of pellets. */
const MSG_ROW = 17;
function drawMessage(g, text, color) {
  const yOff = HUD_TOP * TILE;
  const cells = text.length;
  const x0 = Math.round(NATIVE_W / 2 - cells * 4);
  const y0 = MSG_ROW * TILE + yOff;
  g.fillStyle = PAL.black;
  g.fillRect(x0 - 8, y0, cells * 8 + 16, TILE);
  drawText(g, text, x0, y0, color);
}

/* ------------------------------ attract mode ---------------------------- */

function drawAttract(g) {
  const a = game.attract;
  a.t++;
  const cx = NATIVE_W / 2;
  if (a.t > (a.page === 2 ? 1400 : 520)) { a.page = (a.page + 1) % 3; a.t = 0; a.introStep = 0;
    if (a.page === 2) { startDemo(); } else { game.demo = false; buildMaze(); game.resetActors(); } }

  if (a.page === 2) {
    // self-playing demo round; text stays in the board's message slot
    drawPlayfield(g);
    if ((uiFrame / 20 | 0) % 2 === 0) {
      drawTextCentered(g, 'DEMO  PUSH START', cx, tcy(17) + HUD_TOP * TILE - 3, PAL.orange);
    }
    return;
  }
  if (a.page === 0) {
    // marquee
    drawTextCentered(g, 'GHOST', cx, 48, PAL.red);
    drawTextCentered(g, 'PROTOCOL', cx, 60, PAL.red);
    drawTextCentered(g, 'THE HUNT RUNS BACKWARDS', cx, 84, PAL.cyan);
    // character intro roll
    const step = Math.min(4, a.t / 90 | 0);
    for (let i = 0; i < step; i++) {
      const h = HUNTER_DEFS[i];
      const y = 110 + i * 24;
      const bank = SPRITES.hunters[h.key];
      g.drawImage(bank.normal.right[(uiFrame / 8 | 0) % 2], 40, y - 5);
      drawText(g, h.name, 64, y, h.color);
      drawText(g, '"' + h.nick + '"', 120, y, h.color);
    }
    if (a.t > 380 && (uiFrame / 20 | 0) % 2 === 0) {
      drawTextCentered(g, 'PUSH START', cx, 230, PAL.orange);
    }
    drawTextCentered(g, 'c 1981 NULLSTAR MFG CO', cx, 262, PAL.peach);
    return;
  }
  // page 1: how to command
  drawTextCentered(g, 'YOU ARE THE GHOSTS', cx, 40, PAL.yellow);
  drawTextCentered(g, 'GRAB A GHOST AND TIME', cx, 70, PAL.white);
  drawTextCentered(g, 'STOPS. DRAG TO DRAW', cx, 82, PAL.white);
  drawTextCentered(g, 'THE PATH IT WILL WALK', cx, 94, PAL.white);
  drawTextCentered(g, 'CLOSE THE LOOP TO PATROL', cx, 118, PAL.cyan);
  drawTextCentered(g, 'DRAG BACK TO ERASE', cx, 130, PAL.cyan);
  drawTextCentered(g, 'NO ORDERS MEANS STUPID', cx, 154, PAL.red);
  drawTextCentered(g, 'WALLS STOP IDLE GHOSTS', cx, 166, PAL.red);
  drawTextCentered(g, 'CATCH THE THIEF', cx, 186, PAL.yellow);
  drawTextCentered(g, 'BEFORE HE EATS THE MAZE', cx, 198, PAL.yellow);
  const h = HUNTER_DEFS[(a.t / 130 | 0) % 4];
  g.drawImage(SPRITES.hunters[h.key].normal.right[(uiFrame / 8 | 0) % 2], cx - 30, 210);
  g.drawImage(SPRITES.gob.right[(uiFrame / 6 | 0) % 3], cx + 14, 210);
}

function startDemo() {
  buildMaze();
  game.dotsEaten = 0;
  game.params = levelParams(3);
  game.resetActors();
  game.demo = true;
  game.phase = 'attract';
}

/* ------------------------------ main loop ------------------------------- */

let uiFrame = 0;
let lastTime = 0, acc = 0;

function frame(now) {
  requestAnimationFrame(frame);
  uiFrame++;
  if (!lastTime) lastTime = now;
  let dt = now - lastTime;
  lastTime = now;
  if (dt > 100) dt = 100;
  acc += dt;

  const livePhases = ['ready', 'play', 'capture', 'flash', 'escaped', 'gameover'];
  let steps = 0;
  while (acc >= TICK_MS && steps < 4) {
    acc -= TICK_MS; steps++;
    if (livePhases.includes(game.phase)) game.update();
    else if (game.phase === 'attract' && game.demo) {
      game.phase = 'play'; game.update();
      if (game.phase === 'play' || game.phase === 'command') game.phase = 'attract';
      else { startDemo(); }   // demo round ended somehow: restart it
    }
    // popup decay runs on ticks regardless of phase
    game.popups = game.popups.filter(p => --p.t > 0);
  }

  render();
}

function render() {
  const g = nativeCtx;
  g.fillStyle = PAL.black;
  g.fillRect(0, 0, NATIVE_W, NATIVE_H);

  if (game.phase === 'attract' && !game.demo) {
    drawAttract(g);
    drawHUD(g);
  } else if (game.phase === 'attract' && game.demo) {
    drawAttract(g);
    drawHUD(g);
  } else {
    drawPlayfield(g);
    drawHUD(g);
  }

  /* BEGIN CRT PASS -- composite the finished frame onto the glass. */
  const sctx = screenCtx;
  let sx = 0, sy = 0;
  if (game.shakeT > 0) {
    game.shakeT--;
    sx = ((uiFrame % 2) * 2 - 1) * scale;
  }
  sctx.fillStyle = PAL.black;
  sctx.fillRect(0, 0, screenCanvas.width, screenCanvas.height);
  sctx.imageSmoothingEnabled = false;
  sctx.drawImage(native, sx, sy, NATIVE_W * scale, NATIVE_H * scale);
  // phosphor bloom
  sctx.save();
  sctx.globalCompositeOperation = 'lighter';
  sctx.globalAlpha = 0.28;
  sctx.filter = 'blur(' + Math.max(1, scale) + 'px)';
  sctx.drawImage(native, sx, sy, NATIVE_W * scale, NATIVE_H * scale);
  sctx.restore();
  sctx.filter = 'none';
  // scanlines + vignette
  sctx.drawImage(scanlines, 0, 0);
  sctx.drawImage(vignette, 0, 0);
  /* END CRT PASS */

  drawOrderLayer(sctx, sx, sy);

  /* The board is what the player is actually reading, so it wins: after the
     command layer is down, the pellets and the actors are punched back over
     the top of it. An order must never hide the food it is drawn across. */
  if (game.phase === 'command' || game.phase === 'play') {
    const ds = dotScratch.getContext('2d');
    ds.clearRect(0, 0, NATIVE_W, NATIVE_H);
    drawDots(ds, game.phase === 'command' ? PAL.dotDim : PAL.dot);
    if (game.fruit) {
      ds.drawImage(SPRITES.fruit[game.fruit.idx % SPRITES.fruit.length],
        DEN_EXIT_X - 8, tcy(FRUIT_TILE.r) - 8 + HUD_TOP * TILE);
    }
    if (game.phase !== 'flash') {
      game.evader.draw(ds, game);
      hunterDrawOrder().forEach(h => h.draw(ds, game));
    }
    sctx.drawImage(dotScratch, sx, sy, NATIVE_W * scale, NATIVE_H * scale);
  }
}

/* BEGIN COMMAND LAYER ----------------------------------------------------
   Everything above this point is a 1981 machine and obeys its rules. This
   does not. The orders you draw are the one thing on screen that isn't a
   cabinet artifact -- they are you reaching into the glass -- so they render
   after the CRT pass, at full display resolution, with curves, glow and
   colors the hardware could never have produced. The contrast is the point,
   which is why the palette lock deliberately does not apply here.
------------------------------------------------------------------------- */

function orderPathPoints(tiles, closed, S, ox, oy) {
  // tile centres in display space, split into runs at tunnel seams
  const runs = [];
  let cur = [];
  const list = closed && tiles.length ? tiles.concat([tiles[0]]) : tiles;
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    if (i > 0 && Math.abs(t.c - list[i - 1].c) > 1) { runs.push(cur); cur = []; }
    cur.push({ x: (tcx(t.c)) * S + ox, y: (tcy(t.r) + HUD_TOP * TILE) * S + oy });
  }
  if (cur.length) runs.push(cur);
  return runs;
}

function strokeRuns(ctx, runs, width, color, alpha, dashOffset) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (dashOffset !== null && dashOffset !== undefined) {
    ctx.setLineDash([width * 1.6, width * 1.5]);
    ctx.lineDashOffset = dashOffset;
  }
  for (const run of runs) {
    if (run.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(run[0].x, run[0].y);
    for (let i = 1; i < run.length; i++) ctx.lineTo(run[i].x, run[i].y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawOrderLayer(ctx, ox, oy) {
  const showing = game.phase === 'command' || game.phase === 'play';
  if (!showing) return;
  const S = scale;
  const frozen = game.phase === 'command';
  const flow = (uiFrame * 0.55) % 1000;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  if (frozen) {
    // a faint survey grid over the corridors, drawn as hairlines
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = '#5878ff';
    ctx.lineWidth = Math.max(1, S * 0.16);
    ctx.beginPath();
    for (let r = 0; r < MAZE_ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!isOpen(c, r) || inDen(c, r)) continue;
        const x = tcx(c) * S + ox, y = (tcy(r) + HUD_TOP * TILE) * S + oy;
        const k = S * 0.9;
        ctx.moveTo(x - k, y); ctx.lineTo(x + k, y);
        ctx.moveTo(x, y - k); ctx.lineTo(x, y + k);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  const hot = computeHotBeads(game);
  const spacing = Math.max(2, game.params.hunterSpeed * BEAD_TICKS);

  game.hunters.forEach((h, i) => {
    const drawing = Draw.active && Draw.active.hunter === h;
    let tiles = null, closed = false;
    if (drawing) { tiles = Draw.active.tiles; }
    else if (h.path) {
      closed = h.path.closed;
      tiles = closed ? h.path.tiles : h.path.tiles.slice(Math.max(0, h.path.idx - 1));
    }
    if (!tiles || tiles.length < 1) return;

    const runs = orderPathPoints(tiles, closed, S, ox, oy);
    const w = Math.max(2, S * 0.85);
    const bright = frozen ? 1 : 0.5;

    // the coast past the end of an open order
    if (!closed) {
      const ro = runOutFrom(tiles);
      if (ro.length) {
        const tail = orderPathPoints([tiles[tiles.length - 1]].concat(ro), false, S, ox, oy);
        strokeRuns(ctx, tail, w * 0.8, h.color, 0.3 * (frozen ? 1 : 0.6), flow * 2);
      }
    }

    // two glow passes under a solid core, then a bright pulse running along it
    strokeRuns(ctx, runs, w * 4.5, h.color, 0.13 * bright, null);
    strokeRuns(ctx, runs, w * 2.2, h.color, 0.26 * bright, null);
    strokeRuns(ctx, runs, w, h.color, 0.9 * bright, null);
    strokeRuns(ctx, runs, w * 0.5, '#ffffff', 0.5 * bright, -flow * 2.6);

    // leading edge: a bright head that runs along the route
    if (frozen && runs.length) {
      const walk = closed ? tiles.concat([tiles[0]]) : tiles;
      const total = (walk.length - 1) * TILE;
      const headPos = (uiFrame * 1.6) % Math.max(total, 1);
      const p = pointAlong(walk, headPos);
      if (p) {
        const hx = p.x * S + ox, hy = (p.y + HUD_TOP * TILE) * S + oy;
        const g2 = ctx.createRadialGradient(hx, hy, 0, hx, hy, S * 2.6);
        g2.addColorStop(0, h.color);
        g2.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.save();
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = g2;
        ctx.beginPath(); ctx.arc(hx, hy, S * 2.6, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }

    // timing beads
    const walk = closed ? tiles.concat([tiles[0]]) : tiles;
    const hotSet = hot[i] && hot[i].hot;
    for (let k = 1; k <= 80; k++) {
      const p = pointAlong(walk, k * spacing);
      if (!p) break;
      const bx = p.x * S + ox, by = (p.y + HUD_TOP * TILE) * S + oy;
      const isHot = hotSet && hotSet.has(k);
      ctx.save();
      if (isHot) {
        const pulse = 0.6 + 0.4 * Math.sin(uiFrame * 0.18 + k);
        ctx.globalAlpha = 0.9 * bright;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1, S * 0.28);
        ctx.beginPath();
        ctx.arc(bx, by, S * (0.95 + 0.35 * pulse), 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = bright;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(bx, by, S * 0.42, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.globalAlpha = 0.5 * bright;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(bx, by, S * 0.55, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }

    // arrowhead on an open route, or a closed-circuit ring
    const last = runs[runs.length - 1];
    if (!closed && last && last.length >= 2) {
      const a = last[last.length - 2], b = last[last.length - 1];
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const len = S * 2.6;
      ctx.save();
      ctx.globalAlpha = bright;
      ctx.fillStyle = h.color;
      ctx.translate(b.x, b.y); ctx.rotate(ang);
      ctx.beginPath();
      ctx.moveTo(len, 0);
      ctx.lineTo(-len * 0.55, len * 0.7);
      ctx.lineTo(-len * 0.2, 0);
      ctx.lineTo(-len * 0.55, -len * 0.7);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    } else if (closed && runs[0] && runs[0].length) {
      const p0 = runs[0][0];
      ctx.save();
      ctx.globalAlpha = 0.8 * bright;
      ctx.strokeStyle = h.color;
      ctx.lineWidth = Math.max(1, S * 0.3);
      ctx.beginPath();
      ctx.arc(p0.x, p0.y, S * 1.9 + Math.sin(uiFrame * 0.1) * S * 0.25, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // an armed loop closure gets a halo on the start tile
    if (drawing && Draw.active.closable && runs[0] && runs[0].length) {
      const p0 = runs[0][0];
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1, S * 0.35);
      ctx.beginPath();
      ctx.arc(p0.x, p0.y, S * (2.4 + 0.5 * Math.sin(uiFrame * 0.25)), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  });

  ctx.restore();

  if (frozen) drawRoster(ctx, ox, oy);
}

/* The roster. Four ghosts can end up standing on the same tile, and then a
   click can only ever reach one of them -- so each has a permanent number
   and a button down here. Clicking a name selects that ghost and floats it
   to the front of the pile; the PLAY button unfreezes without the keyboard.
   Slot rectangles are stored each frame for the mousedown hit test. */
const rosterUI = { slots: [], play: null };

function plate(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawRoster(ctx, ox, oy) {
  const S = scale;
  const h0 = S * 13;
  const gap = S * 2;
  const slotW = S * 42;
  const playW = S * 20;
  const total = slotW * 4 + gap * 4 + playW;
  const x0 = (NATIVE_W * S - total) / 2 + ox;
  const y = (HUD_TOP * TILE + MAZE_ROWS * TILE + HUD_BOT * TILE) * S + oy - h0 - S * 1.5;
  rosterUI.slots = [];
  ctx.save();
  ctx.textBaseline = 'middle';

  game.hunters.forEach((h, i) => {
    const x = x0 + i * (slotW + gap);
    const selected = Draw.selected === i;
    const commandable = h.isCommandable();
    const busy = !!h.path;
    rosterUI.slots.push({ x, y, w: slotW, h: h0, i });

    // glass plate with a glowing edge in the ghost's colour
    ctx.save();
    ctx.globalAlpha = commandable ? 1 : 0.35;
    plate(ctx, x, y, slotW, h0, S * 2.5);
    ctx.fillStyle = 'rgba(8,12,28,0.88)';
    ctx.fill();
    if (selected) {
      ctx.shadowColor = h.color;
      ctx.shadowBlur = S * 4;
    }
    ctx.strokeStyle = h.color;
    ctx.globalAlpha = (commandable ? 1 : 0.35) * (selected ? 1 : 0.45);
    ctx.lineWidth = Math.max(1, S * (selected ? 0.7 : 0.4));
    plate(ctx, x, y, slotW, h0, S * 2.5);
    ctx.stroke();
    ctx.restore();

    ctx.globalAlpha = commandable ? 1 : 0.35;
    // number badge
    ctx.font = 'bold ' + Math.round(S * 7) + 'px ui-monospace, Menlo, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = selected ? '#ffffff' : h.color;
    ctx.fillText(String(i + 1), x + S * 6, y + h0 / 2 + S * 0.3);

    ctx.font = 'bold ' + Math.round(S * 4.6) + 'px ui-monospace, Menlo, Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = h.color;
    ctx.fillText(h.def.name, x + S * 12, y + h0 * 0.34);

    ctx.font = Math.round(S * 3.6) + 'px ui-monospace, Menlo, Consolas, monospace';
    ctx.globalAlpha = commandable ? 0.8 : 0.3;
    ctx.fillStyle = busy ? '#ffffff' : '#7c8cb0';
    const status = !commandable ? 'DOWN'
      : h.boostT > 0 ? 'OVERDRIVE'
      : busy ? (h.path.closed ? 'PATROL' : 'ORDERED') : 'NO ORDER';
    ctx.fillText(status, x + S * 12, y + h0 * 0.72);
  });

  // PLAY: a green pulse of a button, mouse-only resume
  const px = x0 + 4 * (slotW + gap);
  rosterUI.play = { x: px, y, w: playW, h: h0 };
  const pulse = 0.75 + 0.25 * Math.sin(uiFrame * 0.12);
  ctx.save();
  plate(ctx, px, y, playW, h0, S * 2.5);
  ctx.fillStyle = 'rgba(8,20,12,0.88)';
  ctx.fill();
  ctx.shadowColor = '#40ff88';
  ctx.shadowBlur = S * 4 * pulse;
  ctx.strokeStyle = '#40ff88';
  ctx.globalAlpha = pulse;
  ctx.lineWidth = Math.max(1, S * 0.6);
  plate(ctx, px, y, playW, h0, S * 2.5);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#40ff88';
  const cx2 = px + playW / 2, cy2 = y + h0 / 2;
  ctx.beginPath();
  ctx.moveTo(cx2 - S * 2.2, cy2 - S * 3);
  ctx.lineTo(cx2 + S * 3.4, cy2);
  ctx.lineTo(cx2 - S * 2.2, cy2 + S * 3);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.restore();
}
/* END COMMAND LAYER */

/* -------------------------------- boot ---------------------------------- */

let mazeLayerDim, mazeLayerWhite;

function boot() {
  buildMaze();
  buildSprites();
  buildWallDistance();
  mazeLayer = renderMazeLayer(PAL.wall, PAL.door);
  mazeLayerDim = renderMazeLayer(PAL.wallDim, PAL.doorDim);
  mazeLayerWhite = renderMazeLayer(PAL.white, PAL.white);
  try { game.high = parseInt(localStorage.getItem('ghostProtocolHigh') || '0', 10) || 0; } catch (e) {}

  screenCanvas = document.getElementById('screen');
  native = makeCanvas(NATIVE_W, NATIVE_H);
  dotScratch = makeCanvas(NATIVE_W, NATIVE_H);
  dotScratch.getContext('2d').imageSmoothingEnabled = false;
  nativeCtx = native.getContext('2d');
  // Nothing on this canvas may ever be resampled: a smoothed blit invents
  // colors that are not in the palette.
  nativeCtx.imageSmoothingEnabled = false;
  layout();
  bindInput();
  enterAttract();
  requestAnimationFrame(frame);
}

boot();
