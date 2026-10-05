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

/* A path the way a canvas keeps one: a list of the commands it was given,
   so a test can read back what was traced. Only the commands game.js uses
   exist -- anything else throws, as it would on a browser without it,
   rather than quietly drawing nothing. */
class Path2D {
  constructor() { this.ops = []; }
  moveTo(x, y) { this.ops.push(['moveTo', x, y]); }
  lineTo(x, y) { this.ops.push(['lineTo', x, y]); }
  arcTo(x1, y1, x2, y2, r) { this.ops.push(['arcTo', x1, y1, x2, y2, r]); }
  arc(x, y, r, a0, a1) { this.ops.push(['arc', x, y, r, a0, a1]); }
  rect(x, y, w, h) { this.ops.push(['rect', x, y, w, h]); }
  closePath() { this.ops.push(['closePath']); }
}

// one screen for the whole run, so tests and game.js address the same canvas
const screen = stubCanvas();

const sandbox = {
  console,
  Math, JSON, Date, Set, Map, Array, Object, String, Number, Boolean,
  Int16Array, Float32Array, Error, isNaN, parseInt, parseFloat, Infinity, NaN,
  Path2D,
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
       DEN_SEATS, DOOR_ROW, DOOR_C0, DOOR_C1, DEN_EXIT_ROW, DEN_EXIT_X,
       bfsRoute, neighborsOf, wrapCol, isOpen, tileOfPx, levelParams,
       BOARDS, setBoard, boardForLevel,
       get TUNNEL_ROWS() { return TUNNEL_ROWS; },
       resumeFromCommand, stalledHunter, startDemo, openHelp, closeHelp, render, Sound,
       rosterUI, helpUI, input, HELP_ROWS, HELP_SHORT,
       SPRITES, drawTrail, drawHunterHi, routeTicks, beadWalk, homeMark,
       frame, pauseToCommand, fx, fitText, springIn, easeOut,
       bankBand, splitBank, SPLIT_TICKS, syncShell, shell,
       bountyNow, dotsLeftNow, driftTiles, runOutFrom, orderTicks, cardState, pillState,
       BOOST_TICKS, CAMP_CHOICES, TOKENS, pillAnim, HELP_CHIP,
       freezeWave, WAVE_TICKS, SHADOW, SHADOW_DROP, SHADOW_LIFT,
       frozenBoardOn, frozenWallLoops, frozenWallPath, frozenBake, frozenCache,
       drawFrozenBoard, drawFrozenDots, drawFrozenMarks, FB_INSET,
       routeOrder, hotBeadsNow, computeHotBeads, hunterDrawOrder, orderPathPoints, routeArrow,
       NATIVE_W, HUD_TOP,
       pointerTarget, syncCursor, ctlLook, PRESS_SCALE, TAP_SLOP_TOUCH,
       dragTag, drawDragTag, tagAnim, TAG_LIFT, pincerFor, handTicks,
       releaseRing, shellAlpha, transmitT, TRANSMIT_TICKS, pincerEar, PINCER_GAP,
       fxIn, drawStatusPill, pillBox, plateShadows, plateShadow, drawPlateShadow,
       get TYPE() { return TYPE; },
       get uiDpr() { return uiDpr; },
       get screenCtx() { return screenCtx; },
       get nativeCtx() { return nativeCtx; },
       get dotScratch() { return dotScratch; },
       get uiFrame() { return uiFrame; },
       get uiClock() { return uiClock; },
       get dots() { return dots; },
       get dotTotal() { return dotTotal; },
       get touchMode() { return touchMode; },
       setTouchMode(v) { touchMode = v; },
       get scale() { return scale; },
       startDrill, endDrill, drillCheck, drillTick, drillOnCommit, loadTrap, tutResumeLocked,
       onboarded, drillCopy, coachUI, coachFx, COACH_SHORT, hintWindowOpen, enterAttract, TRAP,
       DRILL_GUARD, DRILL_FAIL_HOLD, DRILL_WATCH, DRILL_WATCH_MAX, DRILL_OUT, TAP_SLOP, TAP_MS, TAP_TRAVEL,
       get forceDrill() { return forceDrill; },
       setForceDrill(v) { forceDrill = v; },
       resetOnboardMem() { onboardMem = false; },
       coachScene, coachReady, playLook, coachIdle, coachStall, coachCardRect, gradSheetRect,
       drawCoachLayer, drawCoachMarks, drillDenOrdered, layout, PAL, REFUSAL_SHOWN,
       COACH_RIPPLE, COACH_ANYWHERE, COACH_SHOW, COACH_DEN_LIVE, COACH_SKIP, COACH_STALL, COACH_FADE,
       DOCK_DWELL, DOCK_HOME, coachSet, coachDock, TYPE_ROLES, coachHero, heroMid, HERO_MOVE, FX_EXIT,
       HERO_OLD, HERO_NEW, DEN, DEN_EXIT_X, DEN_EXIT_ROW, glassAt, pointerTarget,
       setNativeCtx(v) { nativeCtx = v; },
       TIP, TIP_SHOW, TIP_G1_PLAY, tipUI, tipTick, g1Wanted, tipCopy, tipRect, loadTips,
       drawTipLayer, campPulse, gameOverUI, gameOverFx, gameOverChipUp, helpFx, HELP_CONFIRM,
       practiceLabel, drawHelpLayer, tapPad, TUTORIAL_PARAM, trapSides, drillLaneRouted,
       get tipBits() { return tipBits; },
       setTipBits(v) { tipBits = v; },
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
/* The page's storage, as the game sees it. The stub answers '0' for every
   key -- a returning player -- so a test that needs a first visit, or
   wants to see what was written, swaps getItem/setItem on this object and
   puts them back afterwards. */
sandbox.__api.storage = sandbox.localStorage;

/* The den lets nobody out without a route, but the scripted players in the
   sim scripts were measured against a den that emptied itself: each ghost
   popped out, drifted left or right along the door row and wall-stopped.
   This draws exactly that for any den ghost with no order -- one step off
   the door, alternating sides, then the coast -- so their numbers stay
   comparable with the ones taken before. */
let denFlip = false;
sandbox.__api.releaseDen = () => {
  const g = sandbox.__api.game;
  for (const h of g.hunters) {
    if ((h.state !== 'idle' && h.state !== 'respawn') || h.path) continue;
    denFlip = !denFlip;
    h.setOrder([{ c: 13, r: 11 }, { c: denFlip ? 12 : 14, r: 11 }], false);
  }
};

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
