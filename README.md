# HUNTED

A browser 3D survival game. Someone put a bounty on your head, and everyone in three towns wants it: the glass-and-brick metro of Port Halden, the small town of Ashford, and the industrial waterfront of Saltmarsh Docks. Short highway drives through the countryside connect them. Survive 30 in-game days. The more noise you make, the higher your profile climbs, and police helicopters with searchlights and drones join the search.

## Play

- Easiest: open `dist/hunted.html` directly in a browser (one file, works offline).
- From source: serve the folder (for example `python3 -m http.server`) and open `http://localhost:8000`.

Desktop: WASD move, mouse look, Shift sprint, Space jump / climb / vault, C or Ctrl crouch / slide / roll, click shoot, R reload, F or right click shove, E steal a car or ride a zipline, M big map, Esc pause.

Staying hidden: press E at a big courtyard bin to climb in and watch through the gap under the lid (anyone who saw you get in will come and haul you out). Pick up bottles and cans with E and throw them with T: a smash round the corner pulls people who have lost sight of you over to look. CCTV cameras over shop doors and cashpoints sweep the pavement and report you if you look dodgy in their cone (or at all once you're a known face); shoot, crowbar or bottle them. Run through pigeons and the flock bursts up and gives you away. Crouch behind someone who isn't looking and press E to pick their pocket.

Parkour: vault low cover at a run, jump at ledges to pull up, sprint into a wall and press Space to scramble up, climb ladders, ride ziplines between rooftops (yellow on the minimap).

Places to explore: the Halden Metro (three stations under Port Halden, watch for the train), sewers under Ashford and Saltmarsh Docks (manholes in the street), the Halden Galleria mall, and the Halden Heights construction site with its tower crane.
Phones and tablets get on-screen controls.

## Build the single-file version

```
node tools/build-single.mjs
```

## Layout

- `src/core.js`: renderer, scene, helpers, procedural textures, merged-geometry builder
- `src/world.js`: towns, highways, countryside, height-aware collisions, ladders and ziplines, navigation grid, ray casts
- `src/interiors.js`: subway, sewers, mall, construction site
- `src/parkour.js`: player movement, vaulting, climbing, ladders, ziplines
- `src/audio.js`, `src/fx.js`, `src/people.js`: synth sound, particles and bullet trails, characters and ragdolls
- `src/stealth.js`: hiding in dumpsters, throwable bottles and cans, CCTV cameras, pigeons, pickpocketing
- `src/game.js`: hunters, cars, aircraft, profile system, weapons, HUD, game loop
- `vendor/three.module.min.js`: three.js r170 (MIT, see `vendor/THREE_LICENSE`)

## Tests

GitHub Actions runs the tests on every push and pull request (`.github/workflows/tests.yml`).
Locally: `npm install && npx playwright install chromium && npm test`. That rebuilds
`dist/hunted.html`, syntax-checks every module plus the bundle, then plays the game in
headless Chromium through the `window.__hunted` hooks.
