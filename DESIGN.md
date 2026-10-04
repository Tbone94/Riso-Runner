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
- **The Drum** is the chaser: a giant inked roller. One stumble brings it close (edges smudge,
  plates shake); a second within a few seconds and you get printed.
- **Regions change with distance (2026-10-03, replaces "forks reprint the world"):** forest (with the
  big snow-capped peak) → jungle → Arizona desert → forest …, about 1.5 km each, blending over ~400 m.
  The ink drums crossfade with the region, and the sheet number in the slug line counts regions passed,
  so the world itself tells you how far you've run. Forks may stay as route choices; undecided.
- **Ink drops** in the three inks fill one power meter. v1 power: *Clean Proof* (perfect register,
  slight slow-mo, drops fly to you).
- **Death** holds a clean-proof frame, then prints the moment as a postcard (seed, distance, run no.).
- **Daily seed** so everyone can run the same track.
- No shop or currency in v1.

## Pitched, not decided
Downhill momentum and launches, speed as health, drawing ink bridges at speed (the Riso Rider link),
plate shift (run through obstacles of one ink), set pieces (paper glider, rope zipline, the roller ride).

## The run (M1, built 2026-10-03)
- 3 lanes 2.2 m apart with a quick glide; jump (apex ~1.5 m, ~0.7 s), slide (0.75 s), and down in the
  air drops you fast into a slide. Inputs buffer ~0.15 s. Keys: arrows/WASD/space; phones: swipe, tap = jump.
- Speed 9 → 20 m/s over the first few km. Obstacles are one endless seeded sequence (same every run):
  log (jump), branch (slide), rock1 / rock2 (change lane; rock2 always leaves one lane open), gap (jump),
  and later a rock2 followed by a log or branch through the open lane. Spacing is never under ~1.2 s.
- Each obstacle is dressed for its region: logs / mossy logs / sandstone ledges; fallen trees (with vines in
  the jungle) / stone arches; boulders / mossy boulders / saguaros and striped boulders; streams / chasms.
- Crash: a clean-proof frame, a shake, then the MISPRINT card (distance, cause, best). Best and run number
  persist in localStorage. A SHEET banner announces each new region.
- Checked with a headless autopilot: it clears 10+ km at top speed; doing nothing, only jumping or only
  sliding all crash at the first obstacle.

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

## Milestones
- **M0 Look lab:** the rolling path through all three regions, the full print pass, a slow run, sliders. The vibe test.
- **M1** Core run: lanes, jump, slide, obstacles, death and restart. **Done.**
- **M2** Turns and forks (kept, decided 2026-10-03): choose a branch; region milestones already show.
- **M3** The drum and stumbling, ink drops, the power, score and the postcard.
- **M4** Difficulty tuning, daily seed, audio, comfort settings (FOV, bob), phone controls.
- **M5** Ship: build script, new itch page, GitHub Pages.

## Files
- `index.html`: the game; L opens the look lab panel.
- `src/print.js`: ink material, sky, blue noise and the print pass.
- `src/world.js`: the path, regions, terrain chunks, plants and the far skylines.
- `src/main.js`: game states, the runner, input, HUD and cards, the loop, the lab panel.
- `src/air.js`: leaves, motes and birds.
- `lib/`: three.js r180 (MIT), vendored so it works offline and on itch.
- `riso.js`: copied from Riso Rider (ink and paper names).

Serve with `python3 -m http.server 5174` from the repo root.
