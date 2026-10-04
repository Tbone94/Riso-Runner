# Handoff (2026-10-03, after the music chat)

Riso Runner is playable and nearly ready to ship. Read `DESIGN.md` first (what the game is, every decision and why),
then this. The owner approves the final build before anything goes to itch: **never upload without their OK.**

## Where things stand
- **Built:** M0 look lab → M1 core run → M2 forks + six regions → M3 pickups, focus, postcard → M4 new course per run,
  today's run, procedural sound, settings/pause, auto quality, installable app (PWA). The roller/stumble chaser was built
  and then removed at the owner's request (any hit ends the run). Ink drops were replaced by per-region pickups.
- **Run it:** `python3 -m http.server 5174` in the repo root, open http://localhost:5174. L opens the look lab.
  `window.RR` in the console has test hooks (`RR.tick(dt)` steps the sim headlessly, `RR.begin()`, `RR.events`, …).
- **Tested by autopilot only** (it clears 18 km across all regions and forks). Not yet played on a real phone. The owner
  hasn't heard the procedural sound effects yet (Claude can't listen).

## Music
**Shipped in v1:** one loop per region in `music/` (forest fusion-2, autumn citypop-1, jungle fusion-1, desert fusion-3,
snow kankyo-1, night lofi-1), crossfading at region changes. The owner wasn't sold on any take ("all over the place")
but chose to ship these for now.
- `tools/music/ace_api.py`: ACE-Step 1.5 via the acemusic.ai API (run with `tools/music/.venv/bin/python`). Key in
  `~/.config/acemusic/key`; never print or commit it; suggest the owner regenerates it at acemusic.ai/playground/api-key.
  It now retries 5xx errors and has a `cover` command (re-arrange a take for a region, keeping melody and timing).
- `tools/music/loops.py` (system `python3`, needs numpy): finds the beat grid, keeps the steady middle, picks whole bars
  whose end matches the bar before the start, crossfades, masters to -18 dBFS RMS with a -1 dBFS limiter, pads 1 s of
  the loop's own audio on both ends (seamless whatever the AAC decoder does with priming), encodes AAC 128k.
  `audition <takes>` → `tools/music/out/loops/` + `out/loops.html`; `build` → `music/` from `PICKS`;
  `theme <main> region=<cover> ...` cuts the same bars from every cover and writes `"sync": true`.
- `src/audio.js` music(): decodes only the playing and next region; with `"sync"` the new version starts at the same
  point in the bar. Measured in Chrome: decoded lengths exact, no click at the loop point, crossfade as designed.
- **Next (owner's idea, 2026-10-03):** one chill theme (sax and guitar) with a version per region, Mario-style.
  `DIRS['theme']` (96 bpm, F major) and `VARIANTS` (per-region band/mood) are in `ace_api.py`. Two candidates exist in
  `tools/music/out/` (theme-1, theme-think-1; listen page `out/theme.html`), plus trimmed sources `*-cut.flac`.
  The acemusic.ai service was overloaded that night: 504s on everything, and covers with a 25 MB upload never went
  through. Retry one request at a time, with the trimmed 16-bit sources.

## Before shipping (M5)
- `tools/itch-build.sh` makes `promo/itch/riso-runner-<stamp>.zip` (strips the service worker). Make a **new** itch page
  for Riso Runner, distinct from Riso Rider (gambo7592.itch.io/riso-rider). Owner approval first.
- Home-screen install needs its own https host (itch iframes can't install). Offer GitHub Pages like Riso Rider.
- Bump `VERSION` in `sw.js` on each release.
- Credits: Salamander Grand Piano (CC-BY 3.0), if any sampler music ships. ACE-Step output: MIT, no credit required.

## Loose ends
- The Riso Rider repo (`~/Projects/line-rider-game/.claude/launch.json`) has an uncommitted `riso-runner` preview entry
  added by this chat. It's harmless; drop it when convenient.
- Known rough edges: the jungle reads very green; night could be darker; light shafts are subtle; signboard text is
  small at a distance.
