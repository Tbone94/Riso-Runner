# Handoff (2026-10-03, end of the first build chat)

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

## In progress: music
The owner wants smooth, jazzy Japanese city pop, and loves **Masayoshi Takanaka** (bright jazz-fusion, singing guitar,
samba/latin lift). Directions tried:
1. `tools/music/mockups.py` + `sampler.py`: notes written in code, played on real recorded instruments from
   `~/Music/squish-instruments` (shared with the squish game). Owner verdict: **instruments and tone feel off.**
   This library has no Rhodes, electric bass, electric guitar, sax or full drum kit.
2. **ACE-Step 1.5 (MIT licence, commercial use OK) via the acemusic.ai API**. This is the current path.
   - `tools/music/ace_api.py <direction> [takes] [seconds]`, run with `tools/music/.venv/bin/python` (has certifi; the
     python.org Python lacks system certificates). It needs a browser-like User-Agent (Cloudflare blocks urllib's default).
   - The API key is in `~/.config/acemusic/key` (chmod 600, outside the repo). Never print it or commit it. The owner pasted
     it in chat, so suggest they regenerate it at acemusic.ai/playground/api-key when music is done.
   - Directions and prompts are in `DIRS` inside `ace_api.py`: fusion (120 bpm, E), citypop (104, D), kankyo (78), lofi (84).
   - 11 takes are in `tools/music/out/` (gitignored): fusion-1..3 (mp3), fusion-9 (flac + m4a), citypop-1..3, kankyo-1..2,
     lofi-1..2. They were all sent to the owner; **their verdict is pending.** Default output is now FLAC.
   - Some takes have quiet intros or outros (2-second windows down to −52…−58 dB), so cut loops from the steady middle.
   - The HF Space route (`tools/music/ace.py`, gradio_client) works but the anonymous ZeroGPU quota is tiny. Use the API.
3. **Next steps for music:** get the owner's picks → generate more takes in that direction (FLAC; try reference-audio or
   more specific prompts) → cut seamless loops (crossfade at a bar line, keep tempo-aligned length) → master to about
   −18 dBFS RMS → ship as compressed audio (m4a/ogg, mind the itch zip size) → add a music player in `src/audio.js` with a
   music volume setting. Idea the owner liked: one track per direction with a layer per biome, crossfading at region borders.

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
