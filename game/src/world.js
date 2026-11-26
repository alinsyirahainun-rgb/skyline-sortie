// The world the game flies over: an island chain, a runway, target rings and the horizon.
// Everything here is generated from the seed, so a screenshot is the same frame every time.

import { V3, clamp } from './math3d.js';

export const TERRAIN_SIZE = 6000;
export const GRID = 34;

/** A tiny deterministic generator, so the same seed gives the same world. */
export function makeRandom(seed) {
  let s = (seed * 2654435761) >>> 0;
  return function next() {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/** Smooth value noise over a grid, used for the terrain height and the coastline. */
function noise2(random, scale) {
  const table = new Map();
  const at = (ix, iy) => {
    const key = ix * 73856093 ^ iy * 19349663;
    if (!table.has(key)) table.set(key, random());
    return table.get(key);
  };
  return (x, y) => {
    const gx = x / scale;
    const gy = y / scale;
    const ix = Math.floor(gx);
    const iy = Math.floor(gy);
    const fx = gx - ix;
    const fy = gy - iy;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = at(ix, iy);
    const b = at(ix + 1, iy);
    const c = at(ix, iy + 1);
    const d = at(ix + 1, iy + 1);
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
  };
}

/**
 * Build the terrain: a height field over an island chain, plus a runway cut flat into the main
 * island so the player has somewhere to take off from and land on.
 */
export function buildWorld(seed = 1) {
  const random = makeRandom(seed);
  const big = noise2(random, 900);
  const small = noise2(random, 260);
  const coast = noise2(random, 1400);

  const heights = new Float32Array((GRID + 1) * (GRID + 1));
  const cell = TERRAIN_SIZE / GRID;
  for (let iy = 0; iy <= GRID; iy += 1) {
    for (let ix = 0; ix <= GRID; ix += 1) {
      const x = -TERRAIN_SIZE / 2 + ix * cell;
      const z = -TERRAIN_SIZE / 2 + iy * cell;
      const land = coast(x, z) * 0.55 + 0.2;
      const ridge = big(x, z) * 210 + small(x, z) * 80;
      const island = clamp((land - Math.hypot(x, z) / TERRAIN_SIZE) * 3.4, 0, 1);
      heights[iy * (GRID + 1) + ix] = Math.max(0, ridge * island - 24);
    }
  }

  // A runway on the main island, running north to south. Its height is the terrain under its
  // centre, so the strip sits on the island instead of hanging over a slope, and the cut flattens
  // a wide shoulder around it so the ground rolls away smoothly for a takeoff and a landing.
  const runway = { x: 260, z: 240, length: 1400, width: 90, heading: 0, elevation: 0 };
  const gridAt = (x, z) => {
    const gx = clamp(Math.round((x + TERRAIN_SIZE / 2) / cell), 0, GRID);
    const gz = clamp(Math.round((z + TERRAIN_SIZE / 2) / cell), 0, GRID);
    return heights[gz * (GRID + 1) + gx];
  };
  runway.elevation = gridAt(runway.x, runway.z);
  for (let iy = 0; iy <= GRID; iy += 1) {
    for (let ix = 0; ix <= GRID; ix += 1) {
      const x = -TERRAIN_SIZE / 2 + ix * cell;
      const z = -TERRAIN_SIZE / 2 + iy * cell;
      const dx = Math.abs(x - runway.x) / (runway.width * 2.6);
      const dz = Math.abs(z - runway.z) / (runway.length * 0.72);
      const d = Math.hypot(dx, dz);
      if (d < 1) {
        const t = 1 - d * d; // a square-root free falloff: flat on the strip, smooth at the edge
        const k = iy * (GRID + 1) + ix;
        heights[k] = runway.elevation * t + heights[k] * (1 - t);
      }
    }
  }

  return { heights, cell, runway, seed, size: TERRAIN_SIZE };
}

/** The terrain height at a world position, by bilinear interpolation of the height field. */
export function heightAt(world, x, z) {
  const { heights, cell, size } = world;
  const gx = clamp((x + size / 2) / cell, 0, GRID - 0.001);
  const gz = clamp((z + size / 2) / cell, 0, GRID - 0.001);
  const ix = Math.floor(gx);
  const iz = Math.floor(gz);
  const fx = gx - ix;
  const fz = gz - iz;
  const row = GRID + 1;
  const h00 = heights[iz * row + ix];
  const h10 = heights[iz * row + ix + 1];
  const h01 = heights[(iz + 1) * row + ix];
  const h11 = heights[(iz + 1) * row + ix + 1];
  return (h00 * (1 - fx) + h10 * fx) * (1 - fz) + (h01 * (1 - fx) + h11 * fx) * fz;
}

/** Target rings placed over the island chain: fly through them in order. */
export function buildTargets(world, count = 8) {
  const random = makeRandom(world.seed + 91);
  const rings = [];
  // The ring field is refused if it leaves the strip behind: the first sortie starts on the
  // runway, so the last ring sits over the sea past the south end instead of in the hills behind.
  const field = count >= 6 ? 0.86 : 1;
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2 + random() * 0.4;
    const radius = 900 + random() * 1500;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius * field - 200;
    const ground = heightAt(world, x, z);
    rings.push({
      index: i,
      position: [x, ground + 220 + random() * 180, z],
      radius: 70,
      heading: angle + Math.PI / 2,
      passed: false,
    });
  }
  return rings;
}

/** The aircraft's start: lined up at the north end of the runway, on the centre line. */
export function startOnRunway(world) {
  const { runway } = world;
  return {
    position: [runway.x, runway.elevation + 4, runway.z - runway.length * 0.5 + 60],
    heading: runway.heading,
  };
}

/** Islands for the horizon: a ring of hills behind the playable terrain. */
export function horizonHills(world) {
  const random = makeRandom(world.seed + 7);
  const hills = [];
  for (let i = 0; i < 40; i += 1) {
    const a = (i / 40) * Math.PI * 2 + random() * 0.08;
    hills.push({
      angle: a,
      distance: 4200 + random() * 2600,
      height: 120 + random() * 420,
      width: 500 + random() * 1400,
    });
  }
  return hills;
}

export { V3 };
