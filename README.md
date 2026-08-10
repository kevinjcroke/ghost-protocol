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
| **SPACE** | Freeze / unfreeze time |
| **Grab a ghost with the mouse** | Also freezes time — this is the intended way in |
| **Drag from a ghost** | Hand-draw the path it will walk |
| Drag back along the line | Retracts it, like an undo |
| Return the tip to the start tile, release | Closes it into a **patrol loop** the ghost walks forever |
| Click a ghost, release without dragging | Clears its order |
| Right-drag over a path | Erases from that point |
| **M** | Mute |

The drawn line is not a route the computer picked for you. It follows your
cursor tile by tile through the corridors, orthogonally, refusing walls. Drag
into a wall and the tip waits at the last legal tile until you move somewhere
it can reach. It may cross itself as often as you like.

## The rule that makes it a game

**A ghost with no order is stupid.** It continues in its current direction
forever, through every intersection, until it hits a wall — and then it stops
dead and stays stopped until you give it a new order. A ghost that runs off the
end of a drawn path does the same thing. There is no autopilot, no fallback AI,
no "return to patrol" you didn't draw.

Four ghosts, one mouse, one brain. The game is the coordination.

Command one ghost at a time and you will lose. The scoring knows the
difference: you're paid for proximity pressure and for closing multiple bodies
onto one point from multiple directions, not just for the kill.

### Timing beads

Every drawn path is dotted with tick marks at equal *travel time*. Beads that
light up white are moments where two ghosts' paths coincide in both time and
space — that's the instrument for timing a four-way pincer. Count the beads,
not the distance.

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

The role reversal is wired through the audio too: the death spiral now plays
when *we* lose a hunter, and the siren's rising pitch is a threat clock
counting down our board.

## Credits

Mechanics reference: **[bward2/pacman-js](https://github.com/bward2/pacman-js)**
(MIT). Its tile-locked movement model — the snapped/unsnapped split, crossroad
snapping, adjacency-based move selection — and its speed-ratio and level
progression tables were studied while building this. No code, art, or audio was
copied; the rendering layer here is Canvas rather than DOM/SVG, and collision
runs inside the fixed 60 Hz tick rather than on a separate interval. See
`LICENSE-pacman-js` for its license text.
