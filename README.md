# GHOST PROTOCOL

An arcade maze game where the hunt runs backwards. **You are the ghosts.**
The yellow one is the AI, and he is running for his life.

Open `index.html`. That's it — vanilla JavaScript, one Canvas, no build step,
no dependencies, no assets to download.

## The idea

In every maze game ever made you are the thing being chased. Here you command
all four hunters, and the prey is a genuinely good escape AI: he counts your
threats, prefers corridors with the most exits, farms dots when he's safe,
makes hard runs at the energizers when cornered, abuses the side tunnels, and
punishes any hunter you left parked and stupid.

You cannot steer a ghost directly. You freeze time and **draw** where it walks.

## Controls

| Input | Effect |
| --- | --- |
| Click the attract screen | Start |
| **Click anywhere during play** | Freeze time |
| **Grab a ghost mid-play** | Freezes *and* starts its trail in one gesture |
| **SPACE** | Freeze / unfreeze from the keyboard |
| **Drag from a ghost** | Hand-draw the path it will walk |
| Drag back along the line | Retracts it, like an undo |
| Return the tip to the start tile, release | Closes it into a **patrol loop** the ghost walks forever |
| Click a route's arrowhead | Picks the line back up and continues drawing it |
| Right-drag over a path | Erases from that point |
| **1–4** / **Tab** or the roster buttons | Select a ghost (it floats to the top of any pile) |
| Click a pile of ghosts repeatedly | Cycles through the ones stacked there |
| **M** | Mute |

There is deliberately no "clear order" gesture: drawing a new order *is* the
clear, so no click can ever silently disarm a ghost.

**The camp limit is yours to set.** A ghost that runs off the end of its path
coasts on its last heading until a wall stops it dead — and then it may stand
there, legally camping, for as long as your **CAMP LIMIT** allows (the chip
above the roster: 0s / 3s / 5s / 10s / OFF, click to cycle, remembered
between sessions). Past the limit the ghost goes overdue: the game freezes
with it pre-selected and will not resume until it has somewhere to be. Set
the limit OFF and the original cruelty rule returns undiluted — no forced
pauses, ghosts camp forever, and nobody saves you from a forgotten statue.

The roster reads the whole squad at a glance: `ORDERED`, `PATROL`,
`DRIFTING` (coasting toward its stall), `CAMP 7` (parked, counting down to
intervention), `CAMPED` (parked with the limit off), `ORDERS!` (overdue,
blocking the resume), `OVERDRIVE`, `DOWN`. The play button burns amber while
anyone is overdue and goes green when the squad is ready.

