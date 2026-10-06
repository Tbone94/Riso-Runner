# Riso Runner — design (2026-10-03)

An offshoot of Riso Rider. A first-person endless runner where you are running *inside* a
risograph print: a forest path printed in three inks on grainy paper. Behind you the printer's
drum rumbles closer.

The vibe comes first. If it doesn't feel like being inside a print, nothing else matters.

## Decided
- **Name:** Riso Runner. Its own repo, sharing `riso.js` and the fonts with Riso Rider.
- **First person**, with the printed sheet border (crop marks, slug line, colour bar) fixed on
  screen. That frame doubles as the comfort reference point.
- **3 soft lanes** (smooth glide between them), jump, slide. Arrows / A-D / swipe.
- **Any hit ends the run** (user, 2026-10-03). There's no chaser: the roller and its stumbles were built in
  M3 and taken out at the user's request.
- **Six regions, ~1.5 km each, blending over ~400 m**, the inks crossfading with them. Each has a twist:
  | Region | Inks | Twist |
  |---|---|---|
  | Forest (start) | Sunflower / Teal / Federal Blue | none, the warm-up |
  | Autumn | Sunflower / Orange / Burgundy | trees topple across the path as you near them (jump) |
  | Jungle | Yellow / Green / Hunter Green | thick mist, and some rocks become low branches |
  | Desert | Sunflower / Orange / Medium Blue | tumbleweeds roll across the lanes (jump or dodge) |
  | Snow | Aqua / Medium Blue / Federal Blue | icy stretches: changing lanes is slow and slippery |
  | Night | Yellow / Violet / Federal Blue | darkness: you see a much shorter way ahead |
  Moving hazards are posed by your distance to them, not the clock, so the warning is the same at any speed.
- **Forks (M2, built 2026-10-03):** 300 m before each region starts blending out, the path splits round an
  island with a signpost. Be in the left or right lane to take that branch; the branch picks the next region
  (both options and their twists show on a banner and the signboards). The middle lane hits the signpost.
  The world ahead is built assuming the first option and rebuilt from the blend point when you pick.
  No hard 90° corners: they'd fold the terrain and are rough on comfort in first person.
- **Plain words on screen** (user, 2026-10-03): region names and km, "RUN OVER", no print jargon in the HUD.
  The print vocabulary stays in the look itself and in the lab.
- **Pickups**, one per region (user, 2026-10-03; replaced ink drops, which blocked the view): acorns,
  maple leaves, mangoes, turquoise stones, snowflakes, fireflies. They sit low on the ground (below your line
  of sight), print softly like scenery (never in the obstacles' flat solid style), are taken ~1.5 m early with
  a quick pop, and come in short spaced trails: in lanes, arcs over jumps, through the open lane of a rock
  pair, under branches, down fork branches. 45 fill the focus meter.
- **Focus** (the power, built M3): F, or tap the meter. 6 s of 0.7× time, everything in perfect register,
  pickups within 9 m fly to you.
- **The end of a run** holds a clean-register frame, then the card offers a **postcard**: that frame printed
  on paper with the region in big mid-ink letters, distance, ink, cause, run number and date. Save postcard
  (or S) downloads it, or opens the share sheet on phones.
- **A new course every run** (path shape, obstacles, plants and fork choices follow a seed), and
  **Today's run**: the date is the seed, so everyone gets the same course that day (it also picks the starting
  region); it keeps its own best.
- **Sound** is all generated in code (WebAudio): an ambience bed per region with birds, parrots or crickets,
  footsteps that change with the ground (snow crunch, boardwalk, sand), and effects for jump, land, duck, lane,
  pickups (a rising pentatonic run when you string them), focus, crashes, forks and new regions. M mutes.
