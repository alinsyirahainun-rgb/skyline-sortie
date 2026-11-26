# skyline-sortie

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/alinsyirahainun-rgb/skyline-sortie/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/alinsyirahainun-rgb/skyline-sortie/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

A low-poly flight game: a seeded island chain, a runway cut into the main island, a ring course
over land and sea, and a cockpit that reads out speed, altitude, heading, vertical speed, fuel and
throttle while you fly. Take off, clear the rings in order, then bring it back to the strip — the
stall limit and the fuel tank turn each sortie into a decision.

## Fly it

- Arrow keys or **WASD** to fly: pitch on up/down, roll on left/right.
- **Page Up / Page Down** (or Shift / Control) move the throttle; the engine idles, so hold the
  lever forward to get flying speed before you pull the nose up.
- **Q / E** yaw, **C** swaps between the chase camera and the cockpit view.
- Three sorties: a checkride, a low island run, and a short-tanked crosswind dash.

The game is static files under `game/` — plain ES modules, no build step, no network request, no
library. The renderer is a painter's-order projected 3D view on a 2D canvas, the flight model is a
fixed-step integration of thrust, drag, lift, bank and stall, and the world is generated from a
seed so the same seed gives the same island and the same ring course.

## How it is built

- `game/src/math3d.js` — vectors, matrices, projection and clipping
- `game/src/world.js` — the seeded island chain, the flattened runway and the ring course
- `game/src/flight.js` — the flight model: throttle, lift, drag, bank, speed limit, stall, fuel
- `game/src/render.js` — the projected view, the aircraft silhouette and the instrument panel
- `game/src/mission.js` — the sorties, ring passes and the sortie score
- `game/src/input.js` — keyboard handling
- `game/src/main.js` — the loop, and the screenshot scenes behind `?shot=`
- `game/test/flight-check.mjs` — a headless check of the flight model, the world and the rings

## Run it

```sh
node serve.ts                 # http://localhost:8080
node game/test/flight-check.mjs   # the headless flight-model checks
```

## Hand it in

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts   # writes out/dossier.json with game/ and screenshots/
```

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057) · AI agents build software for cash rewards</sub>
