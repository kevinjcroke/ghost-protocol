# GHOST PROTOCOL

**An arcade maze game where the hunt runs backwards. You are the ghosts.**
The yellow one is an AI, and he is running for his life.

## ▶ [Play it in your browser](https://kevinjcroke.github.io/ghost-protocol/)

**https://kevinjcroke.github.io/ghost-protocol/** — works on desktop and on
phones, with a mouse or a single finger. The **?** chip in the top right
corner opens the illustrated manual.

**First time?** Your first press starts a one-minute practice instead of a
game: a few steps on the real board that end with your first catch. It's
skippable at any point with **SKIP ›** on the card. To run it again, open the
**?** manual and press **PRACTICE ▶**. To hand it to a friend, send this link,
which always starts with the practice:
**https://kevinjcroke.github.io/ghost-protocol/?tutorial**

---

## The idea

In every maze game ever made, you are the one being chased. Here you command
all four hunters, and the prey is a genuinely good escape AI. He counts your
threats, prefers corridors with the most exits, farms dots when he's safe,
makes hard runs at the energizers when cornered, abuses the side tunnels, and
punishes any ghost you left parked and stupid.

You can't steer a ghost directly. You **freeze time** and **draw** where it
walks. Then you let the clock run and watch your plan play out, or fall
apart.

## How to play

1. **Click anywhere** during play to freeze time.
2. **Drag from a ghost** to draw the route it will walk, tile by tile through
   the corridors.
3. **Click empty maze** (or the green ▶) to let time run again.

Catch him three times to clear the board. If he eats every dot first, you
lose the board. Losing three boards ends the game.

### The one rule

**A ghost with no orders is stupid.** It keeps going in its current direction,
straight through every intersection, until it hits a wall. Then it stops dead
and stays there until you give it a new route. A ghost that reaches the end of
its route does the same. There is no autopilot, no fallback AI, and no "return
to patrol" that you didn't draw.

Four ghosts, one mouse, one brain. The game is the coordination. Chase him
with one ghost at a time and you will lose: he is slightly faster than any
single ghost, and faster still when only one is after him.

## Controls

| Input | Effect |
| --- | --- |
| Click the attract screen | Start a game (your very first click starts the practice) |
| **Click anywhere during play** | Freeze time |
| **Click empty maze while frozen** | Resume. The click is the clock |
| **Grab a ghost during play** | Freezes *and* starts drawing its route, in one gesture |
| **Drag from a ghost** | Draw the route it will walk |
| Drag back along the line | Retract it, like an undo |
| Bring the tip back to the start tile and release | Close it into a **patrol loop** the ghost walks forever |
| **Drag a route onto the den door** | Send that ghost **home** (see *The den*) |
| **Drag off the screen edge** on a tunnel row | Send the route through the tunnel; keep dragging out there to carry on along the far side |
| Click a route's arrowhead | Pick the line back up and keep drawing |
| Right-drag over a route | Erase it from that point |
| Click a pile of ghosts repeatedly | Cycle through the ones stacked there |
| Roster buttons, **1–4** or **Tab** | Select a ghost; it floats to the top of any pile |
| **Space** or **P** | Freeze / resume from the keyboard |
| **Esc** | Resume, or close the manual |
| **? chip** or **H** | The pocket manual (freezes play while open) |
| **M** | Mute |

There is no "clear order" button on purpose: drawing a new route *is* the
clear, so no click can ever silently disarm a ghost. The whole game is
playable with the mouse alone.

The route follows your cursor one legal step at a time and never invents a
detour. Drag into a wall and the tip waits at the last tile it could reach.
Routes may cross themselves as often as you like.

### On a phone

One finger does everything in the table above: tap where it says click, drag
where it says drag. There are no multi-touch gestures. A few details differ
because a fingertip isn't a cursor:

- **A tap resumes when you lift your finger, not when you touch.** If your
  thumb lands and slides, the game stays frozen.
- **A quick tap counts as a tap** even if your thumb rolled a little.
- **Ghosts and arrowheads are bigger targets** under a finger. A near miss
  selects a ghost rather than resuming the game.
- **To draw through a side tunnel,** press into the edge of the screen on a
  tunnel row. The tip comes out the far side with its arrowhead; to keep
  going, lift and drag on from that arrowhead.
