> **Note:** This is the original brief the game was built from, kept as a
> record. Its asset requirements were deliberately **not** followed: no Namco
> sprites, palette, maze, audio or font were ripped or used, and no audio was
> taken from the reference repo. Every asset in the game is original work in
> the 1981 arcade idiom. See "About the assets" in [README.md](README.md).

/goal

I want you to build **GHOST PROTOCOL** — a 2D arcade game that is visually indistinguishable from the 1980 Namco *Pac-Man* arcade cabinet, but where **you play as the ghosts**.

Someone glancing at the screen while the little guys are moving should think they are watching Pac-Man. Not "inspired by." Not "retro-styled." Indistinguishable — same resolution, same palette, same sprite cadence, same font, same CRT glow, same audio character, same 60 Hz feel. Then they should watch for ten more seconds and realize the hunt is running backwards.

Build it in **vanilla JavaScript on an HTML5 Canvas**, ideally collapsing to a small number of files (or one) with no build step. It's a personal project — favor "runs when I open it" over architecture.

Use **authentic assets**. Rip the real arcade sprite sheets, the real palette, the real maze layout, the real sound effects — pull them from ROM dumps, sprite archives, emulator captures, spriters-resource, wherever they live. Do not "recreate in the style of." Use the actual pixels. Fidelity is the entire point and there is no reason to handicap it.

---

## START HERE — don't build the Pac-Man half from scratch

**Reference implementation: https://github.com/bward2/pacman-js** (MIT licensed). Clone it, `npm i`, `npm run serve`, and *play it* before writing a line of code. It is a complete, well-tested, faithful Pac-Man clone — 100% unit test coverage, Airbnb lint — and it has already solved most of the boring half of this project.

**Harvest from it, do not fork it wholesale.** Take:

- The maze definition — a 2D character array (`X` walls, `o` pellets, `O` energizers, spaces, spawn markers) that's directly reusable.
- The tile-locked movement system — its `handleSnappedMovement` / `handleUnsnappedMovement` split, its crossroad snapping, its `determinePossibleMoves` adjacency logic. This is exactly the movement model we want and it's already debugged.
- The ghost AI in `app/scripts/characters/ghost.js` — Blinky/Pinky/Inky/Clyde targeting, distance-based move selection, scatter/chase mode switching, `becomeScared`/`endScared`. **We are inverting this**: study it, then write Pac-Man's escape AI as its mirror image. The four target-selection heuristics are a gift — read them as "here is exactly what a competent hunter does," and make Pac-Man's evader specifically counter them.
- The speed tables (`slowSpeed`/`mediumSpeed`/`fastSpeed`/`scaredSpeed`/`eyeSpeed`), level progression, fruit tables, and scoring.
- The audio files in `app/style/audio/` — game_start, siren_1/2/3, power_up, eyes, eat_ghost, death, fruit, dot_1/2. Just take them.

**Rebuild the rendering layer.** The reference renders with DOM elements and SVG sprite sheets. That's a clean approach but it structurally cannot give us what we want: SVG is vector and smooth, and we need hard pixel-grid arcade sprites with a CRT pass over them. It also makes the drawn-path overlay (marching ants, timing beads, four simultaneous trails) painful. So port to a single Canvas 2D context with real pixel-art sprite sheets and nearest-neighbor integer scaling.

Also worth fixing on the way past: the reference runs collision detection on a 500 ms `setInterval`, decoupled from its 120 FPS engine loop. Move collision into the fixed-timestep tick. Our game is about frame-precise convergence of four bodies on one point — a half-second collision granularity would wreck it.

Keep the MIT license file and credit the repo in the README. That's the whole obligation and it costs nothing.

---

## THE TWIST — read this twice, the whole game lives here

You control all four ghosts. Pac-Man is the AI, and he is running for his life.

**The pause-and-command loop.** At any moment, unlimited times, the player hits SPACE (or right-click) and time freezes completely. The screen dims slightly, a subtle command-mode grid overlays the maze, and the player draws orders with the mouse. Draw for all four ghosts before unpausing; on unpause everything executes simultaneously.

### The drawn path — this is the single most important interaction in the game, get it perfect

**You click a ghost and drag.** A line emanates from the ghost and follows your cursor through the maze, with an arrowhead at the leading tip pointing in the current heading. Release to commit. The ghost then walks that exact path.

The line is not a straight line to your cursor and it is not a computed shortest route. It is a **trail you are drawing by hand**, tile by tile, through the corridors. As you move the mouse up, down, left, and right, the tip extends to follow you — snapping to the maze grid, only ever running orthogonally along legal corridors, refusing to cross walls. Drag your cursor into a wall and the tip simply stops and waits at the last legal tile until you move somewhere it can reach. It should feel like drawing a snake through a maze with your finger: fluid, immediate, physical, zero lag between the mouse and the tip.

