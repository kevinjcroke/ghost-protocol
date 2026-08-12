// Runs game.js in Node with just enough DOM to boot, so game logic can be
// tested without a browser. Rendering calls become no-ops.
const fs = require('fs');
const vm = require('vm');

function stubCtx() {
  const noop = () => {};
  return new Proxy({
    canvas: { width: 0, height: 0 },
    fillStyle: '', strokeStyle: '', filter: '', globalAlpha: 1,
    globalCompositeOperation: '', imageSmoothingEnabled: false,
    createRadialGradient: () => ({ addColorStop: noop }),
    measureText: () => ({ width: 0 }),
  }, {
    get(t, k) { return k in t ? t[k] : noop; },
    set(t, k, v) { t[k] = v; return true; },
  });
}
function stubCanvas() {
  const c = { width: 0, height: 0, style: {}, getContext: () => stubCtx(),
    toDataURL: () => 'data:image/png;base64,', addEventListener: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 224, height: 288 }) };
  return c;
}

const sandbox = {
  console,
  Math, JSON, Date, Set, Map, Array, Object, String, Number, Boolean,
  Int16Array, Float32Array, Error, isNaN, parseInt, parseFloat, Infinity, NaN,
  document: {
    createElement: (t) => (t === 'canvas' ? stubCanvas() : { style: {} }),
    getElementById: () => stubCanvas(),
    addEventListener: () => {},
  },
  window: { addEventListener: () => {}, innerWidth: 900, innerHeight: 1000 },
  localStorage: { getItem: () => '0', setItem: () => {} },
  requestAnimationFrame: () => 0,
  performance: { now: () => 0 },
};
sandbox.window.AudioContext = undefined;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

// Top-level const/let live in the script's own scope, not on the sandbox, so
// append an explicit export from inside that scope.
const src = fs.readFileSync(require('path').join(__dirname, '..', 'game.js'), 'utf8')
  + `\n;globalThis.__api = {
       game, Draw, tcx, tcy, COLS, MAZE_ROWS, TILE, DIRS, OPP,
       bfsRoute, neighborsOf, wrapCol, isOpen, tileOfPx,
       resumeFromCommand, stalledHunter, startDemo, openHelp, closeHelp, render, Sound,
       get dots() { return dots; },
       get dotTotal() { return dotTotal; },
     };`;
vm.runInContext(src, sandbox, { filename: 'game.js' });
module.exports = sandbox.__api;
