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
/* Listeners are recorded rather than dropped so input can be tested the way
   a player produces it -- real events through the real handlers -- instead
   of by reaching past the binding and calling internals directly. */
function stubCanvas() {
  const c = { width: 0, height: 0, style: {}, getContext: () => stubCtx(),
    toDataURL: () => 'data:image/png;base64,',
    listeners: {},
    addEventListener: (type, fn) => { (c.listeners[type] || (c.listeners[type] = [])).push(fn); },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 224, height: 288 }) };
  return c;
}

// one screen for the whole run, so tests and game.js address the same canvas
const screen = stubCanvas();

const sandbox = {
  console,
  Math, JSON, Date, Set, Map, Array, Object, String, Number, Boolean,
  Int16Array, Float32Array, Error, isNaN, parseInt, parseFloat, Infinity, NaN,
  document: {
    createElement: (t) => (t === 'canvas' ? stubCanvas() : { style: {} }),
    getElementById: () => screen,
    addEventListener: () => {},
  },
  window: {
    listeners: {},
    addEventListener(type, fn) { (this.listeners[type] || (this.listeners[type] = [])).push(fn); },
    innerWidth: 900, innerHeight: 1000,
  },
  navigator: { maxTouchPoints: 0 },
  setTimeout: (fn) => { fn(); return 0; },
  localStorage: { getItem: () => '0', setItem: () => {} },
  requestAnimationFrame: () => 0,
  performance: { now: () => 0 },
};
sandbox.window.AudioContext = undefined;
/* prefers-reduced-motion, as a browser answers it: one MediaQueryList whose
   .matches is live. The game keeps the list, not the answer, so a test can
   flip it mid-run and the next frame sees the change. */
const reducedMotionMQ = { matches: false };
sandbox.window.matchMedia = (q) =>
  (/prefers-reduced-motion/.test(q) ? reducedMotionMQ : { matches: false });
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

// Top-level const/let live in the script's own scope, not on the sandbox, so
// append an explicit export from inside that scope.
const src = fs.readFileSync(require('path').join(__dirname, '..', 'game.js'), 'utf8')
  + `\n;globalThis.__api = {
       game, Draw, tcx, tcy, COLS, MAZE_ROWS, TILE, DIRS, OPP,
       bfsRoute, neighborsOf, wrapCol, isOpen, tileOfPx,
       BOARDS, setBoard, boardForLevel,
       get TUNNEL_ROWS() { return TUNNEL_ROWS; },
       resumeFromCommand, stalledHunter, startDemo, openHelp, closeHelp, render, Sound,
       rosterUI, helpUI, input, HELP_ROWS,
       frame, pauseToCommand, fx, fitText, springIn, easeOut,
       bankBand, splitBank, SPLIT_TICKS, syncShell, shell,
       bountyNow, dotsLeftNow, driftTiles, runOutFrom, orderTicks, cardState, pillState,
       BOOST_TICKS, CAMP_CHOICES, TOKENS, pillAnim, HELP_CHIP,
       surveyWave, WAVE_TICKS, WAVE_FLARE, SHADOW, SHADOW_DROP, SHADOW_LIFT,
       routeOrder, hotBeadsNow, computeHotBeads, hunterDrawOrder,
       pointerTarget, syncCursor, ctlLook, PRESS_SCALE, TAP_SLOP_TOUCH,
       dragTag, drawDragTag, tagAnim, TAG_LIFT, pincerFor, handTicks,
       releaseRing, shellAlpha, transmitT, TRANSMIT_TICKS, pincerEar, PINCER_GAP,
       fxIn, drawStatusPill, pillBox, plateShadows, plateShadow, drawPlateShadow,
       get TYPE() { return TYPE; },
       get uiDpr() { return uiDpr; },
       get screenCtx() { return screenCtx; },
       get nativeCtx() { return nativeCtx; },
       get uiFrame() { return uiFrame; },
       get uiClock() { return uiClock; },
       get dots() { return dots; },
       get dotTotal() { return dotTotal; },
       get touchMode() { return touchMode; },
       setTouchMode(v) { touchMode = v; },
       get scale() { return scale; },
     };`;
vm.runInContext(src, sandbox, { filename: 'game.js' });

/* Send an event the way a browser would: to everything bound for that type,
   on that target. `fire` returns nothing -- tests read the game state after,
   which is the only thing a player can observe either. */
function fire(target, type, ev) {
  const fns = (target.listeners && target.listeners[type]) || [];
  for (const fn of fns) fn(ev);
}
sandbox.__api.fire = fire;
sandbox.__api.screen = screen;
sandbox.__api.win = sandbox.window;
sandbox.__api.doc = sandbox.document;
sandbox.__api.reducedMotionMQ = reducedMotionMQ;

/* Touches, assembled the way a TouchEvent carries them: `touches` is every
   finger still on the glass, `changedTouches` only the ones this event is
   about. Getting that split wrong is exactly the bug these tests exist to
   catch, so the helper does not paper over it. */
function touch(id, x, y) {
  return { identifier: id, clientX: x, clientY: y };
}
sandbox.__api.touch = touch;
sandbox.__api.touchEvent = (type, touches, changed) => ({
  type, touches, changedTouches: changed || touches,
  cancelable: true, defaultPrevented: false,
  preventDefault() { this.defaultPrevented = true; },
});

module.exports = sandbox.__api;
