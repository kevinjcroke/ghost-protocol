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
  /* later boards re-tint the frame, the way Ms. Pac-Man's cabinets did.
     Frozen time has no bank of its own any more: stopped, the board is
     lifted off the glass and redrawn there (drawFrozenBoard), so nothing
     here ever has to stand for "frozen". */
  wall2:    '#21C851',
  wall3:    '#F09721',
};
PAL.frightW = PAL.white;   // the flash is plain white, not a second near-white

const HUNTER_DEFS = [
  { key: 'raze',  color: PAL.red,     name: 'RAZE',  nick: 'HAMMER'  },
  { key: 'mist',  color: PAL.magenta, name: 'MIST',  nick: 'SHADOW'  },
  { key: 'volt',  color: PAL.cyan,    name: 'VOLT',  nick: 'STATIC'  },
  { key: 'ember', color: PAL.orange,  name: 'EMBER', nick: 'CINDER'  },
];

/* ------------------------------- maze ----------------------------------
   Original layouts. 28x31. Mirror-symmetric.
   '#' wall  '.' dot  'o' energizer  ' ' open (no dot)  '-' den door
   Boards rotate as the levels climb; every board keeps the same den block,
   den exit, fruit seam, and evader spawn, so only the walls change.
------------------------------------------------------------------------- */

/* Board one: the den sits astride its only wrapping row, which matters more
   than it looks -- a tunnel row open across the full width would let an
   unordered hunter circle the board forever without ever meeting a wall, and
   the rule that an unordered hunter eventually stops dead is the whole game.
   Every straight run in here terminates in a wall. */
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
  '#..........................#',
  '#.####.##.###--###.##.####.#',
  '#.####.##.#      #.##.####.#',
  ' ......##.#      #.##...... ',
  '#.####.##.#      #.##.####.#',
  '#.####.##.########.##.####.#',
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

/* Board two: the den-row tunnel closes and two new ones open above and
   below it, so the flanking runs move away from the den's doorstep. */
const MAZE_SRC_2 = [
  '############################',
  '#..........................#',
  '#.##.###.###.##.###.###.##.#',
  '#o##.###.###.##.###.###.##o#',
  '#.##.###.###.##.###.###.##.#',
  '#..........................#',
  '#.####.#####.##.#####.####.#',
  '#.####.#####.##.#####.####.#',
  ' ......##....##....##...... ',
  '#.####.##.##.##.##.##.####.#',
  '#.####.##.##.##.##.##.####.#',
  '#..........................#',
  '#.##.####.###--###.####.##.#',
  '#.##.####.#      #.####.##.#',
  '#.........#      #.........#',
  '#.##.####.#      #.####.##.#',
  '#.##.####.########.####.##.#',
  '#..........................#',
  '#.####.##.##.##.##.##.####.#',
  '#.####.##.##.##.##.##.####.#',
  ' ......##....##....##...... ',
  '#.####.#####.##.#####.####.#',
  '#.####.#####.##.#####.####.#',
  '#..........................#',
  '#.##.###.###.##.###.###.##.#',
  '#o##.###.###.##.###.###.##o#',
  '#.##.###.###.##.###.###.##.#',
  '#..........................#',
  '#.####.#####.##.#####.####.#',
  '#..........................#',
  '############################',
];

/* Board three: three tunnels, den row included. The most porous board --
   by the time it appears the player can steer four hunters at once and the
   evader needs every side door he can get. */
const MAZE_SRC_3 = [
  '############################',
  '#............##............#',
  '#.##.#.##.##.##.##.##.#.##.#',
  '#o##.#.##.##.##.##.##.#.##o#',
  '#.##.#.##.##.##.##.##.#.##.#',
  ' ......##....##....##...... ',
  '#.####.##.##.##.##.##.####.#',
  '#.####.##.##.##.##.##.####.#',
  '#..........................#',
  '#.####.#####.##.#####.####.#',
  '#.####.#####.##.#####.####.#',
  '#..........................#',
  '#.####.##.###--###.##.####.#',
  '#.####.##.#      #.##.####.#',
  ' ......##.#      #.##...... ',
  '#.####.##.#      #.##.####.#',
  '#.####.##.########.##.####.#',
  '#..........................#',
  '#.####.#####.##.#####.####.#',
  '#.####.#####.##.#####.####.#',
  '#..........................#',
  '#.###.##.###.##.###.##.###.#',
  '#.###.##.###.##.###.##.###.#',
  ' .....##............##..... ',
  '#.###.##.###.##.###.##.###.#',
  '#o###.##.###.##.###.##.###o#',
  '#.###.##.###.##.###.##.###.#',
  '#..........................#',
  '#.####.#####.##.#####.####.#',
  '#..........................#',
  '############################',
];

/* Every tunnel row keeps a wall somewhere on it (board one uses the den
   itself), because an unbroken wrap row would let an unordered hunter circle
   forever and quietly repeal the wall-stop rule. test/no-infinite-lanes.js
   walks every board to hold that line. */
const BOARDS = [
  { src: MAZE_SRC,   tunnels: [14],         wall: PAL.wall },
  { src: MAZE_SRC_2, tunnels: [8, 20],      wall: PAL.wall2 },
  { src: MAZE_SRC_3, tunnels: [5, 14, 23],  wall: PAL.wall3 },
];

let TUNNEL_ROWS = BOARDS[0].tunnels;
let boardIdx = -1;

/* Ms. Pac-Man's rotation, roughly: the opener gets two levels, each later
   board a little longer, then the two tunnel-heavy boards alternate. */
function boardForLevel(n) {
  if (n <= 2) return 0;
  if (n <= 5) return 1;
  if (n <= 9) return 2;
  return Math.floor((n - 10) / 4) % 2 === 0 ? 1 : 2;
}

function setBoard(i) {
  if (i === boardIdx) return;
  boardIdx = i;
  TUNNEL_ROWS = BOARDS[i].tunnels;
  buildMaze();
  buildWallDistance();
  mazeLayer = renderMazeLayer(BOARDS[i].wall, PAL.door);
  mazeLayerWhite = renderMazeLayer(PAL.white, PAL.white);
  frozenCache.key = null;   // the frozen board's walls are this board's too
}
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
  const src = BOARDS[boardIdx].src;
  walls = []; dots = []; dotTotal = 0;
  for (let r = 0; r < MAZE_ROWS; r++) {
    const wrow = [], drow = [];
    for (let c = 0; c < COLS; c++) {
      const ch = src[r][c];
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
    /* The face keeps the hunter's own colour. The original made frightened
       ghosts identical to blind the player chasing them; here the frightened
       ones ARE the player's units, so identity has to survive the blue. */
    g.fillStyle = color;
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
    bank.boost = {};
    DIR_NAMES.forEach(d => {
      bank.normal[d] = [renderHunterFrame(h.color, 0, d, 'normal'),
                        renderHunterFrame(h.color, 1, d, 'normal')];
      // overdrive flash frame: same ghost, body burning white
      bank.boost[d] = [renderHunterFrame(PAL.white, 0, d, 'normal'),
                       renderHunterFrame(PAL.white, 1, d, 'normal')];
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
  forceAudible: false,

  /* The attract demo is a silent movie. It runs the real game loop, so it
     emits real chomps and a real siren -- inaudible only because nothing
     has created the AudioContext yet. The moment the player touches any
     control (which is what unlocks audio), the demo starts narrating
     itself over the attract screen. So the board is gated on the demo
     flag, not on luck. UI feedback answers the player directly and plays
     regardless. */
  quiet() {
    return this.muted
      || (!this.forceAudible && typeof game !== 'undefined' && game.demo);
  },
  uiBlip(f0, f1, dur, type, vol, when) {
    const was = this.forceAudible;
    this.forceAudible = true;
    this.blip(f0, f1, dur, type, vol, when);
    this.forceAudible = was;
  },

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
    if (!this.ctx || this.quiet()) return;
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
    if (!this.ctx || this.quiet()) return;
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
    this.sirenGain.gain.value = this.quiet() ? 0 : 0.035;
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
  /* Scheduled, never written through .value: a direct write loses to any
     ramp still queued on the param, and the tape ramps below queue them.
     Mixing the two is how a quick freeze-thaw-freeze left the siren stuck
     silent or an octave flat. */
  setSirenAudible(on) {
    if (!this.sirenGain) return;
    const g = this.sirenGain.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime((on && !this.quiet()) ? 0.035 : 0, t);
  },
  /* Ramp from wherever the param actually is right now, so a ramp that
     interrupts another picks up mid-slide instead of jumping. */
  rampParam(p, to, dur) {
    const t = this.ctx.currentTime, from = p.value;
    p.cancelScheduledValues(t);
    p.setValueAtTime(from, t);
    p.linearRampToValueAtTime(to, t + dur);
  },
  /* Stopping time is heard as a reel stopping: the siren is not cut, it
     sags more than an octave and runs out of breath in 180ms. It sits under
     the freeze blip, which stays the click's own sound. Detune rides on top
     of tickSiren's frequency sweep, so the two never fight over a param. */
  tapeStop() {
    if (!this.ctx || !this.siren) return;
    this.rampParam(this.siren.detune, -1400, 0.18);
    this.rampParam(this.sirenGain.gain, 0, 0.18);
  },
  /* And the reel coming back up to speed. The siren only returns if the
     board would be playing it -- not under fright, not muted, not in the
     silent demo -- but the pitch always comes home, so a siren restored
     later never starts out an octave flat. */
  tapeStart(audible) {
    if (!this.ctx || !this.siren) return;
    this.rampParam(this.siren.detune, 0, 0.15);
    this.rampParam(this.sirenGain.gain, (audible && !this.quiet()) ? 0.035 : 0, 0.04);
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
  /* A ghost in the den has its body back and can go. Two soft rising
     notes, well under the siren: a cue, not an alarm -- the game does not
     stop for it. */
  denReady() {
    this.blip(520, 520, 0.05, 'triangle', 0.05);
    this.blip(780, 780, 0.07, 'triangle', 0.05, this.ctx && this.ctx.currentTime + 0.06);
  },
  /* Sent home, a ghost goes through the door with a short low clunk: a
     latch, not a death. The eaten go in silently -- their eyes have been
     pulsing all the way home, and that already says who they are. */
  denDoor() {
    const t = this.ctx && this.ctx.currentTime;
    this.blip(170, 60, 0.08, 'square', 0.09, t);
    this.noiseBurst(0.035, 0.07, t && t + 0.004);
  },
  hunterLost() {  // our ghost dissolves — the reversed death spiral
    if (!this.ctx || this.quiet()) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 10; i++) {
      this.blip(820 - i * 70, 700 - i * 65, 0.1, 'square', 0.12, t + i * 0.1);
    }
    this.noiseBurst(0.25, 0.12, t + 1.02);
  },
  capture() {  // we caught him
    if (!this.ctx || this.quiet()) return;
    const t = this.ctx.currentTime;
    [220, 330, 440, 660, 880].forEach((f, i) => this.blip(f, f * 1.4, 0.1, 'square', 0.14, t + i * 0.07));
    this.noiseBurst(0.35, 0.16, t + 0.4);
    this.blip(1200, 200, 0.5, 'sawtooth', 0.1, t + 0.42);
  },
  uiFreeze() { this.uiBlip(700, 350, 0.06, 'triangle', 0.1); },
  uiThaw() { this.uiBlip(350, 700, 0.06, 'triangle', 0.1); },
  uiCommit() { this.uiBlip(950, 950, 0.03, 'square', 0.08); },
  uiClear() { this.uiBlip(300, 140, 0.08, 'square', 0.07); },
  /* A refused PLAY: two dry ticks under the buzz, the sound of a control
     that is locked rather than broken. */
  uiRefuse() {
    if (!this.ctx) return;
    const was = this.forceAudible;
    this.forceAudible = true;
    const t = this.ctx.currentTime;
    this.blip(1800, 1800, 0.012, 'sine', 0.08, t);
    this.blip(1800, 1800, 0.012, 'sine', 0.08, t + 0.07);
    this.forceAudible = was;
  },

  /* The pincer read, heard: two notes up when the route in your hand
     starts meeting another ghost's, one soft note down when it stops. Quiet
     enough to sit under a long drag that wanders in and out of one. */
  uiPincerOn() {
    const t = this.ctx && this.ctx.currentTime;
    this.uiBlip(660, 700, 0.05, 'triangle', 0.05, t);
    this.uiBlip(990, 1040, 0.07, 'triangle', 0.05, t + 0.06);
  },
  uiPincerOff() { this.uiBlip(520, 390, 0.09, 'sine', 0.035); },

  /* Original start-of-round jingle (composed for this game), arranged in
     the 1980 arcade-intro idiom: a staccato square lead over a triangle
     bass that slides up into every note, one phrase answered by itself a
     whole step higher, then a chromatic run to a held top note. The
     grammar is the era's; the melody is ours. */
  jingle() {
    if (!this.ctx || this.quiet()) return;
    const t = this.ctx.currentTime + 0.05;
    const S = 0.13;  // sixteenth-note pulse
    const N = {
      C3: 130.8, D3: 146.8, E3: 164.8, F3: 174.6, G3: 196.0,
      E5: 659.3, F5: 698.5, Fs5: 740.0, G5: 784.0, Gs5: 830.6,
      A5: 880.0, B5: 987.8, C5: 523.3, C6: 1046.5, D5: 587.3,
      D6: 1174.7, E6: 1318.5, Fs6: 1480.0,
    };
    // phrase in C: climb root-fifth-octave-tenth, bounce back down
    const lead = [
      [N.C5, 0 * S, 0.10], [N.G5, 1 * S, 0.10], [N.C6, 2 * S, 0.10],
      [N.E6, 3 * S, 0.15], [N.C6, 4.5 * S, 0.10], [N.A5, 5.5 * S, 0.10],
      [N.G5, 6.5 * S, 0.20],
      // the same phrase, lifted a whole step to D
      [N.D5, 9 * S, 0.10], [N.A5, 10 * S, 0.10], [N.D6, 11 * S, 0.10],
      [N.Fs6, 12 * S, 0.15], [N.D6, 13.5 * S, 0.10], [N.B5, 14.5 * S, 0.10],
      [N.A5, 15.5 * S, 0.20],
      // rising chromatic run into the held top note
      [N.E5, 18 * S, 0.09], [N.F5, 19 * S, 0.09], [N.Fs5, 20 * S, 0.09],
      [N.G5, 21 * S, 0.09], [N.Gs5, 22 * S, 0.09], [N.A5, 23 * S, 0.09],
      [N.B5, 24 * S, 0.09], [N.C6, 25 * S, 0.50],
    ];
    lead.forEach(([f, at, d]) => this.blip(f, f, d, 'square', 0.11, t + at));
    // slap bass: every note slides up into its pitch from a fifth below
    const bass = [
      [N.C3, 0 * S, 0.22], [N.C3, 4.5 * S, 0.22],
      [N.D3, 9 * S, 0.22], [N.D3, 13.5 * S, 0.22],
      [N.E3, 18 * S, 0.18], [N.F3, 20 * S, 0.18], [N.G3, 22 * S, 0.18],
      [N.C3, 25 * S, 0.5],
    ];
    bass.forEach(([f, at, d]) => this.blip(f * 0.66, f, d, 'triangle', 0.17, t + at));
  },
  levelClear() {
    if (!this.ctx || this.quiet()) return;
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
/* Where each slot sits in the den, px x on the tcy(14) row. Four bodies
   cannot fit six tiles without touching, so they share the width evenly
   -- a couple of px of overlap, never a whole ghost hidden behind
   another, because the den is now a place the player reads: who is still
   eyes, who is charged and waiting. RAZE only ever sits here after it
   has been home. */
const DEN_SEATS = [106, 94, 118, 130];
const BOOST_SPEED = 1.22;       // prize overdrive, as a multiple of hunting speed
const BOOST_TICKS = 480;        // and how long it lasts: 8 seconds
/* The slow stretch of a tunnel row: the mouths and the wrap zone beyond. */
function inTunnelAt(c, r) {
  return TUNNEL_ROWS.includes(r) && (c <= 6 || c >= 21);
}

class Hunter {
  constructor(def, slot) {
    this.def = def;
    this.key = def.key;
    this.color = def.color;
    this.slot = slot;           // 0 starts outside, 1..3 in den
    this.seatX = DEN_SEATS[slot];
    this.reset();
  }
  reset() {
    this.state = this.slot === 0 ? 'active' : 'idle';
    this.bob = this.slot * 20;
    this.dir = this.slot === 0 ? 'left' : null;
    if (this.slot === 0) {
      this.x = DEN_EXIT_X; this.y = tcy(DEN_EXIT_ROW);
      this.script = [{ x: DEN_EXIT_X - 4, y: tcy(DEN_EXIT_ROW) }];
      this.state = 'exiting'; this.exitHeading = 'left';
    } else {
      this.x = this.seatX; this.y = tcy(14);
    }
    this.path = null;           // {tiles:[{c,r}], closed, idx}
    this.speed = 0;
    this.boostT = 0;            // prize overdrive ticks
    this.frame = 0; this.animT = 0;
    this.respawnT = 0;
    this.needsOrders = false;
    this.campT = 0;
    this.overdue = false;
    this.eaten = false;         // struck, and not yet whole again: see isEyes
    this.readyAt = -1;          // game.tick it last got its body back in the den
    this.dissolveT = -1;
    this.frightImmune = false;  // set on every den exit; only a fresh energizer clears it
    /* RAZE's walk out at the start of a life: the one trip out of the den
       nobody ordered. Spent the moment it lands on the board. */
    this.opening = this.slot === 0;
    this.turnedBack = false;    // going back to its seat, never having left
  }
  tile() { return tileOfPx(this.x, this.y); }
  isThreat() { return this.state === 'active'; }
  /* A hunter waiting in the den can still be given orders -- a route is
     the only thing that lets it out, and one drawn while it is still eyes
     waits with it. Refusing the click reads as a dead control. */
  isCommandable() { return this.state !== 'dissolving' && this.state !== 'eyes'; }
  /* Bare eyes, no body: walking home after he ate it, going in, and the
     whole respawn wait in the den ('respawn' is only ever reached eaten).
     A ghost sent home on orders goes in through the same enteringDen with
     its body on, so for that one state it is the flag that decides. */
  isEyes() {
    return this.state === 'eyes' || this.state === 'respawn'
        || (this.state === 'enteringDen' && this.eaten);
  }
  /* Sitting in the den, whole, charged and waiting for a route out. */
  isReady() { return this.state === 'idle'; }
  /* Which way it looks, for drawing only. In the den the eyes do the
     telling: a ghost that can go watches the door above it, and eyes
     sitting out the wait look at the floor. update() never reads this;
     it steers by dir. */
  face() {
    if (this.state === 'idle') return 'up';
    if (this.state === 'respawn') return 'down';
    return this.dir || 'left';
  }
  inDenStates() {
    return this.state === 'idle' || this.state === 'respawn'
        || this.state === 'enteringDen' || this.state === 'exitingDen'
        || this.state === 'exiting';
  }

  clearOrder() { this.path = null; }
  setOrder(tiles, closed) {
    this.campT = 0;
    this.overdue = false;
    this.path = { tiles: tiles.slice(), closed, idx: 0 };
    /* A route that ends on the den door is a trip home. Read off the tiles
       rather than passed in, so every author of an order agrees on it. */
    const last = tiles[tiles.length - 1];
    this.path.home = !closed && !!last && isDoor(last.c, last.r);
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
        else { this.path = null; return; }  // run off the end: coast on heading
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
    /* Stopped dead with no order: the camp clock (in update) decides when
       the game intervenes. Camping is legal up to the player's limit. */
  }

  update(game) {
    this.animT++;
    if (this.animT % 8 === 0) this.frame ^= 1;

    /* The den lets nobody out on a timer. A ghost in here leaves when it
       has a route and not before: the route IS the release. Waiting is
       legal for as long as the player likes -- a charged ghost held
       inside is an ambush -- so nothing here counts toward the camp
       limit, and nothing on the board treats it as a statue. */
    if (this.state === 'idle') {
      this.bob++;
      this.y = tcy(14) + Math.round(Math.sin(this.bob / 12) * 2);
      if (this.path) this.beginExit();
      return;
    }
    /* The route is the release all the way out, not just at the first
       step. Erased while the ghost is still on its way -- a freeze and a
       right-drag can land in the half-second it takes -- it goes back to
       its seat rather than out on a heading nobody drew. RAZE's opening
       walk is the one exit that never needed a route. */
    if ((this.state === 'exitingDen' || this.state === 'exiting')
        && !this.path && !this.opening) {
      this.state = 'enteringDen';
      this.turnedBack = true;
      return;
    }
    if (this.state === 'exitingDen') {
      // slide to seam, rise through the door -- at hunting speed, not a shuffle
      const spd = 1.2;
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
        }
      }
      return;
    }
    if (this.state === 'exiting') {
      /* Slide off the door seam onto the grid. With an order queued, land
         exactly on the trail's anchor tile so the order survives the trip
         out -- landing a tile away silently voided it. Without one this is
         RAZE's opening: a step along the row toward its side and a coast,
         the way every life has always begun. */
      const hasOrder = !!this.path;
      const targetC = hasOrder ? DOOR_C0 : (this.exitHeading === 'left' ? 12 : 15);
      const targetX = tcx(targetC);
      const spd = 1.2;
      this.dir = this.x < targetX ? 'right' : 'left';
      if (Math.abs(this.x - targetX) > spd) this.x += Math.sign(targetX - this.x) * spd;
      else {
        this.x = targetX;
        this.state = 'active';
        this.opening = false;
        /* Classic den rule: leaving the den always sheds the blue. A ghost
           eaten and walked home re-emerges as a hunter even if the fright
           clock is still running; only a fresh energizer re-blues it. */
        this.frightImmune = true;
        // with an order the trail decides; without one, drift off along the
        // crossing so the parked statue ends up at the wall, not the door
        this.dir = hasOrder ? null : this.exitHeading;
      }
      return;
    }
    if (this.state === 'eyes') {
      this.speed = game.params.eyeSpeed;
      const t = this.tile();
      /* Hand off on tile arrival alone. Eyes eaten mid-stride start off
         tile center, and a route that ends where it began never moves them
         back onto it -- demanding sub-pixel alignment here stranded them
         on the doorstep. enteringDen re-centers both axes itself. */
      if (t.c === EYE_TARGET.c && t.r === EYE_TARGET.r) {
        this.state = 'enteringDen';
        this.eaten = true;    // eyes go in as eyes, however they got here
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
      // onto the seam, down through the door, then along to its own seat
      const spd = 1.0;
      if (this.y < tcy(14)) {
        if (Math.abs(this.x - DEN_EXIT_X) > spd) { this.x += Math.sign(DEN_EXIT_X - this.x) * spd; this.dir = this.x < DEN_EXIT_X ? 'right' : 'left'; }
        else { this.x = DEN_EXIT_X; this.y = Math.min(tcy(14), this.y + spd); this.dir = 'down'; }
      } else if (Math.abs(this.x - this.seatX) > spd) {
        this.x += Math.sign(this.seatX - this.x) * spd;
        this.dir = this.x < this.seatX ? 'right' : 'left';
      } else {
        this.x = this.seatX; this.y = tcy(14);
        this.bob = 0;
        this.dir = null;
        /* Eaten, it sits the respawn wait out as eyes. Sent home, it is
           whole the moment it is in: the walk was the whole price. Turned
           back on the way out, it never stopped being ready. */
        if (this.eaten) {
          this.state = 'respawn';
          this.respawnT = game.params.respawnTicks;
        } else this.becomeReady(game);
      }
      return;
    }
    if (this.state === 'respawn') {
      this.bob++;
      this.y = tcy(14) + Math.round(Math.sin(this.bob / 12) * 2);
      if (--this.respawnT <= 0) this.becomeReady(game);
      return;
    }
    if (this.state !== 'active') return;

    // active
    /* A route home hands off the moment the ghost reaches the doorstep
       tile -- on arrival, as the eyes do, not at its centre -- and it is
       in the den's hands from that tick: not food, not parked. Checked
       before and after the step, so the tick a blue one arrives is already
       the tick it is safe; a collision check that runs after the hunters
       move can never catch it half-handed-off. A lethal one stays lethal
       until it is through the door: see doorstepThreat. */
    if (this.atDoorstep()) { this.goHome(); return; }
    if (this.boostT > 0) this.boostT--;
    /* The camp clock. Standing parked is legal up to the player's limit;
       past it, this ghost goes overdue: the game freezes and will not
       resume until it has orders. Limit null means camping is always fine
       -- the original cruelty rule, undiluted. */
    if (!this.path && !this.dir) {
      this.campT++;
      if (game.campLimit !== null && this.campT >= game.campLimit && !this.overdue) {
        this.overdue = true;
        this.needsOrders = true;
      }
    } else {
      this.campT = 0;
      this.overdue = false;
    }
    const fright = game.frightT > 0 && !this.frightImmune;
    const t = this.tile();
    this.speed = fright ? game.params.hunterFrightSpeed
               : inTunnelAt(t.c, t.r) ? game.params.hunterTunnelSpeed
               : game.params.hunterSpeed;
    if (this.boostT > 0 && !fright) this.speed *= BOOST_SPEED;   // prize overdrive
    stepEntity(this, (e, ws) => this.decide(e, ws));
    if (this.atDoorstep()) this.goHome();
  }

  /* On a route home, standing on the tile above the door with nothing
     left to walk but the door itself. The door is always the last tile
     and the doorstep the one before it: Draw builds them no other way. */
  atDoorstep() {
    const p = this.path;
    if (!p || !p.home) return false;
    const n = p.tiles.length, step = p.tiles[n - 2];
    if (!step || p.idx < n - 2) return false;
    const t = this.tile();
    return t.c === step.c && t.r === step.r;
  }
  /* Going in on orders, whole and not blue, and still on the doorstep row:
     the slide along to the seam happens out on the board, where he can
     walk into it. Protecting a blue ghost from the arrival tick is the
     point of the hand-off; letting a hunting one pass through him on the
     doorstep would break touch = capture for one tile of the maze, and
     a route a tile longer would have caught him. Once it starts down
     through the door it is inside, where he cannot follow. */
  doorstepThreat(game) {
    return this.state === 'enteringDen' && !this.eaten && !this.turnedBack
        && this.tile().r <= DEN_EXIT_ROW && !(game.frightT > 0 && !this.frightImmune);
  }
  /* Arriving home on orders. Its route is spent -- reaching the door is
     the order completed, not an order run dry, so nothing asks for more
     and no coast follows. Overdrive does not bank in here: the den
     recharges a ghost's bite, not the prize. */
  goHome() {
    this.state = 'enteringDen';
    Sound.denDoor();
    this.path = null;
    this.dir = null;
    this.boostT = 0;
    this.campT = 0;
    this.overdue = false;
    this.needsOrders = false;
  }
  /* Whole again, in the den, and free to leave the moment it has a route
     -- including one drawn while it was still eyes, which goes now. */
  becomeReady(game) {
    this.state = 'idle';
    this.eaten = false;
    this.bob = 0;
    /* The chime says a ghost has come back into charge. One that only
       went back to its seat was charged all along, so it sits down quiet. */
    if (!this.turnedBack) {
      this.readyAt = game.tick;
      Sound.denReady();
    }
    this.turnedBack = false;
    if (this.path) this.beginExit();
  }

  beginExit() {
    this.state = 'exitingDen';
    this.dir = 'up';
    // any order queued while it waited survives the trip out
  }

  /* Ticks until this ghost is out on the row above the door and hunting,
     if it left at the first chance: worked out from the den choreography
     in update() -- same speeds, same legs, right to a tick or two -- not
     guessed. A ghost still going in counts the rest of the way in too.
     -1 for anything that is not a whole ghost in the den: out on the
     board, or eyes, which cannot leave before the wait is over whatever
     is drawn for them. The evader's respect for the door is built on it. */
  emergeTicks() {
    const s = this.state;
    if (s === 'active' || this.isEyes()) return -1;
    // only RAZE's opening walk ever lands anywhere but the anchor tile
    const land = !this.path && this.opening
      ? tcx(this.exitHeading === 'left' ? 12 : 15) : tcx(DOOR_C0);
    const slide = (x) => Math.ceil(Math.abs(land - x) / 1.2);
    const out = (x, y) => Math.ceil(Math.abs(DEN_EXIT_X - x) / 1.2)
      + Math.ceil((y - tcy(DEN_EXIT_ROW)) / 1.2) + slide(DEN_EXIT_X);
    if (s === 'exiting') return slide(this.x);
    if (s === 'exitingDen') return out(this.x, this.y);
    if (s === 'idle') return out(this.x, this.y);
    if (s === 'enteringDen') {
      const inside = this.y < tcy(14)
        ? Math.abs(DEN_EXIT_X - this.x) + (tcy(14) - this.y) + Math.abs(this.seatX - DEN_EXIT_X)
        : Math.abs(this.seatX - this.x);
      return Math.ceil(inside) + out(this.seatX, tcy(14));
    }
    return -1;
  }

  /* struck while frightened */
  dissolve() {
    this.state = 'dissolving';
    this.dissolveT = 0;
    this.path = null;
    this.eaten = true;
    this.boostT = 0;      // the den never banks overdrive, eaten or sent
  }

  draw(g, game) {
    const x = Math.round(this.x - 8), y = Math.round(this.y - 8) + HUD_TOP * TILE;
    const bank = SPRITES.hunters[this.key];
    if (this.state === 'dissolving') {
      const f = Math.min(5, this.dissolveT / 6 | 0);
      g.drawImage(SPRITES.dissolve[this.key][f], x, y);
      return;
    }
    if (this.isEyes()) {
      g.drawImage(bank.eyes[this.face()], x, y);
      return;
    }
    // only a ghost out on the board is ever blue; the den keeps its colour
    const fright = game.frightT > 0 && !this.frightImmune && this.state === 'active';
    if (fright) {
      const flashing = game.frightT < 120 && ((game.frightT / 12 | 0) % 2 === 0);
      const arr = flashing ? bank.frightFlash : bank.fright;
      g.drawImage(arr[this.frame], x, y);
    } else if (this.boostT > 0 && (uiFrame / 4 | 0) % 2 === 0) {
      // supercharged: rapid flash between its own colour and white-hot
      g.drawImage(bank.boost[this.dir || 'left'][this.frame], x, y);
    } else {
      g.drawImage(bank.normal[this.face()][this.frame], x, y);
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
/* distance grid from a start tile (through corridors, den excluded). The
   start may be a list: distance to the nearest of several is one flood,
   not a min over floods (the den has two exit tiles). */
function bfsDistFrom(start) {
  const dist = new Int16Array(COLS * MAZE_ROWS).fill(-1);
  const q = Array.isArray(start) ? start.slice() : [start];
  for (const s of q) dist[s.r * COLS + s.c] = 0;
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
  sticky: false,    // selection came from a button/key, not a click on the pile
  tapAdvances: false, // this press landed on the ghost already held

  /* Selection made out-of-band -- roster button, number key, Tab, the game
     itself. Sticky: the next tap on a pile holding this ghost keeps it
     rather than stepping past it. You already said which ghost you meant. */
  select(i) {
    this.selected = i;
    this.sticky = true;
  },

  /* Everyone commandable within reach of a point. If several are truly
     stacked, the pile is just them; otherwise nearest-first. A fingertip's
     contact patch is wider than 12px of glass, so touch reaches further --
     and the error that buys is the safe one: a near-miss selects a ghost
     instead of falling through to empty floor, where a tap means "go" and
     the round restarts under a hand that was aiming at the pile. */
  poolAt(px, py) {
    const reach = touchMode ? 18 : 12;
    const near = [];
    game.hunters.forEach((h, i) => {
      if (!h.isCommandable()) return;
      const dx = h.x - px, dy = h.y - py;
      const d2 = dx * dx + dy * dy;
      if (d2 < reach * reach) near.push({ h, i, d2 });
    });
    near.sort((a, b) => a.d2 - b.d2);
    const stacked = near.filter(n => n.d2 < 64);
    return stacked.length > 1 ? stacked : near;
  },

  /* Ghosts pile up -- three of them leave the den on the same tile, and a
     click can only ever land on one. The gesture disambiguates: a press
     grabs the ghost you already hold if it is here (else the nearest), so
     dragging always commands the ghost you can see on top; TAPPING --
     press and release without a drag -- steps through the pile (cycleAt).
     And every ghost keeps a permanent number that selects it outright. */
  pickAt(px, py) {
    const pool = this.poolAt(px, py);
    if (!pool.length) return null;
    const cur = pool.find(n => n.i === this.selected);
    const choice = cur || pool[0];
    // tapping the ghost you already held means "the next one down" --
    // unless you only just named it by button or number key
    this.tapAdvances = !!cur && !this.sticky;
    this.sticky = false;
    this.selected = choice.i;
    return choice.h;
  },

  /* The release half of a tap: no drag happened, so the press was a
     browse, not a command. Step to the next ghost under the cursor. */
  cycleAt(px, py) {
    if (!this.tapAdvances) return;
    this.tapAdvances = false;
    const pool = this.poolAt(px, py);
    if (pool.length < 2) return;
    const at = pool.findIndex(n => n.i === this.selected);
    if (at < 0) return;
    this.selected = pool[(at + 1) % pool.length].i;
  },

  begin(hunter) {
    const t = hunter.tile();
    const anchor = this.anchorFor(hunter);
    this.active = { hunter, tiles: [anchor], closable: false, home: false };
  },

  /* Pick up a committed route at its arrowhead and keep drawing. The trail
     resumes from what the ghost has NOT yet walked, so committing the
     extension keeps it seamlessly on course. */
  continueFrom(hunter) {
    const p = hunter.path;
    if (!p || p.closed || !p.tiles.length) return false;
    const remaining = p.tiles.slice(Math.max(0, p.idx - 1));
    if (!remaining.length) return false;
    this.active = { hunter, tiles: remaining.map(t => ({ c: t.c, r: t.r })), closable: false,
                    home: !!p.home };
    return true;
  },

  /* The committed open path whose tip sits under this point, if any. */
  tipAt(game, px, py) {
    // same courtesy as poolAt: an arrowhead is a smaller target than a
    // ghost, and a missed grab falls through to the tap that means "go"
    const reach = touchMode ? 14 : 8;
    let best = null;
    for (const h of game.hunters) {
      if (!h.path || h.path.closed || !h.path.tiles.length || !h.isCommandable()) continue;
      const tip = h.path.tiles[h.path.tiles.length - 1];
      const dx = tcx(tip.c) - px, dy = tcy(tip.r) - py;
      const d2 = dx * dx + dy * dy;
      if (d2 < reach * reach && (!best || d2 < best.d2)) best = { h, d2 };
    }
    return best ? best.h : null;
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
     forty-tile horseshoe they never drew.
     The den door is the one wall a route may end on: from the doorstep
     straight down onto either door tile, and that is the last step -- a
     tip on the door can only retract. It is how a ghost is sent home.
     A column past either edge (mc < 0 or mc >= COLS) is a pointer off the
     glass, and which tile it means depends on which way the route has
     been through the tunnel. So the tip carries an unwrapped column, u:
     the route's first column, plus one for every step right and minus one
     for every step left, seams included -- out of the right mouth is
     27 -> 28, not 27 -> 0. Each lap of the board is one span of COLS.
     - A route that has not been through (still on lap 0) reads the pointer
       from the half of the board the tip is on, not from the shorter way
       round: a pointer well past the right edge with the tip still short
       of the right mouth is ahead of it, and the shorter way round would
       have had it turn back across the board.
     - A route that HAS been through reads it from that instead. Out of the
       right mouth, a pointer past the right edge is out on the far side,
       on the route's own lap, and the tip stops at it however far along
       the far side it is. (Read from the tip's half of the board, a tip
       that came out and walked on past the middle looked not yet through,
       took the pointer for a whole lap ahead and ran off round the board
       after it -- through the tunnel a second time.) Past the LEFT edge,
       with the route out of the right mouth, is back the way it came.
     The pointer is held to within one board's width of the edge: past
     that there is no tile further out for it to mean, and no second lap. */
  extendToward(mc, mr) {
    const a = this.active;
    if (!a) return;
    if (mc >= COLS) mc = Math.min(mc, 2 * COLS - 1);
    else if (mc < 0) mc = Math.max(mc, -COLS);
    let u = a.tiles[0].c;
    for (let i = 1; i < a.tiles.length; i++) {
      const d = a.tiles[i].c - a.tiles[i - 1].c;
      u += d > 1 ? -1 : d < -1 ? 1 : d;               // a seam is one step
    }
    let guard = 0;
    while (guard++ < 40) {
      const tip = a.tiles[a.tiles.length - 1];
      const onDoor = isDoor(tip.c, tip.r);
      const lap = Math.floor(u / COLS);
      let dc;
      if (mc >= COLS) {
        dc = lap === 0 ? (tip.c >= COLS / 2 ? mc : mc - COLS) - tip.c
                       : mc + COLS * (lap < 0 ? lap : lap - 1) - u;
      } else if (mc < 0) {
        dc = lap === 0 ? (tip.c < COLS / 2 ? mc : mc + COLS) - tip.c
                       : mc + COLS * (lap > 0 ? lap : lap + 1) - u;
      } else {
        dc = mc - tip.c;
        if (dc > COLS / 2) dc -= COLS;
        if (dc < -COLS / 2) dc += COLS;
      }
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
        const prev = a.tiles.length >= 2 ? a.tiles[a.tiles.length - 2] : null;
        const back = !!prev && prev.c === nc && prev.r === nr;
        if (onDoor && !back) continue;              // home is terminal
        /* Stepping home from the doorstep. Not as a route's first step
           for a ghost still in the den, though: out and straight back in
           is no order at all, and would spend its den exit on nothing. */
        const home = isDoor(nc, nr) && s.y === 1 && tip.r === DEN_EXIT_ROW
          && !(a.tiles.length === 1 && a.hunter.inDenStates());
        if (!home && (!isOpen(nc, nr) || inDen(nc, nr))) continue;
        if (back) a.tiles.pop();                    // retract
        else a.tiles.push({ c: nc, r: nr });
        u += s.x;
        stepped = true;
        break;
      }
      if (!stepped) break;            // hemmed in: the tip waits
    }
    const tip = a.tiles[a.tiles.length - 1];
    a.home = isDoor(tip.c, tip.r);
    // a route home ends inside the den, so it can never be a patrol
    a.closable = !a.home && a.tiles.length >= 5
      && tip.c === a.tiles[0].c && tip.r === a.tiles[0].r;
  },

  commit(dragMoved) {
    const a = this.active;
    this.active = null;
    if (!a) return;
    if (a.tiles.length < 2) {
      /* Nothing was drawn, so nothing changes. A bare click's whole job is
         selecting (and cycling a pile); there is no clear gesture at all --
         drawing a new order IS the clear. Destructive actions must never
         share a gesture with browsing ones. */
      return;
    }
    let tiles = a.tiles;
    let closed = false;
    if (a.closable) {
      tiles = tiles.slice(0, tiles.length - 1);   // drop dup start tile
      closed = true;
    }
    // read before the order lands: a route is what lets a den ghost go
    const wasDen = a.hunter.state === 'idle' || a.hunter.state === 'respawn';
    a.hunter.setOrder(tiles, closed);
    Sound.uiCommit();
    if (game.drill) drillOnCommit(game.hunters.indexOf(a.hunter), wasDen);
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
    h.path.home = false;     // whatever was cut, the door was the last tile
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
  if (isDoor(tip.c, tip.r)) return [];   // a route home ends in the den: no coast
  let dc = tip.c - back.c, dr = tip.r - back.r;
  if (dc > 1) dc = -1; if (dc < -1) dc = 1;
  if (!dc && !dr) return [];
  return driftTiles(tip, dc === 1 ? 'right' : dc === -1 ? 'left' : dr === 1 ? 'down' : 'up');
}

/* The same coast for a ghost already drifting: every tile it will still
   cross on `dir` before the wall stops it, the one it stops on last.
   Tiles are the maze's own, so a trip through the wrap zone counts the
   cells you can see. A ghost standing in the wrap zone itself is taken
   to be about to re-enter on the side it is heading for. */
function driftTiles(tile, dir) {
  const d = DIRS[dir];
  if (!d) return [];
  let c = tile.c, r = tile.r, guard = 0;
  if (c < 0 || c >= COLS) c = d.x < 0 ? COLS : -1;
  const out = [];
  while (guard++ < 40) {
    const nc = wrapCol(c + d.x), nr = r + d.y;
    if (!isOpen(nc, nr) || inDen(nc, nr)) break;
    out.push({ c: nc, r: nr });
    c = nc; r = nr;
  }
  return out;
}

/* How long a hunter takes, in ticks, to walk tiles[from..] from where it
   stands -- or with `lap`, one full circuit of a closed order starting
   now. Walked at the speeds update() will actually pick: the tunnel
   mouths slow it, overdrive lifts it until boostT runs out, fright drags
   it until frightT does. The glass prints this as a promise, so it is
   worked out the way the machine will do it, not from a flat rate. */
function orderTicks(h, tiles, from, lap, short) {
  const P = game.params;
  const cut = short || 0;   // px shy of the last tile's centre where the walk ends
  const boostEnd = h.boostT;
  const frightEnd = h.frightImmune ? 0 : game.frightT;
  let t = 0;
  const walk = (len, tunnel) => {
    for (let guard = 0; len > 1e-6 && guard < 8; guard++) {
      const fright = t < frightEnd;
      let v = fright ? P.hunterFrightSpeed : tunnel ? P.hunterTunnelSpeed : P.hunterSpeed;
      if (!fright && t < boostEnd) v *= BOOST_SPEED;
      let edge = Infinity;
      if (t < frightEnd) edge = frightEnd;
      if (t < boostEnd) edge = Math.min(edge, boostEnd);
      const dt = Math.min(len / v, edge - t);
      len -= v * dt; t += dt;
    }
  };
  // half of each step is spent in the tile it leaves, half in the next;
  // a step across the seam runs the whole wrap zone, two tiles, all tunnel
  const step = (a, b, end) => {
    const off = end ? cut : 0;
    if (Math.abs(b.c - a.c) > 1) { walk(TILE * 2 - off, true); return; }
    walk(TILE / 2, inTunnelAt(a.c, a.r));
    walk(TILE / 2 - off, inTunnelAt(b.c, b.r));
  };
  const n = tiles.length;
  if (lap) {
    for (let i = 0; i < n; i++) step(tiles[i], tiles[(i + 1) % n]);
    return t;
  }
  if (from >= n) return 0;
  // first leg: from the hunter's own position to the tile it is aiming at
  const here = h.tile(), goal = tiles[from];
  /* A ghost turns only on a tile centre. Ordered back the way it came
     before it has reached this one, it carries on to the centre first and
     only then turns round -- so that is the walk, not the straight line
     back, which would come up short by twice the distance still to go. */
  const d = DIRS[h.dir];
  const dc = Math.abs(goal.c - here.c);
  const nextDoor = goal.r === here.r ? dc === 1 || dc === COLS - 1
    : dc === 0 && Math.abs(goal.r - here.r) === 1;
  if (d && nextDoor) {
    const ahead = (tcx(here.c) - h.x) * d.x + (tcy(here.r) - h.y) * d.y;
    let gx = tcx(goal.c) - h.x;
    if (gx > NATIVE_W / 2) gx -= NATIVE_W + TILE;
    else if (gx < -NATIVE_W / 2) gx += NATIVE_W + TILE;
    if (ahead > 1e-6 && gx * d.x + (tcy(goal.r) - h.y) * d.y < 0) {
      walk(ahead, inTunnelAt(here.c, here.r));
      step(here, goal, from === n - 1);
      for (let i = from + 1; i < n; i++) step(tiles[i - 1], tiles[i], i === n - 1);
      return t;
    }
  }
  let dx = Math.abs(tcx(goal.c) - h.x);
  if (dx > NATIVE_W / 2) dx = NATIVE_W + TILE - dx;
  const len = dx + Math.abs(tcy(goal.r) - h.y);
  const inHere = Math.max(0, len - TILE / 2);
  const whole = from === n - 1 ? Math.max(0, len - cut) : len;
  walk(Math.min(inHere, whole), inTunnelAt(here.c, here.r));
  walk(whole - Math.min(inHere, whole), inTunnelAt(goal.c, goal.r));
  for (let i = from + 1; i < n; i++) step(tiles[i - 1], tiles[i], i === n - 1);
  return t;
}

/* How long an open order takes to be done. For a route home that is the
   doorstep, not the door the line is drawn to: the ghost hands itself to
   the den on arriving there, half a tile shy of the centre, and from that
   tick it is no longer walking anything you can time. */
function routeTicks(h, tiles, from) {
  const n = tiles.length;
  if (n >= 2 && isDoor(tiles[n - 1].c, tiles[n - 1].r)) {
    return from >= n - 1 ? 0 : orderTicks(h, tiles.slice(0, -1), from, false, TILE / 2);
  }
  return orderTicks(h, tiles, from, false);
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
  /* A route home does not point anywhere past the door; it ends in the
     den. So its tip is a cup, not an arrowhead: two posts and a floor
     standing on the door tile, open at the top where the line comes in. */
  const homeTip = !closed && tiles.length >= 2
    && isDoor(tiles[tiles.length - 1].c, tiles[tiles.length - 1].r);
  if (homeTip) {
    const tip = tiles[tiles.length - 1];
    const tx = tcx(tip.c), ty = tcy(tip.r) + yOff;
    g.fillStyle = color;
    g.fillRect(tx - 3, ty - 2, 1, 4);
    g.fillRect(tx + 3, ty - 2, 1, 4);
    g.fillRect(tx - 3, ty + 2, 7, 1);
  }
  // arrowhead at the tip pointing along the final segment
  if (!closed && !homeTip && tiles.length >= 2) {
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

/* The tiles a route's timing beads are laid along. A route home stops
   being a hunter at the doorstep -- the ghost hands itself to the den on
   arriving there -- so no bead, and no pincer, is promised past it. */
function beadWalk(tiles) {
  const n = tiles.length;
  return n >= 2 && isDoor(tiles[n - 1].c, tiles[n - 1].r) ? tiles.slice(0, -1) : tiles;
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
    const walk = src.closed ? src.tiles.concat([src.tiles[0]]) : beadWalk(src.tiles);
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
/* The pincer read is the same answer for everyone who asks within one
   frame, and it is not free (every trail against every other, bead by
   bead). render() opens a frame's worth of cache and closes it again, so
   a caller outside a render always gets the state as it stands now. */
let hotFrame = null, hotFrameOpen = false;
function hotBeadsNow() {
  if (!hotFrameOpen) return computeHotBeads(game);
  return hotFrame || (hotFrame = computeHotBeads(game));
}

/* ------------------------------ the evader ------------------------------
   He is not a wander-bot. He simulates your hunters' committed orders,
   scores escape corridors by threat margin and exit count, farms dots when
   safe, sprints for energizers when cornered, abuses the tunnels, and
   ignores any hunter you left parked and stupid.
------------------------------------------------------------------------- */

const HORIZON = 110;   // ticks of hunter future we bother predicting

/* The walk in from wherever a ghost going home stands, as enteringDen
   makes it -- a pixel a tick along to the seam, then down -- for as long
   as it is still on the doorstep row: the part of a trip home that is
   still out on the board (Hunter.doorstepThreat). One tile per tick. */
function doorSlide(x, y) {
  const out = [];
  while (out.length < HORIZON) {
    if (Math.abs(x - DEN_EXIT_X) > 1) x += Math.sign(DEN_EXIT_X - x);
    else { x = DEN_EXIT_X; y += 1; }
    const t = tileOfPx(x, y);
    if (t.r > DEN_EXIT_ROW) break;
    out.push(t.r * COLS + wrapCol(t.c));
  }
  return out;
}

/* Simulate a hunter's deterministic future; tile occupied at each tick.
   With `emerge` it is a den ghost holding a drawn route: -1 (off the
   board) until it is due out, then the route walked from the exit tile at
   hunting pace -- it comes out immune, so never at the blue crawl. */
function hunterFuture(h, game, emerge) {
  const out = [];
  const den = emerge !== undefined;
  if (!h.isThreat() && !den) return out;
  if (den) for (let t = 0; t < Math.min(emerge, HORIZON); t++) out.push(-1);
  const sim = {
    x: den ? tcx(DOOR_C0) : h.x, y: den ? tcy(DEN_EXIT_ROW) : h.y,
    dir: den ? null : h.dir,
    speed: den ? game.params.hunterSpeed : h.speed || game.params.hunterSpeed,
    path: h.path ? { tiles: h.path.tiles, closed: h.path.closed, idx: h.path.idx } : null,
    tile() { return tileOfPx(this.x, this.y); },
  };
  // a route home leaves the board through the door; there is no future past it
  const step = h.path && h.path.home ? h.path.tiles[h.path.tiles.length - 2] : null;
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
  for (let t = out.length; t < HORIZON; t++) {
    stepEntity(sim, decide);
    const tt = sim.tile();
    out.push(tt.r * COLS + wrapCol(tt.c));
    if (step && sim.path && sim.path.idx >= sim.path.tiles.length - 2
        && tt.c === step.c && tt.r === step.r) {
      // it hands off here, then walks the rest of the doorstep row going in
      for (const k of doorSlide(sim.x, sim.y)) if (out.length < HORIZON) out.push(k);
      break;
    }
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
    this.fleeGrid = null;
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
    /* Adrenaline: with exactly one moving hunter on him he sprints -- a
       lone chaser must never be enough, by arithmetic and not just hope.
       The instant a second hunter is moving the edge is gone, which is the
       whole design said as a speed table: pincers work, pursuit does not.
       (fleeGrid is maintained by decide(): set iff one moving threat.) */
    const adrenaline = this.fleeGrid ? 1.09 : 1;
    this.speed = adrenaline * (fright ? game.params.evaderFrightSpeed
               : inTunnel ? game.params.evaderSpeed          // he owns the tunnels
               : game.params.evaderSpeed * (1 + game.boldness() * 0.06));
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
    /* Against exactly one moving pursuer, pure flight is optimal: hold a
       gradient away from it and no lone chaser can ever close. The margin
       scoring only approximates this, capped and diluted by snack value,
       which is why a relentless single hunter used to grind him down. */
    this.fleeGrid = null;
    let movingThreats = 0;
    for (let i = 0; i < game.hunters.length; i++) {
      const h = game.hunters[i];
      if (!h.isThreat() || (!h.path && !h.dir)) continue;
      // edible bodies are not chasers; a den-fresh immune hunter still is
      if (game.frightT > 0 && !h.frightImmune) continue;
      const dg = game.hunterDistGrids[i];
      const d = dg ? dg[t.r * COLS + wrapCol(t.c)] : -1;
      if (d >= 0 && d < 22) { movingThreats++; this.fleeGrid = dg; }
    }
    if (movingThreats !== 1) this.fleeGrid = null;

    /* Never step onto a statue -- and that outranks the no-reverse rule.
       At the last tile of a sealed cul-de-sac the only forward option IS
       the statue, and refusing to reverse there meant walking into it. */
    const isParked = (o) =>
      game.parkedTiles && game.parkedTiles.has(o.r * COLS + wrapCol(o.c));
    const notParked = cands.filter(o => !isParked(o));
    if (notParked.length) cands = notParked;
    else {
      const anySafe = opts.filter(o => !isParked(o));
      if (anySafe.length) cands = anySafe;   // turn around rather than die
    }

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
    const tt = Math.min(HORIZON - 1, Math.round(ticks));
    /* Occupied on/near our arrival tick? The level-scaled horizon is how
       deep he reads your DRAWN orders -- the mind-reading feel. But basic
       reflexes are not a difficulty setting: half a second of "that
       hunter is coming down this corridor" applies at every level, or a
       lone chaser beats him at exactly the levels meant to be gentle. */
    const foresee = (fut) => {
      if (tt >= Math.max(30, game.params.horizon)) return;
      for (let w = -3; w <= 3; w++) {
        const k = tt + w;
        if (k >= 0 && k < fut.length && fut[k] === idx) worst = Math.min(worst, Math.abs(w));
      }
    };
    for (let i = 0; i < game.hunters.length; i++) {
      const h = game.hunters[i];
      const den = game.denWatch[i];
      if (den) {
        /* A whole ghost in the den. It comes out immune, so fright is no
           excuse here -- that is the ambush. With a route drawn it is an
           order like any other: he reads it, and he respects how fast it
           could reach him once out (the same pursuit fallback as a hunter
           on the board, started late). With no route it is only a charged
           ghost that COULD be sent at him. During fright that possibility
           is a threat his energizer does not cancel, so then, and only
           then, he respects it -- as a fact about distance to the
           door: like a statue, it does not advance while he walks, so it
           guards the corridor outside the door without turning the far
           board into a no-go.
           The slack is his naivety: wide on the early boards, where the
           ambush is the lesson, and gone by the seventh. What he never
           gets is a guess at a route you have not drawn. */
        const hd = game.doorDist ? game.doorDist[idx] : -1;
        const out = hd * (TILE / game.params.hunterSpeed) + den.eta;
        // a route out, or the walk in while it is still on the doorstep row
        foresee(game.hunterFutures[i]);
        if (den.committed) {
          if (hd >= 0) worst = Math.min(worst, Math.max(0, out - ticks));
        } else if (game.frightT > 0 && hd >= 0) {
          worst = Math.min(worst, out + game.params.doorSlack);
        }
        continue;
      }
      if (!h.isThreat()) continue;
      const parked = !h.path && !h.dir;
      // food right now -- unless it re-emerged from the den mid-fright
      if (game.frightT > ticks * 1.0 && !h.frightImmune) continue;
      if (parked) {
        const ht = h.tile();
        if (ht.c === c && ht.r === r) return 0;
        /* A statue can wake: one order and it is a hunter again, and being
           three tiles from a fresh hunter is how ambushes happened. Treat
           it as a pursuer with a grace period -- close statues keep a
           respectful margin, distant ones are still safely farmable. */
        const dg = game.hunterDistGrids[i];
        if (dg) {
          const hd = dg[idx];
          if (hd >= 0) {
            const wakeTicks = hd * (TILE / game.params.hunterSpeed) + 45;
            /* A statue does not advance while he walks, so its threat is a
               fact about distance, not about when he arrives. Subtracting
               the arrival tick treated it as if it started chasing the
               moment he planned the route, which painted a permanent no-go
               zone around every statue when seen from across the board --
               dots parked next to one became unreachable in his mind. The
               ambush case is unchanged: when he is already close, arrival
               was near zero anyway, and the moment a statue gets orders it
               becomes a moving threat with real pursuit math. */
            worst = Math.min(worst, wakeTicks);
          }
        }
        continue;
      }
      foresee(game.hunterFutures[i]);
      // static reachability margin as a fallback. Always assume the hunter's
      // healthy speed: planning around a frightened hunter's crawl is how the
      // post-fright whiplash caught him -- fright ends, the crawl doesn't.
      const dg = game.hunterDistGrids[i];
      if (!dg) continue;
      const hd = dg[idx];
      if (hd >= 0) {
        const threatSpeed = Math.max(h.speed || 0, game.params.hunterSpeed);
        const hunterTicks = hd * (TILE / threatSpeed);
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
        /* Safe dots are meals, not decoration. At 1.2 a dot was noise
           against the margin and junction terms, so "stand one tile from
           the pile" scored the same as "eat the pile" and safe leftovers
           were orbited forever. Under pressure the old weight returns:
           snacking while hunted stays a rounding error, as it should. */
        const snackW = minMargin > 30 ? 12 : 1.2;
        let score = Math.min(minMargin, 60) * 3 + exits.length * 5
          + snacks * snackW + fruitBonus * (minMargin > 20 ? 14 : 0);
        // one pursuer: run the gradient away from it before anything else
        if (this.fleeGrid && minMargin < 45 && c >= 0 && c < COLS) {
          const fd = this.fleeGrid[r * COLS + wrapCol(c)];
          if (fd >= 0) score += Math.min(fd, 26) * 2.2;
        }
        /* When it is genuinely safe, head toward whatever food is left --
           from anywhere: the pull used to fade out at 24 tiles, so a far
           cluster exerted nothing and he orbited the safe middle. It grows
           as the board empties; the last dots are the ones he should be
           most determined to finish. The safety gate still matters:
           chasing dots with a hunter three tiles away is how he used to
           walk himself into corners, and a lone chaser could farm that
           mistake all the way to a capture. */
        if (minMargin > 30 && game.foodDist && c >= 0 && c < COLS) {
          const fd = game.foodDist[r * COLS + wrapCol(c)];
          if (fd >= 0) score += Math.max(0, 70 - fd) * (0.8 + game.boldness() * 1.2);
        }
        // cornered? an energizer run is worth everything
        if (energ) score += (minMargin < 25 ? 80 : game.frightT > 0 ? -40 : 6);
        if (tunnelBonus && minMargin < 30) score += 18;
        // fright: hunt the nearest edible hunter instead of running
        if (game.frightT > 60) {
          for (let i = 0; i < game.hunters.length; i++) {
            const h = game.hunters[i];
            if (!h.isThreat() || h.frightImmune) continue;  // immune ones are not on the menu
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
           so badly that one chaser could herd him around the perimeter.)
           When it IS safe, the meal inside must outscore hovering at the
           mouth: the open-route branch gets a food-pull bonus, so without
           the same term here "stand next to the pile" beat "walk in and
           eat it" forever -- guarded leftovers were never finished. */
        const safeHere = minMargin > 30;
        let sealed = Math.min(minMargin, 60) * 3 + snacks * (safeHere ? 12 : 1.2) - 6;
        if (safeHere && game.foodDist && c >= 0 && c < COLS) {
          const fd = game.foodDist[r * COLS + wrapCol(c)];
          if (fd >= 0) sealed += Math.max(0, 70 - fd) * (0.8 + game.boldness() * 1.2);
        }
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
    /* Five seconds. The game's promise is four-body coordination, and every
       second a ghost sits in the den is a second the player commands three. */
    respawnTicks: 300,
    lookahead: Math.min(1 + Math.floor((n - 1) / 2), 4),
    gamble: Math.min(0.12 + 0.05 * (n - 1), 0.55),
    /* how many ticks of your committed orders he can read (precognition);
       a 30-tick reflex floor applies at every level regardless */
    horizon: n <= 1 ? 0 : n === 2 ? 55 : n === 3 ? 80 : HORIZON,
    /* ticks of benefit of the doubt he gives a charged den ghost with no
       route yet (see dangerAt): trusting on the first boards, none by L7 */
    doorSlack: Math.max(0, 24 - 4 * (n - 1)),
  };
}

/* What a catch would bank this instant: the dots he never got, times the
   level. The capture pays exactly this, and the glass quotes exactly
   this, from the one place -- two copies of a formula are how a screen
   ends up promising a number the score never gives. */
function dotsLeftNow() { return Math.max(0, dotTotal - game.dotsEaten); }
function bountyNow() { return dotsLeftNow() * game.level; }

/* ------------------------------- the game ------------------------------- */

const game = {
  phase: 'boot',        // boot attract ready play command capture flash escaped gameover
  level: 1,
  score: 0,
  high: 0,
  contracts: 3,
  evaderLives: 3,       // his lives on the current board; dots persist across them
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
  /* How long a ghost may stand parked before the game intervenes.
     Player-tunable; null = camping is always allowed. */
  campLimit: 600,
  campChoice: 3,
  foodDist: null,
  hunterDistGrids: [null, null, null, null],
  denWatch: [null, null, null, null],   // {eta, committed} per whole den ghost
  doorDist: null,                       // distance to the nearer exit tile
  doorDistOf: null,                     // ...for this maze
  popups: [],           // {x, y, text, color, t}
  message: null,        // {text, color, t}
  attract: { page: 0, t: 0, introStep: 0 },
  demo: false,
  demoFright: false,
  hint: true,
  /* game.tick on the ready -> play flip. game.tick never resets -- it runs
     through the attract demo too -- so "the first seconds of a round" has
     to be counted from here, not from zero. */
  playTick0: 0,
  /* The practice, while it runs: every rule it bends hangs off this one
     object (see startDrill), and null means the real game, untouched. */
  drill: null,
  /* Real catches this game, the practice's never among them. Only the
     game-over screen asks: a game that ended without one is the player
     who never found the verb, and it offers the practice. */
  catches: 0,
  helpOpen: false,      // the pocket manual behind the ? chip
  captureInfo: null,
  flashT: 0,
  shakeT: 0,

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
    if (rebuildDots) {
      setBoard(boardForLevel(this.level));
      buildMaze(); this.dotsEaten = 0; this.evaderLives = 3;
    }
    this.resetActors();
    this.lastFruitAt = -1;
    this.phase = 'ready';
    this.phaseT = 0;
    this.demo = false;
    Sound.jingle();
  },

  newGame() {
    /* Whatever route led here, no practice rule survives into a real
       board -- and the camp limit it switched off comes back as the
       player left it. */
    if (this.drill) {
      this.campLimit = this.drill.saved.campLimit;
      this.campChoice = this.drill.saved.campChoice;
      this.drill = null;
    }
    this.level = 1;
    this.score = 0;
    this.contracts = 3;
    this.extraAwarded = false;
    this.fruitHistory = [];
    this.hint = true;
    setBoard(0);
    buildMaze();
    this.dotsEaten = 0;
    this.evaderLives = 3;
    this.catches = 0;
    shell.key = null;   // the room is relit from scratch on the next frame
    this.startLevel(false);
  },

  addScore(n) {
    this.score += n;
    if (this.score > this.high) {
      this.high = this.score;
      try { localStorage.setItem('ghostProtocolHigh', String(this.high)); } catch (e) {}
    }
    /* 10000, not 5000: each board now banks up to three captures, so the
       old threshold would hand out the extra board almost immediately. */
    if (!this.extraAwarded && this.score >= 10000) {
      this.extraAwarded = true;
      this.contracts++;
      this.popup(NATIVE_W / 2, 130, 'EXTRA BOARD', PAL.white);
    }
  },
  popup(x, y, text, color) {
    this.popups.push({ x, y, text, color, t: 90 });
  },

  triggerFright() {
    this.frightT = this.params.frightTicks;
    // a fresh energizer blues everyone, including squad members that had
    // shed the last fright by walking out of the den
    for (const h of this.hunters) h.frightImmune = false;
    Sound.energize();
    // frightened hunters do NOT reverse or flee by themselves: your problem
  },

  /* The prize under the den is worth exactly one thing: overdrive. Route a
     hunter over it first and that hunter can flat outrun him for eight
     seconds. No points either way -- if he gets it, the window is simply
     gone, and that missed chance is the whole cost. */
  takeFruit(byHunter) {
    if (!this.fruit) return;
    this.fruit = null;
    Sound.fruit();
    if (byHunter) {
      byHunter.boostT = BOOST_TICKS;
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
    if (this.doorDistOf !== walls) {    // once per maze, not per tick
      this.doorDist = bfsDistFrom([{ c: DOOR_C0, r: DEN_EXIT_ROW }, { c: DOOR_C1, r: DEN_EXIT_ROW }]);
      this.doorDistOf = walls;
    }
    for (let i = 0; i < this.hunters.length; i++) {
      const h = this.hunters[i];
      const t = h.tile();
      this.hunterDistGrids[i] = bfsDistFrom({
        c: Math.max(0, Math.min(COLS - 1, wrapCol(t.c))),
        r: Math.max(0, Math.min(MAZE_ROWS - 1, t.r)),
      });
      this.hunterFutures[i] = h.isThreat() ? hunterFuture(h, this) : [];
      /* The den door. A whole ghost inside is a hunter on a delay: it can
         be out and hunting in `eta` ticks, and it comes out immune. One
         with a route drawn is a committed order and he reads the route
         like any other (from the exit tile, after the delay); one without
         is only a possibility, which dangerAt weighs during fright alone.
         Eyes are not on the list at all -- nothing gets them out before
         their wait is over. */
      const eta = h.emergeTicks();
      this.denWatch[i] = eta < 0 ? null : { eta, committed: !!h.path };
      if (eta >= 0 && h.path) this.hunterFutures[i] = hunterFuture(h, this, eta);
      /* Going in lethal, a ghost is still on the doorstep row for a few
         ticks and still catches him there: he reads that walk like any
         other, laid over whatever route out it has queued behind it. */
      if (h.doorstepThreat(this)) {
        const slide = doorSlide(h.x, h.y);
        this.hunterFutures[i] = slide.concat(this.hunterFutures[i].slice(slide.length));
      }
      /* A parked hunter is a wall that kills: the evader's routing has to
         treat its tile as impassable, not as a distant threat. Unless
         fright has made it food -- then the wall is dinner, and this hard
         veto must not overrule the hunt (dangerAt already knows they're
         food; the veto outranks it, so it has to know too). Near expiry
         the tile turns lethal again: lunging at a statue as the clock
         flips is how an eater becomes a score. */
      if (h.isThreat() && !h.path && !h.dir && t.c >= 0 && t.c < COLS
          && (this.frightT <= 45 || h.frightImmune)) {
        this.parkedTiles.add(t.r * COLS + wrapCol(t.c));
      }
    }
  },

  checkCollisions() {
    const et = this.evader.tile();
    for (const h of this.hunters) {
      // a lethal ghost going home is still out here until it is through the door
      if (h.state !== 'active' && !h.doorstepThreat(this)) continue;
      const ht = h.tile();
      const dx = h.x - this.evader.x, dy = h.y - this.evader.y;
      const touching = (ht.c === et.c && ht.r === et.r) || (dx * dx + dy * dy < 36);
      if (!touching) continue;
      if (this.frightT > 0 && !h.frightImmune) {
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

  /* One score, and it is a speed meter: the dots he never got, times the
     level, banked at EACH capture -- a board pays up to three times, and
     speed matters three times, because the dots he ate stay eaten across
     his lives. A pincer earns its banner and fanfare but no separate
     number, because the system already pays for pincers the honest way --
     they catch him sooner, and sooner IS the score. */
  beginCapture(hunter) {
    this.phase = 'capture';
    this.phaseT = 0;
    Sound.stopSiren();
    Sound.capture();
    let bonusHunters = 0;
    const et = this.evader.tile();
    const dirsSeen = new Set();
    for (const h of this.hunters) {
      if (h.state !== 'active' && h !== hunter) continue;   // the catcher may be on the doorstep
      const ht = h.tile();
      const dist = Math.abs(ht.c - et.c) + Math.abs(ht.r - et.r);
      if (dist <= 8) {
        bonusHunters++;
        dirsSeen.add(ht.c - et.c > 0 ? 'e' : ht.c - et.c < 0 ? 'w' : ht.r - et.r > 0 ? 's' : 'n');
      }
    }
    const dotsLeft = dotsLeftNow();
    const banked = bountyNow();
    this.captureInfo = { banked, dotsLeft, hunters: bonusHunters, dirs: dirsSeen.size };
    // a practice catch is real, but it is not a score: nothing banks, the
    // high score is never written, and no number flies off him
    if (!this.drill) {
      this.addScore(banked);
      this.popup(this.evader.x, this.evader.y - 10, String(banked), PAL.cyan);
      this.catches++;
    }
    if (bonusHunters >= 2 && dirsSeen.size >= 2) {
      this.popup(this.evader.x, this.evader.y - 20, 'PINCER', PAL.white);
    }
    this.evader.alive = true;   // shown spinning during capture phase
  },


  /* one 60 Hz game tick (only in live phases) */
  update() {
    this.tick++;
    if (this.phase === 'ready') {
      // 4s: the jingle runs ~3.8s and the siren must not start over it
      if (++this.phaseT > 240) {
        this.phase = 'play';
        this.playTick0 = this.tick;
        Sound.startSiren();
      }
      return;
    }
    if (this.phase === 'capture') {
      this.phaseT++;
      /* A practice catch spends no life and never reaches the next round:
         the board holds on the finished spin and the practice graduates.
         Any catch does -- a lucky lone one in the first scene included --
         so no step can be left waiting on a capture that already came. */
      if (this.drill) {
        if (this.phaseT === 60) this.drill.step = 'graduate';
        return;
      }
      if (this.phaseT === 80) {
        /* He has lives, the way the original's yellow guy did. A capture
           spends one; the board and its dots persist across his deaths, so
           his grazing is progress we can never give back. Only the third
           catch clears the board. */
        this.evaderLives--;
        if (this.evaderLives > 0) this.startLevel(false);
        else { this.phase = 'flash'; this.flashT = 0; Sound.levelClear(); }
      }
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
        /* dir null, not 'up': the first step asks the BFS for a legal
           heading instead of drifting into whatever sits above the spot
           where the evader happened to strike */
        if (++h.dissolveT > 36) { h.state = 'eyes'; h.dir = null; }
        continue;
      }
      h.update(this);
    }
    if (this.demo) this.demoDirector();
    this.evader.update(this);
    this.checkCollisions();
    if (this.phase !== 'play') return;

    if (!this.drill) this.spawnFruitMaybe();   // the practice has no prize to chase
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

    Sound.tickSiren(this.sirenStage());

    /* A ghost just walked off the end of its drawn path: freeze and hand
       the player the pen instead of letting it coast into a wall and go
       stupid unnoticed. The wall rule is unchanged -- resuming without new
       orders still parks it -- the game just always asks first. */
    if (!this.demo) {
      for (let i = 0; i < this.hunters.length; i++) {
        const h = this.hunters[i];
        if (!h.needsOrders) continue;
        h.needsOrders = false;
        if (h.state === 'active' && this.phase === 'play') {
          Draw.select(i);
          this.popup(h.x, h.y - 10, h.def.name + ': ORDERS?', h.color);
          pauseToCommand(h);   // out of the ghost that ran dry or overstayed
        }
      }
    } else {
      this.hunters.forEach(h => { h.needsOrders = false; });
    }

    /* Not in the practice: nothing there gets worse while a newcomer is
       still working out that the click is the clock. */
    if (!this.drill && this.dotsEaten >= dotTotal) {
      // he cleared the board: we lose a contract
      this.contracts--;
      this.phase = 'escaped';
      this.phaseT = 0;
      Sound.stopSiren();
      Sound.hunterLost();
    }
    if (this.drill) drillTick();
  },

  /* attract-mode demo: a squad that plays the game the way it's meant to be
     played. The four triangulate on the evader -- one presses him directly,
     the rest take cut-off points on his other sides, arrows visible on the
     glass -- and the instant he takes an energizer they all wheel and run
     for the far corners until the fright burns off. */
  demoDirector() {
    const fright = this.frightT > 0;
    const flipped = fright !== this.demoFright;
    this.demoFright = fright;
    if (!flipped && this.tick % 120 !== 5) return;

    const et = this.evader.tile();
    const ev = { c: wrapCol(et.c), r: et.r };
    const distEv = bfsDistFrom(ev);
    const dAt = (c, r) => { const d = distEv[r * COLS + wrapCol(c)]; return d < 0 ? 999 : d; };
    /* The den releases nobody on its own, so the demo has to draw its
       ghosts out the way a player would: routes from the door for the ones
       waiting inside, eyes included -- theirs are kept until they can go. */
    const denned = h => h.state === 'idle' || h.state === 'respawn';
    const from = h => {
      if (denned(h)) return { c: DOOR_C0, r: DEN_EXIT_ROW };
      const t = h.tile();
      return { c: wrapCol(t.c), r: t.r };
    };
    const squad = this.hunters.filter(h => h.state === 'active' || denned(h));
    if (!squad.length) return;

    // one candidate target per quadrant
    const targets = [];
    const best = [null, null, null, null];
    for (let r = 0; r < MAZE_ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const d = distEv[r * COLS + c];
        if (d < 0 || inDen(c, r)) continue;
        if (fright) {
          // farthest open tile from him in each board quadrant
          const q = (c >= COLS / 2 ? 1 : 0) + (r >= MAZE_ROWS / 2 ? 2 : 0);
          if (!best[q] || d > best[q].score) best[q] = { c, r, score: d };
        } else {
          // ring anchors: ~7 tiles out, one on each side of him
          if (d < 5 || d > 10) continue;
          const q = (c >= ev.c ? 1 : 0) + (r >= ev.r ? 2 : 0);
          const score = -Math.abs(d - 7);
          if (!best[q] || score > best[q].score) best[q] = { c, r, score };
        }
      }
    }
    best.forEach(b => { if (b) targets.push({ c: b.c, r: b.r }); });

    // nearest hunter presses him directly; the rest take the cut-offs
    const claimed = new Set();
    const byDist = squad.slice().sort((a, b) => {
      const ta = from(a), tb = from(b);
      return dAt(ta.c, ta.r) - dAt(tb.c, tb.r);
    });
    byDist.forEach((h, k) => {
      const at = from(h);
      let goal = null;
      if (!fright && k === 0) {
        goal = ev;
      } else {
        let bi = -1, bd = 1e9;
        targets.forEach((tg, i) => {
          if (claimed.has(i)) return;
          const d = Math.abs(tg.c - at.c) + Math.abs(tg.r - at.r);
          if (d < bd) { bd = d; bi = i; }
        });
        if (bi >= 0) { claimed.add(bi); goal = targets[bi]; }
        else if (!fright) goal = ev;
      }
      if (!goal) return;
      const route = bfsRoute(at, goal);
      if (route && route.length > 1) h.setOrder(route, false);
    });
  },
};

function enterAttract() {
  game.phase = 'attract';
  game.attract = { page: 0, t: 0, introStep: 0 };
  game.demo = false;
  Sound.stopSiren();
  shell.key = null;
  setBoard(0);   // the marquee always shows the opener
  buildMaze();
}

/* ------------------------------- input ---------------------------------- */

const input = {
  mx: 0, my: 0,          // native px within playfield space (y excludes HUD)
  leftDown: false, rightDown: false,
  dragOrigin: null, dragMoved: false,
  touchId: null,         // the finger currently standing in for the mouse
  pendingResume: false,  // a touch that will mean "go" if it lifts as a tap
  cardDown: false,       // a press held on the practice's card, which the maze never saw
  pressT: 0,             // when the press landed, for the quick-tap ruling
  // the mouse at rest, for the glass's hover and cursor: display px, and
  // whether it is over the page at all. A finger never sets these.
  dx: -1, dy: -1, hovering: false,
  pressedCtl: null,      // the control under a press: 'play' 'camp' 'slotN' 'help' 'close' 'skip'
                         // 'practice' (the manual's) 'retry' (the game-over chip)
  hoverCtl: null,        // ...and under a resting mouse
};

/* How far a press may wander and still count as a tap rather than a drag --
   which is the difference between browsing a pile of ghosts and commanding
   the one on top. A cursor does not wander at all, so six native px was
   plenty; a thumb rolls a good deal further than that just being pressed
   down, and every one of those taps was landing as a dead one-tile drag,
   so a stack of ghosts stopped stepping altogether. Native px, so it means
   the same thing at every window size: a tile and a half for a finger. */
const TAP_SLOP = 6, TAP_SLOP_TOUCH = 12;

/* Distance is not the only tell. A quick press that lands and lifts inside
   a quarter second was a tap whatever the thumb did in between -- real
   thumbs roll well past any slop you would dare give a drag threshold, and
   commanding a ghost takes deliberation, not 200ms. Touch only: a mouse
   never needs the second opinion. Travel is capped so a genuine flick of a
   stroke, however fast, still reads as drawing. */
const TAP_MS = 250, TAP_TRAVEL = 24;

/* Which idiom the player is speaking. It is not a device capability but a
   live observation -- a laptop with a touchscreen reads as a mouse until a
   finger actually lands, and reverts the moment the mouse comes back. It
   only ever changes wording and how far a hit target reaches, never rules. */
let touchMode = (function () {
  try {
    if (typeof navigator === 'undefined' || !(navigator.maxTouchPoints > 0)) return false;
    // a fine pointer alongside the digitizer means there is a mouse on the desk
    return !(window.matchMedia && window.matchMedia('(pointer: fine)').matches);
  } catch (e) { return false; }
})();

let screenCanvas, screenCtx, native, nativeCtx, dotScratch, scale = 2;
let scanlines = null, vignette = null;

/* Both take anything carrying clientX/clientY -- a MouseEvent or a Touch --
   so one finger and the mouse arrive at the game in the same coordinates. */
function toNative(src) {
  // rect-relative, because the canvas raster is device pixels while the
  // rect is CSS pixels -- on a scaled Windows display they differ
  const rect = screenCanvas.getBoundingClientRect();
  const x = (src.clientX - rect.left) * (NATIVE_W / rect.width);
  const y = (src.clientY - rect.top) * (NATIVE_H / rect.height);
  return { x, y: y - HUD_TOP * TILE };
}
function toDisplay(src) {
  const rect = screenCanvas.getBoundingClientRect();
  return {
    x: (src.clientX - rect.left) * (screenCanvas.width / rect.width),
    y: (src.clientY - rect.top) * (screenCanvas.height / rect.height),
  };
}
/* Fingers are blunter than a cursor, so every control carries slop -- but
   only in the directions where nothing else is standing. Growing a target
   into its neighbour would make a deliberate tap do the wrong thing, which
   is worse than a target that is merely small. Pads are in display px. */
function tapPad(top, right, bottom, left) {
  if (!touchMode) return null;
  return { t: scale * top, r: scale * right, b: scale * bottom, l: scale * left };
}
function inRect(p, r, pad) {
  if (!r) return false;
  const t = pad ? pad.t : 0, rt = pad ? pad.r : 0;
  const b = pad ? pad.b : 0, l = pad ? pad.l : 0;
  return p.x >= r.x - l && p.x <= r.x + r.w + rt
      && p.y >= r.y - t && p.y <= r.y + r.h + b;
}

/* `origin` is whatever stopped time, in native maze px (the frame actor x/y
   and input.mx/my live in): the press point, the ghost that grabbed or ran
   dry, the ? chip. The glass animates its entrance out of that point. The
   phase itself flips here and now, on the click tick -- only the look is
   allowed to take a moment, and nothing the simulation reads waits on it. */
function pauseToCommand(origin) {
  if (game.phase === 'play') {
    game.phase = 'command';
    Sound.uiFreeze();
    Sound.tapeStop();
    game.hint = false;
    const o = origin || ghostOrigin(Draw.selected);
    fx.origin = { x: o.x, y: o.y };
    // stopping the clock again straight after starting it gets no fanfare
    fx.skipEnter = uiClock - fx.thawAt < FX_REFREEZE;
    fx.enterAt = uiClock;
  }
}
/* A freeze the player asked for, by press or key -- not the camp limit's,
   not the manual's. The first one in a real game is the moment the click
   is learned, and the first-game toast is told so and bows out. */
function handFreeze(origin) {
  const was = game.phase === 'play';
  pauseToCommand(origin);
  if (was && game.phase === 'command') tipFreezeSeen();
}
/* Where a ghost stands, as a freeze origin -- or the middle of the maze
   when that slot has nobody commandable to point at. */
function ghostOrigin(i) {
  const h = game.hunters[i];
  if (h && h.isCommandable()) return { x: h.x, y: h.y };
  return { x: NATIVE_W / 2, y: MAZE_ROWS * TILE / 2 };
}
/* The camp-limit dial. A ghost may stand parked this long before the game
   freezes and demands orders; OFF restores the original undiluted rule --
   ghosts camp forever and nothing intervenes. */
const CAMP_CHOICES = [
  { label: '0S', ticks: 0 },
  { label: '3S', ticks: 180 },
  { label: '5S', ticks: 300 },
  { label: '10S', ticks: 600 },
  { label: 'OFF', ticks: null },
];
function loadCampChoice() {
  let i = 3;   // default 10S
  try { const s = localStorage.getItem('gpCampLimit'); if (s !== null) i = Number(s); } catch (e) {}
  if (!(i >= 0 && i < CAMP_CHOICES.length)) i = 3;
  game.campChoice = i;
  game.campLimit = CAMP_CHOICES[i].ticks;
}
function cycleCampChoice() {
  game.campChoice = (game.campChoice + 1) % CAMP_CHOICES.length;
  game.campLimit = CAMP_CHOICES[game.campChoice].ticks;
  try { localStorage.setItem('gpCampLimit', String(game.campChoice)); } catch (e) {}
  // relax the rule mid-freeze and previously-overdue ghosts are pardoned
  game.hunters.forEach(h => {
    if (game.campLimit === null || h.campT < game.campLimit) h.overdue = false;
  });
  Sound.uiCommit();
}

/* An overdue ghost: camped past the player's own limit. While one exists
   the game will not unfreeze. */
function stalledHunter() {
  return game.hunters.find(h =>
    h.state === 'active' && !h.path && !h.dir && h.overdue) || null;
}
function resumeFromCommand() {
  if (game.phase === 'command') {
    if (Draw.active) Draw.commit(input.dragMoved);
    Draw.endErase();
    drillCheck();   // a route committed just now can be the one that opens the gate
    /* The practice's one gate: while a step's lesson is "draw first",
       PLAY says no in exactly the voice it already uses for an overdue
       ghost, so a mouse press on empty maze reads as a refusal rather
       than a freeze-and-thaw flicker that teaches nothing. */
    if (tutResumeLocked()) { drillRefuse(); return; }
    const stalled = stalledHunter();
    if (stalled) {
      // refuse: point at the ghost that still needs somewhere to be
      Draw.select(game.hunters.indexOf(stalled));
      Sound.uiClear();
      Sound.uiRefuse();
      fx.refusedAt = uiClock;   // the status pill shakes its head
      return;
    }
    game.phase = 'play';
    const d = game.drill;
    if (d) {
      /* Every run is judged afresh, on what was drawn for this one --
         unless a miss is judged and still being shown. Stopping time to
         watch him get away is the natural thing to do, and by then both
         routes are spent: judged again, a player who sent two would be
         told one ghost can't catch him. The hold carries on where it was. */
      if (!d.holding) {
        d.resumeT = 0; d.stopT = 0;
        d.failKind = null; d.failHoldT = 0;
        d.ordersAtResume = game.hunters.filter(h => h.path).length;
      }
      d.ran = true;
    }
    fx.thawAt = uiClock;
    Sound.uiThaw();
    Sound.tapeStart(game.frightT <= 0);
  }
}

/* The manual. Opening it mid-play freezes time first -- reading the rules
   should never cost you the round. Closing it never auto-resumes; the click
   is still the clock. */
function openHelp() {
  if (game.phase === 'play') {
    pauseToCommand({ x: HELP_CHIP.x, y: HELP_CHIP.y - HUD_TOP * TILE });
  }
  game.helpOpen = true;
  helpFx.confirmAt = -1e9;   // an END THIS GAME? left armed never carries over
  Sound.uiCommit();
}
function closeHelp() {
  game.helpOpen = false;
  helpFx.confirmAt = -1e9;
  Sound.uiCommit();
}

/* The manual's PRACTICE control. From the title or a game over it is one
   press: the manual shuts and the practice starts. In the practice it
   starts it over. Over a game still being played it asks first, inline --
   the label turns to END THIS GAME? for three seconds and a second press
   inside them is the yes. No sheet over the sheet: the word changing is
   the question, and doing nothing is the no. */
const HELP_CONFIRM = 180;   // uiClock ticks the question stays asked
function practiceLabel() {
  if (game.drill) return 'RESTART PRACTICE';
  if (game.phase === 'attract' || game.phase === 'gameover') return 'PRACTICE ▶';
  return uiClock - helpFx.confirmAt < HELP_CONFIRM ? 'END THIS GAME?' : 'PRACTICE ▶';
}
function pressPractice() {
  if (practiceLabel() === 'PRACTICE ▶' && game.phase !== 'attract' && game.phase !== 'gameover') {
    helpFx.confirmAt = uiClock;
    Sound.uiCommit();
    return;
  }
  closeHelp();
  startDrill();
}

/* ------------------------------ the practice ----------------------------
   A first-time visitor's first press starts this instead of a round: the
   real opening of board one, then one fixed trap, then a real game. It
   teaches by letting the real rules happen. The evader runs his own brain
   at his own speed in both scenes, and nothing is ever drawn for the
   player -- a lesson in which the game draws the route teaches watching.
   What it does bend, it bends through game.drill alone: no fruit, no
   escape, no score, no lives, no camp limit, no energizers, and a PLAY
   that refuses until the step's route exists. newGame() nulls it, so no
   way out of here can carry a practice rule onto a real board.
   Sim and presentation split the usual way. drillTick runs inside
   game.update, and drillCheck on input and after the tick loop, for the
   steps that turn while time is stopped; both read sim, Draw and the
   manual only. What the card SAYS may lean on uiClock (coachFx); what
   the practice DOES never does. */

/* Scene two. He stands mid-corridor on the top row with a ghost parked
   under each end of it. Measured on the real sim, over six seeds and with
   or without energizers: with no orders, RAZE alone or MIST alone he gets
   out every time; send both -- straight at him, only to the corridor's
   ends, or a tile short of them -- and he is caught 27 ticks after the
   resume, from two sides, every time. test/tutorial.js pins that split,
   so an AI change that breaks the lesson breaks the build. */
const TRAP = { raze: { c: 6, r: 4 }, mist: { c: 13, r: 5 }, evader: { c: 9, r: 1 } };
const DRILL_WATCH = 45;        // ticks a watched ghost stands dead before the point is made
const DRILL_WATCH_MAX = 240;   // ...or this long after the resume, whatever it did
const DRILL_OUT = 30;          // ticks a den ghost must be out and hunting
const DRILL_TRAP_MAX = 360;    // a trap still unsprung after this is a miss
const DRILL_FAIL_HOLD = 30;    // he is seen getting away before the scene resets
const DRILL_GUARD = 18;        // uiClock ticks (300ms) a fresh screen ignores presses

/* First run is "gpOnboard has never been written". Written 'started' the
   moment the practice begins, so a tab closed halfway never auto-starts
   it again; 'done' or 'skipped' when it ends. Storage that refuses falls
   back to memory: then it runs at most once per page load, which is
   never a trap, because SKIP is always on the card. */
let onboardMem = false;
let forceDrill = false;        // ?tutorial: the next title-screen press is the practice
// ?tutorial, ?tutorial=1, &tutorial -- the same test index.html makes for its line
const TUTORIAL_PARAM = /[?&]tutorial(=|&|$)/;
function onboarded() {
  // memory first: storage can read fine and still refuse the write
  if (onboardMem) return true;
  try { return localStorage.getItem('gpOnboard') !== null; } catch (e) { return false; }
}
function markOnboard(v) {
  onboardMem = true;
  try { localStorage.setItem('gpOnboard', v); } catch (e) {}
}

/* The one door into a game from the title screen or the game-over screen.
   A game over is not a first run, so only the title can start practice. */
function startFromTitle() {
  if (game.phase === 'attract' && (forceDrill || !onboarded())) startDrill();
  else game.newGame();
}

/* No energizers in either scene: an early fright eats the ghost being
   taught, and blue is a lesson for later. They become plain dots, so the
   board still reads as board one. */
function drillDots() {
  for (const row of dots) {
    for (let c = 0; c < row.length; c++) if (row[c] === 2) row[c] = 1;
  }
}

/* Scene one is the real opening, live, from this very press: RAZE walks
   out and drifts to the left wall, the other three sit in the den, he
   starts eating. No READY -- the round is already the lesson, and the
   first thing it asks for is the freeze. */
function startDrill() {
  const prior = game.drill;
  game.drill = {
    stage: 1, step: 'freeze',
    playT: 0, resumeT: 0, stopT: 0, outT: 0,
    watchIdx: -1, denIdx: -1, denDone: false, denSel: false,
    ran: false,          // time has run since this step's gate last opened
    fails: 0, ordersAtResume: 0, failKind: null, failHoldT: 0,
    holding: false,      // a miss judged, and he is still being seen getting away
    refusals: 0, taps: 0,
    // a restart hands back what the player came in with, not the practice's own
    saved: prior ? prior.saved : { campLimit: game.campLimit, campChoice: game.campChoice },
  };
  if (!onboarded()) markOnboard('started');   // replays write only how they end
  forceDrill = false;
  /* The camp limit would freeze on the player's behalf the moment RAZE
     stood at its wall. Off, and the roster hides its chip, so the saved
     setting is exactly what comes back. */
  game.campLimit = null;
  game.level = 1;
  game.params = levelParams(1);
  game.demo = false;
  setBoard(0);
  buildMaze();
  drillDots();
  game.dotsEaten = 0;
  game.fruit = null;
  game.lastFruitAt = -1;
  game.foodDist = null;
  game.hint = false;
  game.popups = [];
  game.captureInfo = null;
  game.shakeT = 0;
  game.resetActors();
  Draw.active = null;
  Draw.erase = null;
  Draw.select(0);
  game.phase = 'play';
  game.phaseT = 0;
  game.playTick0 = game.tick;
  shell.key = null;
  coachReset();   // a fresh card: its clocks, its lines, its dock, the 300ms guard
  /* From the manual the practice can start over a stopped board, whose
     siren is still sagged on the tape-stop. A fresh one, not that one. */
  Sound.stopSiren();
  Sound.startSiren();
}

/* Scene two, loaded between two ticks of live play and stopped at once
   with the real freeze entrance out of him. A retry comes back without
   the fanfare: he just got away, and the board says so plainly. */
function loadTrap(isRetry) {
  const d = game.drill;
  buildMaze();
  drillDots();
  game.dotsEaten = 0;
  game.fruit = null;
  game.foodDist = null;     // his food map rebuilt on the first tick, not up to 19 later
  game.popups = [];
  game.captureInfo = null;
  game.resetActors();
  const park = (h, at) => {
    h.state = 'active'; h.opening = false; h.frightImmune = true;
    h.script = null; h.path = null; h.dir = null;
    h.x = tcx(at.c); h.y = tcy(at.r);
  };
  park(game.hunters[0], TRAP.raze);
  park(game.hunters[1], TRAP.mist);
  game.evader.x = tcx(TRAP.evader.c);
  game.evader.y = tcy(TRAP.evader.r);
  game.evader.dir = null;
  d.stage = 2;
  d.step = 'trap';
  d.resumeT = 0; d.stopT = 0; d.failHoldT = 0;
  d.holding = false;   // the reason stays on the card; the run it judged is over
  d.watchIdx = -1;
  d.ran = false;
  pauseToCommand({ x: game.evader.x, y: game.evader.y });
  if (isRetry) fx.skipEnter = true;
  Draw.select(0);
}

/* Is PLAY refused? While a step's lesson is "draw first", and until the
   route it asks for exists. Once time has run in a step, freezing again
   to look never locks the player in: the lesson is already under way. */
function tutResumeLocked() {
  const d = game.drill;
  if (!d || game.phase !== 'command') return false;
  const pathed = game.hunters.some(h => h.path);
  if (d.step === 'draw') return !drillLaneRouted();
  if (d.step === 'go' || d.step === 'trap') return !pathed && !d.ran;
  if (d.step === 'den') return !drillDenOrdered();
  return false;
}
/* A den ghost has its way out: a route while it is still inside or on
   its way up, or it is already out on the board. */
function drillDenOrdered() {
  const d = game.drill;
  const out = d.denIdx >= 0 ? game.hunters[d.denIdx] : null;
  return game.hunters.some(h => h.path && h.inDenStates())
    || !!(out && out.state === 'active');
}

/* The draw step's route: two tiles or more, and not a trip home. The red
   ghost stands on row 11, and dragging it along that row "to the other
   ghosts" walks the tip onto the door -- a real order, and the game keeps
   it, but a ghost that goes and sits in the den never shows the step's
   one lesson, stopping at a wall. So the card says so, and the step
   waits for a route along a corridor. */
function drillLaneRouted() {
  return game.hunters.some(h => h.path && h.path.tiles.length >= 2 && !h.path.home);
}

/* A PLAY the practice will not take yet, answered in exactly the voice
   PLAY already uses for an overdue ghost. */
function drillRefuse() {
  Sound.uiClear();
  Sound.uiRefuse();
  fx.refusedAt = uiClock;
  game.drill.refusals++;
}

// Draw.commit's report: which ghost the player just gave a route to
function drillOnCommit(i, wasDen) {
  const d = game.drill;
  d.watchIdx = i;
  if (wasDen) { d.denDone = true; d.denIdx = i; }
}

/* The steps that turn while time is stopped, where update() never runs:
   after every input event, after the tick loop, and inside a resume. */
function drillCheck() {
  const d = game.drill;
  if (!d) return;
  // a freeze made by opening the manual counts once the manual is shut
  if (d.step === 'freeze' && game.phase === 'command' && !game.helpOpen) {
    d.step = 'draw';
    if (!Draw.active) Draw.select(0);   // RAZE, unless a grab already chose
  }
  if (d.step === 'draw' && drillLaneRouted()) {
    d.step = 'go';
    d.ran = false;
  }
  if (d.step === 'den' && game.phase === 'command' && !d.denSel) {
    d.denSel = true;
    if (!Draw.active) Draw.select(1);   // MIST, the one the card talks about
  }
}

/* The steps that turn on live play. Last thing in update()'s play branch,
   sim state only. */
function drillTick() {
  const d = game.drill;
  if (!d || game.phase !== 'play') return;
  d.playT++;
  d.resumeT++;
  if (d.step === 'go') {
    /* Watching: the ghost walks the route, runs off its end, coasts to a
       wall and stands there. That standing is the lesson, so it is given
       three quarters of a second before the practice moves on. */
    const w = game.hunters[d.watchIdx];
    if (w && w.state === 'active' && !w.path && !w.dir) d.stopT++;
    // a route that ended on the door was a trip home, and home it sits
    else if (w && w.state === 'idle' && !w.path) d.stopT++;
    if (d.stopT >= DRILL_WATCH || d.resumeT >= DRILL_WATCH_MAX) {
      if (d.denDone) loadTrap(false);
      else d.step = 'den';
    }
  } else if (d.step === 'den') {
    const h = d.denIdx >= 0 ? game.hunters[d.denIdx] : null;
    if (h && h.state === 'active' && ++d.outT >= DRILL_OUT) loadTrap(false);
  } else if (d.step === 'trap') {
    if (d.failKind === null) {
      /* Out of his corridor, or down it past both ghosts, and the trap
         has missed. Which lesson the retry teaches depends on how many
         ghosts were sent. */
      const t = game.evader.tile();
      if (t.r >= 8 || t.c <= 2 || t.c >= 17 || d.resumeT >= DRILL_TRAP_MAX) {
        d.failKind = d.ordersAtResume >= 2 ? 'open' : 'one';
        d.failHoldT = 0;
        d.holding = true;
      }
    } else if (++d.failHoldT >= DRILL_FAIL_HOLD) {
      d.fails++;
      loadTrap(true);
    }
  }
}

/* Out of the practice and into a real game: 'done' from the graduation
   press, 'skipped' from SKIP. No confirm on SKIP -- they asked to play. */
function endDrill(how) {
  if (!game.drill) return;
  markOnboard(how);
  // a graduate has stopped time plenty; the first-game nudge is for the skipper
  if (how === 'done') markTip(TIP.freeze);
  Draw.active = null;
  Draw.erase = null;
  Draw.select(0);
  game.popups = [];
  coachUI.card = coachUI.skip = null;
  /* The practice's siren is still going -- wailing, if SKIP came in live
     play, or sagged flat on a tape-stop if it came while frozen -- and
     newGame never touches it. READY must not play over it, and the round
     after must start a real one, so it goes here, as it does on every
     other way into READY. A catch has already stopped it; twice is fine. */
  Sound.stopSiren();
  game.newGame();   // nulls the drill and hands the camp limit back
}

function bindInput() {
  function keyDown(ev) {
    if (ev.repeat) return;
    Sound.ensure(); Sound.resume();
    coachFx.pressAt = uiClock;   // the coach's idle clocks count from any touch of a key
    if (game.helpOpen) {
      // while the manual is up it owns the keyboard
      if (ev.code === 'Escape' || ev.code === 'Space' || ev.code === 'KeyH') {
        ev.preventDefault(); closeHelp();
      }
      return;
    }
    if (ev.code === 'KeyH') { openHelp(); return; }
    const d = game.drill;
    if (d && d.step === 'graduate') {
      // the graduation sheet: Space or Enter is the press that starts the game
      if ((ev.code === 'Space' || ev.code === 'Enter') && coachFx.gradAt !== null
          && uiClock - coachFx.gradAt >= DRILL_GUARD) {
        ev.preventDefault();
        endDrill('done');
      }
      return;
    }
    if (d && ev.code !== 'KeyM' && uiClock - coachFx.startedAt < DRILL_GUARD) return;
    if (ev.code === 'Space' || ev.code === 'KeyP') {
      ev.preventDefault();
      if (game.phase === 'attract' || game.phase === 'gameover') { startFromTitle(); return; }
      // a key has no point on the glass; the ghost it will talk to does
      if (game.phase === 'play') handFreeze(ghostOrigin(Draw.selected));
      else if (game.phase === 'command') resumeFromCommand();
      else if (game.phase === 'ready') tipNudge();   // heard, if not yet obeyed
    } else if (ev.code === 'Escape') {
      resumeFromCommand();
    } else if (ev.code >= 'Digit1' && ev.code <= 'Digit4') {
      // pick a ghost by number, even if it is buried under the other three
      const i = Number(ev.code.slice(5)) - 1;
      if (game.hunters[i] && game.hunters[i].isCommandable()) {
        if (game.phase === 'play') handFreeze(ghostOrigin(i));
        Draw.select(i);
      }
    } else if (ev.code === 'Tab') {
      ev.preventDefault();
      if (game.phase === 'command' || game.phase === 'play') {
        let next = -1;
        for (let n = 1; n <= 4; n++) {
          const i = (Draw.selected + n) % game.hunters.length;
          if (game.hunters[i].isCommandable()) { next = i; break; }
        }
        if (game.phase === 'play') handFreeze(ghostOrigin(next < 0 ? Draw.selected : next));
        if (next >= 0) Draw.select(next);
      }
    } else if (ev.code === 'KeyM') {
      Sound.muted = !Sound.muted;
      Sound.setSirenAudible(!Sound.muted && game.phase === 'play' && game.frightT <= 0);
    }
  }
  // every input event ends by letting a practice step that turned on it turn
  window.addEventListener('keydown', (ev) => { keyDown(ev); drillCheck(); });
  screenCanvas.addEventListener('contextmenu', ev => ev.preventDefault());

  /* Press, drag, release: the only three verbs the game knows. Mouse buttons
     and fingers both funnel through here, so there is exactly one set of
     rules about what a gesture means -- no second, quietly divergent copy
     for phones. `src` is a MouseEvent or a Touch. */
  function pressDown(src, button) {
    const p = toNative(src);
    const dp = toDisplay(src);
    input.mx = p.x; input.my = p.y;
    coachFx.pressAt = uiClock;   // ...and from any press at all
    /* The manual sits above everything, including the attract screen. While
       it is open no click reaches the game: the X or anywhere off the page
       closes it, everything else is ignored. */
    if (button === 0) { input.pressedCtl = null; fx.release = null; }
    if (game.helpOpen) {
      // PRACTICE sits left of the X, so its pad reaches every way but that one
      if (button === 0 && inRect(dp, helpUI.practice, tapPad(4, 1, 4, 4))) {
        input.pressedCtl = 'practice';
        pressPractice();
        return;
      }
      if (button === 0 && inRect(dp, helpUI.close, tapPad(4, 4, 4, 4))) input.pressedCtl = 'close';
      if (button === 0 && (inRect(dp, helpUI.close, tapPad(4, 4, 4, 4)) || !inRect(dp, helpUI.panel))) closeHelp();
      return;
    }
    if (button === 0 && inRect(dp, helpUI.btn, tapPad(3, 3, 3, 3))) {
      input.pressedCtl = 'help';
      openHelp();
      return;
    }
    const d = game.drill;
    if (d) {
      /* The graduation sheet: the whole screen is its button, once it has
         been up long enough that this cannot be the tail of the catch. */
      if (d.step === 'graduate') {
        if (button === 0 && coachFx.gradAt !== null && uiClock - coachFx.gradAt >= DRILL_GUARD) {
          endDrill('done');
        }
        return;
      }
      // the press that started the practice, arriving twice
      if (uiClock - coachFx.startedAt < DRILL_GUARD) return;
      /* The coach card is glass, not maze. SKIP is its one control; the
         rest of it swallows a press while time is stopped, so reading the
         card can never resume or trip the gate. In live play a press on
         it still stops time -- the card says "anywhere", and it is
         somewhere. Over a ghost or an arrowhead it is not glass at all
         (cardHolds). */
      if (button === 0 && coachUI.skip && inRect(dp, coachUI.skip, tapPad(3, 3, 3, 3))) {
        input.pressedCtl = 'skip';
        endDrill('skipped');
        return;
      }
      /* "Click anywhere" invites a double-click, and the hero's freeze
         sends its rect to the bottom dock at once, so the second press of
         one lands on the bare maze it left -- a refused PLAY, or a ghost
         it was hiding. For DRILL_GUARD after that freeze the spot the hero
         stood on is still its glass, and swallows a left press as the
         card does. SKIP, above, is where it rests throughout. */
      const left = coachFx.heroLeft;
      if (button === 0 && left && uiClock - left.at < DRILL_GUARD && inRect(dp, left)) {
        input.cardDown = true;
        return;
      }
      if (cardHolds(dp, p.x, p.y)) {
        input.cardDown = true;   // held on the glass: still a pointer down
        if (game.phase === 'play') {
          if (coachHero()) coachFx.heroLeft = Object.assign({ at: uiClock }, coachUI.card);
          pauseToCommand(p);
        }
        return;
      }
    }
    // a game that ended without a catch offers the practice, once
    if (button === 0 && game.phase === 'gameover' && inRect(dp, gameOverUI.practice, tapPad(3, 3, 3, 3))) {
      input.pressedCtl = 'retry';
      startDrill();
      return;
    }
    if (game.phase === 'attract' || game.phase === 'gameover') { startFromTitle(); return; }
    if (button === 2) {
      input.rightDown = true;
      if (game.phase === 'play') { handFreeze(p); return; }
      if (game.phase === 'command') Draw.beginErase(game, Math.floor(p.x / TILE), Math.floor(p.y / TILE), p.x, p.y);
      return;
    }
    if (button !== 0) return;
    input.leftDown = true;
    input.dragOrigin = { x: p.x, y: p.y };
    input.dragMoved = false;
    input.pressT = performance.now();
    /* READY ignores presses, as it always has -- the round has not begun.
       But a first game's toast is up, saying what the press will do, and
       it nods: the press was heard, it is simply early. */
    if (game.phase === 'ready') tipNudge();
    if (game.phase !== 'play' && game.phase !== 'command') return;
    // roster buttons live in display space, above the glass
    if (game.phase === 'command') {
      /* PLAY is the control a finger reaches for most, so it takes the whole
         empty margin on its right; on its left it stops short of the last
         roster plate. The camp chip grows upward into dead HUD space and
         never down onto the plate beneath it. */
      if (inRect(dp, rosterUI.play, tapPad(1.5, 10, 4, 0.5))) {
        input.pressedCtl = 'play';
        resumeFromCommand();
        return;
      }
      if (inRect(dp, rosterUI.camp, tapPad(6, 3, 0, 8))) {
        input.pressedCtl = 'camp';
        cycleCampChoice();
        return;
      }
      const slot = rosterUI.slots.find(s => inRect(dp, s, tapPad(1, 1, 4, 1)));
      if (slot) {
        const h = game.hunters[slot.i];
        if (h && h.isCommandable()) {
          input.pressedCtl = 'slot' + slot.i;
          Draw.select(slot.i);   // floats it to the front of any pile
          Sound.uiCommit();
        }
        return;
      }
    }
    /* The click is the clock. During live play, any click freezes; while
       frozen, a click on open floor resumes. Clicks that land on something
       meaningful -- a ghost, an arrowhead, the roster, the camp chip, the
       play button -- do that thing instead. A ghost grabbed mid-play still
       freezes and starts its trail in one gesture. */
    const wasPlaying = game.phase === 'play';
    // picked first, so time can stop out of the ghost that was grabbed
    const picked = Draw.pickAt(p.x, p.y);
    if (wasPlaying) handFreeze(picked || p);
    if (picked && game.phase === 'command') Draw.begin(picked);
    else if (!picked && game.phase === 'command' && !wasPlaying) {
      // an arrowhead is a handle: pick a committed route up at its tip and
      // keep drawing where it left off
      const tipOwner = Draw.tipAt(game, p.x, p.y);
      if (tipOwner && Draw.continueFrom(tipOwner)) {
        Draw.select(game.hunters.indexOf(tipOwner));
        return;
      }
      /* Nothing under the cursor: this click means "go". A finger has to
         wait for its own release, because restarting the clock is the one
         action here that cannot be taken back -- he eats while you are not
         looking. A thumb that lands and then slides has changed its mind
         (the drag threshold catches it) and the game stays frozen; a cursor
         does not wander like that, so the mouse keeps deciding on press. */
      if (touchMode) {
        input.pendingResume = true;
        fx.release = { x: p.x, y: p.y, brokeAt: null };   // the ring shows the slop
      } else resumeFromCommand();
    }
  }

  function pressMove(src) {
    const p = toNative(src);
    input.mx = p.x; input.my = p.y;
    if (input.leftDown && input.dragOrigin) {
      const dx = p.x - input.dragOrigin.x, dy = p.y - input.dragOrigin.y;
      const slop = touchMode ? TAP_SLOP_TOUCH : TAP_SLOP;
      if (!input.dragMoved && dx * dx + dy * dy > slop * slop) {
        input.dragMoved = true;
        // a press that became a drag was never a press on a button, and a
        // lift that can no longer mean "go" lets its ring go
        input.pressedCtl = null;
        if (fx.release && fx.release.brokeAt === null) fx.release.brokeAt = uiClock;
        /* A finger that lands on empty maze and swipes is, in the practice,
           a newcomer drawing the corridor they want instead of starting on
           the ghost. The mouse's press there is already a refused PLAY and
           the card says why; the finger's never becomes one, so it would
           get no answer at all. Heard as the same refusal, once a gesture. */
        if (input.pendingResume && !Draw.active && tutResumeLocked()) drillRefuse();
      }
    }
    if (game.phase !== 'command') return;
    if (Draw.active) {
      /* Not until the gesture has declared itself a drag. The tip advances
         after half a tile of travel, which is well inside the slop a tap is
         allowed -- so a press that was only ever a browse used to leave a
         stray two-tile order behind it, and the ghost walked off to a
         corner nobody sent it to. The trail loses nothing by waiting: the
         tip walks the whole way to the finger on the first move that
         counts. */
      /* The tunnel mouths sit against the screen edge, and drawing through
         one means asking for a tile BEYOND that edge. A mouse just sails
         off the canvas; a finger hits glass, and near the bezel the OS
         claims the swipe for itself. So pressure against the playfield's
         edge is read as intent: a pointer parked in the outermost strip
         targets the wrap zone, and the tip walks the tunnel. Everywhere
         but a tunnel row the beyond-edge tile is wall and nothing moves.
         A pointer actually OFF the glass is not clamped to that one tile,
         though: a mouse carried on past the edge asks for the tiles further
         past it, so after the tip comes out of the far mouth it keeps
         following -- along the far side's corridor, and up or down into its
         turns. Dragging back over the board takes it back through. */
      let mc = Math.floor(p.x / TILE);
      const edge = touchMode ? TILE : TILE / 2;
      if (p.x >= 0 && p.x < edge) mc = -1;
      else if (p.x <= NATIVE_W && p.x > NATIVE_W - edge) mc = COLS;
      if (input.dragMoved) Draw.extendToward(mc, Math.floor(p.y / TILE));
    } else if (input.rightDown) {
      Draw.eraseSweep(p.x, p.y);
    }
  }

  function pressUp(src) {
    input.leftDown = false;
    input.cardDown = false;
    input.pressedCtl = null;
    // a ring still whole was answered by this lift; a broken one fades out
    if (fx.release && fx.release.brokeAt === null) fx.release = null;
    if (game.phase === 'command' && Draw.active) {
      const p = toNative(src);
      let tap = !input.dragMoved;
      if (!tap && touchMode && input.dragOrigin) {
        // the second opinion: quick and short-travelled is a tap after all
        const dx = p.x - input.dragOrigin.x, dy = p.y - input.dragOrigin.y;
        tap = performance.now() - input.pressT < TAP_MS
              && dx * dx + dy * dy < TAP_TRAVEL * TAP_TRAVEL;
      }
      // a tap never commands: whatever few tiles the roll grew, take back
      if (tap && Draw.active.tiles.length > 1) Draw.active.tiles.length = 1;
      Draw.commit(!tap && input.dragMoved);
      /* A tap browses the pile -- judged from where the press LANDED, not
         where the thumb happened to lift. The release point of a rolled tap
         can sit outside the pile's reach entirely, and browsing from there
         found one ghost where the player saw four. */
      if (tap) {
        const at = input.dragOrigin || p;
        Draw.cycleAt(at.x, at.y);
        if (game.drill) {
          // the card can tell a tap from a drag, and says so
          game.drill.taps++;
          coachFx.tapAt = uiClock;
        }
      }
    } else if (input.pendingResume && !input.dragMoved) {
      resumeFromCommand();
    }
    input.pendingResume = false;
    input.dragOrigin = null;
  }

  screenCanvas.addEventListener('mousedown', (ev) => {
    touchMode = false;
    Sound.ensure(); Sound.resume();
    pressDown(ev, ev.button);
    drillCheck();
  });
  window.addEventListener('mousemove', (ev) => {
    pressMove(ev);
    const d = toDisplay(ev);
    input.dx = d.x; input.dy = d.y; input.hovering = true;
    syncCursor();
  });
  // off the edge of the window entirely: nothing on the glass is under it
  window.addEventListener('mouseout', (ev) => {
    if (ev.relatedTarget) return;
    input.hovering = false;
    syncCursor();
  });
  window.addEventListener('mouseup', (ev) => {
    input.cardDown = false;   // whichever button it was held with
    if (ev.button === 2) { input.rightDown = false; Draw.endErase(); return; }
    if (ev.button !== 0) return;
    pressUp(ev);
    drillCheck();
  });

  /* ---- touch ----
     One finger is the mouse, and that is the whole vocabulary. The right
     button's erase sweep gets no finger equivalent: drawing a new order is
     already the way to change one, and retracting the tip mid-drag already
     undoes a stroke -- both single-finger. A multi-touch gesture for the
     remainder would be the most fragile thing on the phone in exchange for
     an edit nobody reaches for.
     Extra fingers are therefore not just unused but actively ignored: the
     first finger down owns the gesture until it lifts, so a palm or a
     second thumb cannot wrench a half-drawn path somewhere else. Every
     touch event is swallowed whole, so the browser never scrolls, zooms, or
     fires a stale synthetic click afterwards. */
  const touchOpts = { passive: false };

  function primaryTouch(ev) {
    const live = ev.touches || [];
    for (let i = 0; i < live.length; i++) {
      if (live[i].identifier === input.touchId) return live[i];
    }
    return null;
  }

  screenCanvas.addEventListener('touchstart', (ev) => {
    if (ev.cancelable) ev.preventDefault();
    touchMode = true;
    Sound.ensure(); Sound.resume();
    const first = ev.changedTouches && ev.changedTouches[0];
    if (!first || input.touchId !== null) return;   // a gesture is already running
    input.touchId = first.identifier;
    pressDown(first, 0);
    drillCheck();
  }, touchOpts);

  screenCanvas.addEventListener('touchmove', (ev) => {
    if (ev.cancelable) ev.preventDefault();
    const t = primaryTouch(ev);
    if (t) pressMove(t);
  }, touchOpts);

  function touchRelease(ev) {
    if (ev.cancelable) ev.preventDefault();
    const changed = ev.changedTouches || [];
    let mine = null;
    for (let i = 0; i < changed.length; i++) {
      if (changed[i].identifier === input.touchId) mine = changed[i];
    }
    if (!mine) return;              // some other finger let go; not our gesture
    input.touchId = null;
    pressUp(mine);
    drillCheck();
  }
  screenCanvas.addEventListener('touchend', touchRelease, touchOpts);
  screenCanvas.addEventListener('touchcancel', touchRelease, touchOpts);

  window.addEventListener('resize', layout);
  // phones report the new dimensions a beat after they announce the turn
  window.addEventListener('orientationchange', () => setTimeout(layout, 60));
}

/* ------------------------------ rendering ------------------------------- */

function layout() {
  /* Size the raster in device pixels, not CSS pixels. Windows display
     scaling (devicePixelRatio 1.25/1.5) otherwise stretches the finished
     canvas with nearest-neighbor resampling -- the board shrugs it off,
     but every smooth glyph in the command layer gets its strokes eaten.
     One native pixel maps to exactly `scale` device pixels; the CSS size
     is set to compensate, so nothing on screen changes position. */
  const dpr = window.devicePixelRatio || 1;
  scale = Math.max(1, Math.floor(Math.min(
    window.innerWidth * dpr / NATIVE_W, window.innerHeight * dpr / NATIVE_H)));
  screenCanvas.width = NATIVE_W * scale;
  screenCanvas.height = NATIVE_H * scale;
  screenCanvas.style.width = (NATIVE_W * scale / dpr) + 'px';
  screenCanvas.style.height = (NATIVE_H * scale / dpr) + 'px';
  screenCtx = screenCanvas.getContext('2d');
  screenCtx.imageSmoothingEnabled = false;
  buildTypeScale(dpr);
  coachSets = new WeakMap();   // a new glass sets every sentence afresh
  /* ...and the card's spring holds display px of the old glass: dropped,
     the first frame at the new scale lands at rest, as a practice's first
     frame does, instead of flying in from where the old scale left it */
  coachFx.geo = null;
  rescaleGlass();
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

/* Frozen, the board leaves the machine: the command layer redraws it on
   the glass (drawFrozenBoard), and the framebuffer has nothing of its own
   to show in those rows. The handover is staged the way a 1981 board
   staged anything mid-frame, on a raster interrupt: stopped time arrives
   as a band opening up and down from the row that stopped it, whole tile
   rows at a time, complete in about 100ms -- live pixels outside it, the
   lifted board inside. Nothing fades. Only the entrance is staged -- the
   phase flipped on the click, and a thaw snaps straight back to the
   pixels, because a frozen-looking board over a running one would say
   time is stopped when it is not.
   Returns the band as [lo, hi) maze rows, or null when the whole board is
   on one side of the split. */
const SPLIT_TICKS = 6;
function bankBand() {
  if (game.phase !== 'command' || fx.skipEnter || reducedMotion()) return null;
  const k = Math.min(1, fxT() / SPLIT_TICKS);
  const row0 = Math.max(0, Math.min(MAZE_ROWS - 1, Math.floor(fx.origin.y / TILE)));
  const half = Math.floor(k * Math.max(row0, MAZE_ROWS - 1 - row0));
  const lo = row0 - half, hi = row0 + half + 1;
  if (lo <= 0 && hi >= MAZE_ROWS) return null;
  return { lo: Math.max(0, lo), hi: Math.min(MAZE_ROWS, hi) };
}
/* Paint something either side of the split. `paint(frozen)` draws it for
   one side; mid-split it runs twice, each under a clip of whole tile rows
   -- the live rows above and below the band, then the band -- so the
   walls, the pellets on the board and the pellets punched back over the
   orders all split on the same scanline and never disagree with each
   other. The framebuffer paints nothing on the frozen side: those rows
   are the lifted board's (frozenClip reads the same band). */
function splitBank(g, paint) {
  const band = bankBand();
  if (!band) { paint(game.phase === 'command'); return; }
  const y0 = (band.lo + HUD_TOP) * TILE, y1 = (band.hi + HUD_TOP) * TILE;
  g.save();
  g.beginPath();
  g.rect(0, 0, NATIVE_W, y0);
  g.rect(0, y1, NATIVE_W, NATIVE_H - y1);
  g.clip();
  paint(false);
  g.restore();
  g.save();
  g.beginPath();
  g.rect(0, y0, NATIVE_W, y1 - y0);
  g.clip();
  paint(true);
  g.restore();
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
  /* His lives in reserve, drawn apart from our contracts: red specters are
     boards we can still lose, yellow discs are catches he can still absorb. */
  for (let i = 0; i < Math.max(0, game.evaderLives - 1); i++) {
    g.drawImage(SPRITES.minis.gob, (8 + i) * TILE, by);
  }
  const shown = Math.min(game.level, 6);
  for (let i = 0; i < shown; i++) {
    const idx = (game.level - shown + i) % FRUIT_ART.length;
    g.drawImage(SPRITES.fruit[idx], (COLS - 2 - (shown - i) * 2) * TILE, by - 4);
  }
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
  // maze -- frozen time lifts it off the glass (drawFrozenBoard), split
  // along a raster line while that is arriving (see splitBank)
  if (game.phase === 'flash') {
    const on = (game.flashT / 12 | 0) % 2 === 0;
    g.drawImage(on ? mazeLayerWhite : mazeLayer, 0, yOff);
  } else {
    splitBank(g, frozen => { if (!frozen) g.drawImage(mazeLayer, 0, yOff); });
  }
  if (game.phase !== 'flash') splitBank(g, frozen => { if (!frozen) drawDots(g, PAL.dot); });
  // fruit
  if (game.fruit) {
    g.drawImage(SPRITES.fruit[game.fruit.idx % SPRITES.fruit.length],
      DEN_EXIT_X - 8, tcy(FRUIT_TILE.r) - 8 + yOff);
  }
  // faint trails during live play (and the self-playing demo)
  if (game.phase === 'play' || (game.phase === 'attract' && game.demo)) {
    game.hunters.forEach((h) => {
      if (!h.path) return;
      const tiles = h.path.closed ? h.path.tiles : h.path.tiles.slice(Math.max(0, h.path.idx - 1));
      drawTrail(g, tiles, h.color, { closed: h.path.closed, ants: -(uiFrame >> 2), faint: true });
    });
  }
  /* Frozen, the selection brackets and the needs-orders mark are the
     glass's now, drawn crisp over the lifted board (drawFrozenMarks): a
     chunky bracket would be the one thing left on it that looked like
     the old screen. */
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
    // in command the actors leave the framebuffer; the command layer owns
    // them -- all except a dissolving hunter, which dies as pixels
    if (game.phase !== 'command') game.evader.draw(g, game);
    hunterDrawOrder().forEach(h => {
      if (game.phase !== 'command' || h.state === 'dissolving') h.draw(g, game);
    });
  } else {
    hunterDrawOrder().forEach(h => h.draw(g, game));
  }
  // popups -- frozen, they ride the punch-back instead, over the lifted board
  if (game.phase !== 'command') drawPopups(g);
  /* The message slot: the one place on the board where text belongs, the
     same row the round-start banner uses. Everything routes through here.
     Frozen time says nothing here: the banner blanked a corridor of the
     fruit lane in exactly the phase the player reads the maze hardest, and
     the status pill up in the HUD says it better. The machine keeps its
     voice for the moments that belong to the machine. */
  if (game.phase === 'ready') {
    drawMessage(g, 'READY!', PAL.yellow);
  } else if (game.phase === 'escaped') {
    drawMessage(g, 'TARGET ESCAPED', PAL.red);
  } else if (game.phase === 'gameover') {
    drawMessage(g, 'GAME  OVER', PAL.red);
  } else if (hintWindowOpen() && (uiFrame / 24 | 0) % 2 === 0) {
    drawMessage(g, 'GRAB A GHOST', PAL.peach);
  }
}

/* Score popups, held inside the screen so an edge capture still reads.
   Their ticks run out frozen or not, so one can still be up when time
   stops; it is board text, palette and all, wherever it is drawn. */
/* Where a popup's text sits this tick, in native canvas px: held inside the
   screen so an edge capture still reads, and drifting up as it ages. The
   glass asks too -- a mark drawn over a popup is a mark drawn over words. */
function popupBox(p) {
  const half = p.text.length * 4;
  const x = Math.max(half + 2, Math.min(NATIVE_W - half - 2, p.x));
  const y = Math.max(0, p.y + HUD_TOP * TILE - (90 - p.t) / 6);
  return { x: x - half, y, w: half * 2, h: TILE };
}
function drawPopups(g) {
  game.popups.forEach(p => {
    const b = popupBox(p);
    drawTextCentered(g, p.text, b.x + b.w / 2, b.y, p.color);
  });
}

/* The first untouched seconds of a real round, when the board's message
   slot says GRAB A GHOST and the ? chip breathes. Counted from the round's
   own start: game.tick runs through the attract demo, and a window read
   off it had usually closed before anyone could see it. The practice has
   its own card, a first game has its toast saying the same thing better,
   and one voice at a time is plenty. */
function hintWindowOpen() {
  return game.phase === 'play' && game.hint && !game.drill && !g1Wanted()
    && game.tick - game.playTick0 < 960;
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
  const a = game.attract;   // a.t advances on ticks, in frame()
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
      // no cabinet has a START button under a thumb
      drawTextCentered(g, touchMode ? 'TAP TO START' : 'PUSH START', cx, 230, PAL.orange);
    }
    drawTextCentered(g, 'c 1981 NULLSTAR MFG CO', cx, 262, PAL.peach);
    return;
  }
  // page 1: how to command
  /* Every line is a complete thought: these render centered, so the eye
     takes each one as a unit and a sentence broken mid-clause garden-paths. */
  drawTextCentered(g, 'YOU ARE THE GHOSTS', cx, 40, PAL.yellow);
  drawTextCentered(g, 'GRAB A GHOST. TIME STOPS.', cx, 64, PAL.white);
  drawTextCentered(g, 'DRAG THE PATH IT WILL WALK', cx, 76, PAL.white);
  drawTextCentered(g, 'CLOSE THE LOOP TO PATROL', cx, 94, PAL.cyan);
  drawTextCentered(g, 'DRAG BACK TO ERASE', cx, 106, PAL.cyan);
  drawTextCentered(g, 'NO ORDERS MEANS STUPID', cx, 124, PAL.red);
  drawTextCentered(g, 'WALLS STOP IDLE GHOSTS', cx, 136, PAL.red);
  drawTextCentered(g, 'HE OUTRUNS ANY ONE OF YOU', cx, 154, PAL.orange);
  drawTextCentered(g, 'HUNT AS A PACK OR STARVE', cx, 166, PAL.orange);
  drawTextCentered(g, 'CATCH THE YELLOW GUY', cx, 184, PAL.yellow);
  drawTextCentered(g, 'BEFORE HE EATS THE MAZE', cx, 196, PAL.yellow);
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
  game.demoFright = false;
  game.phase = 'attract';
  // a siren left running from the round that just ended would outlive it
  Sound.stopSiren();
}

/* ------------------------------ main loop ------------------------------- */

/* Presentation time. Every blink, pulse and flicker counts in uiFrame, and
   it used to be "one per requestAnimationFrame" -- which is one per refresh,
   so a 120Hz screen blinked twice as fast and the overdrive flicker became a
   15Hz strobe. It is now read off the rAF timestamp at a fixed 60 per
   second, whatever the glass refreshes at. uiClock is the same clock with
   its fraction kept, for anything that animates rather than blinks. Neither
   is simulation state: game.update never reads them. */
const UI_HZ = 60;
let uiFrame = 0;
let uiClock = 0;
let uiEpoch = null;
let lastTime = 0, acc = 0;

function frame(now) {
  requestAnimationFrame(frame);
  if (typeof now !== 'number') now = performance.now();
  if (uiEpoch === null) uiEpoch = now;
  // never backwards, whatever order a browser delivers timestamps in
  uiClock = Math.max(uiClock, (now - uiEpoch) * UI_HZ / 1000);
  uiFrame = Math.floor(uiClock);
  if (!lastTime) lastTime = now;
  let dt = now - lastTime;
  lastTime = now;
  if (dt > 100) dt = 100;
  acc += dt;

  const livePhases = ['ready', 'play', 'capture', 'flash', 'escaped', 'gameover'];
  let steps = 0;
  while (acc >= TICK_MS && steps < 4) {
    acc -= TICK_MS; steps++;
    // the attract pages turn on ticks, like everything else that keeps time
    if (game.phase === 'attract') game.attract.t++;
    /* The manual opened during READY holds the count too. openHelp only
       freezes live play, and READY is not live -- so the round used to
       start underneath a player who was still reading. */
    const reading = game.helpOpen && game.phase === 'ready';
    if (livePhases.includes(game.phase) && !reading) game.update();
    else if (game.phase === 'attract' && game.demo) {
      game.phase = 'play'; game.update();
      if (game.phase === 'play' || game.phase === 'command') game.phase = 'attract';
      else { startDemo(); }   // demo round ended somehow: restart it
    }
    // popup decay and the capture shake run on ticks regardless of phase
    game.popups = game.popups.filter(p => --p.t > 0);
    if (game.shakeT > 0) game.shakeT--;
  }
  drillCheck();

  render();
}

function render() {
  hotFrame = null; hotFrameOpen = true;
  tipTick();   // before the board, which leaves GRAB A GHOST to a toast that is up
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
  if (game.shakeT > 0) sx = ((uiFrame % 2) * 2 - 1) * scale;
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

  drawFrozenBoard(sctx, sx, sy);   // frozen: the board lifts off the glass
  drawOrderLayer(sctx, sx, sy);

  /* The board is what the player is actually reading, so it wins: after the
     command layer is down, the pellets and the actors are punched back over
     the top of it. An order must never hide the food it is drawn across. */
  if (game.phase === 'command' || game.phase === 'play'
      || (game.phase === 'attract' && game.demo)) {
    const ds = dotScratch.getContext('2d');
    ds.clearRect(0, 0, NATIVE_W, NATIVE_H);
    splitBank(ds, frozen => { if (!frozen) drawDots(ds, PAL.dot); });
    if (game.fruit) {
      ds.drawImage(SPRITES.fruit[game.fruit.idx % SPRITES.fruit.length],
        DEN_EXIT_X - 8, tcy(FRUIT_TILE.r) - 8 + HUD_TOP * TILE);
    }
    if (game.phase !== 'flash') {
      if (game.phase !== 'command') game.evader.draw(ds, game);
      hunterDrawOrder().forEach(h => {
        if (game.phase !== 'command' || h.state === 'dissolving') h.draw(ds, game);
      });
    }
    /* Frozen, the lifted board's black would bury anything left in the
       framebuffer, so what has no art up here -- a fruit, a ghost
       dissolving, a score popup -- comes back over it from the scratch. */
    if (game.phase === 'command') drawPopups(ds);
    /* The lifted cast throws its shadows here, under the pellets about to
       come back: a shadow drawn with the actors would land on the food
       around them, and the glass must never hide the board. Frozen, the
       food comes back round, on the glass, straight after. */
    if (game.phase === 'command') {
      drawContactShadows(sctx, sx, sy);
      drawFrozenDots(sctx, sx, sy);
    }
    /* The command layer ran in between and is allowed to smooth. A leak
       from in there would resample the pellets on the way back up, and the
       palette lock cannot see inside the layer to catch it -- so say it
       again here, where it counts. */
    sctx.imageSmoothingEnabled = false;
    sctx.drawImage(dotScratch, sx, sy, NATIVE_W * scale, NATIVE_H * scale);
    drawFrozenMarks(sctx, sx, sy);   // the brackets and the '!', crisp
    drawFrozenFurniture(sctx, sx, sy);   // roster and pill, over the marks
    drawLiftedCast(sctx, sx, sy);   // frozen, the cast rides on the glass
  }

  drawGlassOver(sctx, sx, sy);   // readouts that must never be punched through
  drawCoachLayer(sctx);   // the practice's card, over the board and under the manual
  drawTipLayer(sctx);    // a real game's one-time toasts, and the game-over chip
  drawHelpLayer(sctx);   // the ? chip and its manual float above everything
  listenForPincer();
  syncShell();
  syncCursor();
  hotFrame = null; hotFrameOpen = false;
}

/* The room around the cabinet. index.html owns every look -- the ring, the
   ghost-colored light, the type -- and this only tells it what state the
   game is in: frozen or not, blocked on an overdue ghost or not, whose
   color the room should take, and the one live instruction line, which is
   the most legible text a phone has because it is real type. The DOM is
   touched only when that state changes, and never read back. Every access
   is fenced: the page can be missing pieces (the test harness has no body
   at all), and a shell that cannot be lit must never cost a frame.
   During the practice the live line is the coach card's lead, frozen or
   not, and body.coaching keeps it up in live play too, a size up and in
   the card's sentence case: the card is canvas type, and this is the
   same sentence in the page's own. */
const shell = { key: null };
function syncShell() {
  const frozen = game.phase === 'command';
  const coaching = !!game.drill;
  const stalled = frozen ? stalledHunter() : null;
  const sel = frozen ? game.hunters[Draw.selected] : null;
  const verb = touchMode ? 'TAP' : 'CLICK';
  /* Nothing leaves the den on its own any more, so holding a ghost that
     is sitting in there says the one thing a new player cannot guess. */
  const denSel = sel && !sel.path && (sel.state === 'idle' || sel.state === 'respawn');
  let line = stalled ? stalled.def.name + ' NEEDS ORDERS'
    : denSel ? sel.def.name + ' WAITS IN THE DEN · DRAG IT OUT'
    : 'DRAG A GHOST · ' + verb + ' EMPTY MAZE TO RUN';
  if (coaching) {
    /* the sheet's head is a label on the glass, and a sentence down here;
       the hero card's instruction is its body, so the line says both */
    const c = drillCopy();
    line = c.head ? c.head.charAt(0) + c.head.slice(1).toLowerCase() + ' ' + c.lead
      : coachHero() ? c.lead + ' ' + c.caption : c.lead;
  }
  const key = frozen + '|' + !!stalled + '|' + (sel ? sel.color : '') + '|' + coaching + '|' + line;
  if (key === shell.key) return;
  shell.key = key;
  try {
    const body = document.body;
    body.classList.toggle('frozen', frozen);
    body.classList.toggle('blocked', !!stalled);
    body.classList.toggle('coaching', coaching);
    // the room keeps the last ghost's color on the way out, so the light
    // fades rather than flashing to a default first
    if (sel) body.style.setProperty('--accent', sel.color);
    const live = document.getElementById('hint-live');
    if (live && (frozen || coaching)) live.textContent = line;
    /* The page greeted a first visit with "a practice comes first". Once
       one has run, that is no longer true of anything on screen, so the
       resting line goes back to the returning player's -- swapped as the
       real game starts, while nobody is mid-drag for the slot to move. */
    const idle = document.getElementById('hint-idle');
    if (!coaching && coachFx.startedAt > -1e9 && idle && idle.dataset && idle.dataset.after) {
      idle.innerHTML = idle.dataset.after;
      delete idle.dataset.after;
    }
  } catch (e) {}
}

/* The pointer's own vocabulary, for a mouse: a hand over anything that
   answers a click, an open hand over a ghost or an arrowhead you could
   pick up, a closed one while you hold a route, the crosshair everywhere
   else. The same questions pressDown asks, in the same order, but only the
   pure ones -- Draw.pickAt would reselect and restack the pile just for
   being hovered. Written to the page only when the answer changes. */
let cursorNow = '';
function pointerTarget() {
  if (touchMode || !input.hovering) return { cursor: 'crosshair', hover: null };
  const d = { x: input.dx, y: input.dy };
  const px = d.x / scale, py = d.y / scale - HUD_TOP * TILE;
  const hand = (hover) => ({ cursor: 'pointer', hover });
  if (game.helpOpen) {
    if (inRect(d, helpUI.practice)) return hand('practice');
    return inRect(d, helpUI.close) ? hand('close') : { cursor: 'crosshair', hover: null };
  }
  if (Draw.active) return { cursor: 'grabbing', hover: null };
  if (inRect(d, helpUI.btn)) return hand('help');
  if (game.phase === 'gameover' && inRect(d, gameOverUI.practice)) return hand('retry');
  if (game.drill) {
    // graduation: the whole glass is the button
    if (game.drill.step === 'graduate') return hand(inRect(d, coachUI.play) ? 'grad' : null);
    if (inRect(d, coachUI.skip)) return hand('skip');
    if (cardHolds(d, px, py)) return { cursor: 'default', hover: null };
  }
  if (game.phase === 'command') {
    if (inRect(d, rosterUI.play)) return hand('play');
    if (inRect(d, rosterUI.camp)) return hand('camp');
    const slot = rosterUI.slots.find(s => inRect(d, s));
    if (slot) {
      const h = game.hunters[slot.i];
      return h && h.isCommandable() ? hand('slot' + slot.i) : { cursor: 'crosshair', hover: null };
    }
    if (Draw.poolAt(px, py).length || Draw.tipAt(game, px, py)) return { cursor: 'grab', hover: null };
  } else if (game.phase === 'play' && Draw.poolAt(px, py).length) {
    return { cursor: 'grab', hover: null };
  }
  return { cursor: 'crosshair', hover: null };
}
function syncCursor() {
  const t = pointerTarget();
  // a held button owns the look until it lets go
  input.hoverCtl = input.leftDown || input.rightDown ? null : t.hover;
  if (t.cursor === cursorNow) return;
  cursorNow = t.cursor;
  try { screenCanvas.style.cursor = t.cursor; } catch (e) {}
}

/* BEGIN COMMAND LAYER ----------------------------------------------------
   Everything above this point is a 1981 machine and obeys its rules. This
   does not. The orders you draw are the one thing on screen that isn't a
   cabinet artifact -- they are you reaching into the glass -- so they render
   after the CRT pass, at full display resolution, with curves, glow and
   colors the hardware could never have produced. The contrast is the point,
   which is why the palette lock deliberately does not apply here.
------------------------------------------------------------------------- */

/* ---- tokens ----
   The glass has its own small palette, and it is named rather than typed
   out at each call so the chrome reads as one designed surface instead of
   seven slightly different blues. Ghost colors still come from the ghosts. */
const TOKENS = {
  ink:   '#ffffff',              // primary text
  muted: '#8fa0c0',              // secondary text, labels
  body:  '#c0cae2',              // a sentence to be read: 8.8:1 on the glass over white, 12:1 over black
  glass: 'rgba(8,12,28,0.88)',   // control fill
  line:  '#5878ff',              // hairlines and rims
  ok:    '#40ff88',              // ready, go
  warn:  '#ffb040',              // overdue, blocked
  alert: '#ff5060',              // refused
  scrim: 'rgba(0,0,8,0.78)',     // behind a sheet: the machine, dimmed
  onColor: '#0a0e1c',            // type set on a ghost color or a filled button
  track:   'rgba(255,255,255,0.14)',  // the unlit part of a ring
  specular: 'rgba(255,255,255,0.16)', // the hairline where light catches glass
  shadow:  'rgba(0,0,6,0.7)',    // what a floating card casts
  casing:  '#00000a',            // the dark edge a route is laid on, map-style
  wave:    '#c8dcff',            // the freeze wave's ring at its brightest
  waveClear: 'rgba(200,220,255,0)',  // ...and either side of it
  hover:   'rgba(255,255,255,0.08)',  // a control under a resting mouse
  press:   'rgba(255,255,255,0.14)',  // ...and under a press
};

/* ---- type ----
   The board speaks in 8x8 tiles; the glass speaks in real type. Sizes are
   S-proportional so the layout holds its shape at every scale, but each
   role carries a floor in CSS px -- because canvas px are device px, and a
   floor written in those is 6 CSS px on a dpr-3 phone. Figures are set in
   the monospace so a countdown never shuffles its neighbours; the rest is
   the platform's own UI face.
   k: size in native px (times scale); floor: CSS px; track: em; least:
   how far below its floor a role may shrink to fit, in CSS px, where the
   floor is a resting size rather than a limit -- a ghost's name rests at
   12 CSS px, but on a dpr-3 phone EMBER at 12 is wider than its card. */
const UI_SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const UI_MONO = 'ui-monospace, Menlo, Consolas, monospace';
const TYPE_ROLES = {
  numeral: { k: 7,   floor: 15,   weight: 700, family: UI_MONO },  // big figures
  badge:   { k: 4.4, floor: 10,   weight: 700, family: UI_MONO },  // a card's number
  head:    { k: 6,   floor: 16,   weight: 700, family: UI_SANS, track: 0.04 },  // sheet titles
  title:   { k: 4.6, floor: 12,   weight: 600, family: UI_SANS, track: 0.06, least: 10.5 },  // names
  lead:    { k: 3.8, floor: 11,   weight: 600, family: UI_SANS },  // a rule's first line
  caption: { k: 3.6, floor: 10.5, weight: 500, family: UI_SANS },  // status, labels
  figure:  { k: 3.6, floor: 10.5, weight: 600, family: UI_MONO },  // small numbers
  micro:   { k: 3.2, floor: 9,    weight: 500, family: UI_SANS },  // hints only
  /* The practice's own voice. Its sentences are read while the player is
     doing something else, so they are set a size up from the rules, and
     never at a label's floor: 16 and 14 CSS px on the smallest glass,
     growing with the scale from there. */
  coachLead: { k: 5,   floor: 16, weight: 600, family: UI_SANS },  // what to do now
  coachBody: { k: 4.4, floor: 14, weight: 500, family: UI_SANS },  // ...and why, or where
  /* The first instruction, front and centre: the practice's opening card
     and a first real game's toast, over the den, read before the hand
     knows where anything is. Lead and body both a good size up, so the
     one thing to do is the biggest thing on the glass. */
  heroLead: { k: 7,   floor: 22, weight: 600, family: UI_SANS },
  heroBody: { k: 5.2, floor: 16, weight: 500, family: UI_SANS },
};
let uiDpr = 1;
let TYPE = {};

/* Canvas px for a size of k native px that never drops below floorCss CSS
   px. Everything in the command layer that must stay legible goes through
   this, not through bare scale. */
function uiPx(k, floorCss) {
  return Math.max(scale * k, floorCss * uiDpr);
}

/* Per layout(), not per frame: each role's resting size, its floor, and
   every font string in between, so fitting text never builds strings. */
function buildTypeScale(dpr) {
  uiDpr = dpr || 1;
  TYPE = {};
  for (const name in TYPE_ROLES) {
    const r = TYPE_ROLES[name];
    const min = Math.ceil((r.least || r.floor) * uiDpr);
    const max = Math.max(Math.ceil(r.floor * uiDpr), Math.round(uiPx(r.k, r.floor)));
    const fonts = [], track = [];
    for (let px = min; px <= max; px++) {
      fonts[px] = r.weight + ' ' + px + 'px ' + r.family;
      track[px] = r.track ? (r.track * px).toFixed(2) + 'px' : '0px';
    }
    TYPE[name] = { min, max, fonts, track, tracked: !!r.track };
  }
  /* The status pill lives in one HUD row, eight board pixels tall, and on
     a small phone that row is barely eleven CSS px -- less than a caption
     at its floor plus any glass round it. So the pill's words are sized
     from the capsule the row can hold, not the other way round: a caption
     where it fits, down to the micro floor where it does not. */
  const box = pillBox();
  for (const [name, like] of [['pillCap', 'caption'], ['pillFig', 'figure']]) {
    const r = TYPE_ROLES[like];
    const floor = Math.ceil(TYPE_ROLES.micro.floor * uiDpr);
    const max = Math.max(floor, Math.min(TYPE[like].max, Math.round(box.h * 0.62)));
    const min = Math.min(max, floor);
    const fonts = [], track = [];
    for (let px = min; px <= max; px++) {
      fonts[px] = r.weight + ' ' + px + 'px ' + r.family;
      track[px] = '0px';
    }
    TYPE[name] = { min, max, fonts, track, tracked: false };
  }
}

/* The pill's capsule, at rest: centred in HUD row 2, and never taller than
   the row less a hairline, whatever the caption's floor would like. The
   maze's top wall is the next row down, and the glass may not touch it. */
const PILL_ROW = 2;   // HUD row 2, native y 16-24: the empty one under the scores
function pillBox() {
  const S = scale;
  const floorRoom = HUD_TOP * TILE * S - uiDpr;
  const rowTop = PILL_ROW * TILE * S;
  const h = Math.min(Math.max(S * 7, TYPE.caption.max + uiDpr * 7), floorRoom - rowTop);
  return { top: rowTop + (TILE * S - h) / 2, h, floor: HUD_TOP * TILE * S };
}

/* `tight` sets a tracked role with no tracking: the last thing given up
   at the floor, before a shorter word is. */
function setRoleFont(ctx, T, px, tight) {
  ctx.font = T.fonts[px];
  if (T.tracked && 'letterSpacing' in ctx) ctx.letterSpacing = tight ? '0px' : T.track[px];
}

/* A role's resting size in canvas px -- for laying out around text. */
function rolePx(role) { return TYPE[role].max; }

/* Width of text set in a role at its resting size, without drawing it. */
function roleWidth(ctx, text, role) {
  const T = TYPE[role];
  ctx.save();
  setRoleFont(ctx, T, T.max);
  const w = ctx.measureText(text).width;
  ctx.restore();
  return w;
}

/* Every word the glass prints goes through here. It tries the full text at
   the role's size and shrinks a pixel at a time toward the floor; if that
   still overflows maxW, the short label gets the same treatment; if even
   that overflows, the short label is set at the floor anyway -- legibility
   beats a tidy margin. A tracked role gives up its tracking at the floor
   before it gives up a word: a name five letters long spends a whole
   letter's width on air at a phone's floor size. `shortText` may be null,
   one label, or a list of ever-shorter ones; an empty string last means
   "leave it out" rather than print it over its neighbour. The fit is
   judged with every digit read as 0, so a countdown ticking 8, 7, 1 never
   flips the size under the player's eye. Alignment and baseline are the
   caller's; font, spacing and fill are not left behind. Returns the width
   drawn. Loops are bounded by the size range, so a measureText that
   answers 0 simply fits first time. */
function fitText(ctx, text, shortText, x, y, role, maxW, color) {
  const T = TYPE[role];
  ctx.save();
  ctx.fillStyle = color;
  let pick = null;
  const tries = [text].concat(shortText === null || shortText === undefined ? [] : shortText);
  for (let n = 0; n < tries.length && pick === null; n++) {
    const probe = tries[n].replace(/[0-9]/g, '0');
    for (let px = T.max; px >= T.min; px--) {
      setRoleFont(ctx, T, px);
      if (!maxW || ctx.measureText(probe).width <= maxW) { pick = tries[n]; break; }
    }
    if (pick === null && T.tracked) {
      setRoleFont(ctx, T, T.min, true);
      if (ctx.measureText(probe).width <= maxW) pick = tries[n];
    }
  }
  if (pick === null) {
    pick = tries[tries.length - 1];
    setRoleFont(ctx, T, T.min, true);
  }
  ctx.fillText(pick, x, y);
  const w = ctx.measureText(pick).width;
  ctx.restore();
  return w;
}

/* Words in the sans and figures in the mono, set as one line -- so ROUTE
   stays the platform's face while 3.2s never shuffles its neighbours.
   `variants` are ever-shorter alternatives, each a list of runs: { t, role,
   color } for text, or { w, paint(ctx, x, y) } for a small fixed-width
   mark. Every text run shrinks together a pixel at a time toward its floor
   before the next variant is tried, measured with digits read as 0, the
   way fitText does it; the last variant is set at the floor if nothing
   fits. Measuring is separate from drawing so a caller can size a capsule
   around the line first. Returns { runs, d, ws, w }: d px under resting
   size, each run's advance, and the total. */
function fitRuns(ctx, variants, maxW) {
  const measure = (runs, d) => {
    const ws = runs.map(r => {
      if (r.t === undefined) return r.w;
      const T = TYPE[r.role];
      setRoleFont(ctx, T, Math.max(T.min, T.max - d));
      return ctx.measureText(r.t.replace(/[0-9]/g, '0')).width;
    });
    return { ws, w: ws.reduce((a, b) => a + b, 0) };
  };
  ctx.save();
  let pick = null;
  for (let n = 0; n < variants.length && !pick; n++) {
    const runs = variants[n];
    let span = 0;
    for (const r of runs) if (r.t !== undefined) span = Math.max(span, TYPE[r.role].max - TYPE[r.role].min);
    for (let d = 0; d <= span; d++) {
      const m = measure(runs, d);
      if (!maxW || m.w <= maxW) { pick = { runs, d, ws: m.ws, w: m.w }; break; }
    }
  }
  if (!pick) {
    const runs = variants[variants.length - 1];
    const m = measure(runs, Infinity);
    pick = { runs, d: Infinity, ws: m.ws, w: m.w };
  }
  ctx.restore();
  return pick;
}
/* Set a fitted line left to right from x; y is the caller's baseline. */
function drawRuns(ctx, set, x, y) {
  ctx.save();
  ctx.textAlign = 'left';
  set.runs.forEach((r, i) => {
    if (r.t === undefined) { if (r.paint) r.paint(ctx, x, y); }
    else {
      const T = TYPE[r.role];
      setRoleFont(ctx, T, Math.max(T.min, T.max - set.d));
      ctx.fillStyle = r.color;
      ctx.fillText(r.t, x, y);
    }
    x += set.ws[i];
  });
  ctx.restore();
}
function cap(t, color) { return { t, role: 'caption', color: color || TOKENS.muted }; }
function num(t, color) { return { t, role: 'figure', color: color || TOKENS.ink }; }

/* ---- the presentation clock ----
   One clock for every entrance and exit on the glass, so nothing on it
   ever runs to a separate beat. It reads uiClock (60 per second off the
   rAF timestamp); the simulation never reads it, and freeze and resume
   never wait for it -- the phase has already flipped by the time any of
   this is asked. Headless, the clock moves only when a test drives
   frame(), and by then it has been driven a long way -- so tests stamp
   enterAt and thawAt relative to uiClock, never as bare numbers.
     enterAt   uiClock when time last stopped
     thawAt    uiClock when time last restarted (a refused PLAY is not one)
     origin    what stopped it, native maze px
     skipEnter the freeze came within FX_REFREEZE of a thaw: no entrance
     refusedAt uiClock when PLAY last said no
     release   a finger down on open floor, waiting to see if it lifts as a
               tap: { x, y } native maze px, brokeAt uiClock when it slid
               too far to mean "go" (null while it still can). Input writes
               this one; it is a picture of input.pendingResume, nothing more */
const FX_REFREEZE = 20;    // ticks
const FX_SPRING = 13.2;    // ticks: ~220ms to settle
const FX_EXIT = 8;         // ticks: exits leave faster than entrances arrive
const fx = {
  enterAt: -1e9, thawAt: -1e9, refusedAt: -1e9,
  origin: { x: NATIVE_W / 2, y: MAZE_ROWS * TILE / 2 },
  skipEnter: false,
  release: null,
};
function fxT() { return Math.max(0, uiClock - fx.enterAt); }
function fxThawT() { return Math.max(0, uiClock - fx.thawAt); }

/* Underdamped: crosses its mark at ~80ms, overshoots by ~6% and is still
   inside half a percent at 220ms, where it snaps home. t in ticks. */
function springIn(t) {
  if (reducedMotion() || t >= FX_SPRING) return 1;
  if (t <= 0) return 0;
  const z = 0.667, w = 0.635, root = Math.sqrt(1 - z * z), wd = w * root;
  return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + (z / root) * Math.sin(wd * t));
}
/* Exit progress 0..1, decelerating, over FX_EXIT ticks. */
function easeOut(t) {
  if (reducedMotion() || t >= FX_EXIT) return 1;
  if (t <= 0) return 0;
  const u = 1 - t / FX_EXIT;
  return 1 - u * u * u;
}
/* The entrance as most things want it: sprung, or already home. */
function fxIn() { return fx.skipEnter ? 1 : springIn(fxT()); }

/* The release. Resume has already happened by the time any of this is
   drawn -- phase flipped on the click -- so it all plays over live frames
   and a freeze cancels it outright, simply by no longer being play. The
   lifted shells fade into the pixel sprites on the exit curve; each order
   is sent down its own line once. Reduced motion gets neither. */
const TRANSMIT_TICKS = 12;
function shellAlpha() {
  if (game.phase === 'command') return 1;
  if (game.phase !== 'play') return 0;
  return 1 - easeOut(fxThawT());
}
// ticks into the transmit, or -1 when none is running
function transmitT() {
  if (game.phase !== 'play' || reducedMotion()) return -1;
  const t = fxThawT();
  return t < TRANSMIT_TICKS ? t : -1;
}

let reduceMotionMQ;
function reducedMotion() {
  try {
    if (reduceMotionMQ === undefined) {
      reduceMotionMQ = (window.matchMedia
        && window.matchMedia('(prefers-reduced-motion: reduce)')) || null;
    }
    return !!(reduceMotionMQ && reduceMotionMQ.matches);
  } catch (e) { return false; }
}

/* Tile centres in display space, split into runs at tunnel seams. A run
   that leaves through a tunnel mouth is carried on to the edge of the
   playfield it exits by, and the run on the far side starts from the edge
   it comes in at, on the same row: the line visibly goes into one mouth
   and out of the other, instead of stopping a half-tile short of each and
   leaving a lone tile centre -- no line, no arrowhead -- on the far side
   of a route that has only just crossed. The stubs are drawing only;
   every timing on the route still counts in tiles. */
function orderPathPoints(tiles, closed, S, ox, oy) {
  const runs = [];
  let cur = [];
  const list = closed && tiles.length ? tiles.concat([tiles[0]]) : tiles;
  const at = (x, r) => ({ x: x * S + ox, y: (tcy(r) + HUD_TOP * TILE) * S + oy });
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    const prev = i > 0 ? list[i - 1] : null;
    if (prev && Math.abs(t.c - prev.c) > 1) {
      // leaving col 27 rightward exits on the right; col 0 leftward, on the left
      const outX = prev.c > t.c ? NATIVE_W : 0;
      cur.push(at(outX, prev.r));
      runs.push(cur);
      cur = [at(NATIVE_W - outX, t.r)];
    }
    cur.push(at(tcx(t.c), t.r));
  }
  if (cur.length) runs.push(cur);
  return runs;
}

/* Where an open route's arrowhead goes and which way it points: at its
   last tile, along the last stretch of line. Null when the route is a
   lone tile with no line to point along. */
function routeArrow(runs) {
  const last = runs[runs.length - 1];
  if (!last || last.length < 2) return null;
  const a = last[last.length - 2], b = last[last.length - 1];
  return { x: b.x, y: b.y, ang: Math.atan2(b.y - a.y, b.x - a.x) };
}

/* The arrowhead a route from routeOrder carries, if it carries one: a
   patrol has its ring and a route home its den instead. The order layer
   draws it from here and the frozen food leaves room for it from here,
   so the two can never disagree about where the heads are. */
function orderArrow(o) {
  return !o.closed && !o.home ? routeArrow(o.runs) : null;
}

function strokeRuns(ctx, runs, width, color, alpha, dashOffset, op) {
  ctx.save();
  if (op) ctx.globalCompositeOperation = op;
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

/* Frozen time lifts the target off the glass. While you plan, the evader is
   the one actor rendered the way the command layer renders everything --
   display-resolution curves, gradients, glow -- the same character, same
   footprint, same frozen mouth frame, just no longer made of tiles. The
   instant PLAY unfreezes him he drops back into the framebuffer. */
function drawEvaderHi(ctx, ox, oy) {
  const e = game.evader;
  if (!e || !e.alive) return;
  const S = scale;
  const x = e.x * S + ox, y = (e.y + HUD_TOP * TILE) * S + oy;
  const r = 7 * S;   // the sprite's 14px footprint, honestly kept
  // the chomp is frozen mid-bite exactly where time stopped
  const gape = [0.10, Math.PI / 8, Math.PI / 4][[0, 1, 2, 1][e.frame % 4]];
  const breathe = 1 + 0.025 * Math.sin(uiFrame / 20);

  ctx.save();
  ctx.translate(x, y);

  // a quiet halo so he reads as "held", like the head of a drawn order
  const halo = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, r * 2.1);
  halo.addColorStop(0, 'rgba(255,240,33,0.30)');
  halo.addColorStop(1, 'rgba(255,240,33,0)');
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(0, 0, r * 2.1, 0, Math.PI * 2); ctx.fill();

  // orient exactly like the sprite renderer: art faces right
  if (e.dir === 'left') ctx.scale(-1, 1);
  else if (e.dir === 'up') ctx.rotate(-Math.PI / 2);
  else if (e.dir === 'down') ctx.rotate(Math.PI / 2);
  ctx.scale(breathe, breathe);

  // body: the same yellow disc, with the curve the tile grid could never hold
  const body = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.15, 0, 0, r * 1.12);
  body.addColorStop(0, '#FFFAB0');
  body.addColorStop(0.55, '#FFF021');
  body.addColorStop(1, '#C8A400');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, r, gape, Math.PI * 2 - gape);
  ctx.closePath();
  ctx.fill();

  // the eye: same mark, same place as the sprite's two black pixels,
  // plus the one glint only display resolution can afford
  ctx.fillStyle = '#181818';
  ctx.beginPath(); ctx.arc(-1 * S, -3.5 * S, 1.25 * S, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath(); ctx.arc(-1.4 * S, -3.9 * S, 0.4 * S, 0, Math.PI * 2); ctx.fill();

  ctx.restore();
}

/* The hunters get the same lift off the glass as their target: dome, skirt,
   visor rebuilt as curves at display resolution, in whatever state time
   froze them -- their own colour, overdrive white, fright blue with the
   peach outline, or bare eyes walking home. Same 14px footprint, same
   frozen skirt frame. A dissolving hunter never comes up here: it dies in
   the framebuffer, as pixels. */
function shadeMix(hex, k) {
  // k > 0 mixes toward white, k < 0 toward black
  const n = parseInt(hex.slice(1), 16);
  const ch = [n >> 16 & 255, n >> 8 & 255, n & 255].map(v =>
    Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k)));
  return 'rgb(' + ch.join(',') + ')';
}

function drawHunterHi(ctx, ox, oy, h, idx) {
  const S = scale;
  const x = h.x * S + ox, y = (h.y + HUD_TOP * TILE) * S + oy;
  const eyesOnly = h.isEyes();
  const fright = game.frightT > 0 && !h.frightImmune && h.state === 'active';
  const frightFlash = fright && game.frightT < 120 && ((game.frightT / 12 | 0) % 2 === 0);
  const boosted = !fright && !eyesOnly && h.boostT > 0 && (uiFrame / 4 | 0) % 2 === 0;
  const body = fright ? (frightFlash ? PAL.frightW : PAL.fright)
             : boosted ? PAL.white : h.color;
  const breathe = 1 + 0.025 * Math.sin(uiFrame / 20 + idx * 1.7);

  ctx.save();
  ctx.translate(x, y);

  if (!eyesOnly) {
    const halo = ctx.createRadialGradient(0, 0, 3.5 * S, 0, 0, 14 * S);
    halo.addColorStop(0, shadeMix(body === PAL.frightW ? PAL.fright : body, 0).replace('rgb', 'rgba').replace(')', ',0.26)'));
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(0, 0, 14 * S, 0, Math.PI * 2); ctx.fill();
  }

  ctx.scale(S * breathe, S * breathe);   // native px units from here down
  const p = PUPIL_OFF[h.face()] || PUPIL_OFF.left;

  if (!eyesOnly) {
    // silhouette: dome over straight sides over the three-flame hem,
    // the hem phase frozen on whichever skirt frame time stopped
    const ph = (h.frame ? 1 : -1) * 0.7;
    ctx.beginPath();
    ctx.moveTo(-7, 0);
    ctx.arc(0, 0, 7, Math.PI, Math.PI * 2);
    ctx.lineTo(7, 7);
    const seg = 14 / 6;
    for (let k = 1; k <= 5; k++) {
      ctx.lineTo(Math.max(-6.6, Math.min(6.6, 7 - k * seg + ph)), k % 2 ? 4.9 : 7);
    }
    ctx.lineTo(-7, 7);
    ctx.closePath();
    const grad = ctx.createRadialGradient(-2.5, -3.2, 1, 0, 0, 9);
    grad.addColorStop(0, shadeMix(body, 0.55));
    grad.addColorStop(0.55, body);
    grad.addColorStop(1, shadeMix(body, -0.3));
    ctx.fillStyle = grad;
    ctx.fill();
    if (fright) {
      // same reason as the sprite's outline: fright blue melts into the
      // maze stroke without a peach rim
      ctx.strokeStyle = frightFlash ? h.color : PAL.peach;
      ctx.lineWidth = 0.7;
      ctx.stroke();
    }
  }

  if (fright) {
    const face = h.color;   // identity lives in the face; see renderHunterFrame
    ctx.fillStyle = face;
    ctx.beginPath(); ctx.arc(-3, -1, 1.1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(3, -1, 1.1, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = face;
    ctx.lineWidth = 0.9;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-6, 3.5);
    for (let k = 0; k < 3; k++) {
      ctx.lineTo(-6 + k * 4 + 2, 2.6);
      ctx.lineTo(-6 + k * 4 + 4, 3.5);
    }
    ctx.stroke();
  } else {
    // the scanning visor: oval whites, pupils shoved toward the heading
    for (const exOff of [-3, 3]) {
      ctx.fillStyle = PAL.eyeWhite;
      ctx.beginPath();
      ctx.ellipse(exOff, 0, 2, 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PAL.pupil;
      ctx.beginPath();
      ctx.arc(exOff + (p.x - 1), (p.y - 1) * 1.1, 1.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath();
      ctx.arc(exOff + (p.x - 1) - 0.4, (p.y - 1) * 1.1 - 0.45, 0.32, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
  if (h.isReady()) readyMark(ctx, x, y - 9.6 * S, S, h.color);
}

/* Whole, in the den, and free to go the moment it has a route: a small
   chevron over its head, pointing at the door. A mark, not a glow -- the
   den is four ghosts wide and a halo would bleed into the neighbours, who
   may be eyes still sitting out their wait. It rides a little, the one
   thing in the den that says "any time you like". */
function readyMark(ctx, x, y, S, color) {
  const ride = reducedMotion() ? 0 : Math.sin(uiFrame * 0.12) * S * 0.35;
  const w = S * 1.7, hgt = S * 1.1, cy = y - ride;
  const trace = () => {
    ctx.beginPath();
    ctx.moveTo(x - w, cy + hgt / 2);
    ctx.lineTo(x, cy - hgt / 2);
    ctx.lineTo(x + w, cy + hgt / 2);
  };
  ctx.save();
  const a = ctx.globalAlpha;   // the lifted cast's own fade
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = TOKENS.casing;
  ctx.globalAlpha = a * 0.7;
  ctx.lineWidth = Math.max(2, S * 0.9);
  trace(); ctx.stroke();
  ctx.globalAlpha = a;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, S * 0.42);
  trace(); ctx.stroke();
  ctx.restore();
}

/* ---- the frozen board ----
   Frozen, the whole board lifts off the glass the way the cast does: the
   walls, the pellets and the energizers are redrawn at display resolution
   in here, on a pure black field, with no scanlines, bloom or vignette
   over them. Every wall block is a solid shape -- a deep shade of the
   board's colour, a faint rim inside it and a crisp lit edge, with softly
   rounded corners -- traced from the same tile maze the pixel walls come
   from, so the corridors, the den and its door are exactly where they are
   in live play. Outside the maze counts as open, so the frame is a block
   like any other, floating, lit on both sides, and a tunnel mouth ends it
   in two rounded caps. Live play never sees any of this: the 1981 board
   comes back the instant time runs. It arrives on the same raster split
   as everything else frozen (bankBand), so the black opens from the row
   that stopped time and the pixels go with it, row for row. */
const FB_INSET = 1.25;   // native px each block stands back from its corridor
const FB_R_OUT = 2.6;    // a block's own corners
const FB_R_IN = 1.6;     // a corridor's corners (the block's inside bends)
const FB_EDGE = 0.75;    // the lit edge, native px, laid inside the block
const FB_DOT_R = 1.15;   // a pellet: the 2x2 square's area, as a disc
const FB_POWER_R = 3.3;  // an energizer
const FB_COLLAR = 0.7;   // the black ring a pellet is cut out of a route with
/* The walls and the energizer, baked once per board and scale. setBoard
   and layout() empty it; the key is the belt to their braces. */
const frozenCache = { key: null, walls: null, power: null };

function frozenBoardOn() { return game.phase === 'command'; }

/* The wall blocks as closed loops of tile corners, solid on the right of
   every edge (the glass's y runs down, so a block's outline goes round
   clockwise on screen, and anything it encloses that is open goes round
   the other way). Each corner keeps the headings in and out of it. */
function frozenWallLoops() {
  const solid = (c, r) => inBounds(c, r) && solidAt(c, r);
  const out = new Map();   // "x,y" -> edges leaving that corner
  const add = (x0, y0, x1, y1) => {
    const k = x0 + ',' + y0;
    if (!out.has(k)) out.set(k, []);
    out.get(k).push({ x0, y0, x1, y1, dx: x1 - x0, dy: y1 - y0, used: false });
  };
  for (let r = 0; r < MAZE_ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!solid(c, r)) continue;
      if (!solid(c, r - 1)) add(c, r, c + 1, r);
      if (!solid(c + 1, r)) add(c + 1, r, c + 1, r + 1);
      if (!solid(c, r + 1)) add(c + 1, r + 1, c, r + 1);
      if (!solid(c - 1, r)) add(c, r + 1, c, r);
    }
  }
  const loops = [];
  out.forEach(list => list.forEach(start => {
    if (start.used) return;
    const pts = [];
    let e = start;
    while (e && !e.used) {
      e.used = true;
      pts.push({ x: e.x0, y: e.y0, dx: e.dx, dy: e.dy });
      const cur = e;
      const cross = n => cur.dx * n.dy - cur.dy * n.dx;
      // a pinch where two blocks touch corner to corner: turn right, so each
      // block keeps its own corner instead of the two fusing through it
      const next = (out.get(e.x1 + ',' + e.y1) || []).filter(n => !n.used)
        .sort((a, b) => cross(b) - cross(a));
      e = next[0];
    }
    // keep only the corners: drop every point where the heading carries on
    const corners = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i - 1 + pts.length) % pts.length];
      if (p.dx !== q.dx || p.dy !== q.dy) {
        corners.push({ x: p.x, y: p.y, inX: q.dx, inY: q.dy, outX: p.dx, outY: p.dy });
      }
    }
    if (corners.length >= 4) loops.push(corners);
  }));
  return loops;
}

/* One path for every block, in native px: each edge stood back FB_INSET
   into its block, each corner rounded -- a block's own corners at FB_R_OUT,
   the corridor's at FB_R_IN. Anything open a block encloses winds the
   other way, so a nonzero fill leaves it open. */
function frozenWallPath() {
  const p = new Path2D();
  frozenWallLoops().forEach(loop => {
    const P = loop.map(v => ({
      x: v.x * TILE + FB_INSET * (-v.inY - v.outY),
      y: v.y * TILE + FB_INSET * (v.inX + v.outX),
      r: (v.inX * v.outY - v.inY * v.outX) > 0 ? FB_R_OUT : FB_R_IN,
    }));
    const n = P.length, a = P[n - 1], b = P[0];
    p.moveTo((a.x + b.x) / 2, (a.y + b.y) / 2);
    for (let i = 0; i < n; i++) {
      const cur = P[i], nxt = P[(i + 1) % n];
      p.arcTo(cur.x, cur.y, nxt.x, nxt.y, cur.r);
    }
    p.closePath();
  });
  return p;
}

// a palette entry at alpha a, for the glass
function hexAlpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
}

/* The bake, at scale S: the walls and the door on a canvas the size of the
   maze on the glass, and one energizer -- a steady disc with a small warm
   glow -- to be stamped where each one is. */
function frozenBake() {
  const S = scale;
  const key = boardIdx + '|' + S;
  if (frozenCache.key === key) return frozenCache;
  const cv = makeCanvas(NATIVE_W * S, MAZE_ROWS * TILE * S);
  const g = cv.getContext('2d');
  const col = BOARDS[boardIdx].wall;
  const path = frozenWallPath();
  g.setTransform(S, 0, 0, S, 0, 0);
  // the door first, seated under the ends of the den wall
  const dy = DOOR_ROW * TILE + TILE / 2;
  g.lineCap = 'round';
  g.strokeStyle = PAL.door;
  g.lineWidth = 1.6;
  g.beginPath();
  g.moveTo(DOOR_C0 * TILE - FB_INSET, dy);
  g.lineTo((DOOR_C1 + 1) * TILE + FB_INSET, dy);
  g.stroke();
  // the body: a deep shade of the board colour, flat
  g.fillStyle = shadeMix(col, -0.7);
  g.fill(path);
  g.save();
  g.clip(path);
  // a soft inner rim just inside the edge, so the block reads as raised
  g.strokeStyle = hexAlpha(col, 0.22);
  g.lineWidth = FB_EDGE * 2 + 2.4;
  g.stroke(path);
  // the lit edge, entirely inside the block so the corridor stays clean
  g.strokeStyle = shadeMix(col, 0.22);
  g.lineWidth = FB_EDGE * 2;
  g.stroke(path);
  g.restore();

  const R = FB_POWER_R * S, G = R * 2.4, w = Math.ceil(G * 2) + 2;
  const pw = makeCanvas(w, w);
  const pg = pw.getContext('2d');
  const m = w / 2;
  const glow = pg.createRadialGradient(m, m, R * 0.8, m, m, G);
  glow.addColorStop(0, hexAlpha(PAL.dot, 0.28));
  glow.addColorStop(1, hexAlpha(PAL.dot, 0));
  pg.fillStyle = glow;
  pg.beginPath(); pg.arc(m, m, G, 0, Math.PI * 2); pg.fill();
  pg.fillStyle = PAL.dot;
  pg.beginPath(); pg.arc(m, m, R, 0, Math.PI * 2); pg.fill();

  frozenCache.key = key; frozenCache.walls = cv; frozenCache.power = pw;
  return frozenCache;
}

/* Where the frozen board is showing this frame, in display px: the whole
   maze, or while the freeze is arriving, the band of rows it has reached. */
function frozenClip(ctx, ox, oy) {
  const S = scale, band = bankBand();
  const lo = band ? band.lo : 0, hi = band ? band.hi : MAZE_ROWS;
  ctx.beginPath();
  ctx.rect(ox - S * TILE, (lo + HUD_TOP) * TILE * S + oy,
    (NATIVE_W + 2 * TILE) * S, (hi - lo) * TILE * S);
  ctx.clip();
}

/* The field and the walls: laid over the CRT-passed frame, under the
   orders. Pure black, so nothing of the glass is left over the board.
   One fill and one blit. */
function drawFrozenBoard(ctx, ox, oy) {
  if (!frozenBoardOn()) return;
  const S = scale;
  const bake = frozenBake();
  ctx.save();
  frozenClip(ctx, ox, oy);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = PAL.black;
  ctx.fillRect(0, HUD_TOP * TILE * S + oy, screenCanvas.width, MAZE_ROWS * TILE * S);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bake.walls, ox, HUD_TOP * TILE * S + oy);
  ctx.restore();
}

/* The food, punched back over the orders as round discs. Time is stopped,
   so the energizers hold still instead of blinking, each with its warm
   glow so it still outranks the pellet field. A thin black collar under
   every disc cuts it cleanly out of a route drawn across it. Two fills
   for the whole field, and a stamp per energizer.
   Except under an arrowhead. The collar is wider than the arrowhead is
   deep, so a route whose tip stopped on a pellet -- most of them, and
   every one dragged on along the far side of a tunnel -- had its head cut
   out to a sliver: nothing to read and nothing to grab. The tip's pellet
   keeps its disc, sitting in the arrowhead the way the 2x2 pellet always
   did, and loses only its collar. Returns the tips it spared, for the
   tests. */
function drawFrozenDots(ctx, ox, oy) {
  if (!frozenBoardOn()) return null;
  const S = scale, yOff = HUD_TOP * TILE;
  const bake = frozenBake();
  const tips = new Set();
  routeOrder(S, ox, oy).forEach(o => {
    if (!orderArrow(o)) return;
    const t = o.tiles[o.tiles.length - 1];
    tips.add(t.r * COLS + t.c);
  });
  ctx.save();
  frozenClip(ctx, ox, oy);
  ctx.globalCompositeOperation = 'source-over';
  const pel = new Path2D(), collar = new Path2D(), pow = [];
  const rp = FB_DOT_R * S, rc = rp + S * FB_COLLAR, rpc = (FB_POWER_R + 0.9) * S;
  for (let r = 0; r < MAZE_ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const d = dots[r][c];
      if (!d) continue;
      const x = tcx(c) * S + ox, y = (tcy(r) + yOff) * S + oy;
      if (d === 1) {
        if (!tips.has(r * COLS + c)) { collar.moveTo(x + rc, y); collar.arc(x, y, rc, 0, Math.PI * 2); }
        pel.moveTo(x + rp, y); pel.arc(x, y, rp, 0, Math.PI * 2);
      } else {
        collar.moveTo(x + rpc, y); collar.arc(x, y, rpc, 0, Math.PI * 2);
        pow.push(x, y);
      }
    }
  }
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = PAL.black;
  ctx.fill(collar);
  ctx.globalAlpha = 1;
  ctx.fillStyle = PAL.dot;
  ctx.fill(pel);
  const half = bake.power.width / 2;
  for (let i = 0; i < pow.length; i += 2) {
    ctx.drawImage(bake.power, Math.round(pow[i] - half), Math.round(pow[i + 1] - half));
  }
  ctx.restore();
  return tips;
}

/* The two marks the pixel board used to put round a ghost, as clean
   strokes over the lifted board, in the same places and on the same
   cadence. Brackets mark the SELECTED ghost only, corners only so the
   ghost stays readable, and hold steady: when all four blinked at once,
   "selected" was invisible on the board. The blink is kept for the '!'
   over a ghost standing still with no orders (a ghost waiting in the den
   is not camping: waiting there is legal). Returns what it drew, for the
   tests. */
function drawFrozenMarks(ctx, ox, oy) {
  if (!frozenBoardOn()) return null;
  const S = scale;
  const at = h => ({ x: h.x * S + ox, y: (h.y + HUD_TOP * TILE) * S + oy });
  const drawn = { brackets: null, alerts: [] };
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const sel = game.hunters[Draw.selected];
  if (sel && sel.isCommandable() && !Draw.active) {
    const p = at(sel), e = 8.6 * S, arm = 3 * S;
    ctx.globalAlpha = 1;
    ctx.strokeStyle = PAL.white;
    ctx.lineWidth = Math.max(1.5, S * 0.7);
    ctx.beginPath();
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const x = p.x + sx * e, y = p.y + sy * e;
        ctx.moveTo(x - sx * arm, y); ctx.lineTo(x, y); ctx.lineTo(x, y - sy * arm);
      }
    }
    ctx.stroke();
    drawn.brackets = p;
  }
  if ((uiFrame / 20 | 0) % 2 === 0) {
    game.hunters.forEach(h => {
      if (!h.isCommandable() || h.state !== 'active' || h.path || h.dir) return;
      /* The ghost's own ORDERS? popup is spawned right where this mark
         goes, and a '!' stamped into it reads R!ZE. The words already say
         it; the mark waits until they have drifted clear. */
      const nx = h.x, ny = h.y + HUD_TOP * TILE;
      if (game.popups.some(pp => {
        const b = popupBox(pp);
        return nx + 2 > b.x && nx - 2 < b.x + b.w && ny - 9 > b.y && ny - 16 < b.y + b.h;
      })) return;
      const p = at(h);
      const top = p.y - 15.2 * S, foot = p.y - 12 * S, dot = p.y - 9.4 * S;
      const mark = (w, color) => {
        ctx.strokeStyle = color; ctx.fillStyle = color;
        ctx.lineWidth = w;
        ctx.beginPath(); ctx.moveTo(p.x, top); ctx.lineTo(p.x, foot); ctx.stroke();
        ctx.beginPath(); ctx.arc(p.x, dot, w / 2, 0, Math.PI * 2); ctx.fill();
      };
      ctx.globalAlpha = 0.7;
      mark(S * 2.9, TOKENS.casing);
      ctx.globalAlpha = 1;
      mark(S * 1.7, PAL.white);
      drawn.alerts.push(p);
    });
  }
  ctx.restore();
  return drawn;
}

/* ---- the freeze wave ----
   Stopping time is something that happened somewhere -- under your finger,
   at the ghost you grabbed, at the ghost that ran out of orders, at the ?
   chip -- so the glass acknowledges it from there: one soft ring runs out
   from that point to the far corner of the glass, fading as it spreads,
   while the lifted board opens behind it from the same row. It is over
   the board and under everything that is read on it. A refreeze or
   reduced motion skips it. */
const WAVE_TICKS = 16;                  // the ring reaches the far corner
const WAVE_ALPHA = 0.35;
function waveReach(t) {                 // 0..1 of the way out, decelerating
  const k = Math.min(1, Math.max(0, t) / WAVE_TICKS);
  return 1 - (1 - k) * (1 - k) * (1 - k);
}
/* Where the ring is this frame, in display px: its centre, how far it has
   got (R) and how far it has to go (far). Returns it for the tests;
   drawing is the point. */
function freezeWave(S, ox, oy) {
  const t = fxT();
  const moving = !fx.skipEnter && !reducedMotion() && t < WAVE_TICKS;
  const cx = fx.origin.x * S + ox, cy = (fx.origin.y + HUD_TOP * TILE) * S + oy;
  const far = Math.hypot(Math.max(cx, NATIVE_W * S - cx), Math.max(cy, NATIVE_H * S - cy));
  const R = moving ? far * waveReach(t) : Infinity;
  return { moving, cx, cy, far, R };
}
function drawFreezeWave(ctx, ox, oy) {
  const wv = freezeWave(scale, ox, oy);
  if (!wv.moving || wv.R >= wv.far) return;
  // one soft band just inside the front, gone by the time it has covered the glass
  const S = scale;
  const inner = Math.max(0, wv.R - 4 * S), outer = wv.R + S;
  const g = ctx.createRadialGradient(wv.cx, wv.cy, inner, wv.cx, wv.cy, outer);
  g.addColorStop(0, TOKENS.waveClear);
  g.addColorStop(0.7, TOKENS.wave);
  g.addColorStop(1, TOKENS.waveClear);
  ctx.save();
  ctx.globalAlpha = WAVE_ALPHA * (1 - wv.R / wv.far);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(wv.cx, wv.cy, outer, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/* ---- contact shadows ----
   Frozen, the cast is lifted off the board into the glass, and a lifted
   thing throws a shadow. Two small sprites baked once per scale -- one
   for the cast at rest, one a little larger, softer and further down for
   the selected ghost, which is how the glass says "held" without changing
   the size of anything -- and blitted 1:1, a drawImage per actor. render()
   lays them down before the pellets are punched back, so they darken the
   trails under a ghost's hem and never the food beside it. */
const SHADOW = { rest: null, held: null };
const SHADOW_DROP = 6.2;   // native px below the actor's centre
const SHADOW_LIFT = 0.8;   // the held ghost's extra drop, under 1S
function bakeShadow(rx, ry, peak) {
  const S = scale;
  const w = Math.ceil(2 * rx * S) + 2, h = Math.ceil(2 * ry * S) + 2;
  const cv = makeCanvas(w, h);
  const g = cv.getContext('2d');
  const rg = g.createRadialGradient(0, 0, 0, 0, 0, rx * S);
  rg.addColorStop(0, 'rgba(0,0,6,1)');
  rg.addColorStop(0.5, 'rgba(0,0,6,0.6)');
  rg.addColorStop(1, 'rgba(0,0,6,0)');
  g.globalAlpha = peak;
  g.setTransform(1, 0, 0, ry / rx, w / 2, h / 2);   // a circle, squashed flat
  g.fillStyle = rg;
  g.beginPath(); g.arc(0, 0, rx * S, 0, Math.PI * 2); g.fill();
  return cv;
}
function bakeShadows() {
  SHADOW.rest = bakeShadow(6.5, 2.2, 0.5);
  SHADOW.held = bakeShadow(7.6, 2.8, 0.4);
}

/* A new scale, from layout(): everything on the glass that was baked or
   remembered in display px is now the wrong size. The shadows are baked
   again, the lifted board is dropped to be baked at its next frozen
   frame, and the two things that ease from where they were last drawn --
   the pill's width, the drag tag's place -- forget it and snap, rather
   than spring from a size that no longer exists (a pill springing up
   from two-thirds its width clips its own words on the way). */
function rescaleGlass() {
  bakeShadows();
  plateShadows.clear();
  frozenCache.key = null;
  pillAnim.at = -Infinity;   // older than any freeze: the next draw snaps
  tagAnim.on = false;
}
function drawContactShadows(ctx, ox, oy) {
  if (game.phase !== 'command' || !SHADOW.rest) return;
  const a = Math.min(1, fxIn());
  if (a <= 0) return;
  const S = scale;
  const put = (spr, x, y) => ctx.drawImage(spr,
    Math.round(x * S + ox - spr.width / 2),
    Math.round((y + HUD_TOP * TILE) * S + oy - spr.height / 2));
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = a;
  game.hunters.forEach((h, i) => {
    // bare eyes, walking home or waiting in the den, have no body to cast one
    if (h.state === 'dissolving' || h.isEyes()) return;
    const held = i === Draw.selected;
    put(held ? SHADOW.held : SHADOW.rest, h.x, h.y + SHADOW_DROP + (held ? SHADOW_LIFT : 0));
  });
  const e = game.evader;
  if (e && e.alive) put(SHADOW.rest, e.x, e.y + SHADOW_DROP);
  ctx.restore();
}

/* Frozen, the cast is lifted into the glass. For a few frames after a
   thaw the lifted shells stay on, at the live positions, fading out over
   the pixel sprites already moving underneath -- they peel off rather than
   cut. The game is not waiting for them; it is running. The fade is why
   this lives in here and not in render(): an alpha belongs to the glass. */
function drawLiftedCast(ctx, ox, oy) {
  const lifted = shellAlpha();
  if (lifted <= 0) return;
  ctx.save();
  ctx.globalAlpha = lifted;
  hunterDrawOrder().forEach((h, i) => {
    if (h.state !== 'dissolving') drawHunterHi(ctx, ox, oy, h, i);
  });
  drawEvaderHi(ctx, ox, oy);   // the target sits on top of everything
  ctx.restore();
}

/* Every route on the glass, read once and in stacking order: the selected
   ghost's on top, and the route in hand above even that. Each keeps its
   hunter index `i`, because the pincer beads are keyed by it and the
   stacking order is not the roster order. */
function routeOrder(S, ox, oy) {
  const routes = game.hunters.map((h, i) => {
    const drawing = !!(Draw.active && Draw.active.hunter === h);
    let tiles = null, closed = false;
    if (drawing) { tiles = Draw.active.tiles; }
    else if (h.path) {
      closed = h.path.closed;
      tiles = closed ? h.path.tiles : h.path.tiles.slice(Math.max(0, h.path.idx - 1));
    }
    if (!tiles || tiles.length < 1) return null;
    const last = tiles[tiles.length - 1];
    return { h, i, drawing, tiles, closed,
      home: !closed && tiles.length >= 2 && isDoor(last.c, last.r),
      walk: closed ? tiles.concat([tiles[0]]) : tiles,
      runs: orderPathPoints(tiles, closed, S, ox, oy) };
  });
  const order = hunterDrawOrder().map(h => routes[game.hunters.indexOf(h)]).filter(Boolean);
  const inHand = order.findIndex(o => o.drawing);
  if (inHand >= 0) order.push(order.splice(inHand, 1)[0]);
  return order;
}

/* The order going out: one short bright comet from the ghost down the
   line it was given, arriving at the arrowhead as the transmit ends (a
   patrol gets one lap, from wherever the ghost is on it). Rides pointAlong
   over the same tiles the trail is drawn from, so it can only ever run
   along an order that exists. k is 0..1 through the transmit. */
function drawTransmit(ctx, h, S, ox, oy, k, w) {
  const p = h.path;
  const s0 = Math.max(0, p.idx - 1);
  const walk = p.closed ? p.tiles.slice(s0).concat(p.tiles.slice(0, s0), [p.tiles[s0]])
    : p.tiles.slice(s0);
  if (walk.length < 2) return;
  const total = (walk.length - 1) * TILE;
  const head = total * (1 - (1 - k) * (1 - k));   // leaves fast, lands soft
  const tail = Math.max(0, head - TILE * 1.5);
  const runs = [];
  let cur = [], prev = null;
  for (let d = tail; ; d = Math.min(head, d + TILE / 4)) {
    const q = pointAlong(walk, d);
    if (q) {
      // the tunnel seam: the comet leaves one edge and comes in the other
      if (prev && Math.abs(q.x - prev.x) + Math.abs(q.y - prev.y) > TILE) { runs.push(cur); cur = []; }
      cur.push({ x: q.x * S + ox, y: (q.y + HUD_TOP * TILE) * S + oy });
      prev = q;
    }
    if (d >= head) break;
  }
  runs.push(cur);
  const a = Math.min(1, (1 - k) / 0.4);   // full until it nears the end
  strokeRuns(ctx, runs, w * 3, h.color, 0.45 * a, null);
  strokeRuns(ctx, runs, w * 1.1, TOKENS.ink, 0.95 * a, null);
}

/* The end of a route home. An arrowhead promises a heading and, past it,
   a coast; this route has neither -- it ends in the den. So it ends in a
   small den: an open-topped box whose gap is the door the line runs in
   through, with the ghost's own colour sitting inside it, whole. Frozen,
   it goes down on a dark casing like the trails, so it holds up over the
   pink door and the den wall it lands on; live, the casing goes with the
   rest of the planning aids and the mark is as light as an arrowhead.
   `p` is the door tile's centre. */
function homeMark(ctx, p, S, color, bright, frozen) {
  const u = S * 2.3, gap = u * 0.42;
  const top = p.y - u * 0.35, bot = p.y + u * 1.05;
  const trace = () => {
    ctx.beginPath();
    ctx.moveTo(p.x - gap, top); ctx.lineTo(p.x - u, top);
    ctx.lineTo(p.x - u, bot); ctx.lineTo(p.x + u, bot);
    ctx.lineTo(p.x + u, top); ctx.lineTo(p.x + gap, top);
  };
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (frozen) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = TOKENS.casing;
    ctx.lineWidth = Math.max(2, S * 0.95);
    trace(); ctx.stroke();
  }
  ctx.globalAlpha = bright;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, S * 0.4);
  trace(); ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(p.x, p.y + u * 0.45, u * 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawOrderLayer(ctx, ox, oy) {
  /* The attract demo also shows the orders -- the arrows converging on him
     are the pitch -- but at live-play brightness only: frozen stays gated on
     command, so the lifted board, the hi-res cast and the roster never leak
     onto the attract screen. */
  const demoLive = game.phase === 'attract' && game.demo;
  const showing = game.phase === 'command' || game.phase === 'play' || demoLive;
  if (!showing) return;
  const S = scale;
  const frozen = game.phase === 'command';
  const flow = (uiFrame * 0.55) % 1000;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  if (frozen) drawFreezeWave(ctx, ox, oy);

  const hot = hotBeadsNow();
  const spacing = Math.max(2, game.params.hunterSpeed * BEAD_TICKS);
  const w = Math.max(2, S * 0.85);
  /* Just after a thaw the trails come down from frozen brightness to live
     over the transmit, rather than dropping to half on the click. */
  const sendT = transmitT();
  const sendK = sendT < 0 ? 1 : sendT / TRANSMIT_TICKS;
  const bright = frozen ? 1 : 0.5 + 0.5 * (1 - sendK) * (1 - sendK);
  const order = routeOrder(S, ox, oy);

  /* Pass one: the lines. Every trail is additive, so two crossing routes
     used to sum to a white smear exactly where you most need to tell them
     apart. Frozen, each is laid on a dark casing first, the way a map lays
     a road on its outline, and the one drawn later cuts cleanly across the
     one below. Live play keeps its half-bright additive trails as they
     were: the casing is a planning aid, and it goes with the planning. */
  order.forEach(({ h, tiles, closed, runs, drawing }) => {
    if (frozen) strokeRuns(ctx, runs, w * 3.2, TOKENS.casing, 0.55, null, 'source-over');

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
    if (sendT >= 0 && h.path && !drawing) drawTransmit(ctx, h, S, ox, oy, sendK, w);
  });

  /* Pass two: the marks. Beads, heads, arrowheads and rings all go down
     after every casing, so a later route's dark edge can never swallow an
     earlier route's white pincer bead -- the one mark that says two
     ghosts will be in the same place at the same time. */
  order.forEach(o => {
    const { h, i, drawing, closed, home, walk, runs } = o;
    // leading edge: a bright head that runs along the route
    if (frozen && runs.length) {
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

    // timing beads -- a route home's stop at the doorstep, where it does
    const hotSet = hot[i] && hot[i].hot;
    const beadTiles = closed ? walk : beadWalk(walk);
    for (let k = 1; k <= 80; k++) {
      const p = pointAlong(beadTiles, k * spacing);
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

    /* Arrowhead on an open route, a den on a route home, or a closed-circuit
       ring. A tip that has only just come out of a tunnel still gets its
       arrowhead, on the far side, on a half-tile stem from the screen edge:
       that is where the route now ends, and where it is picked up again. */
    const last = runs[runs.length - 1];
    const arrow = orderArrow(o);
    if (home && last && last.length >= 1) {
      homeMark(ctx, last[last.length - 1], S, h.color, bright, frozen);
    } else if (arrow) {
      const len = S * 2.6;
      ctx.save();
      ctx.globalAlpha = bright;
      ctx.fillStyle = h.color;
      ctx.translate(arrow.x, arrow.y); ctx.rotate(arrow.ang);
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

  /* The glass furniture dropping away. For a few ticks after a thaw it is
     only a picture of itself over play that is already running -- pressDown
     reads no roster outside command, so a click in that window freezes
     exactly as it always has. Frozen, it is drawn later, from render(), by
     drawFrozenFurniture. */
  if (!frozen && game.phase === 'play' && fxThawT() < FX_EXIT) {
    drawRoster(ctx, ox, oy, true);
    drawStatusPill(ctx, ox, oy, true);
  }
}

/* The glass furniture while time is stopped: live and hit-testable. It is
   drawn after the crisp marks round the ghosts, so the roster, the camp
   chip and the status pill still cover a '!' or a bracket that reaches
   them, exactly as they covered the pixel marks in the framebuffer, and
   before the lifted cast, which has always ridden over everything. */
function drawFrozenFurniture(ctx, ox, oy) {
  if (game.phase !== 'command') return;
  drawRoster(ctx, ox, oy, false);
  drawStatusPill(ctx, ox, oy, false);
}

/* The roster. Four ghosts can end up standing on the same tile, and then a
   click can only ever reach one of them -- so each has a permanent number
   and a card down here. Clicking a card selects that ghost and floats it
   to the front of the pile; the PLAY button unfreezes without the keyboard.
   Rects are stored each frame for the mousedown hit test, and always where
   the card comes to rest: the cards move, the targets never do. */
const rosterUI = { slots: [], play: null, camp: null };
/* Where the roster's plates come to rest, in display px: the bottom of
   the glass less a card and a margin. Anything that docks above the
   roster reads it from here, so it can never drift from the real thing. */
function rosterTop() {
  return NATIVE_H * scale - scale * 13 - scale * 1.5;
}

function plate(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* A plate's shadow, baked. The canvas redraws every frame while frozen,
   and a live shadowBlur is a fresh Gaussian over an arbitrary path each
   time -- on a phone that rasterises shadows on the CPU, seven of them a
   frame is real money spent in exactly the phase the player is dragging.
   So each shadow is blurred once per scale and blitted after that. A
   rounded plate's shadow is the same all along its straight middle, so
   one bake of a short plate serves every width: its two ends, and one
   column of the middle stretched between them -- which is how the pill
   and the tag, whose widths spring, still cost one bake each. A plate
   too short to have a middle is baked whole, at its own width.
   Only the shadow is kept: the plate is drawn a canvas-width off to the
   side and its shadow thrown back in, cast by the same fill so a
   translucent plate throws the same fainter shadow it always did. */
const plateShadows = new Map();   // emptied by layout(); scale is in the blur
function plateShadow(w, h, r, blur, fill) {
  const m = Math.ceil(blur * 1.5) + 1;   // three sigma: all of it
  const K = Math.ceil(r + m);            // an end, and a sigma-proof margin past it
  const whole = w < 2 * K + 1;
  const bw = whole ? Math.ceil(w) : 2 * K + 1;
  const key = (whole ? bw : 's') + '|' + Math.ceil(h) + '|' + r + '|' + blur + '|' + fill;
  let cv = plateShadows.get(key);
  if (!cv) {
    if (plateShadows.size > 64) plateShadows.clear();   // a runaway, not a working set
    cv = makeCanvas(bw + 2 * m, Math.ceil(h) + 2 * m);
    const g = cv.getContext('2d');
    const off = cv.width + 8;
    g.shadowColor = TOKENS.shadow;
    g.shadowBlur = blur;
    g.shadowOffsetX = off;
    plate(g, m - off, m, bw, h, r);
    g.fillStyle = fill;
    g.fill();
    plateShadows.set(key, cv);
  }
  return { cv, m, K, whole };
}
function drawPlateShadow(ctx, x, y, w, h, r, blur, fill) {
  const s = plateShadow(w, h, r, blur, fill);
  const cv = s.cv, m = s.m, K = s.K, H = cv.height;
  if (s.whole) { ctx.drawImage(cv, x - m, y - m); return; }
  const cap = m + K;
  ctx.drawImage(cv, 0, 0, cap, H, x - m, y - m, cap, H);
  ctx.drawImage(cv, cap, 0, 1, H, x + K, y - m, w - 2 * K, H);
  ctx.drawImage(cv, cap + 1, 0, cap, H, x + w - K, y - m, cap, H);
}

/* Glass as a card wears it: a flat fill, a soft shadow under it, and one
   device-thin hairline along the top edge where light would catch. No
   sampled frost -- in command the strip behind the cards is black, and
   frosting black is a lot of work to arrive at black. `lift` is in native
   px; a lifted card casts a longer, softer shadow. `shade` overrides the
   shadow as { blur, dy } in native px, for a plate with little room under
   it. */
function glassPlate(ctx, x, y, w, h, r, lift, fill, shade) {
  const S = scale;
  const f = fill || TOKENS.glass;
  const blur = S * (shade ? shade.blur : 2.5 + lift * 1.5);
  const dy = S * (shade ? shade.dy : 0.6 + lift * 0.8);
  drawPlateShadow(ctx, x, y + dy, w, h, r, blur, f);
  ctx.save();
  plate(ctx, x, y, w, h, r);
  ctx.fillStyle = f;
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = TOKENS.specular;
  ctx.lineWidth = uiDpr;
  ctx.beginPath();
  ctx.moveTo(x + r * 0.8, y + uiDpr);
  ctx.lineTo(x + w - r * 0.8, y + uiDpr);
  ctx.stroke();
  ctx.restore();
}

/* Every control on the glass has three looks: at rest, under a resting
   mouse (a little lighter, its rim brighter), and pressed (lighter still,
   drawn 3% smaller about its centre). Only the picture changes -- the rect
   it is hit-tested by stays where it is. Hover is a courtesy to the mouse
   and says nothing a finger needs; a press that turns into a drag drops
   its look, because it was never a press on a button. */
const PRESS_SCALE = 0.97;
function ctlLook(id) {
  const pressed = input.pressedCtl === id;
  return { pressed, hover: !pressed && !touchMode && input.hoverCtl === id };
}
function pressIn(ctx, look, cx, cy) {
  if (!look.pressed) return;
  ctx.translate(cx, cy);
  ctx.scale(PRESS_SCALE, PRESS_SCALE);
  ctx.translate(-cx, -cy);
}
function ctlTint(ctx, look, x, y, w, h, r) {
  if (!look.hover && !look.pressed) return;
  ctx.save();
  plate(ctx, x, y, w, h, r);
  ctx.fillStyle = look.pressed ? TOKENS.press : TOKENS.hover;
  ctx.fill();
  ctx.restore();
}

/* PLAY's two faces, also drawn small on a finger's release ring: the
   triangle (t its half-height) and the padlock it becomes while a ghost
   is overdue (u its unit: S on the button). Fill and stroke are the
   caller's. */
function playGlyph(ctx, cx, cy, t) {
  ctx.beginPath();
  ctx.moveTo(cx - t * 0.7, cy - t);
  ctx.lineTo(cx + t * 1.05, cy);
  ctx.lineTo(cx - t * 0.7, cy + t);
  ctx.closePath();
  ctx.fill();
}
function padlockGlyph(ctx, cx, cy, u) {
  // a shackle over a body
  ctx.lineWidth = Math.max(1.5 * uiDpr, u * 0.7);
  ctx.beginPath();
  ctx.arc(cx, cy - u * 0.8, u * 1.5, Math.PI, Math.PI * 2);
  ctx.lineTo(cx + u * 1.5, cy);
  ctx.moveTo(cx - u * 1.5, cy);
  ctx.lineTo(cx - u * 1.5, cy - u * 0.8);
  ctx.stroke();
  plate(ctx, cx - u * 2.3, cy - u * 0.3, u * 4.6, u * 3.6, u * 0.6);
  ctx.fill();
}

/* Cards rise out of the bezel on the shared spring, a beat apart from left
   to right; after a thaw they drop away faster than they came, over play
   that is already running. n is the card's place in the stagger.
   -> { a: opacity 0..1, dy: display px below the resting place } */
const CARD_RISE = 5;        // native px travelled
const CARD_STAGGER = 1.5;   // ticks between neighbours
function cardMotion(n, leaving) {
  if (leaving) {
    const e = easeOut(fxThawT());
    return { a: 1 - e, dy: e * CARD_RISE * scale };
  }
  const k = fx.skipEnter ? 1 : springIn(fxT() - n * CARD_STAGGER);
  return { a: Math.min(1, Math.max(0, k)), dy: (1 - k) * CARD_RISE * scale };
}

function secs(ticks) { return (ticks / 60).toFixed(1) + 's'; }

/* What a card says about its ghost: a state dot, one figure that matters,
   and a ring round the badge that means exactly one thing in that state --
   or no ring, where nothing is counting. Every figure is read off the
   fields and rules the simulation itself runs on.
     dot    state color        ring  { frac 0..1, color } or null
     lines  fitRuns variants   look  portrait look: 'fright' | 'eyes' | 'boost'
     mark   badge glyph in place of the number, overdue    down  greyed out */
function cardState(h) {
  const T = TOKENS;
  const look = h.state === 'active' && game.frightT > 0 && !h.frightImmune ? 'fright'
    : h.boostT > 0 ? 'boost' : null;
  if (!h.isCommandable() || (h.state === 'enteringDen' && h.eaten)) {
    // eaten: the walk in as eyes has no clock worth quoting
    return { dot: T.muted, down: true, ring: null, look: 'eyes',
      lines: [[cap('HEADING HOME')], [cap('HOME')]] };
  }
  /* The den is where green would lie most easily: a whole ghost in there
     is a good thing, but it is only ORDERED once it has a route out, and
     a route queued now goes the moment it can. So the dot follows the
     route, as it does everywhere else on the roster, and so do the words. */
  if (h.state === 'enteringDen') {
    // sent home, and through the door: whole, and ready in a moment
    if (h.path) {
      return { dot: T.ok, ring: null, look,
        lines: [[cap('HOME · BACK OUT')], [cap('BACK OUT')], [cap('OUT')]] };
    }
    return { dot: T.muted, ring: null, look,
      lines: [[cap('HOME · GOING IN')], [cap('GOING IN')], [cap('IN')]] };
  }
  if (h.state === 'respawn') {
    /* Eyes in the den: the one wait the player cannot shorten. A route
       drawn meanwhile is kept, and the card says so -- the same clock,
       now counting down to it going rather than to it being whole. */
    const s = secs(h.respawnT);
    const ring = { frac: h.respawnT / game.params.respawnTicks, color: T.muted };
    if (h.path) {
      return { dot: T.ok, down: true, look: 'eyes', ring,
        lines: [[cap('LEAVES IN '), num(s)], [cap('OUT '), num(s)], [num(s)]] };
    }
    return { dot: T.muted, down: true, look: 'eyes', ring,
      lines: [[cap('BACK IN '), num(s)], [num(s)]] };
  }
  if (h.state === 'idle') {
    // whole: nothing is counting, it goes when it has a route -- or, frozen
    // with one drawn, on the first tick after the resume
    if (h.path) {
      return { dot: T.ok, ring: null, look,
        lines: [[cap('HOME · LEAVING')], [cap('LEAVING')], [cap('OUT')]] };
    }
    return { dot: T.muted, ring: null, look,
      lines: [[cap('HOME · READY')], [cap('READY')], [cap('DEN')]] };
  }
  if (h.state !== 'active') {
    // on its way out: routed, bar RAZE's opening walk
    return { dot: h.path ? T.ok : T.muted, ring: null, look,
      lines: [[cap('LEAVING DEN')], [cap('LEAVING')], [cap('EXIT')]] };
  }
  if (h.overdue && !h.path && !h.dir) {
    // a white pill with a red edge: an alarm that can never be read as RAZE
    return { overdue: true, dot: T.alert, mark: '!', look,
      ring: { frac: 1, color: T.warn },
      lines: [[cap('NEEDS ORDERS', T.onColor)], [cap('ORDERS', T.onColor)], [cap('!', T.onColor)]] };
  }
  if (h.boostT > 0) {
    const s = secs(h.boostT);
    return { dot: T.ink, look, ring: { frac: h.boostT / BOOST_TICKS, color: T.ink },
      lines: [[cap('OVERDRIVE '), num(s)], [cap('BOOST '), num(s)], [num(s)]] };
  }
  if (h.path) {
    const p = h.path;
    const progress = { frac: p.idx / p.tiles.length, color: T.ok };
    if (p.closed) {
      const s = secs(orderTicks(h, p.tiles, 0, true));
      return { dot: T.ok, look, ring: progress, lines: [[cap('LOOP '), num(s)], [num(s)]] };
    }
    const s = secs(routeTicks(h, p.tiles, p.idx));
    if (p.home) {
      // timed to the doorstep, where it hands itself to the den
      return { dot: T.ok, look, ring: progress,
        lines: [[cap('HOME IN '), num(s)], [cap('HOME '), num(s)], [num(s)]] };
    }
    return { dot: T.ok, look, ring: progress, lines: [[cap('ROUTE '), num(s)], [num(s)]] };
  }
  if (h.dir) {
    // the wall-stop rule, counted in tiles while it can still be undone
    const n = driftTiles(h.tile(), h.dir).length;
    const unit = n === 1 ? ' TILE' : ' TILES';
    return { dot: T.muted, ring: null, look,
      lines: n === 0 ? [[cap('STOPPING')], [cap('STOP')]]
        : [[cap('STOPS IN '), num(String(n)), cap(unit)], [num(String(n)), cap(unit)], [num(String(n))]] };
  }
  if (game.campLimit === null) {
    // the limit is OFF: nothing is counting, so nothing pretends to
    return { dot: T.muted, ring: null, look, lines: [[cap('CAMPED')], [cap('CAMP')]] };
  }
  const left = Math.max(0, game.campLimit - h.campT);
  const late = left <= 120;
  const s = Math.ceil(left / 60) + 's';
  return { dot: late ? T.warn : T.muted, look,
    ring: { frac: game.campLimit > 0 ? left / game.campLimit : 0, color: late ? T.warn : T.ink },
    lines: [[num(s), cap(' LEFT')], [num(s)]] };
}

/* A ring that counts: the unlit track all the way round, then the part
   still to go, clockwise from twelve. */
function countRing(ctx, x, y, r, w, ring) {
  ctx.save();
  ctx.lineWidth = w;
  ctx.strokeStyle = TOKENS.track;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  if (ring && ring.frac > 0.001) {
    const f = Math.min(1, ring.frac);
    ctx.strokeStyle = ring.color;
    ctx.lineCap = f < 1 ? 'round' : 'butt';
    ctx.beginPath();
    ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f);
    ctx.stroke();
  }
  ctx.restore();
}

function drawRoster(ctx, ox, oy, leaving) {
  const S = scale;
  const h0 = S * 13;
  const gap = S * 2;
  const slotW = S * 42;
  const playW = S * 20;
  const total = slotW * 4 + gap * 4 + playW;
  const x0 = (NATIVE_W * S - total) / 2 + ox;
  const y = rosterTop() + oy;
  // on the way out the cards are only pictures: the last resting rects stand
  if (!leaving) rosterUI.slots = [];
  ctx.save();
  ctx.textBaseline = 'middle';
  /* Name over metric, centred as a pair on their cap heights. A CSS floor
     can make the type taller than the S-proportional strip was drawn for,
     so the pair is placed from the sizes actually in use, not from S --
     and where the floors crowd the strip, the gap between the lines gives
     way before the lines leave the glass. */
  const capT = rolePx('title') * 0.7, capC = rolePx('caption') * 0.7;
  const lead = Math.max(uiDpr, Math.min(Math.max(S * 1.5, rolePx('caption') * 0.3),
    h0 - S * 2 - capT - capC));
  const top = (h0 - capT - lead - capC) / 2;
  const nameDY = top + capT / 2, statusDY = top + capT + lead + capC / 2;

  /* The badge fills the card's height, less a margin; the digit sets its
     size where the floor wins, and the ring sits just outside it. */
  const ringW = Math.max(1.5 * uiDpr, S * 0.55);
  const ringGap = Math.max(uiDpr, S * 0.45);
  const rOut = h0 / 2 - ringW / 2 - Math.max(uiDpr, S * 0.9);
  const rb = Math.min(Math.max(S * 3.4, rolePx('badge') * 0.62), rOut - ringW / 2 - ringGap);
  const rr = rb + ringW / 2 + ringGap;
  const bxOff = S * 1.4 + rr;
  const txOff = bxOff + rr + S * 2;
  const dotR = Math.max(1.5 * uiDpr, S * 0.7);
  const dotGap = Math.max(2 * uiDpr, S);
  /* The portrait is a luxury: it stays only while the longest full metric
     still fits beside it, decided for the whole row at once so no card
     gains or loses a face as its state changes. */
  const portW = S * 8;
  const widest = roleWidth(ctx, 'STOPS IN ', 'caption') + roleWidth(ctx, '00', 'figure')
    + roleWidth(ctx, ' TILES', 'caption') + dotR * 2 + dotGap;
  const portrait = slotW - txOff - portW >= widest;
  const textW = slotW - txOff - (portrait ? portW : S * 2);

  game.hunters.forEach((h, i) => {
    const x = x0 + i * (slotW + gap);
    if (!leaving) rosterUI.slots.push({ x, y, w: slotW, h: h0, i });
    const m = cardMotion(i + 1, leaving);
    if (m.a <= 0.01) return;
    const selected = Draw.selected === i && !leaving;
    const st = cardState(h);
    const lift = selected ? 1 : 0;
    const yc = y + m.dy - lift * S;
    const cy = yc + h0 / 2;
    const look = ctlLook('slot' + i);

    ctx.save();
    ctx.globalAlpha = m.a * (st.down ? 0.55 : 1);
    pressIn(ctx, look, x + slotW / 2, cy);
    glassPlate(ctx, x, yc, slotW, h0, S * 2.5, lift);
    ctlTint(ctx, look, x, yc, slotW, h0, S * 2.5);
    // the rim: the chosen ghost's own color, everyone else a quiet hairline
    ctx.save();
    ctx.strokeStyle = selected ? h.color : TOKENS.line;
    ctx.globalAlpha *= selected ? 1 : look.hover ? 0.8 : 0.3;
    ctx.lineWidth = selected ? Math.max(1.5 * uiDpr, S * 0.5) : uiDpr;
    plate(ctx, x, yc, slotW, h0, S * 2.5);
    ctx.stroke();
    ctx.restore();

    // badge: the ghost's color, its number (or the overdue mark), its ring
    const bx = x + bxOff;
    countRing(ctx, bx, cy, rr, ringW, st.ring);
    ctx.fillStyle = h.color;
    ctx.beginPath(); ctx.arc(bx, cy, rb, 0, Math.PI * 2); ctx.fill();
    ctx.textAlign = 'center';
    fitText(ctx, st.mark || String(i + 1), null, bx, cy + S * 0.2, 'badge', rb * 1.5, TOKENS.onColor);

    /* Words stay on their own card. Every status has a short form that
       fits at a phone's floor size, so this cuts nothing in practice; it
       is here so a face with wider capitals than planned for clips at its
       own edge instead of painting over the next ghost's badge. */
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, yc, slotW, h0);
    ctx.clip();
    const tx = x + txOff;
    ctx.textAlign = 'left';
    fitText(ctx, h.def.name, null, tx, yc + nameDY, 'title', textW, TOKENS.ink);

    const sy = yc + statusDY;
    if (st.overdue) {
      const padX = Math.max(3 * uiDpr, S * 1.2);
      const set = fitRuns(ctx, st.lines, textW - padX * 2);
      // roomy where the strip allows, snug where the CSS floor has eaten it
      const ph = Math.min(rolePx('caption') * 1.35,
        Math.max(rolePx('caption') * 1.1, (h0 - statusDY) * 2));
      ctx.save();
      plate(ctx, tx, sy - ph / 2, set.w + padX * 2, ph, ph / 2);
      ctx.fillStyle = TOKENS.ink;
      ctx.fill();
      ctx.strokeStyle = TOKENS.alert;
      ctx.lineWidth = Math.max(1.5 * uiDpr, S * 0.4);
      ctx.stroke();
      ctx.restore();
      drawRuns(ctx, set, tx + padX, sy);
    } else {
      ctx.fillStyle = st.dot;
      ctx.beginPath(); ctx.arc(tx + dotR, sy, dotR, 0, Math.PI * 2); ctx.fill();
      const set = fitRuns(ctx, st.lines, textW - dotR * 2 - dotGap);
      drawRuns(ctx, set, tx + dotR * 2 + dotGap, sy);
    }
    ctx.restore();

    if (portrait) {
      const look = st.look;
      // in the den the portrait looks where the ghost does: door or floor
      const inDen = h.state === 'idle' || h.state === 'respawn';
      helpGhost(ctx, x + slotW - portW / 2 - S * 0.5, cy, S * 3,
        look === 'boost' ? TOKENS.ink : h.color, look === 'boost' ? null : look,
        inDen ? h.face() : undefined);
    }
    ctx.restore();
  });

  /* The camp-limit dial: a small capsule above the roster. Click to cycle.
     This is the player's own rule, so it lives in the player's layer. The
     practice switches the rule off and hides the dial with it, so nothing
     there can overwrite the setting the player comes back to. */
  if (game.drill) {
    if (!leaving) rosterUI.camp = null;
  } else {
    const chipW = S * 34, chipH = S * 6;
    const cxp = x0, cyp = y - chipH - S * 1.2;
    if (!leaving) rosterUI.camp = { x: cxp, y: cyp, w: chipW, h: chipH };
    const m = cardMotion(0, leaving);
    if (m.a > 0.01) {
      const cy = cyp + m.dy;
      const look = ctlLook('camp');
      ctx.save();
      ctx.globalAlpha = m.a;
      pressIn(ctx, look, cxp + chipW / 2, cy + chipH / 2);
      glassPlate(ctx, cxp, cy, chipW, chipH, chipH / 2, 0);
      ctlTint(ctx, look, cxp, cy, chipW, chipH, chipH / 2);
      /* The first time the limit freezes a game, the toast names the chip
         and the chip answers once: it lights as if hovered, and lets go. */
      const nudge = campPulse();
      if (nudge > 0) {
        ctx.save();
        ctx.globalAlpha *= nudge;
        ctlTint(ctx, { hover: true, pressed: false }, cxp, cy, chipW, chipH, chipH / 2);
        ctx.restore();
      }
      ctx.save();
      ctx.strokeStyle = TOKENS.line;
      ctx.globalAlpha *= Math.max(look.hover ? 0.8 : 0.45, nudge);
      ctx.lineWidth = uiDpr;
      plate(ctx, cxp, cy, chipW, chipH, chipH / 2);
      ctx.stroke();
      ctx.restore();
      /* The setting sits flush right; the label gets whatever is left of
         the widest setting's room, so cycling the dial never changes which
         label fits. */
      const valueW = Math.max(...CAMP_CHOICES.map(c => roleWidth(ctx, c.label, 'figure')));
      const off = game.campLimit === null;
      ctx.textAlign = 'right';
      fitText(ctx, CAMP_CHOICES[game.campChoice].label, null, cxp + chipW - chipH / 2,
        cy + chipH / 2, 'figure', valueW, off ? TOKENS.muted : TOKENS.ink);
      ctx.textAlign = 'left';
      fitText(ctx, 'CAMP LIMIT', ['CAMP', ''], cxp + chipH / 2, cy + chipH / 2,
        'caption', chipW - chipH - S * 1.5 - valueW, TOKENS.muted);
      ctx.restore();
    }
  }

  /* PLAY: the one filled control on the glass, because it is the one that
     matters. A ring round the triangle closes as the squad fills up with
     orders -- a reading, not a gate; PLAY with gaps is still PLAY. While a
     ghost is overdue it turns amber and shows a lock, and stays inert:
     ghosts don't camp.
     The practice has one real gate, and it wears the lock too -- but on
     plain glass, not amber: amber means a ghost has been left too long,
     and a newcomer who has not drawn yet has done nothing wrong. It
     shakes its head when pressed, the way the pill does for an overdue
     ghost. When the practice's route is down, the lock is gone and a
     green rim breathes round the button: this is the next press. */
  const px = x0 + 4 * (slotW + gap);
  if (!leaving) rosterUI.play = { x: px, y, w: playW, h: h0 };
  const pm = cardMotion(5, leaving);
  if (pm.a > 0.01) {
    const face = playLook();
    const blocked = face === 'overdue', gated = face === 'gated';
    const squad = game.hunters.filter(h => h.isCommandable());
    const ready = squad.length ? squad.filter(h => h.path).length / squad.length : 1;
    const py = y + pm.dy;
    const since = uiClock - fx.refusedAt;
    const shake = gated && since < 14 && !reducedMotion()
      ? Math.sin(since * 1.9) * (1 - since / 14) * S * 1.6 : 0;
    const cx = px + playW / 2 + shake, cy = py + h0 / 2;
    const look = ctlLook('play');
    ctx.save();
    ctx.globalAlpha = pm.a * (blocked ? 0.85 : 1);
    if (face === 'go') {
      const m = Math.max(1.5 * uiDpr, S * 0.9);
      const breath = reducedMotion() ? 0.6 : 0.4 + 0.4 * (0.5 + 0.5 * Math.sin(uiClock * 0.09));
      ctx.save();
      ctx.strokeStyle = TOKENS.ok;
      ctx.globalAlpha *= breath;
      ctx.lineWidth = Math.max(1.5 * uiDpr, S * 0.45);
      plate(ctx, px - m, py - m, playW + m * 2, h0 + m * 2, h0 / 2 + m);
      ctx.stroke();
      ctx.restore();
    }
    pressIn(ctx, look, cx, cy);
    glassPlate(ctx, px + shake, py, playW, h0, h0 / 2, 0,
      gated ? TOKENS.glass : blocked ? TOKENS.warn : TOKENS.ok);
    ctlTint(ctx, look, px + shake, py, playW, h0, h0 / 2);
    ctx.fillStyle = TOKENS.onColor;
    ctx.strokeStyle = TOKENS.onColor;
    if (gated) {
      ctx.save();
      ctx.strokeStyle = TOKENS.line;
      ctx.globalAlpha *= look.hover ? 0.8 : 0.5;
      ctx.lineWidth = uiDpr;
      plate(ctx, px + shake, py, playW, h0, h0 / 2);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = ctx.strokeStyle = TOKENS.muted;
      padlockGlyph(ctx, cx, cy, S);
    } else if (blocked) {
      padlockGlyph(ctx, cx, cy, S);
    } else {
      const rp = Math.min(playW, h0) / 2 - S * 1.8;
      const w = Math.max(1.5 * uiDpr, S * 0.5);
      ctx.save();
      ctx.globalAlpha *= 0.22;
      ctx.lineWidth = w;
      ctx.beginPath(); ctx.arc(cx, cy, rp, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      if (ready > 0) {
        ctx.save();
        ctx.lineWidth = w;
        ctx.lineCap = ready < 1 ? 'round' : 'butt';
        ctx.beginPath();
        ctx.arc(cx, cy, rp, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, ready));
        ctx.stroke();
        ctx.restore();
      }
      playGlyph(ctx, cx, cy, rp * 0.55);
    }
    ctx.restore();
  }

  ctx.restore();
}

/* The status pill: one calm line in the empty HUD row under the scores,
   in place of the pixel COMMAND that used to blink in the fruit lane. The
   words come from a short ladder, first match wins -- a ghost overdue,
   then the route in your hand, then a squad with nothing left to order,
   then the plain count -- and the second figure is what a catch would
   bank this instant. It reports state and consequence; it never proposes
   a move. Display only: not a target, so the ? chip keeps all its pad. */
/* The route in hand, timed the way the ghost will walk it. The first tile
   of a fresh trail is the one the ghost is standing in unless it is
   already past it, and a ghost is never charged for walking to its own
   tile. `upTo` stops the walk after that many tiles. */
function handFrom(a) {
  const here = a.hunter.tile();
  return a.tiles[0].c === here.c && a.tiles[0].r === here.r ? 1 : 0;
}
function handTicks(a, upTo) {
  const tiles = upTo === undefined ? a.tiles : a.tiles.slice(0, upTo);
  return routeTicks(a.hunter, tiles, handFrom(a));
}

function pillState() {
  const T = TOKENS;
  /* The den counts. A ghost waiting in there is one you can order, and
     until it has a route it is exactly as unordered as one parked on the
     board -- holding it for an ambush is legal, not "done". Eyes still in
     the den count too, and a route queued for them is an order. Eyes out
     on the board walking home are nobody's to order yet. */
  const squad = game.hunters.filter(h => h.isCommandable());
  const ordered = squad.filter(h => h.path).length;
  const stalled = stalledHunter();
  if (stalled) {
    const n = stalled.def.name;
    return { kind: 'overdue', dot: T.alert, rim: T.warn, text: n + ' NEEDS ORDERS',
      main: [[cap(n + ' NEEDS ORDERS', T.ink)], [cap(n + ' OVERDUE', T.ink)], [cap(n, T.ink)]] };
  }
  const a = Draw.active;
  if (a && a.tiles.length >= 2) {
    const h = a.hunter;
    if (a.closable) {
      return { kind: 'loop', dot: h.color, text: 'RELEASE TO LOOP',
        main: [[cap('RELEASE TO LOOP', T.ink)], [cap('LOOP', T.ink)]] };
    }
    /* A ghost still in the den walks the door first, which no route time
       can promise honestly, so it gets the instruction and no number. */
    if (h.state !== 'active') {
      return a.home
        ? { kind: 'drawing', dot: h.color, text: 'RELEASE TO SEND HOME',
            main: [[cap('RELEASE TO SEND HOME', T.ink)], [cap('SEND HOME', T.ink)], [cap('HOME', T.ink)]] }
        : { kind: 'drawing', dot: h.color, text: 'RELEASE TO COMMIT',
            main: [[cap('RELEASE TO COMMIT', T.ink)], [cap('RELEASE', T.ink)]] };
    }
    const s = secs(handTicks(a));
    if (a.home) {
      return { kind: 'drawing', dot: h.color, text: s + ' · RELEASE TO SEND HOME',
        main: [[num(s), cap(' · RELEASE TO SEND HOME', T.ink)], [num(s), cap(' · SEND HOME', T.ink)],
               [num(s), cap(' · HOME', T.ink)], [num(s)]] };
    }
    return { kind: 'drawing', dot: h.color, text: s + ' · RELEASE TO COMMIT',
      main: [[num(s), cap(' · RELEASE TO COMMIT', T.ink)], [num(s), cap(' · RELEASE', T.ink)], [num(s)]] };
  }
  if (squad.length && ordered === squad.length) {
    return { kind: 'ready', dot: T.ok, text: 'ALL ORDERED · PLAY',
      main: [[cap('ALL ORDERED · PLAY', T.ink)], [cap('ALL ORDERED', T.ink)], [cap('READY', T.ink)]] };
  }
  const of = ordered + ' OF ' + squad.length;
  return { kind: 'command', dot: T.line, text: 'COMMAND · ' + of + ' ORDERED',
    // only the figures are set as figures; OF is a word, like ORDERED
    main: [[cap('COMMAND · ', T.ink), num(String(ordered)), cap(' OF '),
            num(String(squad.length)), cap(' ORDERED')],
           [num(ordered + '/' + squad.length), cap(' ORDERED')],
           [num(ordered + '/' + squad.length)]] };
}

// the pill's width, sprung between one state's text and the next
const pillAnim = { from: 0, to: 0, at: -1e9 };
// a tight, dropless shadow: the row under the pill is the maze's top wall
const PILL_SHADE = { blur: 1, dy: 0 };
function pillWidthNow() {
  return pillAnim.from + (pillAnim.to - pillAnim.from) * springIn(uiClock - pillAnim.at);
}

function drawStatusPill(ctx, ox, oy, leaving) {
  const S = scale;
  const k = leaving ? 1 - easeOut(fxThawT()) : fxIn();
  const a = Math.min(1, Math.max(0, k));
  if (a <= 0.01) return;
  const st = pillState();
  const box = pillBox();
  const ph = box.h;
  // it drops in from the score line above, and leaves the way it came
  const top = box.top + oy - (1 - k) * S * 3;
  const cx = NATIVE_W / 2 * S + ox;
  const padX = ph * 0.45;
  const dotR = Math.max(1.5 * uiDpr, S * 0.8);
  const gapA = Math.max(3 * uiDpr, S * 1.4);
  // never wider than the room left of the ? chip, mirrored about the centre
  const maxW = (HELP_CHIP.x - HELP_CHIP.r - 1 - NATIVE_W / 2) * 2 * S;

  // the squad at a glance: filled when a ghost has orders, hollow when not
  const pip = Math.max(1.25 * uiDpr, S * 0.75);
  const pipGap = Math.max(1.5 * uiDpr, S * 0.7);
  const pips = { w: game.hunters.length * pip * 2 + (game.hunters.length - 1) * pipGap,
    paint(c, x, y) {
      game.hunters.forEach((h, i) => {
        const px = x + pip + i * (pip * 2 + pipGap);
        c.save();
        c.beginPath(); c.arc(px, y, pip, 0, Math.PI * 2);
        if (h.isCommandable() && h.path) { c.fillStyle = h.color; c.fill(); }
        else {
          if (!h.isCommandable()) c.globalAlpha *= 0.35;
          c.strokeStyle = h.color;
          c.lineWidth = Math.max(uiDpr, S * 0.3);
          c.beginPath(); c.arc(px, y, pip - c.lineWidth / 2, 0, Math.PI * 2);
          c.stroke();
        }
        c.restore();
      });
    } };
  const space = { w: gapA * 1.5 };
  const b = String(bountyNow());
  const bFull = [num('+' + b), cap(' ON CATCH')], bShort = [num('+' + b)];
  const m = st.main, last = m[m.length - 1];
  // the same words, set in the pill's own sizes (see buildTypeScale)
  const inRow = { caption: 'pillCap', figure: 'pillFig' };
  const variants = [
    m[0].concat([space, pips, space], bFull),
    m[0].concat([space, pips, space], bShort),
    m[1].concat([space, pips, space], bShort),
    last.concat([space, pips, space], bShort),
    last.concat([space, pips]),
    last,
  ].map(v => v.map(r => (inRow[r.role] ? Object.assign({}, r, { role: inRow[r.role] }) : r)));
  const fixed = padX * 2 + dotR * 2 + gapA;
  const set = fitRuns(ctx, variants, maxW - fixed);
  const target = Math.min(maxW, set.w + fixed);
  if (leaving || pillAnim.at < fx.enterAt) {
    pillAnim.from = pillAnim.to = target;
    pillAnim.at = uiClock;
  } else if (Math.abs(target - pillAnim.to) > 0.5) {
    pillAnim.from = pillWidthNow();
    pillAnim.to = target;
    pillAnim.at = uiClock;
  }
  const w = Math.min(maxW, pillWidthNow());

  // a refused PLAY: the pill shakes its head, briefly, and only then
  let dx = 0;
  const since = uiClock - fx.refusedAt;
  if (st.kind === 'overdue' && since < 14 && !reducedMotion()) {
    dx = Math.sin(since * 1.9) * (1 - since / 14) * S * 1.6;
  }

  const x = cx - w / 2 + dx;
  ctx.save();
  ctx.globalAlpha = a;
  /* Nothing of it lands on the maze: not the capsule at the top of its
     spring, and not its shadow, which is cut short and kept straight under
     it -- a board pixel darkened by the glass is a board pixel lost. */
  ctx.beginPath();
  ctx.rect(0, 0, screenCanvas.width, box.floor + oy);
  ctx.clip();
  glassPlate(ctx, x, top, w, ph, ph / 2, 0, null, PILL_SHADE);
  const rest = { x: cx - w / 2, y: box.top + oy, w, h: ph, floor: box.floor + oy };
  ctx.save();
  ctx.strokeStyle = st.rim || TOKENS.line;
  ctx.globalAlpha *= st.rim ? 0.95 : 0.4;
  ctx.lineWidth = st.rim ? Math.max(1.5 * uiDpr, S * 0.4) : uiDpr;
  plate(ctx, x, top, w, ph, ph / 2);
  ctx.stroke();
  ctx.restore();
  // the content sits at its own width, centred; the capsule springs round it
  plate(ctx, x, top, w, ph, ph / 2);
  ctx.clip();
  const cy = top + ph / 2;
  const lx = cx + dx - (set.w + fixed) / 2 + padX;
  ctx.fillStyle = st.dot;
  ctx.beginPath(); ctx.arc(lx + dotR, cy, dotR, 0, Math.PI * 2); ctx.fill();
  ctx.textBaseline = 'middle';
  drawRuns(ctx, set, lx + dotR * 2 + gapA, cy);
  ctx.restore();
  return rest;
}

/* ---- planning feedback ----
   While you drag, your finger or cursor is sitting on the one thing you
   are trying to read. So the numbers float clear of it on a small tag:
   the route's time, a patrol's lap when the loop is armed, and the moment
   the route meets another ghost's in time and space, who with and when.
   It is pinned to the head tile, not the pointer, and eases after it, so
   it steps with the trail instead of shivering with the hand. It reports
   consequences only -- nothing on it is the evader's, and nothing on it
   suggests where to go. */

/* The pincer the route in hand is making, if any: the first bead of it
   that coincides with another ghost's (the same test computeHotBeads
   lights the white beads by), the ghost it meets, and when this ghost
   gets there at the speeds it will really walk. */
function pincerFor(a) {
  const i = game.hunters.indexOf(a.hunter);
  const hot = hotBeadsNow();
  const mine = hot[i];
  if (!mine || !mine.hot.size) return null;
  let best = null;
  for (const k of [...mine.hot].sort((m, n) => m - n)) {
    const p = mine.pts[k - 1];
    hot.forEach((other, j) => {
      if (j === i || !other || !other.hot.has(k) || !other.pts[k - 1]) return;
      const q = other.pts[k - 1];
      const d2 = (p.x - q.x) * (p.x - q.x) + (p.y - q.y) * (p.y - q.y);
      if (d2 < 20 * 20 && (!best || d2 < best.d2)) best = { k, p, j, d2 };
    });
    if (best) break;
  }
  if (!best) return null;
  // the bead sits part way along the step into tiles[p.i]
  const p = best.p, t0 = a.tiles[p.i - 1];
  const f = Math.min(1, (Math.abs(p.x - tcx(t0.c)) + Math.abs(p.y - tcy(t0.r))) / TILE);
  const ta = handTicks(a, p.i), tb = handTicks(a, p.i + 1);
  return { with: game.hunters[best.j], bead: best.k, ticks: ta + (tb - ta) * f };
}

/* What the tag says, or null when there is no tag: only once a press has
   declared itself a drag, only with a route to time, and never for a
   ghost still in the den, whose walk to the door no figure can promise. */
function dragTag() {
  const a = Draw.active;
  if (!a || !input.dragMoved || game.phase !== 'command' || a.tiles.length < 2) return null;
  const h = a.hunter;
  if (h.state !== 'active') return null;
  const head = a.tiles[a.tiles.length - 1];
  const loop = a.closable;
  const ticks = loop ? orderTicks(h, a.tiles.slice(0, -1), 0, true) : handTicks(a);
  return { h, head, loop, home: !!a.home, ticks, pincer: pincerFor(a) };
}

const TAG_EASE = 2.5;    // ticks: how far the tag lags the head tile
const TAG_LIFT = 44;     // CSS px between a fingertip and the tag
const tagAnim = { on: false, x: 0, y: 0, t: 0 };
/* Ease toward a target over uiClock time -- or snap, on first sight and
   always under reduced motion. */
function tagFollow(tx, ty) {
  if (!tagAnim.on || reducedMotion()) {
    tagAnim.x = tx; tagAnim.y = ty;
  } else {
    const k = 1 - Math.exp(-Math.max(0, uiClock - tagAnim.t) / TAG_EASE);
    tagAnim.x += (tx - tagAnim.x) * k;
    tagAnim.y += (ty - tagAnim.y) * k;
  }
  tagAnim.on = true;
  tagAnim.t = uiClock;
}

function drawDragTag(ctx, ox, oy) {
  const st = dragTag();
  if (!st) { tagAnim.on = false; return null; }
  const S = scale, W = screenCanvas.width, H = screenCanvas.height;
  const hx = tcx(st.head.c) * S + ox, hy = (tcy(st.head.r) + HUD_TOP * TILE) * S + oy;
  const padX = Math.max(5 * uiDpr, S * 2), padY = Math.max(3 * uiDpr, S * 1.2);
  const lineH = rolePx('caption') * 1.3;
  const maxW = Math.min(W - S * 4, S * 90) - padX * 2;
  const s = secs(st.ticks);
  const lines = [fitRuns(ctx, st.loop ? [[cap('LOOP '), num(s)], [num(s)]]
    : st.home ? [[cap('HOME IN '), num(s)], [cap('HOME '), num(s)], [num(s)]]
    : [[num(s)]], maxW)];
  if (st.pincer) {
    const who = st.pincer.with, ps = secs(st.pincer.ticks);
    const name = { t: who.def.name, role: 'caption', color: who.color };
    lines.push(fitRuns(ctx, [
      [cap('PINCER w/ ', TOKENS.ink), name, cap(' '), num(ps)],
      [cap('PINCER '), num(ps)],
      [name, cap(' '), num(ps)],
      [num(ps)]], maxW));
  }
  const w = Math.max(...lines.map(l => l.w)) + padX * 2;
  const h = lines.length * lineH + padY * 2;

  /* A fingertip covers the head, so the tag stands well above it; a cursor
     covers almost nothing, so it sits just off the head's shoulder. Near
     the top of the glass it goes underneath instead, and it never leaves
     the canvas. */
  const lift = touchMode ? TAG_LIFT * uiDpr : S * 6;
  let tx = touchMode ? hx - w / 2 : hx + S * 6;
  let ty = hy - lift - h;
  if (ty < HUD_TOP * TILE * S) ty = hy + lift;
  tx = Math.max(S, Math.min(W - w - S, tx));
  ty = Math.max(S, Math.min(H - h - S, ty));
  tagFollow(tx, ty);
  const x = tagAnim.x, y = tagAnim.y;
  const r = Math.min(h / 2, S * 3);

  ctx.save();
  if (touchMode) {
    // a hairline back to the head it is talking about
    ctx.save();
    ctx.strokeStyle = st.h.color;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = uiDpr;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(Math.max(x + r, Math.min(x + w - r, hx)), y > hy ? y : y + h);
    ctx.stroke();
    ctx.restore();
  }
  glassPlate(ctx, x, y, w, h, r, 1);
  ctx.save();
  ctx.strokeStyle = st.h.color;
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = uiDpr;
  plate(ctx, x, y, w, h, r);
  ctx.stroke();
  ctx.restore();
  ctx.textBaseline = 'middle';
  lines.forEach((l, n) => drawRuns(ctx, l, x + padX, y + padY + lineH * (n + 0.5)));
  ctx.restore();
  return { x, y, w, h, tx, ty, hx, hy };
}

/* A finger on open floor means "go" -- but only if it lifts as a tap, and
   that rule used to live in the manual. Now it is drawn: a ring at exactly
   the slop radius round the point the finger landed on, the play mark in
   the middle. Lift inside it and time starts; slide out and it lets go,
   and time stays stopped. It is a picture of pendingResume and the same
   threshold, never a second opinion: pressUp resumes that press on
   !dragMoved alone, which is exactly what crossing this circle flips (the
   quick-tap ruling only ever reviews a drawn route, never this). With a
   ghost overdue the lift will be refused, so the ring says that instead. */
function releaseRing(ox, oy) {
  const rel = fx.release;
  if (!rel || game.phase !== 'command') return null;
  let a = 1;
  if (rel.brokeAt !== null) {
    a = 1 - easeOut(uiClock - rel.brokeAt);
    if (a <= 0) return null;
  } else if (!input.pendingResume) return null;
  const S = scale;
  return { x: rel.x * S + ox, y: (rel.y + HUD_TOP * TILE) * S + oy, r: TAP_SLOP_TOUCH * S,
    a, broken: rel.brokeAt !== null, blocked: !!stalledHunter() };
}
function drawReleaseRing(ctx, ox, oy) {
  const ring = releaseRing(ox, oy);
  if (!ring) return;
  const S = scale;
  const color = ring.blocked ? TOKENS.warn : TOKENS.ok;
  ctx.save();
  ctx.globalAlpha = ring.a;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  if (!ring.broken) {
    // the tether: how far the finger has wandered from where it landed
    const fx0 = input.mx * S + ox, fy0 = (input.my + HUD_TOP * TILE) * S + oy;
    if (Math.hypot(fx0 - ring.x, fy0 - ring.y) > S) {
      ctx.save();
      ctx.globalAlpha *= 0.45;
      ctx.lineWidth = uiDpr;
      ctx.beginPath(); ctx.moveTo(ring.x, ring.y); ctx.lineTo(fx0, fy0); ctx.stroke();
      ctx.restore();
    }
  }
  ctx.globalAlpha *= 0.8;
  ctx.lineWidth = Math.max(1.5 * uiDpr, S * 0.35);
  ctx.beginPath(); ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2); ctx.stroke();
  if (ring.blocked) padlockGlyph(ctx, ring.x, ring.y, Math.max(1.2 * uiDpr, S * 0.55));
  else playGlyph(ctx, ring.x, ring.y, Math.max(3 * uiDpr, S * 1.3));
  ctx.restore();
}

/* The last things on the glass under the ? layer: readouts that sit over
   the pellets and the lifted cast, because a pellet punched through a
   number would make it unreadable. Both exist only while something is
   pressed in command, and both are small. */
function drawGlassOver(ctx, ox, oy) {
  drawReleaseRing(ctx, ox, oy);
  drawDragTag(ctx, ox, oy);
}

/* ---- the practice's coach ----
   One card, one instruction at a time, docked just above where the roster
   rests so it never jumps when time stops and the roster rises under it.
   Its words are read off the practice's state and the live idiom every
   frame -- nothing it says is stored, so closing the manual or freezing
   mid-watch always lands on the right line. Around it, a few neutral marks
   on the board: a dashed ring on the ghost the card means, a ripple when
   nobody has touched anything, a chevron over the den door, and -- only
   after a while untouched -- a dotted fingertip showing the gesture. They
   are white and grey, never a ghost's color, never arrowed or beaded, so
   nothing of the coach's can be mistaken for an order. Rects are display
   px, for pressDown; null whenever that part is not taking presses.
     card   the whole plate: a press here is not a press on the maze
     skip   SKIP, the one live control on it
     play   the graduation sheet's PLAY (the whole screen answers, though) */
const coachUI = { card: null, skip: null, play: null };

/* Presentation time for the practice, uiClock throughout; the sim never
   reads it. Input stamps the presses; coachNotice, run whenever the card
   is read, stamps what changed on it.
     startedAt     the practice began: the double-press guard, the card's rise
     gradAt        the graduation sheet first went up
     pressAt       the last press or key of any kind
     tapAt         the last press on a ghost that let go without a drag
     key, stepAt   the step on the card (and its scene), and when it came
     fails, failAt missed traps seen, and when the last one reloaded
     lead, leadAt  the lead on the card, and when it last changed
     cap, capAt    ...and the caption
     tipLen, tipAt the route in hand's length, and when it last changed
     dock, dockAt  where the card rests, 'bottom' or 'top', and since when
     clearAt       since when the bottom has been clear, while it rests at the top
     geo           the drawn y and height springing to the resting ones
                   ({ y0, h0, y1, h1, t }), or null before the first frame
     heroCopy      what the hero card last said, while it has yet to go home
     heroAt        when it set off for its dock, or null before it has
     heroLeft      the hero's rect, display px, and the uiClock `at` a press on
                   it stopped time: its glass a moment longer (pressDown)
     drawn         the plate as drawn this frame, display px -- for the tests
     goneAt        the catch took the card off the glass */
const coachFx = {
  startedAt: -1e9, gradAt: null, pressAt: -1e9, tapAt: -1e9,
  key: null, stepAt: -1e9, fails: 0, failAt: -1e9,
  lead: null, leadAt: -1e9, cap: null, capAt: -1e9,
  tipLen: 0, tipAt: -1e9, dock: 'bottom', dockAt: -1e9, clearAt: -1e9, geo: null,
  heroCopy: null, heroAt: null, heroLeft: null, drawn: null, goneAt: null,
};
function coachReset() {
  Object.assign(coachFx, {
    startedAt: uiClock, gradAt: null, pressAt: uiClock, tapAt: -1e9,
    key: null, stepAt: uiClock, fails: 0, failAt: -1e9,
    lead: null, leadAt: -1e9, cap: null, capAt: -1e9,
    tipLen: 0, tipAt: -1e9, dock: 'bottom', dockAt: -1e9, clearAt: uiClock, geo: null,
    heroCopy: null, heroAt: null, heroLeft: null, drawn: null, goneAt: null,
  });
}

/* The stuck ladder, in uiClock ticks. A rung only ever changes what the
   glass says or shows -- nothing here moves a ghost, a clock or a route,
   and nothing gets worse for the player while they wait. */
const REFUSAL_SHOWN = 180;   // a refusal's reason, or a tap's, stays on the card
const COACH_RIPPLE = 240;    // 4s untouched in scene one: the maze starts to pulse
const COACH_ANYWHERE = 600;  // 10s: ...and the caption says where
const COACH_SHOW = 300;      // 5s frozen and untouched: the demo, or the ring on ▶
const COACH_DEN_LIVE = 360;  // 6s of live play in the den step without a freeze
const COACH_SKIP = 1200;     // 20s in one step: SKIP stops being quiet
const COACH_STALL = 36;      // 600ms of a tip that will not follow the pointer
const COACH_FADE = 0.35;     // a tip, with something of the board's under it (the card moves instead)
const GRAD_SWELL = 60;       // the ? chip's one swell as GOT HIM lands
const COACH_STEPS = ['freeze', 'draw', 'go', 'den', 'trap'];   // the pips

/* What changed since the card last looked. Cheap and idempotent: it only
   notes when a thing became different, so it can run as often as the
   card is read. */
function coachNotice() {
  const d = game.drill;
  if (!d) return;
  const key = d.step + '|' + d.stage;
  const was = coachFx.key;
  if (key !== coachFx.key) { coachFx.key = key; coachFx.stepAt = uiClock; }
  if (d.fails !== coachFx.fails) {
    // a retry starts its step over, idle clock and all
    coachFx.fails = d.fails;
    coachFx.failAt = uiClock;
    coachFx.stepAt = uiClock;
  }
  /* The trap is a new board: its card starts at whichever dock keeps him
     and the rings clear, simply there, with no dwell to sit out first. */
  if (d.step === 'trap' && coachFx.stepAt === uiClock && (was !== key || coachFx.failAt === uiClock)) {
    coachFx.dockAt = -1e9;
    coachFx.geo = null;
  }
  const n = Draw.active ? Draw.active.tiles.length : 0;
  if (n !== coachFx.tipLen) { coachFx.tipLen = n; coachFx.tipAt = uiClock; }
}
/* How long the player has left the practice alone: since the step began,
   the last press, and the last time time itself stopped or started. */
function coachIdle() {
  const since = Math.max(coachFx.stepAt, coachFx.pressAt,
    game.phase === 'command' ? fx.enterAt : fx.thawAt);
  return uiClock - since;
}
/* A drag going nowhere: the tip has not moved for a beat while the
   pointer is two tiles off it. The den has its own version -- straight up
   from the door is wall, and the tip will sit on the door tile for as
   long as you pull -- because there the fix is a direction, not a hint. */
function coachStall() {
  const a = Draw.active;
  if (!a || !input.dragMoved || game.phase !== 'command') return null;
  if (uiClock - coachFx.tipAt < COACH_STALL) return null;
  const tip = a.tiles[a.tiles.length - 1];
  if (Math.hypot(input.mx - tcx(tip.c), input.my - tcy(tip.r)) < TILE * 2) return null;
  return tip.r === DEN_EXIT_ROW && (tip.c === DOOR_C0 || tip.c === DOOR_C1)
    && a.hunter.inDenStates() ? 'door' : 'lane';
}
/* The trap, read the way he will meet it: which side of him each drawn
   route comes at him from. A route's side is where it first comes up into
   his corridor, the top row, or failing that where it ends, if that is up
   in the corridor or the risers under its ends; one that never comes up
   there closes nothing. Two routes are not a trap -- "from both sides"
   is, and the card says which it is looking at rather than counting.
   The card's judgment, drawn from the board; the sim never asks. */
function trapSides() {
  const e = game.evader.tile();
  let west = 0, east = 0;
  for (const h of game.hunters) {
    if (!h.path) continue;
    const ts = h.path.tiles.slice(h.path.idx || 0);
    const tip = ts[ts.length - 1];
    const at = ts.find(t => t.r === 1 && t.c !== e.c) || (tip && tip.r <= 4 && tip.c !== e.c ? tip : null);
    if (at && at.c < e.c) west++;
    else if (at) east++;
  }
  return { west, east, at: west + east, pinch: west > 0 && east > 0 };
}
/* The step still wants its route drawn. */
function coachNeedsRoute() {
  const d = game.drill;
  if (d.step === 'draw') return !drillLaneRouted();
  if (d.step === 'go') return tutResumeLocked();   // its route erased before time ran
  if (d.step === 'den') return !drillDenOrdered();
  if (d.step === 'trap') return !trapSides().pinch;
  return false;
}
/* Frozen, and the practice's route is down: PLAY is the next press. */
function coachReady() {
  const d = game.drill;
  if (!d || game.phase !== 'command' || tutResumeLocked()) return false;
  if (d.step === 'go') return game.hunters.some(h => h.path);
  if (d.step === 'den') return drillDenOrdered();
  if (d.step === 'trap') return trapSides().pinch;
  return false;
}
/* PLAY's face: the practice's gate, an overdue ghost, the practice's go,
   or plain PLAY. drawRoster wears it; the tests read it. */
function playLook() {
  if (tutResumeLocked()) return 'gated';
  if (stalledHunter()) return 'overdue';
  return coachReady() ? 'go' : 'play';
}

/* What the card says now: { lead, caption, skip, hint }, and on the
   graduation sheet head, button and micro too. Chosen here, not at the
   step change, so the idiom can change under it: a finger never reads
   click, a mouse never reads tap. `hint` marks a caption that is
   answering something the player just did, or failed to do for a while;
   it is set in ink rather than the body's grey.
   Every line is a sentence, in sentence case: they are read while the
   hand is busy, and capitals read slower than prose. One idea a line,
   and a caption under fifty letters where it can be. The labels round
   them (SKIP ›, PLAY, GOT HIM.) keep the cabinet's capitals. */
function drillCopy() {
  const d = game.drill;
  if (!d) return { lead: '', caption: '' };
  coachNotice();
  const tap = touchMode;
  const V = tap ? 'Tap' : 'Click', v = tap ? 'tap' : 'click';
  const frozen = game.phase === 'command';
  const idle = coachIdle();
  const paths = game.hunters.filter(h => h.path).length;
  // the draw step's route went onto the door: the game keeps it, the card names it
  const homeBound = d.step === 'draw' && !drillLaneRouted() && game.hunters.some(h => h.path && h.path.home);
  let lead = '', caption = '', hint = false;
  switch (d.step) {
    case 'freeze':
      // the hero card: the state in the lead, the one thing to do under it
      lead = 'Time is running.';
      caption = V + ' anywhere to stop it.';
      if (!frozen && idle >= COACH_ANYWHERE) { caption = 'Anywhere on the maze works.'; hint = true; }
      break;
    case 'draw':
      lead = tap ? 'Put a finger on the red ghost and drag a path.'
                 : 'Press on the red ghost and drag a path.';
      caption = 'It walks your path, then stops at a wall.';
      if (homeBound) { caption = 'That sends it home. Draw it along a corridor.'; hint = true; }
      break;
    case 'go':
      if (frozen && tutResumeLocked()) {
        /* The route was erased before time ever ran: PLAY is shut again,
           so the card goes back to the draw step's words rather than
           sending the player to a control that will not answer. */
        lead = tap ? 'Put a finger on the red ghost and drag a path.'
                   : 'Press on the red ghost and drag a path.';
        caption = 'It walks your path, then stops at a wall.';
      } else if (frozen) {
        lead = 'Now ' + v + ' empty maze, or ▶, to start time.';
        caption = 'You can stop and redraw whenever you like.';
        if (idle >= COACH_SHOW) { caption = '▶ is at the bottom right.'; hint = true; }
      } else if (d.stopT > 0 || d.resumeT >= DRILL_WATCH_MAX) {
        const w = game.hunters[d.watchIdx];
        if (w && w.inDenStates()) {
          // a route that ended on the door: it went home, and home it stays
          lead = 'It walked your path home to the den.';
          caption = 'It waits there until you draw it out.';
        } else {
          // it coasted off the end to the wall: waiting is the lesson, not stillness
          lead = 'Path done, so it stopped at a wall.';
          caption = 'Without a path, a ghost waits where it stops.';
        }
      } else lead = 'Watch it walk your path.';
      break;
    case 'den': {
      const ordered = drillDenOrdered();
      if (!frozen && ordered) lead = 'Here it comes.';
      else if (!frozen) {
        // three, or all four if the red ghost's route took it home
        const n = game.hunters.filter(h => h.inDenStates()).length;
        const who = n === game.hunters.length ? 'All ' + n + ' ghosts wait'
          : n === 1 ? '1 more ghost waits' : n + ' more ghosts wait';
        lead = who + ' in the den. ' + V + ' to stop time.';
        caption = 'They only come out when you draw them out.';
      } else if (ordered) lead = V + ' empty maze, or ▶, to let it out.';
      else {
        lead = tap ? 'Put a finger on the pink ghost and drag it out.'
                   : 'Press on the pink ghost and drag it out.';
        caption = 'Its path starts at the door. Then left or right.';
        // a route for the red ghost again is not the lesson; say so kindly
        if (game.hunters[0].path) { caption = 'The red ghost has its path. Now the pink one.'; hint = true; }
      }
      break;
    }
    case 'trap': {
      const sides = trapSides();
      if (!frozen) lead = 'Squeeze…';
      else if (paths === 0 && d.failKind === 'one') {
        lead = "He got away. One ghost can't catch him.";
        caption = 'Send both: one at each end of his corridor.';
      } else if (paths === 0 && d.failKind === 'open') {
        lead = 'He slipped out an open end.';
        caption = 'Send one from each side, all the way to him.';
      } else if (sides.pinch) {
        lead = V + ' empty maze, or ▶, to spring the trap.';
        caption = 'He has nowhere left to run.';
      } else if (sides.at >= 2) {
        lead = 'Both are on one side of him.';
        caption = 'Send one at him from the far side.';
      } else if (paths === 1 || sides.at === 1) {
        lead = "One ghost won't catch him.";
        caption = 'Send the other one at him from the far side.';
      } else {
        // nothing drawn, or nothing drawn that comes anywhere near him
        lead = "Catch him. He's faster than any one ghost.";
        caption = 'Send the red and pink ghosts from both sides.';
      }
      /* two misses: the corridor's two ends get rings, and the card points
         at them -- by what they are, since the ghosts wear rings too */
      if (frozen && !sides.pinch && d.fails >= 2) { caption = 'Send one ghost to each end of his corridor.'; hint = true; }
      break;
    }
    case 'graduate':
      return {
        head: 'GOT HIM.',
        lead: 'Stop time, draw paths, trap him from two sides.',
        caption: 'For real: catch him 3 times before he eats every dot.',
        button: 'PLAY',
        micro: 'Everything else is under the ? chip.',
      };
  }
  /* What the player just did, answered in the step's own terms: a drag
     going nowhere, a refused PLAY, a press on a ghost that let go before
     it drew. The newest of the last two wins; a live drag beats both. */
  if (frozen) {
    const stall = coachStall();
    const refused = tutResumeLocked() && uiClock - fx.refusedAt < REFUSAL_SHOWN;
    const tapped = coachNeedsRoute() && uiClock - coachFx.tapAt < REFUSAL_SHOWN
      && (!refused || coachFx.tapAt > fx.refusedAt);
    if (stall === 'door') caption = 'Go left or right along the top of the den first.';
    else if (stall) caption = 'Paths follow the corridors. Trace along one.';
    else if (tapped) {
      caption = tap ? 'Keep your finger down and drag before you lift it.'
                    : 'Hold the button down and drag before you let go.';
    } else if (refused && !homeBound) {
      caption = d.step === 'den' ? "The pink ghost first. It's waiting in the den."
        : d.step === 'trap'
          ? (tap ? 'Draw a path first: finger on a ghost, then drag.'
                 : 'Draw a path first: press on a ghost and drag.')
          : (tap ? 'Start with your finger on the red ghost.'
                 : 'Start the drag on the red ghost.');
    }
    if (stall || tapped || refused) hint = true;
  }
  // four misses: SKIP stops being an escape hatch and becomes the way on
  const skip = d.step === 'trap' && d.fails >= 4 ? 'START THE GAME ›' : 'SKIP ›';
  return { lead, caption, skip, hint };
}

/* What a line says when even two lines at the role's floor will not hold
   it, the way HELP_SHORT does it for the manual: keyed by the line it
   stands in for, so each idiom keeps its own verb. A list is tried in
   order. The practice's sentences wrap before they shorten (coachSet),
   and on every glass the tests know -- down to 360 CSS px at dpr 3 --
   none of them gets this far: these are the floor under the floor. The
   labels set on one line (SKIP's START THE GAME ›, the manual's control,
   the game-over chip) still reach for theirs through fitText. */
const COACH_SHORT = {
  'Press on the red ghost and drag a path.':       'Drag a path from the red ghost.',
  'Put a finger on the red ghost and drag a path.': 'Drag from the red ghost.',
  'It walks your path, then stops at a wall.':     ['It walks your path, then stops.', 'It walks your path.'],
  'That sends it home. Draw it along a corridor.': ['That goes home. Use a corridor.', 'Use a corridor.'],
  'Now click empty maze, or ▶, to start time.':    'Click empty maze or ▶ to run.',
  'Now tap empty maze, or ▶, to start time.':      'Tap empty maze or ▶ to run.',
  'You can stop and redraw whenever you like.':    'Stop and redraw any time.',
  'It walked your path home to the den.':          'It walked home.',
  'It waits there until you draw it out.':         'It waits for a path out.',
  'Path done, so it stopped at a wall.':           'Path done: it stopped.',
  'Without a path, a ghost waits where it stops.': ['No path, no chase.', 'It waits.'],
  'Send one ghost to each end of his corridor.':   ['One ghost to each end.', 'One at each end.'],
  'Start the drag on the red ghost.':              'Start on the red ghost.',
  'Start with your finger on the red ghost.':      'Start on the red ghost.',
  'Hold the button down and drag before you let go.': ['Hold the button and drag.', 'Hold and drag.'],
  'Keep your finger down and drag before you lift it.': ['Keep your finger down, drag.', 'Hold and drag.'],
  'Paths follow the corridors. Trace along one.':  'Trace along a corridor.',
  '3 more ghosts wait in the den. Click to stop time.': ['3 wait in the den. Click to stop.', 'Click to stop time.'],
  '3 more ghosts wait in the den. Tap to stop time.':   ['3 wait in the den. Tap to stop.', 'Tap to stop time.'],
  'All 4 ghosts wait in the den. Click to stop time.':  ['4 wait in the den. Click to stop.', 'Click to stop time.'],
  'All 4 ghosts wait in the den. Tap to stop time.':    ['4 wait in the den. Tap to stop.', 'Tap to stop time.'],
  'They only come out when you draw them out.':    'They leave only on a path.',
  'Press on the pink ghost and drag it out.':      ['Drag the pink ghost out.', 'Drag pink out.'],
  'Put a finger on the pink ghost and drag it out.': ['Drag the pink ghost out.', 'Drag pink out.'],
  'Its path starts at the door. Then left or right.': ['From the door, go left or right.', 'Then left or right.'],
  'The red ghost has its path. Now the pink one.': 'Now the pink one.',
  'Go left or right along the top of the den first.': ['Go left or right first.', 'Left or right first.'],
  'Click empty maze, or ▶, to let it out.':        'Click empty maze or ▶.',
  'Tap empty maze, or ▶, to let it out.':          'Tap empty maze or ▶.',
  "He got away. One ghost can't catch him.":       "One ghost can't catch him.",
  'Send both: one at each end of his corridor.':   'Send both, one at each end.',
  'Send one from each side, all the way to him.':  ['One each side, all the way in.', 'One from each side.'],
  'Send one at him from the far side.':            'One from the far side.',
  "Catch him. He's faster than any one ghost.":    ["He's faster than one ghost.", 'Catch him.'],
  'Send the red and pink ghosts from both sides.': ['Send red and pink, both sides.', 'Send red and pink.'],
  'Send the other one at him from the far side.':  'Now the other, far side.',
  'Click empty maze, or ▶, to spring the trap.':   'Click empty maze or ▶.',
  'Tap empty maze, or ▶, to spring the trap.':     'Tap empty maze or ▶.',
  "The pink ghost first. It's waiting in the den.": 'The pink ghost first.',
  'Draw a path first: press on a ghost and drag.': 'Draw a path first.',
  'Draw a path first: finger on a ghost, then drag.': 'Draw a path first.',
  'START THE GAME ›':                              'PLAY ›',
  'Stop time, draw paths, trap him from two sides.': ['Stop time, draw paths, trap him.', 'Stop, draw, trap.'],
  'For real: catch him 3 times before he eats every dot.': ['Catch him 3 times before the dots go.', 'Catch him 3 times.'],
  'Everything else is under the ? chip.':          'More under the ? chip.',
  // after the practice: the tips, the manual's control, the game-over chip
  '3 more ghosts wait in the den for your paths.': ['3 more wait in the den for paths.', '3 more wait for paths.'],
  'Keep them clear until they flash back.':        ['Keep clear till they flash back.', 'Keep them clear.'],
  'Eaten ghosts wait 5 seconds in the den.':       ['Eaten ghosts wait 5s in the den.', 'Eaten: 5s in the den.'],
  'Give it a path. The camp limit chip sets how long.': ['Give it a path. Camp limit sets how long.', 'Give it a path.'],
  'White beads: these two arrive together.':       ['White beads: they arrive together.', 'White beads: same moment.'],
  'STUCK? TRY THE 1-MINUTE PRACTICE ›':            ['TRY THE 1-MINUTE PRACTICE ›', 'TRY THE PRACTICE ›'],
  'RESTART PRACTICE':                              'RESTART',
  'END THIS GAME?':                                'END GAME?',
};
function coachLine(ctx, text, x, y, role, maxW, color) {
  return fitText(ctx, text, COACH_SHORT[text] || null, x, y, role, maxW, color);
}

/* ---- setting a sentence ----
   The coach's lines are sentences, and a sentence that does not fit is
   wrapped, not shrunk: at its resting size, onto at most COACH_LINES
   lines, broken where the two come out most nearly even, and the plate
   grows to hold them. Only if two lines at the role's floor will not
   hold it does it give up size, a pixel at a time, and then words, to
   its COACH_SHORT forms; if nothing holds, the shortest is set at the
   floor anyway and whatever is left rides on the second line --
   legibility beats a tidy margin, as it does in fitText. ▶ is glued to
   the word before it, so a line never starts on a bare arrow. Measured
   with every digit read as 0, as fitText measures. Returns { lines, px,
   w }: w the widest line as set. Kept per context and dropped by
   layout(): the card asks every frame, and the answer only changes with
   the words or the glass. */
const COACH_LINES = 2;
let coachSets = new WeakMap();
function wrapWords(ctx, text, maxW, most) {
  const width = t => ctx.measureText(t.replace(/[0-9]/g, '0')).width;
  const words = [];
  for (const w of text.split(' ')) {
    if (words.length && /^▶/.test(w)) words[words.length - 1] += ' ' + w;
    else words.push(w);
  }
  const lines = [];
  let line = '';
  for (const w of words) {
    if (line && width(line + ' ' + w) > maxW) { lines.push(line); line = w; }
    else line = line ? line + ' ' + w : w;
  }
  lines.push(line);
  if (most === Infinity) return lines;
  if (lines.length > most || lines.some(l => width(l) > maxW)) return null;
  if (lines.length === 2) {
    // the even break: the one whose longer half is shortest
    let best = null, cost = Infinity;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
      const c = Math.max(width(a), width(b));
      if (c <= maxW && c < cost) { cost = c; best = [a, b]; }
    }
    if (best) return best;
  }
  return lines;
}
function coachSet(ctx, text, role, maxW) {
  let memo = coachSets.get(ctx);
  if (!memo) { memo = new Map(); coachSets.set(ctx, memo); }
  const key = role + '|' + Math.round(maxW) + '|' + text;
  const had = memo.get(key);
  if (had) return had;
  const T = TYPE[role];
  const tries = [text].concat(COACH_SHORT[text] === undefined ? [] : COACH_SHORT[text]);
  ctx.save();
  let set = null;
  for (let n = 0; n < tries.length && !set; n++) {
    for (let px = T.max; px >= T.min && !set; px--) {
      setRoleFont(ctx, T, px);
      const lines = wrapWords(ctx, tries[n], maxW, COACH_LINES);
      if (lines) set = { lines, px };
    }
  }
  if (!set) {
    setRoleFont(ctx, T, T.min);
    const lines = wrapWords(ctx, tries[tries.length - 1], maxW, Infinity);
    set = { lines: [lines[0]].concat(lines.length > 1 ? [lines.slice(1).join(' ')] : []), px: T.min };
  }
  setRoleFont(ctx, T, set.px);
  set.w = Math.max(...set.lines.map(l => ctx.measureText(l).width));
  ctx.restore();
  if (memo.size > 256) memo.clear();
  memo.set(key, set);
  return set;
}
// one line of a set to the next, display px; and the whole set's height
function setStep(set) { return Math.round(set.px * 1.25); }
function setHeight(set) { return set ? set.lines.length * setStep(set) : 0; }
/* A set, drawn: y the middle of its first line, alignment the caller's. */
function drawSet(ctx, set, x, y, role, color) {
  const T = TYPE[role], step = setStep(set);
  ctx.save();
  setRoleFont(ctx, T, set.px);
  ctx.fillStyle = color;
  set.lines.forEach((l, i) => ctx.fillText(l, x, y + i * step));
  ctx.restore();
}

/* ---- the coach's marks on the board ----
   What the coach draws over the maze this frame, decided in one place so
   the card, the tests and the drawing never disagree:
     rings    [{ h, thin }] a ghost the card is talking about; thin while it
              walks, so it follows without shouting
     ringPlay the ring on ▶, when nobody has found it
     ripple   ticks into the idle pulse from the maze centre, or -1
     bracket  the den, outlined, while three ghosts wait unused in it
     chevron  up, over the door every den route starts from
     markers  the trap corridor's two ends, after two misses
     demo     strokes for the fingertip (native maze px), or null; demoT
              ticks into it
     skipLit  SKIP in ink: the player has been stuck long enough to want out
     breathe  the lead breathes along with the ripple
     failing  the card is reporting a miss: an amber rim */
function coachScene() {
  const s = { rings: [], ringPlay: false, ripple: -1, bracket: false, chevron: false,
    markers: false, demo: null, demoT: 0, skipLit: false, breathe: false, failing: false };
  const d = game.drill;
  if (!d || d.step === 'graduate' || game.phase === 'capture') return s;
  coachNotice();
  const frozen = game.phase === 'command';
  const idle = coachIdle();
  const inStep = uiClock - coachFx.stepAt;
  const held = Draw.active ? Draw.active.hunter : null;
  const paths = game.hunters.filter(h => h.path).length;
  const R = game.hunters[0], M = game.hunters[1];
  const ring = (h, thin) => {
    if (h && h !== held && h.isCommandable()) s.rings.push({ h, thin: !!thin });
  };
  const stuck = inStep >= COACH_SKIP || d.refusals >= 3;
  let demoFrom = COACH_SHOW;
  switch (d.step) {
    case 'freeze':
      if (!frozen && idle >= COACH_RIPPLE) s.ripple = idle - COACH_RIPPLE;
      s.breathe = s.ripple >= 0;
      s.skipLit = inStep >= COACH_SKIP;
      break;
    case 'draw':
      if (frozen && !drillLaneRouted()) ring(R);   // a trip home is not yet the route
      if (frozen && idle >= COACH_SHOW) s.demo = coachDemoDraw();
      s.skipLit = stuck;
      break;
    case 'go':
      // an erased route shuts PLAY again: ring the red ghost, as the draw step does, not ▶
      if (frozen && tutResumeLocked()) ring(R);
      else if (frozen) s.ringPlay = idle >= COACH_SHOW && !Draw.active;
      else ring(game.hunters[d.watchIdx], true);
      break;
    case 'den': {
      const ordered = drillDenOrdered();
      if (!frozen && !ordered) {
        s.bracket = true;
        if (idle >= COACH_DEN_LIVE) s.ripple = idle - COACH_DEN_LIVE;
      } else if (!frozen) ring(game.hunters[d.denIdx], true);
      else if (!ordered) {
        ring(M);
        s.chevron = !held || held.inDenStates();
        if (idle >= COACH_SHOW) s.demo = coachDemoDen();
      }
      s.skipLit = stuck;
      break;
    }
    case 'trap':
      if (frozen) {
        if (!trapSides().pinch) { if (!R.path) ring(R); if (!M.path) ring(M); }
        s.markers = d.fails >= 2;
        s.failing = !!d.failKind && paths === 0;
        // three misses and the gesture is shown straight away; after one, on a pause
        if (d.fails >= 3) demoFrom = 0;
        if (paths < 2 && d.fails >= 1 && idle >= demoFrom) s.demo = coachDemoTrap();
      }
      s.skipLit = d.fails >= 3;
      break;
  }
  /* The fingertip is a picture of a gesture, and the moment there is a
     real one -- any press at all, either button, a finger, one held on
     the card, a route in hand or an erase sweep -- it is gone. */
  if (s.demo && (input.leftDown || input.rightDown || input.cardDown || input.touchId !== null
                 || Draw.active || Draw.erase)) s.demo = null;
  if (s.demo) s.demoT = idle - demoFrom;
  return s;
}

/* The demo strokes, in native maze px. Cosmetic: they are routed with
   bfsRoute for the look of a corridor and handed to nothing but the
   drawing below. */
const tileAt = t => ({ x: tcx(t.c), y: tcy(t.r) });
function coachDemoDraw() {
  // from the red ghost, five tiles up the left-hand corridor
  const R = game.hunters[0];
  const route = bfsRoute(R.tile(), { c: 1, r: 6 }) || [];
  return [[{ x: R.x, y: R.y }].concat(route.slice(1, 6).map(tileAt))];
}
function coachDemoDen() {
  // from the pink ghost's seat to the door, up, one step left, and on up
  const M = game.hunters[1];
  const up = bfsRoute({ c: 12, r: DEN_EXIT_ROW }, { c: 12, r: 8 }) || [];
  return [[{ x: M.x, y: M.y }, { x: DEN_EXIT_X, y: M.y },
    { x: DEN_EXIT_X, y: tcy(DEN_EXIT_ROW) }].concat(up.map(tileAt))];
}
function coachDemoTrap() {
  // one ghost to each end of his corridor and in at him, one after the other
  const R = game.hunters[0], M = game.hunters[1], E = TRAP.evader;
  const out = [];
  if (!R.path) out.push([{ x: R.x, y: R.y }, tileAt({ c: 6, r: 1 }), tileAt(E)]);
  if (!M.path) out.push([{ x: M.x, y: M.y }, tileAt({ c: 12, r: 5 }), tileAt({ c: 12, r: 1 }), tileAt(E)]);
  return out;
}

/* Board px to glass px, for anything the coach pins to the maze. */
function glassAt(x, y) {
  return { x: x * scale, y: (y + HUD_TOP * TILE) * scale };
}

/* The coach's one mark: a dashed hollow ring in plain white, breathing a
   little and turning slowly, so it reads as pointing rather than as part
   of the board. `r` a radius, or a rect to ring as a capsule. */
function coachRing(ctx, x, y, r, thin) {
  const S = scale, still = reducedMotion();
  ctx.save();
  ctx.strokeStyle = TOKENS.ink;
  ctx.globalAlpha *= thin ? 0.4 : 0.6;
  ctx.lineWidth = thin ? Math.max(uiDpr, S * 0.3) : Math.max(1.5 * uiDpr, S * 0.45);
  ctx.setLineDash([S * 1.6, S * 1.1]);
  ctx.lineDashOffset = still ? 0 : -uiClock * S * 0.06;
  const b = still ? 1 : 1 + 0.05 * Math.sin(uiClock * 0.1);
  ctx.beginPath();
  if (typeof r === 'number') ctx.arc(x, y, r * b, 0, Math.PI * 2);
  else {
    const m = S * 2 * b;
    plate(ctx, r.x - m, r.y - m, r.w + m * 2, r.h + m * 2, r.h / 2 + m);
  }
  ctx.stroke();
  ctx.restore();
}

/* Scene one's first question is the freeze, and a board that is simply
   running gives no hint that it can be touched. So after a while, rings
   spread from the middle of the maze -- the shape of a press, not of
   anything the game does. Still, under reduced motion: one faint ring. */
const RIPPLE_EVERY = 90;   // ticks: a pulse every second and a half
function drawRipple(ctx, t) {
  const S = scale;
  const c = glassAt(NATIVE_W / 2, MAZE_ROWS * TILE / 2);
  ctx.save();
  ctx.strokeStyle = TOKENS.muted;
  ctx.lineWidth = Math.max(uiDpr, S * 0.4);
  if (reducedMotion()) {
    ctx.globalAlpha = 0.3;
    ctx.beginPath(); ctx.arc(c.x, c.y, S * 22, 0, Math.PI * 2); ctx.stroke();
  } else {
    for (const lag of [0, 16]) {
      if (t < lag) continue;
      const k = ((t - lag) % RIPPLE_EVERY) / RIPPLE_EVERY;
      const e = 1 - (1 - k) * (1 - k);
      ctx.globalAlpha = 0.5 * (1 - k) * (1 - k);
      ctx.beginPath(); ctx.arc(c.x, c.y, S * (5 + 60 * e), 0, Math.PI * 2); ctx.stroke();
    }
  }
  ctx.restore();
}

/* The fingertip. A hollow white circle presses down at the start of a
   stroke, slides along it, and lifts; behind it a dotted grey trail fades
   within half a second. No arrowhead, no beads, no casing, no ghost color
   -- nothing a route has -- and it is gone the instant a real press lands.
   Several strokes play one after the other. Under reduced motion the
   whole of each stroke is simply shown, dotted, with the circle at its
   start. */
const DEMO_PRESS = 12;    // ticks: the fingertip lands
const DEMO_TILE = 7;      // ticks per tile of slide
const DEMO_LIFT = 12;     // ticks: ...and lifts
const DEMO_FADE = 30;     // ticks a trail dot lasts behind it
const DEMO_PERIOD = 144;  // at least this long between one showing and the next
const DEMO_DOT = 3;       // native px between trail dots
function polyLength(pts) {
  let n = 0;
  for (let i = 1; i < pts.length; i++) n += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return n;
}
function polyAt(pts, s) {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (s <= l || i === pts.length - 1) {
      const k = l ? Math.min(1, Math.max(0, s / l)) : 0;
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
    s -= l;
  }
  return pts[0];
}
function drawDemoStroke(ctx, strokes, t) {
  const S = scale, still = reducedMotion();
  const lens = strokes.map(polyLength);
  const durs = lens.map(l => DEMO_PRESS + l / TILE * DEMO_TILE + DEMO_LIFT);
  const period = Math.max(DEMO_PERIOD, durs.reduce((a, b) => a + b, 0) + DEMO_FADE + 24);
  let u = still ? 0 : t % period;
  const tipR = Math.max(5 * uiDpr, S * 3);
  const dotR = Math.max(uiDpr, S * 0.32);
  ctx.save();
  strokes.forEach((pts, i) => {
    const local = u;
    u -= durs[i];
    if (pts.length < 2) return;
    if (still) {
      ctx.save();
      ctx.fillStyle = TOKENS.muted;
      ctx.globalAlpha = 0.55;
      for (let s = 0; s <= lens[i]; s += DEMO_DOT) {
        const p = glassAt(polyAt(pts, s).x, polyAt(pts, s).y);
        ctx.beginPath(); ctx.arc(p.x, p.y, dotR, 0, Math.PI * 2); ctx.fill();
      }
      const p0 = glassAt(pts[0].x, pts[0].y);
      ctx.strokeStyle = TOKENS.ink;
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = Math.max(1.5 * uiDpr, S * 0.4);
      ctx.beginPath(); ctx.arc(p0.x, p0.y, tipR, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      return;
    }
    if (local < 0) return;
    const slid = Math.max(0, Math.min(lens[i], (local - DEMO_PRESS) / DEMO_TILE * TILE));
    // the trail: each dot lit as the tip passes it, gone half a second later
    ctx.save();
    ctx.fillStyle = TOKENS.muted;
    for (let s = 0; s <= slid; s += DEMO_DOT) {
      const age = local - (DEMO_PRESS + s / TILE * DEMO_TILE);
      const a = 0.75 * (1 - age / DEMO_FADE);
      if (a <= 0) continue;
      const q = polyAt(pts, s), p = glassAt(q.x, q.y);
      ctx.globalAlpha = a;
      ctx.beginPath(); ctx.arc(p.x, p.y, dotR, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    if (local >= durs[i]) return;
    // the tip: in as it lands, out as it lifts, pressed a little smaller in between
    const inK = Math.min(1, local / DEMO_PRESS);
    const outK = Math.min(1, (durs[i] - local) / DEMO_LIFT);
    const q = polyAt(pts, slid), p = glassAt(q.x, q.y);
    ctx.save();
    ctx.globalAlpha = 0.85 * Math.min(inK, outK);
    ctx.strokeStyle = TOKENS.ink;
    ctx.lineWidth = Math.max(1.5 * uiDpr, S * 0.4);
    ctx.beginPath(); ctx.arc(p.x, p.y, tipR * (1 + 0.35 * (1 - inK) + 0.35 * (1 - outK)), 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha *= 0.18;
    ctx.fillStyle = TOKENS.ink;
    ctx.fill();
    ctx.restore();
  });
  ctx.restore();
}

/* The marks, under the card. */
function drawCoachMarks(ctx, s) {
  const S = scale;
  if (s.ripple >= 0) drawRipple(ctx, s.ripple);
  if (s.bracket) {
    /* The den, bracketed at its corners in the glass's hairline: three
       ghosts are in there doing nothing, and the card is about to ask
       why. */
    const a = glassAt(DEN.left * TILE - 1.5, DEN.top * TILE - 1.5);
    const b = glassAt((DEN.right + 1) * TILE + 1.5, (DEN.bottom + 1) * TILE + 1.5);
    const L = S * 4;
    ctx.save();
    ctx.strokeStyle = TOKENS.line;
    ctx.globalAlpha = reducedMotion() ? 0.8 : 0.6 + 0.3 * Math.sin(uiClock * 0.08);
    ctx.lineWidth = Math.max(uiDpr, S * 0.4);
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const [x, y, dx, dy] of [[a.x, a.y, 1, 1], [b.x, a.y, -1, 1], [a.x, b.y, 1, -1], [b.x, b.y, -1, -1]]) {
      ctx.moveTo(x + dx * L, y); ctx.lineTo(x, y); ctx.lineTo(x, y + dy * L);
    }
    ctx.stroke();
    ctx.restore();
  }
  if (s.markers) {
    for (const c of [6, 12]) {
      const p = glassAt(tcx(c), tcy(1));
      coachRing(ctx, p.x, p.y, S * 5, false);
    }
  }
  s.rings.forEach(({ h, thin }) => {
    const p = glassAt(h.x, h.y);
    coachRing(ctx, p.x, p.y, S * (thin ? 9 : 10), thin);
  });
  if (s.ringPlay && rosterUI.play) coachRing(ctx, 0, 0, rosterUI.play, false);
  if (s.chevron) {
    /* Every den route starts on the door, whatever the finger does, so
       the door gets an arrow: up and out, bobbing. */
    const bob = reducedMotion() ? 0 : Math.sin(uiClock * 0.12) * S * 0.6;
    const p = glassAt(DEN_EXIT_X, DOOR_ROW * TILE + TILE / 2);
    const w = S * 2.6, hh = S * 1.5;
    ctx.save();
    ctx.strokeStyle = TOKENS.ink;
    ctx.lineWidth = Math.max(1.5 * uiDpr, S * 0.55);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    [0, 1].forEach(n => {
      const y = p.y + bob - n * S * 2.2;
      ctx.globalAlpha = n ? 0.4 : 0.9;
      ctx.beginPath();
      ctx.moveTo(p.x - w, y + hh); ctx.lineTo(p.x, y - hh); ctx.lineTo(p.x + w, y + hh);
      ctx.stroke();
    });
    ctx.restore();
  }
  if (s.demo) drawDemoStroke(ctx, s.demo, s.demoT);
}

/* ---- the hero ----
   The practice's first card is its one instruction before the player
   knows where anything is, so it is not docked: it is set large and
   centred over the den, the middle of the maze, where the eye already
   is. It keeps the card's top row -- PRACTICE, the pips, SKIP -- and its
   sentences are centred under it. The freeze that answers it sends it
   home to the bottom dock (coachMove), and the player has seen where the
   next instruction will be. */
function coachHero() {
  const d = game.drill;
  return !!d && d.step === 'freeze';
}
// the den's middle, display px down the glass: where a hero centres
function heroMid() {
  return glassAt(NATIVE_W / 2, (DEN.top + DEN.bottom + 1) * TILE / 2).y;
}
// a hero's y for height h: on the den's middle, and never under the pill or the roster
function heroY(h) {
  const S = scale;
  const top = pillBox().floor + S * 1.5, bottom = rosterTop() - S * 3 - h;
  return Math.round(Math.max(top, Math.min(bottom, heroMid() - h / 2)));
}
/* The first game's hero toast for height h. Not on the den: its caption
   is about the three ghosts waiting there, and a toast over them would
   point at what it hides. It takes the open band of maze above the
   first ghost's start, under the pill, centred in it; READY! and the den
   are left below it in plain view. Where that band is too short for it,
   it hangs under READY! instead, in the empty lower maze. */
function heroToastY(h) {
  const S = scale;
  const top = pillBox().floor + S * 1.5;
  const above = glassAt(0, tcy(DEN_EXIT_ROW) - TILE).y - S * 1.5;
  if (above - top >= h) return Math.round(top + (above - top - h) / 2);
  const under = glassAt(0, (MSG_ROW + 1) * TILE).y + S * 1.5;
  return Math.round(Math.max(top, Math.min(rosterTop() - S * 3 - h, under)));
}

/* The card's resting place, in display px, at one of its two docks (see
   coachDock), or as the hero; the current one when none is named. It is
   sized from the type actually in use: 78% of the glass where there is
   room, and wider where the lead has hit its floor, so a phone still gets
   a few words a line -- the hero a size up in all of it. Its height is
   whatever its sentences wrap to -- the top row, then the lead and the
   caption as coachSet sets them -- so it grows to fit rather than
   squeezing them. `ctx` measures (the screen's by default)
   and `copy` is what it says (the card's own by default). */
function coachCardRect(ctx, copy, dock) {
  ctx = ctx || screenCtx;
  copy = copy || drillCopy();
  dock = dock || (coachHero() ? 'hero' : coachFx.dock);
  const S = scale, W = screenCanvas.width;
  const hero = dock === 'hero';
  const leadRole = hero ? 'heroLead' : 'coachLead', bodyRole = hero ? 'heroBody' : 'coachBody';
  const pad = hero ? Math.max(S * 3.5, 9 * uiDpr) : Math.max(S * 2.5, 6 * uiDpr);
  const gap = hero ? Math.max(S * 1.6, 4 * uiDpr) : Math.max(S * 1.2, 3 * uiDpr);
  const microH = rolePx('micro'), capH = rolePx('caption');
  const w = Math.round(hero
    ? Math.min(W - S * 6, Math.max(W * 0.86, rolePx('heroLead') * 16))
    : Math.min(W - S * 8, Math.max(W * 0.78, rolePx('coachLead') * 24)));
  const x = Math.round((W - w) / 2);
  const tw = w - pad * 2;
  const lead = coachSet(ctx, copy.lead, leadRole, tw);
  const cap = copy.caption ? coachSet(ctx, copy.caption, bodyRole, tw) : null;
  const h = Math.round(pad * 2 + microH + gap + setHeight(lead) + (cap ? gap * 0.6 + setHeight(cap) : 0));
  const y = hero ? heroY(h)
    : Math.round(dock === 'top' ? pillBox().floor + S * 1.5 : rosterTop() - S * 3 - h);
  return { x, y, w, h, pad, gap, microH, capH, tw, lead, cap, dock, hero, leadRole, bodyRole };
}

/* ---- where the card rests ----
   Home is the bottom of the maze, over the roster: the hero goes there on
   the first freeze, so the player learns where the next word will be,
   and there it stays. It leaves for the top, hung under the status pill,
   only to uncover what the step is about -- and never fades to make way:
   a card at a third of its strength is a card nobody can read, and the
   moment something runs under it is the moment it is being read. What it
   keeps clear of, by weight:
     the ghost it is asking for (a full ring), the trap's two rings   100
     the route in hand: its tip, and the ghost drawing it              10
     a ghost the go step is watching walk (a thin ring)                 4
     him, in the trap                                                   4
   Anything else may pass under it. In scene one he is not what the card
   is about, and a card that dodged him would never sit still; nor is the
   fingertip, which is drawn to be seen beside the card, not instead of it.
   The dock covering more gives way to the one covering less: at once if
   what it covers is the ghost it asks for, and otherwise only once it
   has rested DOCK_DWELL, so he running past can never set it swinging.
   The dock it would move to must be clear by a margin the one it rests
   at is not held to, and it goes home to the bottom only once the bottom
   has stayed clear for DOCK_HOME with no route in hand. The trap's board
   starts it at whichever dock suits, with no dwell (coachNotice). The
   hero is not docked at all. Presentation only: the sim never asks where
   the card is, and the hit tests read the resting rect of the dock it is
   at, not the spring carrying it there. */
const DOCK_DWELL = 45;   // ticks at a dock before it moves for anything less than its ghost
const DOCK_HOME = 90;    // ticks the bottom stays clear before the card goes back
const DOCK_MUST = 100;   // the weight the card may never rest on
function coachKeepClear(scene) {
  const S = scale, out = [], d = game.drill;
  const step = d ? d.step : null;
  const add = (x, y, r, w) => { const p = glassAt(x, y); out.push({ x: p.x, y: p.y, r, w }); };
  const e = game.evader;
  if (step === 'trap' && e && e.alive) add(e.x, e.y, S * 7, 4);
  for (const { h, thin } of scene.rings) {
    if (!thin) add(h.x, h.y, S * 10, DOCK_MUST);
    else if (step === 'go') add(h.x, h.y, S * 9, 4);
  }
  if (scene.markers) for (const c of [6, 12]) add(tcx(c), tcy(1), S * 7, DOCK_MUST);
  const a = Draw.active;
  if (a) {
    const t = a.tiles[a.tiles.length - 1];
    add(tcx(t.c), tcy(t.r), S * 5, 10);
    add(a.hunter.x, a.hunter.y, S * 7, 10);
  }
  return out;
}
// the weight of what a rect covers, each thing grown by m
function dockCover(r, items, m) {
  let n = 0;
  for (const q of items) {
    const k = q.r + m;
    if (q.x + k > r.x && q.x - k < r.x + r.w && q.y + k > r.y && q.y - k < r.y + r.h) n += q.w;
  }
  return n;
}
function coachDock(ctx, copy, scene) {
  const items = coachKeepClear(scene);
  const cur = coachFx.dock, alt = cur === 'top' ? 'bottom' : 'top';
  const here = dockCover(coachCardRect(ctx, copy, cur), items, 0);
  const there = dockCover(coachCardRect(ctx, copy, alt), items, scale * 4);
  if (cur !== 'top' || there > 0) coachFx.clearAt = uiClock;
  const rested = uiClock - coachFx.dockAt >= DOCK_DWELL;
  const move = (there < here && (here >= DOCK_MUST || rested))
    || (cur === 'top' && there === 0 && !Draw.active && uiClock - coachFx.clearAt >= DOCK_HOME);
  if (move) {
    coachFx.dock = alt;
    coachFx.dockAt = uiClock;
    coachFx.clearAt = uiClock;
  }
  return coachFx.dock;
}
/* Where the card is drawn: its resting y and height, reached on the
   shared spring from wherever it was when either last changed -- a dock
   crossed, or a line gained or lost. The first frame of a practice is
   simply there; its rise is drawCoachLayer's. */
function coachGeo(r) {
  const at = coachFx.geo;
  const now = () => {
    const k = springIn(uiClock - at.t);
    return { y: at.y0 + (at.y1 - at.y0) * k, h: at.h0 + (at.h1 - at.h0) * k };
  };
  if (!at) coachFx.geo = { y0: r.y, h0: r.h, y1: r.y, h1: r.h, t: uiClock };
  else if (Math.abs(at.y1 - r.y) > 0.5 || Math.abs(at.h1 - r.h) > 0.5) {
    const from = now();
    coachFx.geo = { y0: from.y, h0: from.h, y1: r.y, h1: r.h, t: uiClock };
  } else return now();
  return { y: coachFx.geo.y0, h: coachFx.geo.h0 };
}

/* ---- the hero goes home ----
   The freeze that answers the hero sends it to its dock: from the middle
   of the maze to the bottom over HERO_MOVE, shrinking to the docked
   card's size as it goes. Not on the shared spring: that one is built to
   arrive in a blink and would be there in a third of the trip, so this
   is a plain cubic ease-out across the whole of it -- quick off the
   middle, a long settle onto the dock, never past it. It sets off on the
   freeze's own stamp, fx.enterAt, so it falls while the wave runs out
   across the maze and lands as the roster's cards rise to meet it -- the
   two halves of one moment, time stopping and the glass arriving. Its
   words are step one's, scaled with the plate, until the last part of the
   trip, where they cross-fade to step two's on the plate's own progress:
   step one's are gone by the time it is four fifths of the way, step
   two's are whole as it lands, and the two never stand at strength
   together -- never a swap in mid-air at full size, and never a stale
   line on a card already home. Under reduced motion it is simply at the
   bottom, saying step two. Returns { from, k } -- the hero's rect as it
   last stood, and the 0..1 of the trip, eased -- or null when there is
   no trip under way. Presentation only; the hit tests read the dock's
   resting rect throughout, so SKIP is where it will be, not where it is
   flying. */
const HERO_MOVE = 18;   // ticks: ~300ms from the middle to the dock
const HERO_OLD = [0.55, 0.8];   // the trip's k over which step one's words leave
const HERO_NEW = [0.7, 1];      // ...and step two's arrive
function coachMove(ctx, r) {
  if (r.hero || !coachFx.heroCopy) return null;
  if (coachFx.heroAt === null) {
    // the freeze's own stamp if this is its frame; a freeze under the manual goes when the manual shuts
    coachFx.heroAt = game.phase === 'command' && uiClock - fx.enterAt < FX_SPRING
      ? Math.min(uiClock, fx.enterAt) : uiClock;
  }
  const t = uiClock - coachFx.heroAt;
  if (reducedMotion() || t >= HERO_MOVE) { coachFx.heroCopy = null; return null; }
  return {
    from: coachCardRect(ctx, coachFx.heroCopy, 'hero'),
    k: 1 - Math.pow(1 - Math.max(0, t) / HERO_MOVE, 3),
  };
}
// 0 before a, 1 after b, straight in between
function ramp(u, a, b) { return Math.min(1, Math.max(0, (u - a) / (b - a))); }

/* Anything of the board's the player must see, under a rect: him, a
   ghost they can command, or the tip of the route in hand. The tips
   still fade for it (the card moves instead: coachDock). `himOnly` asks
   about him alone, for the hero toast (drawTipToast). */
function coachUnder(r, himOnly) {
  const S = scale;
  const hit = (q, m) => q.x + m > r.x && q.x - m < r.x + r.w && q.y + m > r.y && q.y - m < r.y + r.h;
  const e = game.evader;
  if (e && e.alive && hit(glassAt(e.x, e.y), S * 7)) return true;
  if (himOnly) return false;
  if (game.hunters.some(h => h.isCommandable() && hit(glassAt(h.x, h.y), S * 7))) return true;
  const a = Draw.active;
  if (a) {
    const t = a.tiles[a.tiles.length - 1];
    if (hit(glassAt(tcx(t.c), tcy(t.r)), S * 4)) return true;
  }
  return false;
}

/* Does the card take a press here (display px d, board px x, y)? Not over
   a ghost or an arrowhead. The card moves off what it is talking about,
   but it still rests over a strip of maze, and a ghost it is not talking
   about can stand there; a press on it is a press on the ghost, or "stop
   and redraw whenever you like" would be a lie there. The hero is the
   exception, all of it glass: it sits on the den by design, the three
   ghosts under it cannot be seen through it, and its one instruction is
   the freeze. A press on "Time is running." that also picked up a hidden
   den ghost would start a route nobody asked for, and could walk the
   player straight past the den's own lesson. Hover-safe reads, never
   pickAt, which changes the selection just by asking. */
function cardHolds(d, x, y) {
  if (!coachUI.card || !inRect(d, coachUI.card)) return false;
  if (coachHero()) return true;
  return !Draw.poolAt(x, y).length && !(game.phase === 'command' && Draw.tipAt(game, x, y));
}

/* The card: PRACTICE, the five pips and SKIP along the top, then the lead
   and its caption. It rises with the practice as the hero, goes home to
   the bottom on the first freeze, drops away for the catch, and moves --
   top or bottom of the maze -- rather than sit over what the step is
   about (coachDock); a new line springs in where the old one stood, and
   the plate springs to its new size with it. */
function drawCoachLayer(ctx) {
  coachUI.card = coachUI.skip = coachUI.play = null;
  coachFx.drawn = null;
  const d = game.drill;
  if (!d || game.helpOpen) return;
  if (d.step === 'graduate') {
    if (coachFx.gradAt === null) coachFx.gradAt = uiClock;
    drawGraduation(ctx);
    return;
  }
  const copy = drillCopy();
  const scene = coachScene();
  if (game.phase === 'capture') {
    // the catch has the board to itself
    if (coachFx.goneAt === null) coachFx.goneAt = uiClock;
    const e = easeOut(uiClock - coachFx.goneAt);
    if (e < 1) drawCoachCard(ctx, copy, scene, 1 - e, e * CARD_RISE * scale, false);
    return;
  }
  coachFx.goneAt = null;
  drawCoachMarks(ctx, scene);
  if (!coachHero()) coachDock(ctx, copy, scene);
  const k = springIn(uiClock - coachFx.startedAt);
  drawCoachCard(ctx, copy, scene, Math.min(1, Math.max(0, k)), (1 - k) * CARD_RISE * scale, true);
}

function drawCoachCard(ctx, copy, scene, a, dy, live) {
  const S = scale;
  const d = game.drill;
  const r = coachCardRect(ctx, copy);
  if (r.hero) { coachFx.heroCopy = copy; coachFx.heroAt = null; }
  const mv = coachMove(ctx, r);
  /* The plate: on its way home from the middle, or at its dock on the
     dock's own spring. The hero has no spring of its own, and the dock's
     starts from rest where the trip home lands. */
  let at;
  if (mv) {
    const f = mv.from, mix = (p, q) => p + (q - p) * mv.k;
    at = { x: mix(f.x, r.x), y: mix(f.y, r.y), w: mix(f.w, r.w), h: mix(f.h, r.h),
      pad: mix(f.pad, r.pad), gap: mix(f.gap, r.gap) };
    coachFx.geo = null;
  } else if (r.hero) {
    at = { x: r.x, y: r.y, w: r.w, h: r.h, pad: r.pad, gap: r.gap };
    coachFx.geo = null;
  } else {
    const g = coachGeo(r);
    at = { x: r.x, y: g.y, w: r.w, h: g.h, pad: r.pad, gap: r.gap };
  }
  if (copy.lead !== coachFx.lead) { coachFx.lead = copy.lead; coachFx.leadAt = uiClock; }
  if (copy.caption !== coachFx.cap) { coachFx.cap = copy.caption; coachFx.capAt = uiClock; }

  // a missed trap reloads with the card shaking its head, as a refused PLAY does
  const since = uiClock - coachFx.failAt;
  const dx = since < 14 && !reducedMotion() ? Math.sin(since * 1.9) * (1 - since / 14) * S * 1.6 : 0;
  const x = at.x + dx, y = at.y + dy, w = at.w, h = at.h, pad = at.pad, rad = S * 3;
  coachFx.drawn = { x, y, w, h };
  ctx.save();
  ctx.globalAlpha = a;
  glassPlate(ctx, x, y, w, h, rad, 1);
  ctx.save();
  ctx.strokeStyle = scene.failing ? TOKENS.warn : TOKENS.line;
  ctx.globalAlpha *= scene.failing ? 0.95 : 0.5;
  ctx.lineWidth = scene.failing ? Math.max(1.5 * uiDpr, S * 0.4) : uiDpr;
  plate(ctx, x, y, w, h, rad);
  ctx.stroke();
  ctx.restore();
  ctx.textBaseline = 'middle';

  /* The top row. SKIP is a quiet word at the right, lit once the player
     has been stuck a while; after four missed traps it is the way on, and
     filled like one. The pips sit in the middle -- or wherever SKIP
     leaves room -- and PRACTICE gives way first if the row is crowded.
     The hero sets it in the same type as the docked card, so on the way
     home it simply travels with the plate. */
  const rowY = y + pad + r.microH / 2;
  const label = copy.skip;
  const go = label !== 'SKIP ›';
  const skipW = (ww, pp) => Math.min(ww * 0.5, roleWidth(ctx, label, 'caption') + pp * 1.5);
  const sw = skipW(w, pad);
  const sh = r.capH + at.gap * 1.5;
  const sx = x + w - pad * 0.5 - sw, sy = rowY - sh / 2;
  const look = ctlLook('skip');
  ctx.save();
  pressIn(ctx, look, sx + sw / 2, rowY);
  if (go) glassPlate(ctx, sx, sy, sw, sh, sh / 2, 0, TOKENS.ok);
  ctlTint(ctx, look, sx, sy, sw, sh, sh / 2);
  if (!go && scene.skipLit) {
    ctx.save();
    ctx.strokeStyle = TOKENS.line;
    ctx.globalAlpha *= 0.6;
    ctx.lineWidth = uiDpr;
    plate(ctx, sx, sy, sw, sh, sh / 2);
    ctx.stroke();
    ctx.restore();
  }
  ctx.textAlign = 'center';
  coachLine(ctx, label, sx + sw / 2, rowY, 'caption', sw - pad * 0.5,
    go ? TOKENS.onColor : look.hover || look.pressed || scene.skipLit ? TOKENS.ink : TOKENS.muted);
  ctx.restore();

  const pr = Math.max(1.5 * uiDpr, S * 0.75), pg = Math.max(3 * uiDpr, S * 1.4);
  const pipsW = COACH_STEPS.length * pr * 2 + (COACH_STEPS.length - 1) * pg;
  let pcx = x + w / 2;
  if (pcx + pipsW / 2 > sx - pg * 2) pcx = sx - pg * 2 - pipsW / 2;
  const practiceW = roleWidth(ctx, 'PRACTICE', 'micro');
  if (x + pad + practiceW + pg * 2 <= pcx - pipsW / 2) {
    ctx.textAlign = 'left';
    fitText(ctx, 'PRACTICE', null, x + pad, rowY, 'micro', practiceW + S, TOKENS.muted);
  }
  const cur = COACH_STEPS.indexOf(d.step);
  const kPip = springIn(uiClock - coachFx.stepAt);
  COACH_STEPS.forEach((step, i) => {
    const px = pcx - pipsW / 2 + pr + i * (pr * 2 + pg);
    const done = i < cur || (step === 'den' && d.denDone);
    ctx.save();
    ctx.beginPath();
    if (i === cur && !done) {
      ctx.strokeStyle = TOKENS.ink;
      ctx.lineWidth = Math.max(uiDpr, S * 0.35);
      ctx.arc(px, rowY, pr * (0.6 + 0.6 * kPip), 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = done ? TOKENS.ink : TOKENS.track;
      ctx.globalAlpha *= done ? 0.85 : 1;
      ctx.arc(px, rowY, done ? pr : pr * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });

  /* The lines. Each springs up into place when it changes; the lead
     breathes while the maze pulses, so the two read as one call. On the
     way home the hero's lines shrink with the plate and give way, late,
     to step two's, which land with it. */
  const leadTop = rowY + r.microH / 2 + at.gap;
  const box = { x: x + pad, y: leadTop, w: w - pad * 2, h: y + h - pad - leadTop };
  if (mv) {
    drawCardLines(ctx, mv.from, coachFx.heroCopy, box, { a: 1 - ramp(mv.k, HERO_OLD[0], HERO_OLD[1]), fit: true });
    drawCardLines(ctx, r, copy, box, { a: ramp(mv.k, HERO_NEW[0], HERO_NEW[1]), fit: true });
  } else {
    const breath = scene.breathe && !reducedMotion()
      ? 0.72 + 0.28 * (0.5 + 0.5 * Math.cos(uiClock * Math.PI * 2 / RIPPLE_EVERY)) : 1;
    drawCardLines(ctx, r, copy, box, { a: 1, breath,
      kl: springIn(uiClock - coachFx.leadAt), kc: springIn(uiClock - coachFx.capAt) });
  }
  ctx.restore();

  /* The rects are the card's at rest -- at its dock, or the hero's --
     whatever the trip home, the spring, the rise or the shake are doing:
     SKIP must not slip out from under a finger because the card is on
     its way somewhere. */
  if (live) {
    const rsw = skipW(r.w, r.pad), rsh = r.capH + r.gap * 1.5;
    coachUI.card = { x: r.x, y: r.y, w: r.w, h: r.h };
    coachUI.skip = { x: r.x + r.w - r.pad * 0.5 - rsw, y: r.y + r.pad + r.microH / 2 - rsh / 2, w: rsw, h: rsh };
  }
}

/* A card's two sentences as `f` (a coachCardRect) set them, in `box`
   under the top row: from its left edge at a dock, centred as the hero.
   `o.kl` and `o.kc` spring each line in when it changes, and `o.breath`
   is the lead's. With `o.fit` -- the plate in flight -- the set is
   scaled, never set afresh, to whatever the plate holds this frame. The
   hero's body is its instruction, so it is in ink, as a hint is. */
function drawCardLines(ctx, f, copy, box, o) {
  const a = o.a === undefined ? 1 : o.a;
  if (a <= 0.004) return;
  const S = scale;
  const kl = o.kl === undefined ? 1 : o.kl, kc = o.kc === undefined ? 1 : o.kc;
  const capGap = f.gap * 0.6;
  const bh = setHeight(f.lead) + (f.cap ? capGap + setHeight(f.cap) : 0);
  const s = o.fit ? Math.min(1, box.w / f.tw, box.h / bh) : 1;
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.translate(f.hero ? box.x + box.w / 2 : box.x, box.y);
  if (s !== 1) ctx.scale(s, s);
  ctx.textAlign = f.hero ? 'center' : 'left';
  ctx.save();
  ctx.globalAlpha *= Math.min(1, Math.max(0, kl)) * (o.breath === undefined ? 1 : o.breath);
  drawSet(ctx, f.lead, 0, setStep(f.lead) / 2 + (1 - kl) * S * 1.5, f.leadRole, TOKENS.ink);
  ctx.restore();
  if (f.cap) {
    const capY = setHeight(f.lead) + capGap + setStep(f.cap) / 2;
    ctx.save();
    ctx.globalAlpha *= Math.min(1, Math.max(0, kc));
    drawSet(ctx, f.cap, 0, capY + (1 - kc) * S * 1.5, f.bodyRole,
      f.hero || copy.hint ? TOKENS.ink : TOKENS.body);
    ctx.restore();
  }
  ctx.restore();
}

/* GOT HIM: the whole game in one line over the finished catch, and the
   way into a real one. It grows out of the spot where he was caught, on
   the shared spring, over the machine dimmed by half. It never moves on
   by itself -- a reader is never yanked into READY -- and any press is
   PLAY, so there is nothing to aim at; the button is there to be seen. */
/* The sheet at rest, display px: the plate, its padding, the button, its
   sentences as coachSet wraps them, and the centre line of each row (of
   a set's first line). Sized from the type in use, like the card, and as
   tall as its sentences come out. */
function gradSheetRect(ctx, copy) {
  ctx = ctx || screenCtx;
  copy = copy || drillCopy();
  const S = scale, W = screenCanvas.width, H = screenCanvas.height;
  const pad = Math.max(S * 4, 10 * uiDpr), gap = Math.max(S * 2, 5 * uiDpr);
  const headH = rolePx('head'), labH = rolePx('title');
  const btnH = Math.max(S * 11, labH * 2), btnW = Math.max(S * 34, labH * 6);
  const w = Math.round(Math.min(W - S * 6, Math.max(W * 0.86, rolePx('coachLead') * 26)));
  const x = Math.round((W - w) / 2);
  const tw = w - pad * 2;
  const lead = coachSet(ctx, copy.lead, 'coachLead', tw);
  const cap = coachSet(ctx, copy.caption, 'coachBody', tw);
  const micro = coachSet(ctx, copy.micro, 'coachBody', tw);
  const h = pad * 2 + headH + setHeight(lead) + setHeight(cap) + btnH + setHeight(micro) + gap * 4.2;
  const y = Math.round((H - h) / 2);
  let cy = y + pad + headH / 2;
  const ys = { head: cy };
  cy += headH / 2 + gap; ys.lead = cy + setStep(lead) / 2;
  cy += setHeight(lead) + gap * 0.6; ys.cap = cy + setStep(cap) / 2;
  cy += setHeight(cap) + gap * 1.6; ys.btn = cy;
  cy += btnH + gap; ys.micro = cy + setStep(micro) / 2;
  return { x, y, w, h, pad, ys, btnW, btnH, lead, cap, micro };
}
function drawGraduation(ctx) {
  const S = scale, W = screenCanvas.width, H = screenCanvas.height;
  const copy = drillCopy();
  const k = springIn(uiClock - coachFx.gradAt);
  const a = Math.min(1, Math.max(0, k));
  ctx.save();
  ctx.globalAlpha = 0.5 * a;
  ctx.fillStyle = TOKENS.scrim;
  ctx.fillRect(0, 0, W, H);
  const g = gradSheetRect(ctx, copy);
  const { x, y, w, h, pad, ys, btnW, btnH } = g;
  const cx = W / 2, mid = y + h / 2;
  // the button's resting rect is the one hovered and pressed, whatever the spring is doing
  const bx = cx - btnW / 2;
  coachUI.play = { x: bx, y: ys.btn, w: btnW, h: btnH };

  ctx.globalAlpha = a;
  const o = game.evader ? glassAt(game.evader.x, game.evader.y) : { x: cx, y: mid };
  const sc = 0.5 + 0.5 * k;
  ctx.translate(o.x + (cx - o.x) * k, o.y + (mid - o.y) * k);
  ctx.scale(sc, sc);
  ctx.translate(-cx, -mid);

  glassPlate(ctx, x, y, w, h, S * 3, 2);
  ctx.save();
  ctx.strokeStyle = TOKENS.line;
  ctx.globalAlpha *= 0.6;
  ctx.lineWidth = uiDpr;
  plate(ctx, x, y, w, h, S * 3);
  ctx.stroke();
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const tw = w - pad * 2;
  fitText(ctx, copy.head, null, cx, ys.head, 'head', tw, TOKENS.ink);
  drawSet(ctx, g.lead, cx, ys.lead, 'coachLead', TOKENS.ink);
  drawSet(ctx, g.cap, cx, ys.cap, 'coachBody', TOKENS.body);

  const look = ctlLook('grad');
  const by = ys.btn;
  ctx.save();
  pressIn(ctx, look, cx, by + btnH / 2);
  glassPlate(ctx, bx, by, btnW, btnH, btnH / 2, 0, TOKENS.ok);
  ctlTint(ctx, look, bx, by, btnW, btnH, btnH / 2);
  // the word and PLAY's own triangle, centred as a pair
  const t = btnH * 0.16;
  const lw = roleWidth(ctx, copy.button, 'title');
  const span = lw + t * 3;
  ctx.textAlign = 'left';
  fitText(ctx, copy.button, null, cx - span / 2, by + btnH / 2, 'title', btnW, TOKENS.onColor);
  ctx.fillStyle = TOKENS.onColor;
  playGlyph(ctx, cx + span / 2 - t, by + btnH / 2, t);
  ctx.restore();
  ctx.textAlign = 'center';
  drawSet(ctx, g.micro, cx, ys.micro, 'coachBody', TOKENS.muted);
  ctx.restore();
}

/* ---- after the practice: the tips ----
   A real game teaches the rest the moment it happens, once ever each: a
   small glass toast under the status pill, in the coach card's material
   with none of its controls. It takes no press, stops nothing and moves
   nothing. Every trigger is read off the game as it stands, from here,
   and the game never learns a toast was up. What has been shown is one
   number in the browser, gpTips, a bit a lesson:
     freeze  a first real game: time stops on your click, and the den
             waits on your paths. The one toast that is a hero, centred
             over the den as the practice's first card is. Up from READY
             and gone on the first freeze the player makes. Unlike the
             rest, showing it does not spend it: a round that never froze
             gets it back
     fright  the first time his energizer turns a ghost on the board blue
     eaten   the first ghost he eats
     camp    the first freeze the camp limit makes, with a nod from its chip
     beads   the first frozen frame with white beads on it
   None of them names a pointer but the first, so the idioms share them.
   The practice and the attract demo never see any of it. */
const TIP = { freeze: 1, fright: 2, eaten: 4, camp: 8, beads: 16 };
const TIP_SHOW = 210;      // uiClock ticks a tip stays: 3.5s
const TIP_G1_PLAY = 480;   // ticks of a round's play the freeze toast waits for a freeze
const TIP_PULSE = 48;      // the camp chip's one swell, after it has settled
let tipBits = 0;
function loadTips() {
  // Number(null) is 0 and garbage is NaN, which |0 also makes 0: nothing shown
  try { tipBits = Number(localStorage.getItem('gpTips')) | 0; } catch (e) { tipBits = 0; }
}
function markTip(bit) {
  if (tipBits & bit) return;
  tipBits |= bit;
  try { localStorage.setItem('gpTips', String(tipBits)); } catch (e) {}
}
// handFreeze's report: in a real game, the click has been found
function tipFreezeSeen() {
  if (!game.drill && !game.demo) markTip(TIP.freeze);
}

/* Presentation state, uiClock throughout:
     active   the tip on the glass, a TIP key, or null
     at       when it went up
     name     the camp tip's ghost, fixed as it went up
     leaving  { kind, name, at }: the one on its way out
     nudgeAt  a press in READY the freeze toast answered
     campAt   the camp tip went up, for the chip's swell
     alpha, alphaAt  the eased fade while something of the board is under it
     rect     where it rests, display px -- for the tests; it takes no press */
const tipUI = { active: null, at: -1e9, name: '', leaving: null, nudgeAt: -1e9, campAt: -1e9,
  alpha: 1, alphaAt: -1e9, rect: null };

// a round of a real game: not the title, not the demo, not the practice
function realRound() {
  return !game.drill && !game.demo
    && game.phase !== 'attract' && game.phase !== 'gameover' && game.phase !== 'boot';
}
/* The freeze toast's whole rule, pure, so the board's own GRAB A GHOST
   can stand aside for it without waiting on a frame. */
function g1Wanted() {
  if (!realRound() || (tipBits & TIP.freeze)) return false;
  return game.phase === 'ready'
    || (game.phase === 'play' && game.tick - game.playTick0 < TIP_G1_PLAY);
}
// the moment a lesson happens, first match wins; null when none is due
function tipDue() {
  if (!realRound() || game.helpOpen) return null;
  const fresh = bit => !(tipBits & bit);
  if (fresh(TIP.fright) && game.frightT > 0
      && game.hunters.some(h => h.state === 'active' && !h.frightImmune)) return 'fright';
  if (fresh(TIP.eaten) && game.hunters.some(h => h.state === 'dissolving' || h.isEyes())) return 'eaten';
  if (fresh(TIP.camp) && game.phase === 'command' && stalledHunter()) return 'camp';
  if (fresh(TIP.beads) && game.phase === 'command'
      && hotBeadsNow().some(l => l && l.hot.size)) return 'beads';
  return null;
}
/* Once a frame, from render. One toast at a time, and the freeze toast
   first: a player who has not found the click has no use yet for blue
   ghosts. A lesson that comes due behind it waits, and is still there
   if its moment is -- fright lasts, eyes last, a camp freeze lasts. */
function tipTick() {
  const T = tipUI;
  if (T.active === 'freeze') {
    if (g1Wanted()) return;
    tipLeave();
  } else if (T.active) {
    if (uiClock - T.at < TIP_SHOW && realRound()) return;
    tipLeave();
  }
  if (T.leaving && uiClock - T.leaving.at < FX_EXIT) return;
  if (g1Wanted()) { tipStart('freeze'); return; }
  const due = tipDue();
  if (due) { tipStart(due); markTip(TIP[due]); }
}
function tipStart(kind) {
  tipUI.active = kind;
  tipUI.at = uiClock;
  tipUI.name = kind === 'camp' ? stalledHunter().def.name : '';
  if (kind === 'camp') tipUI.campAt = uiClock;
}
function tipLeave() {
  tipUI.leaving = { kind: tipUI.active, name: tipUI.name, at: uiClock };
  tipUI.active = null;
}
// a press READY will not take yet, answered by the toast that asked for it
function tipNudge() {
  if (tipUI.active === 'freeze') tipUI.nudgeAt = uiClock;
}
/* The camp chip's swell, 0..1: once the chip has risen into place, a
   single breath in and out. Held still, at a glance's worth, under
   reduced motion. */
function campPulse() {
  const t = uiClock - tipUI.campAt - FX_SPRING;
  if (t < 0 || t >= TIP_PULSE) return 0;
  return reducedMotion() ? 0.6 : Math.sin(Math.PI * t / TIP_PULSE);
}

function tipCopy(kind, name) {
  switch (kind) {
    case 'freeze': return {
      lead: (touchMode ? 'Tap' : 'Click') + ' anywhere to stop time.',
      caption: '3 more ghosts wait in the den for your paths.' };
    case 'fright': return {
      lead: 'Blue ghosts can be eaten.', caption: 'Keep them clear until they flash back.' };
    case 'eaten': return {
      lead: 'Eaten ghosts wait 5 seconds in the den.', caption: 'Then draw them back out.' };
    case 'camp': return {
      // a name in a sentence is a name, not a label: EMBER reads Ember
      lead: name.charAt(0) + name.slice(1).toLowerCase() + ' waited too long.',
      caption: 'Give it a path. The camp limit chip sets how long.' };
    case 'beads': return {
      lead: 'White beads: these two arrive together.', caption: "That's a pincer." };
  }
  return { lead: '', caption: '' };
}

/* The toast at rest, display px: as wide as its words, within the
   card's own limits, and hung just under the pill's row -- which is the
   maze's top edge, so it drops out of the HUD the way the pill does. Its
   two sentences are set as the card's are, wrapping at the widest the
   toast may be; the widest line they come out at is the toast's width.
   The freeze toast is the exception: it is a first game's hero, the
   practice's first card without its controls -- centred on the glass in
   the hero's type, its sentences centred, in the open maze above the den
   it talks about (heroToastY). It has no next instruction to go and wait
   for, so it never docks; it fades where it stands. */
function tipRect(ctx, copy, kind) {
  const S = scale, W = screenCanvas.width;
  if (kind === 'freeze') {
    const pad = Math.max(S * 3.5, 9 * uiDpr), gap = Math.max(S * 1.6, 4 * uiDpr);
    const most = Math.round(Math.min(W - S * 6, Math.max(W * 0.86, rolePx('heroLead') * 16)));
    const lead = coachSet(ctx, copy.lead, 'heroLead', most - pad * 2);
    const cap = coachSet(ctx, copy.caption, 'heroBody', most - pad * 2);
    const w = Math.ceil(Math.min(most, Math.max(W * 0.6, Math.max(lead.w, cap.w) + pad * 2)));
    const h = Math.round(pad * 2 + setHeight(lead) + gap + setHeight(cap));
    return { x: Math.round((W - w) / 2), y: heroToastY(h), w, h, pad, gap, lead, cap, hero: true,
      leadRole: 'heroLead', bodyRole: 'heroBody' };
  }
  const pad = Math.max(S * 2.5, 6 * uiDpr), gap = Math.max(S, 2.5 * uiDpr);
  const most = Math.round(Math.min(W - S * 8, Math.max(W * 0.78, rolePx('coachLead') * 24)));
  const lead = coachSet(ctx, copy.lead, 'coachLead', most - pad * 2);
  const cap = coachSet(ctx, copy.caption, 'coachBody', most - pad * 2);
  const w = Math.ceil(Math.min(most, Math.max(W * 0.4, Math.max(lead.w, cap.w) + pad * 2)));
  const h = Math.round(pad * 2 + setHeight(lead) + gap + setHeight(cap));
  return { x: Math.round((W - w) / 2), y: Math.round(pillBox().floor + S * 1.5), w, h, pad, gap, lead, cap,
    hero: false, leadRole: 'coachLead', bodyRole: 'coachBody' };
}
/* k the entrance spring, out the exit's progress. He or the route's tip
   under it and it fades back: the board comes first. The card moves out
   of the way instead, but a toast is up for three seconds and takes no
   press, and there is nowhere else under the pill for it to go. The hero
   toast gives way to him alone: it is the round's one instruction, and a
   ghost walking under it is a ghost it is asking the player to stop. */
function drawTipToast(ctx, kind, name, k, out) {
  const S = scale;
  const copy = tipCopy(kind, name);
  const r = tipRect(ctx, copy, kind);
  const a = Math.min(1, Math.max(0, k)) * (1 - out);
  const target = coachUnder(r, r.hero) ? COACH_FADE : 1;
  if (reducedMotion()) tipUI.alpha = target;
  else tipUI.alpha += (target - tipUI.alpha) * (1 - Math.exp(-Math.max(0, uiClock - tipUI.alphaAt) / 3));
  tipUI.alphaAt = uiClock;
  if (a <= 0.01) return r;
  // a press READY would not take: the toast swells a little and settles
  const since = uiClock - tipUI.nudgeAt;
  const swell = kind === 'freeze' && !out && since < FX_SPRING ? 1 + 0.04 * (1 - springIn(since)) : 1;
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  ctx.save();
  ctx.globalAlpha = a * tipUI.alpha;
  ctx.translate(cx, cy - (1 - k) * S * 3);
  ctx.scale(swell, swell);
  ctx.translate(-cx, -cy);
  const rad = S * 3;
  glassPlate(ctx, r.x, r.y, r.w, r.h, rad, 1);
  ctx.save();
  ctx.strokeStyle = TOKENS.line;
  ctx.globalAlpha *= 0.5;
  ctx.lineWidth = uiDpr;
  plate(ctx, r.x, r.y, r.w, r.h, rad);
  ctx.stroke();
  ctx.restore();
  ctx.textAlign = r.hero ? 'center' : 'left';
  ctx.textBaseline = 'middle';
  const tx = r.hero ? cx : r.x + r.pad;
  const leadY = r.y + r.pad + setStep(r.lead) / 2;
  drawSet(ctx, r.lead, tx, leadY, r.leadRole, TOKENS.ink);
  drawSet(ctx, r.cap, tx, r.y + r.pad + setHeight(r.lead) + r.gap + setStep(r.cap) / 2,
    r.bodyRole, TOKENS.body);
  ctx.restore();
  return r;
}

/* The game-over chip. A game that ended without a single catch is a
   player who never found the verb, and the game over is the one moment
   they are listening: so the practice is offered, bottom centre, where
   the roster would stand. Once per page load -- a second catchless game
   over is somebody's choice, and the manual still has the way in. */
const GAMEOVER_PRACTICE = 'STUCK? TRY THE 1-MINUTE PRACTICE ›';
const gameOverUI = { practice: null };               // display px, while it is up
const gameOverFx = { live: false, spent: false, at: -1e9 };
function gameOverChipUp() {
  if (game.phase !== 'gameover') { gameOverFx.live = false; return false; }
  if (!gameOverFx.live && !gameOverFx.spent && game.catches === 0) {
    gameOverFx.live = gameOverFx.spent = true;
    gameOverFx.at = uiClock;
  }
  return gameOverFx.live;
}
function drawGameOverChip(ctx) {
  const S = scale, W = screenCanvas.width;
  const h = Math.round(Math.max(S * 9, rolePx('caption') * 2.2));
  const pad = h * 0.6;
  const w = Math.round(Math.min(W - S * 12,
    Math.max(W * 0.5, roleWidth(ctx, GAMEOVER_PRACTICE, 'caption') + pad * 2)));
  const x = Math.round((W - w) / 2);
  const y = Math.round(rosterTop() + (S * 13 - h) / 2);
  gameOverUI.practice = { x, y, w, h };   // the resting rect, whatever the spring is doing
  const k = springIn(uiClock - gameOverFx.at);
  const look = ctlLook('retry');
  ctx.save();
  ctx.globalAlpha = Math.min(1, Math.max(0, k));
  ctx.translate(0, (1 - k) * CARD_RISE * S);
  pressIn(ctx, look, x + w / 2, y + h / 2);
  glassPlate(ctx, x, y, w, h, h / 2, 1);
  ctlTint(ctx, look, x, y, w, h, h / 2);
  ctx.save();
  ctx.strokeStyle = TOKENS.line;
  ctx.globalAlpha *= look.hover ? 0.9 : 0.6;
  ctx.lineWidth = uiDpr;
  plate(ctx, x, y, w, h, h / 2);
  ctx.stroke();
  ctx.restore();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  coachLine(ctx, GAMEOVER_PRACTICE, x + w / 2, y + h / 2, 'caption', w - pad, TOKENS.ink);
  ctx.restore();
}

/* After the coach, before the manual: the toasts over the board, and
   the chip over a game over. Rects are nulled first and set only while
   drawn, as the coach's are. */
function drawTipLayer(ctx) {
  gameOverUI.practice = null;
  tipUI.rect = null;
  const T = tipUI;
  if (T.leaving) {
    const e = easeOut(uiClock - T.leaving.at);
    if (e < 1) drawTipToast(ctx, T.leaving.kind, T.leaving.name, 1, e);
    else T.leaving = null;
  }
  if (T.active) T.rect = drawTipToast(ctx, T.active, T.name, springIn(uiClock - T.at), 0);
  if (gameOverChipUp()) drawGameOverChip(ctx);
}

/* The pincer read, heard. Only on a change, only for the route in hand, at
   most once per PINCER_GAP, and through uiBlip, so mute silences it. A
   route picked up already meeting someone starts from there unannounced,
   and letting go is not "lost". Presentation only: the simulation never
   learns a chime happened.
   The ear keeps what it last *said*, not what it last saw. A change inside
   the gap is held, not dropped: if it is still true when the gap runs out
   it is said then, so the last thing heard always matches the route in
   hand -- and a wobble that flips back inside the gap was never news. */
const PINCER_GAP = 15;   // ticks: a quarter second
const pincerEar = { a: null, said: false, at: -1e9 };
function listenForPincer() {
  const a = game.phase === 'command' ? Draw.active : null;
  if (!a) { pincerEar.a = null; return; }
  const mine = hotBeadsNow()[game.hunters.indexOf(a.hunter)];
  const on = !!(mine && mine.hot.size);
  if (pincerEar.a !== a) { pincerEar.a = a; pincerEar.said = on; return; }
  if (on === pincerEar.said || uiClock - pincerEar.at < PINCER_GAP) return;
  pincerEar.said = on;
  pincerEar.at = uiClock;
  if (on) Sound.uiPincerOn(); else Sound.uiPincerOff();
}

/* ------------------------------ the manual ------------------------------
   The instructions kept growing until they stopped being read. Now the
   glass carries one small ? chip in the corner, and this pocket manual
   behind it: seven rules, each with a little drawn figure. Documentation
   is for the player, so it renders in the player's layer. */
const helpUI = { btn: null, close: null, panel: null, practice: null };
// the manual's own presentation state: when PRACTICE last asked END THIS GAME?
const helpFx = { confirmAt: -1e9 };
// the ? chip's centre, in native px of the whole canvas (HUD rows included)
const HELP_CHIP = { x: NATIVE_W - 7, y: 7, r: 4.2 };

/* The roster ghost in miniature: dome, straight sides, three-flame hem.
   `look` is true or 'fright' for the frightened face, 'eyes' for a ghost
   walking home as nothing but its eyes; anything else is the ghost.
   `gaze` 'up' or 'down' turns the pupils the way the den turns them;
   left out, they look along the page. */
function helpGhost(ctx, x, y, r, color, look, gaze) {
  const fright = look === true || look === 'fright';
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(r / 7, r / 7);
  if (look !== 'eyes') {
    ctx.beginPath();
    ctx.moveTo(-7, 0);
    ctx.arc(0, 0, 7, Math.PI, Math.PI * 2);
    ctx.lineTo(7, 7);
    for (let k = 1; k <= 5; k++) ctx.lineTo(7 - k * (14 / 6), k % 2 ? 4.9 : 7);
    ctx.lineTo(-7, 7);
    ctx.closePath();
    ctx.fillStyle = fright ? PAL.fright : color;
    ctx.fill();
  }
  if (fright) {
    ctx.fillStyle = PAL.peach;
    ctx.beginPath(); ctx.arc(-3, -1, 1.1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(3, -1, 1.1, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = PAL.peach;
    ctx.lineWidth = 0.9;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-6, 3.5);
    for (let k = 0; k < 3; k++) {
      ctx.lineTo(-6 + k * 4 + 2, 2.6);
      ctx.lineTo(-6 + k * 4 + 4, 3.5);
    }
    ctx.stroke();
  } else {
    for (const ex of [-3, 3]) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(ex, 0, 2, 2.4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#202090';
      const gy = gaze === 'up' ? -1.2 : gaze === 'down' ? 1.2 : 0;
      ctx.beginPath(); ctx.arc(ex + (gy ? 0 : 1), gy, 1.1, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

function helpTrail(ctx, pts, w, color, arrow) {
  // the drawn-order look in miniature: glow passes under a solid core
  for (const [lw, a] of [[w * 4, 0.14], [w * 2, 0.3], [w, 0.95]]) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = a;
    ctx.lineWidth = lw;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    ctx.restore();
  }
  if (arrow) {
    const a = pts[pts.length - 2], b = pts[pts.length - 1];
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const len = w * 2.6;
    ctx.save();
    ctx.fillStyle = color;
    ctx.translate(b.x, b.y); ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(len, 0);
    ctx.lineTo(-len * 0.55, len * 0.7);
    ctx.lineTo(-len * 0.2, 0);
    ctx.lineTo(-len * 0.55, -len * 0.7);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

function helpFigure(ctx, kind, cx, cy, S) {
  // each figure lives in a box roughly 30S wide, 22S tall around (cx, cy)
  ctx.save();
  switch (kind) {
    case 'click': {
      // a cursor with pulse rings: the click that stops and starts time
      const ph = (uiFrame * 0.03) % 1;
      for (const k of [0, 0.5]) {
        const t = (ph + k) % 1;
        ctx.strokeStyle = '#9fb4ff';
        ctx.globalAlpha = 0.7 * (1 - t);
        ctx.lineWidth = Math.max(1, S * 0.4);
        ctx.beginPath();
        ctx.arc(cx - S * 3, cy - S * 1, S * (2.5 + t * 6), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.translate(cx - S * 3, cy - S * 1);
      ctx.scale(S * 0.75, S * 0.75);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#202040';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(0, 10); ctx.lineTo(2.6, 7.6);
      ctx.lineTo(4.4, 11.2); ctx.lineTo(6.1, 10.3); ctx.lineTo(4.3, 6.9);
      ctx.lineTo(7.3, 6.9);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      break;
    }
    case 'drag': {
      helpTrail(ctx, [
        { x: cx - S * 8, y: cy + S * 2 }, { x: cx - S * 1, y: cy + S * 2 },
        { x: cx - S * 1, y: cy - S * 4 }, { x: cx + S * 9, y: cy - S * 4 },
      ], S * 0.8, HUNTER_DEFS[0].color, true);
      helpGhost(ctx, cx - S * 8, cy + S * 2, S * 3.4, HUNTER_DEFS[0].color, false);
      break;
    }
    case 'beads': {
      helpTrail(ctx, [{ x: cx - S * 11, y: cy }, { x: cx + S * 11, y: cy }],
        S * 0.8, HUNTER_DEFS[2].color, false);
      for (let k = -2; k <= 2; k++) {
        const bx = cx + k * S * 4.5;
        if (k === 0) {
          const pulse = 0.6 + 0.4 * Math.sin(uiFrame * 0.18);
          ctx.globalAlpha = 0.95;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = Math.max(1, S * 0.32);
          ctx.beginPath();
          ctx.arc(bx, cy, S * (1.1 + 0.4 * pulse), 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = k === 0 ? 1 : 0.65;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(bx, cy, S * 0.6, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'loop': {
      const w = S * 8, h = S * 6;
      helpTrail(ctx, [
        { x: cx - w, y: cy - h }, { x: cx + w, y: cy - h }, { x: cx + w, y: cy + h },
        { x: cx - w, y: cy + h }, { x: cx - w, y: cy - h },
      ], S * 0.8, HUNTER_DEFS[3].color, false);
      // the closed-circuit ring on the start tile
      ctx.strokeStyle = HUNTER_DEFS[3].color;
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = Math.max(1, S * 0.35);
      ctx.beginPath();
      ctx.arc(cx - w, cy - h, S * 1.8 + Math.sin(uiFrame * 0.1) * S * 0.25, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'camp': {
      // a wall, a dotted coast into it, and a ghost parked against it
      ctx.fillStyle = '#3a48ff';
      ctx.fillRect(cx + S * 7, cy - S * 8, S * 1.6, S * 16);
      ctx.strokeStyle = HUNTER_DEFS[1].color;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = Math.max(1, S * 0.6);
      ctx.setLineDash([S * 1.2, S * 1.4]);
      ctx.beginPath();
      ctx.moveTo(cx - S * 11, cy + S * 1);
      ctx.lineTo(cx + S * 2, cy + S * 1);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      helpGhost(ctx, cx + S * 3, cy + S * 1, S * 3.4, HUNTER_DEFS[1].color, false);
      // the small z trails the big one by the big one's own size, floor or not
      const zPx = rolePx('caption');
      ctx.textAlign = 'left';
      fitText(ctx, 'Z', null, cx + S * 0.5, cy - S * 5, 'caption', 0, TOKENS.muted);
      fitText(ctx, 'z', null, cx + S * 0.5 + zPx * 0.75, cy - S * 5 - zPx * 0.55,
        'micro', 0, TOKENS.muted);
      break;
    }
    case 'fright': {
      // the energizer, mid-blink, and what it does to a hunter
      if ((uiFrame / 12 | 0) % 2 === 0) {
        ctx.fillStyle = PAL.dot;
        ctx.beginPath(); ctx.arc(cx - S * 8, cy, S * 2.2, 0, Math.PI * 2); ctx.fill();
      }
      helpGhost(ctx, cx + S * 5, cy, S * 3.4, null, true);
      break;
    }
    case 'den': {
      /* The den in miniature: a route running down through the door, the
         ghost it sent sitting inside whole and watching the door, and a
         pair of eyes beside it still sitting out their wait. Ready and
         stuck, side by side, the way the board shows them. */
      const w = S * 10, top = cy - S * 2, bot = cy + S * 8.5, door = S * 3;
      ctx.strokeStyle = PAL.wall;
      ctx.lineWidth = Math.max(1, S * 0.6);
      ctx.beginPath();
      ctx.moveTo(cx - door, top); ctx.lineTo(cx - w, top); ctx.lineTo(cx - w, bot);
      ctx.lineTo(cx + w, bot); ctx.lineTo(cx + w, top); ctx.lineTo(cx + door, top);
      ctx.stroke();
      ctx.strokeStyle = PAL.door;
      ctx.beginPath(); ctx.moveTo(cx - door, top); ctx.lineTo(cx + door, top); ctx.stroke();
      helpTrail(ctx, [
        { x: cx - S * 11, y: cy - S * 8 }, { x: cx, y: cy - S * 8 }, { x: cx, y: top },
      ], S * 0.8, HUNTER_DEFS[1].color, false);
      helpGhost(ctx, cx - S * 4.5, cy + S * 4, S * 3.1, HUNTER_DEFS[1].color, null, 'up');
      helpGhost(ctx, cx + S * 4.5, cy + S * 4, S * 3.1, HUNTER_DEFS[3].color, 'eyes', 'down');
      break;
    }
    case 'score': {
      ctx.fillStyle = PAL.dot;
      for (const k of [-1, 0, 1]) {
        ctx.beginPath(); ctx.arc(cx - S * 7 + k * S * 3.6, cy, S * 0.9, 0, Math.PI * 2); ctx.fill();
      }
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      fitText(ctx, 'x LVL', null, cx - S * 2.2, cy + S * 0.2, 'caption', S * 17, TOKENS.ink);
      break;
    }
  }
  ctx.restore();
}

/* `at`/`bt` are the same instruction in the finger idiom. A manual that
   tells a phone player to right-click is worse than no manual. */
const HELP_ROWS = [
  { fig: 'click',  a: 'CLICK ANYWHERE FREEZES TIME',       b: 'CLICK EMPTY MAZE TO RESUME',
                   at: 'TAP ANYWHERE FREEZES TIME',        bt: 'TAP EMPTY MAZE TO RESUME' },
  { fig: 'drag',   a: 'DRAG A GHOST TO DRAW ITS PATH',     b: 'IT WALKS EXACTLY WHAT YOU DREW' },
  { fig: 'beads',  a: 'BEADS MARK EQUAL TRAVEL TIME',      b: 'WHITE BEADS = A SYNCED PINCER' },
  { fig: 'loop',   a: 'CLOSE THE LOOP FOR AN ENDLESS PATROL', b: 'CLICK AN ARROWHEAD TO KEEP DRAWING',
                   bt: 'TAP AN ARROWHEAD TO KEEP DRAWING' },
  { fig: 'camp',   a: 'OFF THE END IT COASTS TO A WALL',   b: 'CAMP LIMIT SETS HOW LONG IT WAITS' },
  { fig: 'fright', a: 'ENERGIZERS TURN YOUR SQUAD BLUE',   b: 'BLUE GHOSTS CAN BE EATEN' },
  { fig: 'den',    a: 'DRAW A GHOST HOME TO RECHARGE IT',  b: 'IT LEAVES THE DEN ONLY ON ORDERS' },
  { fig: 'score',  a: 'SCORE = DOTS LEFT x LEVEL',         b: 'CATCH HIM FAST, BANK MORE' },
];
/* What a line says when the column is too narrow to hold it at a legible
   size -- a small phone at dpr 3. Keyed by the line it stands in for, so
   the click and finger idioms each get their own. */
const HELP_SHORT = {
  'BEADS MARK EQUAL TRAVEL TIME':         'BEADS = EQUAL TRAVEL TIME',
  'WHITE BEADS = A SYNCED PINCER':        'WHITE BEADS = PINCER',
  'IT WALKS EXACTLY WHAT YOU DREW':       'IT WALKS WHAT YOU DREW',
  'CLOSE THE LOOP FOR AN ENDLESS PATROL': 'CLOSE THE LOOP TO PATROL',
  'CLICK AN ARROWHEAD TO KEEP DRAWING':   'CLICK A TIP TO KEEP DRAWING',
  'TAP AN ARROWHEAD TO KEEP DRAWING':     'TAP A TIP TO KEEP DRAWING',
  'OFF THE END IT COASTS TO A WALL':      'THEN IT COASTS TO A WALL',
  'CAMP LIMIT SETS HOW LONG IT WAITS':    'CAMP LIMIT: HOW LONG IT WAITS',
  'ENERGIZERS TURN YOUR SQUAD BLUE':      'ENERGIZERS TURN YOU BLUE',
  'DRAW A GHOST HOME TO RECHARGE IT':     'DRAW IT HOME TO RECHARGE',
  'IT LEAVES THE DEN ONLY ON ORDERS':     'IT LEAVES ONLY ON ORDERS',
  'SPACE FREEZE   1-4 SELECT   RIGHT-DRAG ERASE   M MUTE': 'SPACE FREEZE  1-4 SELECT  M MUTE',
  'TAP FREEZE   ROSTER SELECTS   DRAG BACK TO UNDO':      'ROSTER SELECTS  DRAG BACK TO UNDO',
};
function helpLine(ctx, text, x, y, role, maxW, color) {
  fitText(ctx, text, HELP_SHORT[text] || null, x, y, role, maxW, color);
}

function drawHelpLayer(ctx) {
  const S = scale;
  const W = screenCanvas.width, H = screenCanvas.height;
  ctx.save();
  ctx.textBaseline = 'middle';

  /* The ? chip: the one control that never leaves the glass. It breathes
     on the attract screen and during the first untouched seconds of a
     round, then settles down and stays out of the way. */
  const r = S * HELP_CHIP.r;
  const bcx = HELP_CHIP.x * S, bcy = HELP_CHIP.y * S;
  helpUI.btn = { x: bcx - r - S, y: bcy - r - S, w: (r + S) * 2, h: (r + S) * 2 };
  helpUI.practice = null;   // set again below, only while the manual is up
  /* ...and once more as the practice's GOT HIM sheet lands, because its
     last line points here: a single swell, not a breath. */
  const landed = game.drill && coachFx.gradAt !== null ? uiClock - coachFx.gradAt : -1;
  const swell = !game.helpOpen && landed >= 0 && landed < GRAD_SWELL;
  const attention = !game.helpOpen
    && (game.phase === 'attract' || hintWindowOpen() || swell);
  const pulse = swell ? 0.5 + 0.5 * Math.sin(Math.PI * landed / GRAD_SWELL)
    : attention ? 0.65 + 0.35 * Math.sin(uiFrame * 0.1) : 0.5;
  const chip = ctlLook('help');
  ctx.save();
  pressIn(ctx, chip, bcx, bcy);
  ctx.beginPath(); ctx.arc(bcx, bcy, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(8,12,28,0.85)';
  ctx.fill();
  ctlTint(ctx, chip, bcx - r, bcy - r, r * 2, r * 2, r);
  ctx.save();
  ctx.shadowColor = '#5878ff';
  ctx.shadowBlur = attention ? S * 3.5 * pulse : 0;
  ctx.strokeStyle = '#5878ff';
  ctx.globalAlpha = chip.hover || chip.pressed ? 1 : 0.4 + pulse * 0.6;
  ctx.lineWidth = Math.max(1, S * 0.5);
  ctx.beginPath(); ctx.arc(bcx, bcy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
  ctx.textAlign = 'center';
  fitText(ctx, '?', null, bcx, bcy + S * 0.4, 'title', r * 1.6,
    game.helpOpen || chip.hover ? TOKENS.ink : '#9fb4ff');
  ctx.restore();

  if (!game.helpOpen) { ctx.restore(); return; }

  // dim the whole machine: the manual is read, not played
  ctx.fillStyle = TOKENS.scrim;
  ctx.fillRect(0, 0, W, H);

  const px = S * 9, py = S * 12;
  const pw = W - px * 2, ph = H - py * 2;
  helpUI.panel = { x: px, y: py, w: pw, h: ph };
  plate(ctx, px, py, pw, ph, S * 3);
  ctx.fillStyle = 'rgba(10,14,32,0.96)';
  ctx.fill();
  ctx.strokeStyle = '#5878ff';
  ctx.globalAlpha = 0.8;
  ctx.lineWidth = Math.max(1, S * 0.5);
  plate(ctx, px, py, pw, ph, S * 3);
  ctx.stroke();
  ctx.globalAlpha = 1;

  const cw = S * 7;
  helpUI.close = { x: px + pw - cw - S * 3, y: py + S * 3.5, w: cw, h: cw };
  const cc = helpUI.close;

  /* PRACTICE, a quiet capsule left of the X: the way back into the
     lesson for anyone who skipped it or wants it again. Its question,
     END THIS GAME?, is set in amber on the same capsule; the title gives
     up room to it rather than the other way round. */
  const prLabel = practiceLabel();
  const prAsk = prLabel === 'END THIS GAME?';
  const prLook = ctlLook('practice');
  const prH = Math.max(cw, rolePx('caption') * 1.9);
  const prPad = Math.max(S * 2.5, 6 * uiDpr);
  const titleRoom = roleWidth(ctx, 'HOW TO PLAY', 'head');
  const pwMax = Math.max(S * 20, cc.x - S * 3 - (px + S * 6) - Math.min(titleRoom, pw * 0.4));
  const prW = Math.min(pwMax, roleWidth(ctx, prLabel, 'caption') + prPad * 2);
  const pr = { x: cc.x - S * 2 - prW, y: cc.y + cw / 2 - prH / 2, w: prW, h: prH };
  helpUI.practice = pr;
  ctx.save();
  pressIn(ctx, prLook, pr.x + pr.w / 2, pr.y + prH / 2);
  ctlTint(ctx, prLook, pr.x, pr.y, pr.w, prH, prH / 2);
  ctx.strokeStyle = prAsk ? TOKENS.warn : TOKENS.line;
  ctx.globalAlpha = prAsk ? 0.95 : prLook.hover ? 0.8 : 0.5;
  ctx.lineWidth = prAsk ? Math.max(1.5 * uiDpr, S * 0.4) : uiDpr;
  plate(ctx, pr.x, pr.y, pr.w, prH, prH / 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  coachLine(ctx, prLabel, pr.x + pr.w / 2, pr.y + prH / 2, 'caption', pr.w - prPad,
    prAsk ? TOKENS.warn : prLook.hover || prLook.pressed ? TOKENS.ink : '#9fb4ff');
  ctx.restore();

  ctx.textAlign = 'left';
  fitText(ctx, 'HOW TO PLAY', null, px + S * 6, py + S * 7, 'head', pr.x - S * 3 - (px + S * 6), TOKENS.ink);

  const x = ctlLook('close');
  ctx.save();
  pressIn(ctx, x, cc.x + cw / 2, cc.y + cw / 2);
  ctlTint(ctx, x, cc.x, cc.y, cw, cw, cw / 2);
  ctx.strokeStyle = x.hover ? TOKENS.ink : '#9fb4ff';
  ctx.lineWidth = Math.max(1, S * 0.6);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cc.x + S * 1.8, cc.y + S * 1.8);
  ctx.lineTo(cc.x + cw - S * 1.8, cc.y + cw - S * 1.8);
  ctx.moveTo(cc.x + cw - S * 1.8, cc.y + S * 1.8);
  ctx.lineTo(cc.x + S * 1.8, cc.y + cw - S * 1.8);
  ctx.stroke();
  ctx.restore();

  const top = py + S * 13;
  const rowH = (ph - S * 13 - S * 10) / HELP_ROWS.length;
  /* The rule's two lines sit apart by their own sizes, not by S: at a CSS
     floor the type outgrows the spacing the S layout was drawn for. */
  const lineGap = Math.max(S * 5.4, (rolePx('lead') + rolePx('caption')) * 0.6);
  HELP_ROWS.forEach((row, i) => {
    const cy = top + rowH * i + rowH / 2;
    if (i > 0) {
      ctx.strokeStyle = '#5878ff';
      ctx.globalAlpha = 0.18;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px + S * 5, top + rowH * i);
      ctx.lineTo(px + pw - S * 5, top + rowH * i);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    helpFigure(ctx, row.fig, px + S * 19, cy, S);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const textW = pw - S * 42;
    helpLine(ctx, (touchMode && row.at) || row.a, px + S * 37, cy - lineGap * 0.48,
      'lead', textW, TOKENS.ink);
    helpLine(ctx, (touchMode && row.bt) || row.b, px + S * 37, cy + lineGap * 0.52,
      'caption', textW, TOKENS.muted);
  });

  ctx.textAlign = 'center';
  helpLine(ctx, touchMode
      ? 'TAP FREEZE   ROSTER SELECTS   DRAG BACK TO UNDO'
      : 'SPACE FREEZE   1-4 SELECT   RIGHT-DRAG ERASE   M MUTE',
    px + pw / 2, py + ph - S * 5, 'micro', pw - S * 8, TOKENS.muted);

  ctx.restore();
}
/* END COMMAND LAYER */

/* -------------------------------- boot ---------------------------------- */

let mazeLayerWhite;

function boot() {
  buildSprites();
  setBoard(0);   // builds maze, wall distance field, and the wall layers
  try { game.high = parseInt(localStorage.getItem('ghostProtocolHigh') || '0', 10) || 0; } catch (e) {}
  loadCampChoice();
  loadTips();
  // ?tutorial in the link: the next title-screen press is the practice,
  // whatever this browser remembers -- the way to hand a friend the lesson
  // (the parameter itself: ?utm_campaign=tutorial is somebody else's word)
  try { forceDrill = TUTORIAL_PARAM.test(location.search); } catch (e) {}

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
