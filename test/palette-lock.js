// Enforces two things a 1981 board enforced for free:
//   1. every color in the source palette sits on the resistor ladder
//   2. nothing in the code draws with a color that isn't in the palette
// A smoothed blit or a stray rgba() shows up here as an off-palette value.
const fs = require('fs');
const path = require('path');

const raw = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8');
// The CRT pass models the glass in front of the board, so it is allowed to
// blend and blur. Strip it before judging the framebuffer drawing code.
const src = raw.replace(/\/\* BEGIN CRT PASS[\s\S]*?\/\* END CRT PASS \*\//g, '');
const LADDER = [0x00, 0x21, 0x47, 0x51, 0x97, 0xC8, 0xF0, 0xFF];

const palBlock = raw.match(/const PAL = \{([\s\S]*?)\n\};/)[1];
const palColors = new Map();
for (const m of palBlock.matchAll(/(\w+):\s*'(#[0-9A-Fa-f]{6})'/g)) {
  palColors.set(m[2].toUpperCase(), m[1]);
}

let fail = 0;
console.log('palette entries: ' + palColors.size);
for (const [hex, name] of palColors) {
  const ch = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const bad = ch.filter(v => !LADDER.includes(v));
  if (bad.length) {
    console.log('  FAIL ' + name + ' ' + hex + ' has off-ladder channels: '
      + bad.map(v => v.toString(16)).join(', '));
    fail++;
  }
}
if (!fail) console.log('  PASS every channel sits on the ladder');

// Any literal color used for drawing must come from PAL.
const literals = new Set();
for (const m of src.matchAll(/'(#[0-9A-Fa-f]{3,8})'/g)) literals.add(m[1].toUpperCase());
for (const m of src.matchAll(/'(rgba?\([^']*\))'/g)) literals.add(m[1]);
const stray = [...literals].filter(c => !palColors.has(c));
if (stray.length) {
  console.log('  FAIL off-palette literals in source: ' + stray.join(', '));
  fail++;
} else {
  console.log('  PASS no off-palette color literals in the drawing code');
}

// Resampling invents colors; it must be off wherever we blit.
const smoothing = [...src.matchAll(/imageSmoothingEnabled\s*=\s*(\w+)/g)].map(m => m[1]);
if (!smoothing.length || smoothing.some(v => v !== 'false')) {
  console.log('  FAIL image smoothing is enabled somewhere: ' + smoothing.join(', '));
  fail++;
} else {
  console.log('  PASS image smoothing is off on every context (' + smoothing.length + ' sites)');
}

// Scaled drawImage calls (9 args) resample; only the final screen blit may.
const scaled = [...src.matchAll(/drawImage\(([^;]*?)\);/g)]
  .map(m => m[1])
  .filter(a => a.split(',').length >= 9);
const allowed = scaled.filter(a => /native,/.test(a));
if (scaled.length !== allowed.length) {
  console.log('  FAIL a sprite is drawn at a scale other than 1:1:');
  scaled.filter(a => !/native,/.test(a)).forEach(a => console.log('     ' + a.trim()));
  fail++;
} else {
  console.log('  PASS sprites are only ever blitted 1:1');
}

console.log(fail === 0 ? '\nPALETTE LOCKED' : '\n' + fail + ' PALETTE FAILURES');
process.exit(fail === 0 ? 0 : 1);