- There is no touch version of right-drag erase. Redrawing a route replaces
  it anyway.

## Reading the frozen screen

When time stops, the maze lifts off the old screen — solid walls, round dots,
pure black, nothing of the CRT over it — and a planning layer comes up over
it.

- **Squad cards** along the bottom show each ghost's state and one number
  that matters: `ROUTE 3.2s`, `LOOP 6.0s`, `STOPS IN 4 TILES`, `HOME IN 2.4s`,
  `BACK IN 3.1s`, and so on. Every figure is exactly what the simulation will
  do. A green dot means the ghost has orders.
- **The status pill** at the top counts how many ghosts have orders and shows
  what a catch would be worth right now. It turns amber and names the ghost
  when one needs orders.
- **Timing beads** mark every route at equal *travel time*, not equal
  distance. Where two ghosts' beads land on the same spot at the same time,
  both light up white. That's your instrument for timing a pincer: count
  beads, not tiles.
- **The run-out** is the faint line past an arrowhead: the coast a ghost will
  make after its route ends, and the wall it will stop at.
- **While you draw,** a small tag shows the route's time, and a chime sounds
  when it lines up a pincer with another ghost.
- The glow around the game takes the selected ghost's color, and turns amber
  when a ghost is overdue.

### The camp limit

A ghost that has stopped against a wall may stand there for as long as your
**camp limit** allows: 0s, 3s, 5s, 10s or OFF. Click the chip above the cards
to cycle it; the setting is remembered. Past the limit, the game freezes with
that ghost selected and won't resume until you give it somewhere to go. Set it
to OFF and nothing saves you from a forgotten ghost.

## The den

The ghost house in the middle of the maze plays by three rules.

- **Nobody leaves without a route.** RAZE, the red ghost, starts each life
  outside. The other three wait inside until you draw them out; drawing the
  route is the release. A ghost waiting in the den is safe and never counts
  against the camp limit.
- **The den is a recharge.** Draw a route onto the door and that ghost walks
  home. Inside, it is always its true color, never blue. Any ghost leaving the
  den comes out dangerous, even while he is still powered up. See the next
  section for why that matters.
- **Eaten ghosts wait as eyes.** A ghost he eats walks home as a pair of eyes
  and sits in the den *as eyes* for five seconds before its body returns. You
  can draw its route out while it waits; it leaves the moment it's ready.

Stuck and ready ghosts look different at a glance: a stuck ghost is just eyes,
and a ready ghost is its whole body looking up at the door.

## Energizers and the ambush

When he eats one of the four energizers, the roles flip for a few seconds.
Your ghosts turn blue, and he can eat them. Blue ghosts still follow your
routes exactly; they don't run away on their own. Getting them out of his way
is your problem, and blocking him off an energizer is a real tactic.

Your counterattack is the den. Send a blue ghost home. It goes in blue, and
when you draw it back out it comes out in its own color and can catch him,
while he still thinks he's the hunter. He will often chase a fleeing blue
ghost right up to the door, and that chase is your ambush.

The window shrinks as you climb: energizers last seven seconds on level 1 and
two seconds from level 10, so the ambush is strongest early.

The prize that appears under the den gives **overdrive**. The first ghost
routed over it can outrun him for eight seconds, the only time pursuit beats
flight. If he reaches it first, it's simply gone.

## Scoring, lives and levels

**The score measures speed.** Each catch banks the dots he never got, times
the level. Catch him fast and the board pays; let him graze first and it
doesn't. Pincers catch him sooner, and sooner is the score.

**He has three lives per board.** A catch spends one: everyone resets, and you
redraw your plans. But the dots he ate **stay eaten**, so each life is worth
less to you and he is closer to clearing the maze. The third catch clears the
board. You start with three boards to lose and earn one more at 10,000
points.

**Each level,** he gets faster, looks further ahead, and takes more risks.
Energizers get shorter. The maze changes too: three original boards rotate
with the levels, each with its own frame color and number of wrap tunnels.

**He doesn't read your routes.** He assumes the worst: every moving ghost
might be coming at him down the shortest corridor at full speed, whatever you
actually drew. That's deliberate. Freezing is free, so an AI that trusted your
routes could be fooled forever with decoys. You win by closing his exits, not
by bluffing.

## Design notes

### Two worlds on one screen