- **The line may cross itself freely.** Overlaps are legal and expected. Draw a figure-eight, draw a spiral, draw the same corridor four times. Never reject or auto-simplify a self-intersecting path.
- **Backtracking retracts.** Dragging the cursor back down the segment you *just* drew pulls the tip back in, eating the path like an undo — that's how you fix a wrong turn without restarting. But this only applies to immediate reversal along the live tip. If you loop the long way around and re-enter a corridor you drew earlier, that's a crossing, not a retraction, and the path just overlaps.
- **Close the loop and it becomes a patrol.** If you bring the tip back onto the path's own starting tile and release, the path closes into a circuit and the ghost walks it forever. This is how the player builds zone defense and standing traps, and it's the antidote to leaving ghosts parked and stupid. An open path just ends.
- **Timing beads.** Render evenly spaced tick marks along each drawn path — one every N game ticks of travel — so the player can literally count out where each ghost will be at the same moment and time a four-way convergence. Coordination is the whole game; give the player the instrument to do it precisely. Highlight the beads that align across multiple ghosts' paths.
- **Four ghosts, four trails.** Each ghost's committed path draws in that ghost's own color, dotted, with marching-ants animation flowing toward its head so you can read direction at a glance. All four are visible simultaneously during pause and faintly during play, fading behind the ghost as it consumes them.
- Clicking a ghost and releasing without dragging clears its order. Right-drag or a modifier erases from an existing path.
- The arrow, the trail, the beads, and the command grid all render in the same 8×8 pixel-grid, hard-edged, palette-limited style as the rest of the game. No anti-aliasing, no gradients, no modern UI. It should look like an overlay the 1980 hardware could actually have drawn.

**The cruelty that makes it a game.** A ghost with no order is *stupid*. It continues in its current direction, forever, through every intersection, until it hits a wall — and then it **stops dead and stays stopped** until the player gives it a new order. A ghost that runs off the end of a drawn path resumes this rule: it keeps going in its last heading until a wall halts it. There is no autopilot, no fallback AI, no "return to patrol" the player didn't draw. Every ghost that is moving intelligently is moving because the player drew it that way. Four ghosts, one mouse, one brain — the game is the coordination.

**The strategy the design must reward** is the swarm: reading Pac-Man's escape options, pinching corridors, sealing the tunnel, and closing four bodies onto one yellow circle from four directions. A player who commands one ghost at a time should reliably lose. A player who thinks in pincers should feel like a genius. Tune toward that.

**Power pellets invert.** When Pac-Man eats an energizer the roles flip for a few seconds: your ghosts turn frightened-blue, and if he touches one it's eaten and sent back to the house on a slow respawn timer. So the four energizers are ticking bombs on your board, and part of the strategy is body-blocking Pac-Man away from them — or accepting a sacrifice to force him into a corner. Frightened ghosts still obey the exact same order/wall rules; being blue does not make them run away by themselves. That is the player's problem to solve.

**Pac-Man's AI must be genuinely good.** He is not a wander-bot. He evaluates escape routes by counting how many of them each ghost threatens, prefers corridors with the most exits, values dots and fruit when safe, makes hard runs at energizers when cornered, abuses the side tunnel, and exploits any ghost the player has left parked and stupid. He should visibly *bait* — feint one way at a junction and cut back. Give him a difficulty-scaled lookahead depth so late levels feel like he's reading your mind.

**Progression.** Level 1 is slow enough to teach the pause loop. Every level Pac-Man gets faster, his lookahead deepens, frightened time shortens, and his willingness to gamble goes up. Later levels add pressure variations — a second Pac-Man, faster energizer respawns, tunnels that only he can use at speed. Win a level by catching him; lose it if he clears the board of dots. Score for proximity pressure and multi-ghost pincers, not just the kill, so good play reads as good play.

---

## VISUAL FIDELITY SPEC — this is a replication job, not a design job

Treat every number below as a *target to verify*, not a fact to trust. Pull real arcade reference (screenshots, capture video, hardware documentation, emulator frame dumps) and correct the spec where I'm wrong, then hit it exactly.

- Native internal resolution 224×288, 8×8 tile grid, 28×36 tiles, integer-scaled to the window with nearest-neighbor. Never non-integer scale. Never smooth.
- Sprites are 16×16 drawn on a 8×8 tile background layer, exactly as the hardware did it.
- The maze is the original layout: the ghost house, the two side tunnels wrapping at the middle row, 240 dots plus 4 energizers, the fruit slot beneath the house.
- The palette is a small fixed set of hardware colors — maze blue, dot peach, the four ghost colors, the yellow, frightened blue and the white flash, the eyes' white and pupil blue. Pull the actual hardware palette or eyedrop it off emulator frames; do not eyeball hex codes. Everything on screen must come from that array and nothing else.
- Sprites are **pixel art, not vector**. If you're adapting the reference project's SVGs, rasterize them to the native pixel grid and correct them against real ROM sprite dumps — a smooth-scaled vector ghost will fail the blind trial in the first three seconds.
- Animation cadence: Pac-Man's chomp cycles on a fixed frame count and *he opens his mouth in the direction of travel*; ghosts are two-frame with a rippling skirt; ghost eyes track their heading; eaten ghosts are eyes-only floating home; energizers blink on the hardware's blink interval; the maze flashes white/blue on level clear.
- Movement is tile-locked and axis-aligned. No diagonals, no free-floating positions, no easing. Reproduce the cornering behavior where a turn buffered slightly early cuts the corner.
- The HUD is the arcade HUD: score top-left with the leading zero suppressed, high score centered, lives as sprites bottom-left, fruit history bottom-right, "READY!" in yellow before each round.
- Audio: use the real samples (the reference project ships them). The four-stage siren that climbs in pitch as dots disappear, the chomp, the energizer wobble, the ghost-eaten rise, the eyes-returning warble, the death spiral, the attract jingle. Rewire them for the role reversal — the death spiral now plays when *we* lose a ghost, the siren's rising pitch is now a threat clock counting down our board — but keep the sounds themselves.
- CRT treatment on top: subtle scanlines, phosphor bloom on bright pixels, very slight barrel distortion, black surround. Tasteful — the goal is "photographed off a cabinet in 1981," not "Instagram filter."
- Attract mode. The game must idle into a demo with the marquee, the character intro roll, and a self-playing AI round, exactly like a cabinet nobody has put a quarter into.