Ghosts pile onto the same tile constantly — three of them leave the den
together — and a click can only land on one. So each keeps a permanent number
and a button. The roster along the bottom of the frozen screen shows who is
who and which of them currently has somewhere to be: click a name to select
that ghost (it floats to the front of whatever pile it's standing in), press
its number, or click the green **▶** to unfreeze — the whole game is playable
without touching the keyboard.

The prize that appears under the den is worth exactly one thing: **overdrive**.
A hunter routed over it first flashes white-hot and can flat outrun him for
eight seconds — the only window where pursuit beats flight. No points either
way; if he reaches it first, the weapon is simply gone.

The drawn line is not a route the computer picked for you. It follows your
cursor tile by tile through the corridors, orthogonally, refusing walls. Drag
into a wall and the tip waits at the last legal tile until you move somewhere
it can reach. It may cross itself as often as you like.

This matters more than it sounds. An earlier version quietly pathfound to
wherever your cursor was, and dragging straight down a walled column turned a
fourteen-tile order into a forty-tile horseshoe — which, at this resolution,
looks much like the line you meant to draw until you unfreeze and watch a
ghost set off the wrong way. The tip now only ever takes one legal step at a
time toward your cursor, and stalls rather than inventing a detour.

### Timing beads

Every drawn path is marked at equal *travel time*, not equal distance. Where
two hunters' beads coincide in both time and space, both light up white —
that's the instrument for timing a four-way pincer. Count beads, not tiles.

### The run-out

An open path shows a sparse continuation past its arrowhead: the coast a
hunter makes on its last heading after the order ends, and the tile a wall
will actually stop it on. The rule isn't softened, it's just no longer a
surprise.

## The rule that makes it a game

**A ghost with no order is stupid.** It continues in its current direction
forever, through every intersection, until it hits a wall — and then it stops
dead and stays stopped until you give it a new order. A ghost that runs off the
end of a drawn path does the same thing. There is no autopilot, no fallback AI,
no "return to patrol" you didn't draw.

Four ghosts, one mouse, one brain. The game is the coordination.

Command one ghost at a time and you will lose. The score knows: there is one
number, and it is a speed meter — **the dots he never got, times the level**,
banked at the moment of capture. Catch him fast and the board pays; let him
graze first and it doesn't. A multi-directional pincer earns its banner and
fanfare, and its real reward is built in: pincers catch him sooner, and
sooner *is* the score. The rising siren and the falling payout are the same
clock.

Your ghosts are *not* slower than him in any meaningful way — they run at
near parity. Their handicap is that they cannot improvise. He re-decides at
every junction and can read the orders you've already committed; your four
walk exactly what you drew and nothing else. That asymmetry is the game.

### Energizers invert

When he eats an energizer the roles flip for a few seconds: your hunters turn
blue and he can eat them, sending them back to the den on a respawn timer. The
four energizers are ticking bombs on your board. Frightened hunters obey the
exact same order and wall rules — being blue does not make them run away by
themselves. That's your problem to solve, and body-blocking him off an
energizer is a real tactic.

## Progression

Win a board by catching him. Lose one if he clears every dot. Each level he
gets faster, his lookahead deepens, his willingness to gamble on a feint goes
up, and he starts reading further into the orders you've already committed —
by level 4 he is predicting your drawn paths, not just reacting to positions.
Frightened time shortens; hunters take longer to come back.

## About the assets

The original brief asked for ripped Namco arcade assets — ROM sprite dumps, the
real palette, the original maze, the actual sound samples — so the result would
be indistinguishable from *Pac-Man*. **That part was deliberately not done.**
Those assets are copyrighted, and shipping them is not something I'll do even
for a personal project.

Everything here is original work in the 1981 arcade idiom, built to the same
hardware constraints the real cabinets had:

- **Maze**: an original 28x31 layout — mirror-symmetric, single-width corridors,
  two wrap tunnels, four energizers, a central den, machine-verified for full
  connectivity and no dead ends.
- **Sprites**: hand-authored pixel art on the native grid, 16x16 on an 8x8 tile
  background, drawn as character-ROM style bitmaps in code.
- **Palette**: a small fixed color table. Frozen time uses a second palette
  *bank* rather than alpha blending, because the hardware being imitated could
  not blend a framebuffer.
- **Audio**: synthesized from scratch with the Web Audio API — square and
  triangle waves through a low-pass filter standing in for a cabinet speaker.
  The four-stage siren, the chomp, the energizer wobble, the dissolve spiral,
  and the round-start jingle are all composed for this game.
- **Presentation**: 224x288 native, integer nearest-neighbor scaling only, with
  a light CRT pass — scanlines, phosphor bloom, vignette.

There is exactly one deliberate exception, and it's the point of the game.
**The orders you draw are not a 1981 artifact.** The trails, beads, arrowheads
and roster render *after* the CRT pass, at full display resolution, with
smooth curves, additive glow and colors no color PROM could produce. The board
is a machine from 1981; the command layer is you reaching through the glass at
it. The pellets and sprites are then punched back over the top, so an order
never hides the food it's drawn across.

`test/palette-lock.js` enforces the boundary: everything outside the CRT pass
and the command layer must come from the fixed table.

The role reversal is wired through the audio too: the death spiral now plays
when *we* lose a hunter, and the siren's rising pitch is a threat clock
counting down our board.

## Tests

No framework, no install. `test/harness.js` boots `game.js` in Node behind a
stub DOM, so the whole game can be exercised headlessly in about a second.

```bash
node test/test-game.js && node test/validate-maze.js && node test/no-infinite-lanes.js && node test/palette-lock.js
```

- **test-game.js** — 34 checks: path retraction, loop closure, self-crossing,
  the refusal to reroute, orders queued from the den, the wall-stop rule, the
  energizer role reversal, eyes and respawn, capture and pincer scoring, board
  loss, level flow, and a 30,000-tick soak.
- **validate-maze.js** — proves the board is mirror-symmetric, fully
  connected, and free of dead ends and 2×2 rooms.
- **no-infinite-lanes.js** — walks all 1,328 straight runs on the board and
  proves every one ends at a wall. Without this the wall-stop rule can be
  silently cancelled by a corridor that wraps the full width, which is exactly
  what the first version of the maze did.
- **palette-lock.js** — fails on any color off the ladder, any enabled image
  smoothing, or any sprite blitted at a scale other than 1:1. Resampling
  invents colors that were never in the palette.
- **speed-audit.js** / **difficulty-curve.js** — measure what the tuning
  tables actually produce: tiles covered per second by each side, and win
  rates for a coordinating player versus a one-ghost-at-a-time player across
  levels 1–20.

## Credits

Mechanics reference: **[bward2/pacman-js](https://github.com/bward2/pacman-js)**
(MIT). Its tile-locked movement model — the snapped/unsnapped split, crossroad
snapping, adjacency-based move selection — and its speed-ratio and level
progression tables were studied while building this. No code, art, or audio was
copied; the rendering layer here is Canvas rather than DOM/SVG, and collision
runs inside the fixed 60 Hz tick rather than on a separate interval. See
`LICENSE-pacman-js` for its license text.