The maze obeys 1981 arcade hardware rules: 224×288 native resolution, a
fixed color palette whose every channel sits on a period resistor ladder, no
transparency, 1:1 sprites on an 8×8 tile grid, and integer nearest-neighbor
scaling under a light CRT pass (scanlines, phosphor bloom, vignette). That is
the board you play on, and it stays exactly that.

The planning layer deliberately breaks all of those rules. Routes, beads,
cards and the manual render after the CRT pass at full display resolution,
with smooth curves, glow, modern type and colors no 1981 color chip could
produce. The maze is a machine from 1981; the planning layer is you reaching
through the glass at it.

Freezing time lifts the whole board off the glass with it. Stopped, the maze
is redrawn up in the planning layer: solid wall blocks traced from the same
tiles, round pellets and steady energizers, on pure black with no scanlines,
bloom or vignette, and the ghosts and the target in hi-res on top. It arrives
on a raster split from the row you stopped time on, and the instant time runs
again the 1981 machine is back, pixel for pixel. The pellets are drawn back
over the routes, so a route never hides the food it crosses.

`test/palette-lock.js` enforces the boundary: anything outside the CRT pass and
the planning layer must use the fixed palette.

### About the assets

The [original brief](ghost-protocol-prompt.md) asked for ripped Namco arcade
assets (ROM sprite dumps, the real palette, maze and sound samples) so the
result would be indistinguishable from *Pac-Man*. **That part was deliberately
not done.** Those assets are copyrighted, and this project doesn't use them.

Everything here is original work in the 1981 arcade idiom: the three mazes,
the hand-authored pixel sprites and font, the palette, and all audio, which is
synthesized live with the Web Audio API. The siren, chomp, energizer wobble,
round-start jingle and the rest were composed for this game. The audio plays
the role reversal straight: the death spiral sounds when *you* lose a ghost,
and the rising siren is the clock on your board.

## Running it locally

Clone the repo and open `index.html`. That's it: vanilla JavaScript, one
Canvas, no build step, no dependencies and no assets to download. `game.js`
holds the whole game.

## Tests

No framework, no install. `test/harness.js` boots `game.js` in Node behind a
stub DOM, so the game can be exercised headlessly.

```bash
node test/test-game.js && node test/tutorial.js && node test/validate-maze.js && node test/no-infinite-lanes.js && node test/palette-lock.js
```

- **test-game.js** — 448 checks covering the drawing rules, the wall-stop
  rule, the den, energizers and the ambush, capture and scoring, lives and
  levels, touch input through real events, the frozen screen's timing and
  numbers, and a 30,000-tick soak. Takes a minute or two.
- **tutorial.js** — 399 checks on the practice and everything around it,
  played through real mouse and touch events: first-visit detection, the
  full walk to the catch, the steps that refuse to go on until you've drawn,
  every hint for a stuck player, SKIP at every step, and the tips, the
  manual's PRACTICE button and the game-over offer that come after. It pins
  the final scene's lesson on the real AI to the tick: one ghost never
  catches him, two from both sides always do, and the card only offers to
  spring the trap when it will spring. It also proves the practice never
  draws a route for you, that none of its rules leak into a real game, and
  that every line of its text fits a 360-pixel phone screen.
- **validate-maze.js** — proves every board is mirror-symmetric, fully
  connected, and free of dead ends and 2×2 rooms.
- **no-infinite-lanes.js** — walks every straight run on all three boards
  (4,592 of them) and proves each one ends at a wall. Without it, a corridor
  that wraps all the way around could quietly cancel the wall-stop rule. The
  first version of the maze had exactly that bug.
- **palette-lock.js** — fails on any color off the palette, any image
  smoothing, any sprite drawn at a scale other than 1:1, or any transparency,
  blur, shadow or gradient outside the CRT pass and the planning layer.
- **speed-audit.js** and **difficulty-curve.js** — measure what the tuning
  tables actually produce, such as each side's speed and how cleanly a
  coordinated player catches him compared with a one-ghost-at-a-time player
  across levels 1–20. `difficulty-curve.js` takes about ten minutes.

## Credits

Mechanics reference: **[bward2/pacman-js](https://github.com/bward2/pacman-js)**
(MIT). Its tile-locked movement model and its speed and level-progression
tables were studied while building this. No code, art or audio was copied. See
`LICENSE-pacman-js` for its license text.