---

## HOW TO BUILD IT

First, one agent clones the reference project, gets it running, plays it, and writes a short map of what's worth taking and what's being replaced. Everyone else starts from that map — nobody re-derives what's already sitting in that repo working.

Then fan out sub-agents, each owning a single vertical slice in parallel: canvas maze renderer and tilemap port; sprite sheet acquisition, rasterization, and animation tables; the fixed-timestep 60 Hz loop with collision folded into the tick; **the drag-to-draw path input system** (corridor snapping, retraction, self-crossing, loop closure detection, timing beads, four-color trail rendering); ghost order execution and the wall-stop rule; Pac-Man's escape AI and difficulty curve; the energizer role-reversal state machine; audio rewiring; the CRT post-processing pass; HUD, scoring, and attract mode; level progression and tuning tables.

Give the drag-to-draw system your best agent and more iterations than anything else. Every other slice is a replication problem with a known right answer sitting in an arcade cabinet. This one is original, it is the entire reason the game exists, and it is the only part that can fail in a way no reference can tell you about. If the drawing doesn't feel *good* — tactile, instant, forgiving of a sloppy hand, obvious on the first try without a tutorial — nothing else matters.

Each sub-agent takes its slice to finished, shipped, no-TODO quality. Not a prototype. Not a placeholder. The thing itself.

/loop

**Loop one — the blind fidelity trial.** After each slice lands, spawn a *separate* sub-agent as a hostile art director. Give it a screenshot of our game and a screenshot of the real arcade game, unlabeled and in random order, and make it say which one is the real cabinet and enumerate exactly which pixels gave it away. This critic's default answer is "obviously the fake, and here are eleven reasons." It must be specific and merciless: wrong blue by two shades, sprite one pixel too wide, chomp a frame too slow, dot spacing off by one, glow too hot, font kerning wrong on the 7.

If the critic can identify our version, it does not pass. Feed the findings back, fix, re-screenshot, re-run the blind trial. Keep looping. Do not accept "close enough," do not accept "the difference is negligible," do not let a sub-agent mark its own homework. The loop exits only when three consecutive blind trials with fresh critics fail to pick out our version, and at least one critic guesses wrong.

Run the same blind trial on *motion*, not just stills — capture animated GIFs of a ghost turning a corner, Pac-Man chomping down a corridor, the energizer flash, the level-clear maze flash — and have the critic call the fake from movement alone. Run it on audio too: describe both waveforms and have the critic pick the emulator.

/loop

**Loop two — the fun trial.** Perfect pixels on a boring game is a failure. Spawn a separate playtest sub-agent that actually plays the built game through the browser, level by level, and reports as a brutal games journalist who has played every arcade game ever made. It answers: **does drawing a path feel good in the hand — instant, tactile, forgiving?** Did it ever draw a path it didn't intend, and what was the mouse doing when that happened? Is the retract-on-backtrack rule discoverable without being told? Did it figure out closed-loop patrols on its own, and did that feel like a discovery or a gimmick? Is the pause-and-draw loop *tense or tedious*? Does swarming actually feel better than babysitting one ghost? Are the timing beads readable enough to actually synchronize a four-way pincer? Is the wall-stop rule a satisfying constraint or an annoying one? Does Pac-Man feel cunning or scripted? At which level did it first feel unfair, and at which level did it first feel boring? Would it put another quarter in?

Run a dedicated **first-touch trial** inside this loop: a fresh sub-agent that has never seen the game and has been told nothing about the controls beyond "you are the ghosts." Watch what it tries. If it does not work out click-and-drag within fifteen seconds unprompted, the affordance is wrong — fix the game, not the instructions.

Anything short of "I lost track of time" is a fail. Feed it back, retune, replay. Loop until the playtester is asking to keep playing after the report is done. Track the difficulty curve across levels 1–20 and prove it is a curve, not a cliff.

Both loops run until they stop producing findings. Then run them once more with fresh critics who have never seen the game, because the ones who've been staring at it have gone blind.

/loop

until it is utterly perfect. Fan out sub-agents and ultracode.
