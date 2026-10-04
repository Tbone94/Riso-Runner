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

## Milestones
- **M0 Look lab:** the rolling path through all three regions, the full print pass, a slow run, sliders. The vibe test.
- **M1** Core run: lanes, jump, slide, obstacles, death and restart.
- **M2** Turns, region milestones on the HUD, and forks (if we keep them).
- **M3** The drum and stumbling, ink drops, the power, score and the postcard.
- **M4** Difficulty tuning, daily seed, audio, comfort settings (FOV, bob), phone controls.
- **M5** Ship: build script, new itch page, GitHub Pages.

## Files
- `index.html`: currently the M0 look lab.
- `src/print.js`: ink material, sky, blue noise and the print pass.
- `src/world.js`: the path, regions, terrain chunks, plants and the far skylines.
- `src/main.js`: boot, the loop, the lab panel.
- `lib/`: three.js r180 (MIT), vendored so it works offline and on itch.
- `riso.js`: copied from Riso Rider (ink and paper names).

Serve with `python3 -m http.server 5174` from the repo root.