- **Music** (v1, 2026-10-03): one seamless loop per region (ACE-Step 1.5 takes, MIT), crossfading over 3 s when the
  region changes; quieter on the menu and when paused, muffled during focus. Its own Music slider. The effects were
  lifted 8 dB to sit above it, with a safety limiter on the output. Next (owner's idea): one theme with a version per
  region, Mario-style, played in step so only the band changes at a border.
- **Settings** (title and pause): field of view, sound effects and music volumes (all the way down = off; split
  2026-10-04 at the user's request), all sound off, calm mode (steadier print, no shake),
  quality (auto drops the print resolution when the frame rate sags). The view widens on portrait screens so
  all three lanes fit.
- **Fork banner** (user, 2026-10-04): a slim strip with both choices and their twists, top centre on desktop and just
  under the HUD on phones, so it never covers the focus bar.
- **Focus on touch screens** (user, 2026-10-04): a big round FOCUS button under the right thumb, shown only while focus
  is ready (the top bar still works too).
- **Colour-blind friendly** (setting, user 2026-10-04): checked by simulating protan, deutan and tritan vision on a
  frame per region (`tools/cvd.py`). Obstacles already read by lightness (darkest shape, paper edge); the setting makes
  them solid dark ink with a thicker outline and a wider paper edge, steadies the inks (fewer false coloured edges), and
  swaps the jungle's green mid ink for teal (its yellow and green collapse to one olive with red-green colour blindness).
- **Phones fill the screen** (user, 2026-10-04): on touch screens and narrow windows the print runs edge to edge (no
  paper margins, crop marks, title or slug, no ragged plate edge); the HUD keeps clear of notches. Desktop keeps the sheet.
- **Obstacles stand off the background** (user, 2026-10-04): a thicker dark outline plus a band of bare paper just
  outside it, like a sticker's edge (lab: "Paper edge round obstacles").
- **Installable app**: manifest, riso-printed icons, full screen, an offline service worker (skipped on
  localhost unless `?sw`), an Install button where the browser offers one, and an Add to Home Screen hint on iOS.
- No shop or currency in v1.

## Pitched, not decided
Downhill momentum and launches, speed as health, drawing ink bridges at speed (the Riso Rider link),
plate shift (run through obstacles of one ink), set pieces (paper glider, rope zipline, the roller ride).

## The run (M1, built 2026-10-03)
- 3 lanes 2.2 m apart with a quick glide; jump (apex ~1.5 m, ~0.7 s); duck lasts only while the button
  is held (user, 2026-10-03); down in the air drops you fast and you land ducking if still held. Jumps
  buffer ~0.15 s. Keys: arrows/WASD/space; phones: swipe (hold after swiping down), tap = jump.
- Speed 9 → ~25 m/s, still creeping up after 10 km. Difficulty keeps rising to ~9 km: tighter spacing (never
  under ~1.15 s), and combos unlock: dodge-then-jump/duck, jump-then-dodge, zigzag rocks, leap-then-duck. Obstacles are one endless seeded sequence (same every run):
  log (jump), branch (slide), rock1 / rock2 (change lane; rock2 always leaves one lane open), gap (jump),
  and later a rock2 followed by a log or branch through the open lane. Spacing is never under ~1.2 s.
- Each obstacle is dressed for its region: logs / mossy logs / sandstone ledges; fallen trees (with vines in
  the jungle) / stone arches; boulders / mossy boulders / saguaros and striped boulders; streams / chasms.
- Crash: a clean-proof frame, a shake, then the MISPRINT card (distance, cause, best). Best and run number
  persist in localStorage. A SHEET banner announces each new region.
- Checked with a headless autopilot: it clears 18 km (all six regions, 12 forks, ~25 m/s) without a crash;
  doing nothing crashes at the first obstacle, the middle lane at a fork hits the signpost, and letting go of
  duck before a branch hits it.

### Obstacles must read, without shouting
- Obstacles print as **flat solid ink** (no hatching, little grain) while all scenery is hatched and grainy.
- They fog far less than scenery, carry a heavier hand-cut outline, and a sunlit top in the light ink.
- A shadow pools on the path under each one (for a branch, the dark band says "something overhead").
- Gaps have snapped rope-bridge posts (cairns in the desert) at both edges, tall enough to see over a rise.
- Path crests are gentle enough to always see ~30 m ahead.

## Difficulty
Speed ramps slowly to a cap. Chunks carry difficulty scores and come from a band that widens over time.
Every obstacle is readable at least ~1 s ahead (fog distance scales with speed). Never stack a turn
with an obstacle. Calm stretches after forks. Hard, never unfair.

## The look (how the print is made)
1. The scene renders **ink densities, not colour**: R = light ink, G = mid, B = key, A = material id
   (for outlines). Lighting is stepped into bands; distance fogs every surface toward the horizon's ink.
2. The **print pass** is a GPU port of `riso.js`: blue-noise grain per plate (the same tile), a
   misregistration offset per plate that grows with speed and depth, key-ink outlines from the depth
   and id buffers (wobbled like a hand-cut block), press defects (starved drum, roller tire tracks), and
   each ink multiplied onto paper.
3. Inks keep **roles** so any three-ink set works: light = sky glow, sunlit ground; mid = foliage,
   sky top; key = trunks, deep shade, outlines, kerbs.
   Region inks: forest Sunflower / Teal / Federal Blue; jungle Yellow / Green / Hunter Green;
   desert Sunflower / Orange / Medium Blue (the desert sky is a thin key, so blue sky over orange rock).
4. The sky is a **split fountain** with kasumi mist bands where the paper shows through.
5. Foliage is cut-paper geometry, instanced and swaying. Forest: tiered pines, round broadleaf masses,
   birches, meadow clearings. Jungle: mossy giants hung with vines, feathery palms leaning over a plank
   boardwalk, pleated fan palms, torn banana leaves, ferns, short misty fog, light shafts through gaps.
   Desert: saguaros, striped sandstone buttes and mesas, sage, dry grass.
6. The grain is fixed to the screen. You are looking through the paper. "Reprint" re-seeds it at 12 fps.
7. Light shafts are a print-pass effect: march toward the sun through the depth buffer; open sky bleaches
   the mid and key plates and lays down light ink.
8. Polish (2026-10-03): a tone curve pushes ink toward clean paper and solid shapes ("bold shapes"); the
   key plate prints as a wavering hand-cut line screen (hatching) instead of grain; the ink stops raggedly
   short of the image edge like a real plate; the air is alive (tumbling leaves, paper-white fluff and
   pollen, desert dust, a flock of birds).
9. **Readable riso** (2026-10-05, after Reddit feedback that the game was hard to see and too grainy): imperfections
   are big and soft, while anything small or fast stays crisp.
   - The grain is **soft** (lab: "Grain softness", default .85). Each pixel shows the average of the few grains it
     covers instead of one grain on or off, so tints keep an even shimmer and the TV-static look is gone.
   - The key plate's hatching is lighter (.3): at full strength it striped whole night scenes.
   - The roller tracks run near the sheet's edges, where real feed rollers grip, never through the lanes.
   - Jungle boulders and logs carry moss in patches on top. The trunk's moss bands made them read as boardwalk.

## Milestones
- **M0 Look lab:** the rolling path through all three regions, the full print pass, a slow run, sliders. The vibe test.
- **M1** Core run: lanes, jump, slide, obstacles, death and restart. **Done.**
- **M2** Forks that pick the next region, three new regions, a twist per region, a steeper curve. **Done.**
- **M3** Ink drops, focus, and the postcard. **Done.** (The roller was built, then removed.)
- **M4** New course per run, today's run, sound, settings and pause, auto quality, installable app. **Done.**
  Difficulty is tuned by the autopilot tests only; it needs real play.
- **M5** Ship: music added; owner asked to publish on itch and GitHub Pages (2026-10-03).

## Files
- `index.html`: the game; L opens the look lab panel.
- `src/print.js`: ink material, sky, blue noise and the print pass.
- `src/world.js`: the path, regions, terrain chunks, plants and the far skylines.
- `src/main.js`: game states, the runner, input, HUD and cards, the loop, the lab panel.
- `src/air.js`: leaves, motes and birds.
- `src/postcard.js`: the end-of-run postcard.
- `src/audio.js`: procedural sound and the music player.
- `music/`: the region loops and `music.json` (made by `tools/music/loops.py`).
- `sw.js`, `manifest.webmanifest`, `icons/`: the installable app.
- `tools/itch-build.sh`: the itch.io zip.
- `lib/`: three.js r180 (MIT), vendored so it works offline and on itch.
- `riso.js`: copied from Riso Rider (ink and paper names).

Serve with `python3 -m http.server 5174` from the repo root.
