// The missions: a short sortie list, each with a goal the HUD reads out and a score at the end.
// A sortie is finished when the last ring is flown or the aircraft is out of fuel or in the ground.

import { V3 } from './math3d.js';

export const MISSIONS = [
  {
    id: 'checkride',
    title: 'SORTIE 1 · CHECKRIDE',
    objective: 'Take off from the runway, fly every ring, land back on the strip.',
    rings: 5,
    fuel: 1,
    wind: 0,
  },
  {
    id: 'island-run',
    title: 'SORTIE 2 · ISLAND RUN',
    objective: 'Low and fast over the chain: clear all rings before the tanks run dry.',
    rings: 8,
    fuel: 0.82,
    wind: 6,
  },
  {
    id: 'storm-dash',
    title: 'SORTIE 3 · STORM DASH',
    objective: 'A crosswind and a short tank: fly the ring line and bring it home.',
    rings: 8,
    fuel: 0.7,
    wind: 13,
  },
];

/** The state a named screenshot scene starts from. */
export const SCENES = {
  cockpit: { mode: 'cockpit', seconds: 34, mission: 0 },
  approach: { mode: 'chase', seconds: 96, mission: 0 },
  action: { mode: 'chase', seconds: 52, mission: 1 },
};

/** Where the camera looks for a ring: the ring's centre, so the cue sits in frame. */
export function ringCue(rings, index) {
  const ring = rings[index];
  if (!ring) return null;
  return V3.sub(ring.position, [0, 0, 0]);
}

/** Whether the aircraft just passed through the ring (a sphere test against the ring size). */
export function passedRing(aircraft, ring) {
  if (ring.passed) return false;
  const d = V3.sub(aircraft.position, ring.position);
  return Math.hypot(d[0], d[1], d[2]) < ring.radius * 1.35;
}

/** The score line at the end of a sortie. */
export function missionScore(rings, aircraft) {
  const cleared = rings.filter((r) => r.passed).length;
  const landed = aircraft.onGround && !aircraft.crashed && Math.abs(aircraft.airspeed) < 90;
  return {
    cleared,
    total: rings.length,
    landed,
    crashed: aircraft.crashed,
    fuelLeft: aircraft.fuel,
    points: cleared * 100 + (landed ? 250 : 0) + Math.round(aircraft.fuel * 120) - (aircraft.crashed ? 400 : 0),
  };
}
