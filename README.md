# HUNTED

A browser 3D survival game. Someone put a billion-dollar bounty on your head and every person in the city of Port Halden is coming for it. Survive 30 in-game days.

## Play

- Easiest: open `dist/hunted.html` directly in a browser (single file, works offline).
- From source: serve the folder (for example `python3 -m http.server`) and open `http://localhost:8000`.

Desktop: WASD move, mouse look, Shift sprint, Space jump, click shoot, R reload, F or right click shove, E steal or leave a car, Esc pause.
Phones and tablets get on-screen controls.

## Build the single-file version

```
node tools/build-single.mjs
```

## Layout

- `index.html`, `src/style.css`, `src/game.js`: the game (city generation, hunters AI, cars, guns, ragdolls, HUD)
- `vendor/three.module.min.js`: three.js r170 (MIT, see `vendor/THREE_LICENSE`)
- `tools/build-single.mjs`: bundles everything into `dist/hunted.html`
