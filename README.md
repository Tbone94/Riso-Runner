# Riso Runner

An endless first-person run through a risograph print: forest, autumn, jungle, desert, snow and night,
each printed in its own three inks, each with its own twist. Pick the next region at every fork, gather
what the region leaves on the path, and see how far you get.

Play: open `index.html` from a local server (`python3 -m http.server 5174`). Keys: ← → lanes, ↑ / space
jump, hold ↓ duck, F focus, P pause, M sound, L the look lab. Phones: swipe, tap to jump.

- `DESIGN.md` — what the game is and why.
- `src/` — `main.js` (game), `world.js` (path, regions, obstacles, plants), `print.js` (the riso print
  pass), `air.js` (particles), `audio.js` (procedural sound), `postcard.js` (the end-of-run postcard).
- `lib/` — three.js r180 (MIT).
- `tools/itch-build.sh` — zip for itch.io (`promo/itch/`).

Installable as an app (manifest + offline service worker); bests are kept in localStorage.
