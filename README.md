# HUNTED

A browser 3D survival game. Someone put a bounty on your head, and everyone in three towns wants it: the glass-and-brick metro of Port Halden, the small town of Ashford, and the industrial waterfront of Saltmarsh Docks. Short highway drives through the countryside connect them. Survive 30 in-game days. The more noise you make, the higher your profile climbs, and police helicopters with searchlights and drones join the search.

## Play

- Easiest: open `dist/hunted.html` directly in a browser (one file, works offline).
- From source: serve the folder (for example `python3 -m http.server`) and open `http://localhost:8000`.

Desktop: WASD move, mouse look, Shift sprint, Space jump, click shoot, R reload, F or right click shove, E steal or leave a car, M big map, Esc pause.
Phones and tablets get on-screen controls.

## Build the single-file version

```
node tools/build-single.mjs
```

## Layout

- `src/core.js`: renderer, scene, helpers, procedural textures, merged-geometry builder
- `src/world.js`: towns, highways, countryside, collisions, navigation grid, ray casts
- `src/audio.js`, `src/fx.js`, `src/people.js`: synth sound, particles and bullet trails, characters and ragdolls
- `src/game.js`: hunters, cars, aircraft, profile system, weapons, HUD, game loop
- `vendor/three.module.min.js`: three.js r170 (MIT, see `vendor/THREE_LICENSE`)
