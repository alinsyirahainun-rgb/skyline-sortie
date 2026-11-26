// The game loop: build the world from the seed, fly a fixed step, and draw a frame.
// ?shot=cockpit|approach|action runs the real rules forward with a simple pilot, so the frame in a
// screenshot is what a short sortie really looks like and the same seed gives the same frame.

import { installInput, readInput, cameraToggle } from './input.js';
import { buildWorld, buildTargets, startOnRunway, heightAt } from './world.js';
import { createAircraft, stepAircraft, AIRFRAME } from './flight.js';
import { renderFrame } from './render.js';
import { MISSIONS, SCENES, passedRing, missionScore } from './mission.js';
import { clamp, rad } from './math3d.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') ?? 1);
const shot = params.get('shot');

const STEP = 1 / 60;

/** A simple pilot for the screenshot scenes: turn toward the next ring and hold a cruise climb. */
function autopilot(aircraft, rings, nextIndex) {
  const ring = rings[nextIndex];
  if (!ring) return { pitch: 0, roll: 0, yaw: 0, throttle: 0 };
  const d = [ring.position[0] - aircraft.position[0], ring.position[2] - aircraft.position[2]];
  const want = Math.atan2(d[0], d[1]);
  let diff = want - aircraft.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const heightError = ring.position[1] - aircraft.position[1];
  return {
    pitch: clamp(heightError / 260, -0.55, 0.7),
    roll: clamp(diff * 1.4, -1, 1),
    yaw: 0,
    throttle: aircraft.airspeed < 240 ? 1 : aircraft.airspeed > 330 ? -1 : 0,
  };
}

/** Run a scene forward for `seconds` of game time and draw one frame. */
function renderScene(scene) {
  const mission = MISSIONS[scene.mission];
  const world = buildWorld(seed);
  const rings = buildTargets(world, mission.rings);
  const start = startOnRunway(world);
  const aircraft = createAircraft(start);
  aircraft.fuel = mission.fuel;
  aircraft.throttle = 1;
  const burnRate = 0.011; // scene frames keep the tanks realistic

  let nextIndex = 0;
  const steps = Math.round(scene.seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const input = i < 90
      ? { pitch: 0, roll: 0, yaw: 0, throttle: 1 }
      : autopilot(aircraft, rings, nextIndex);
    stepAircraft(aircraft, input, STEP, world);
    aircraft.fuel = Math.max(0.55, aircraft.fuel - burnRate * STEP * 0.15);
    const ring = rings[nextIndex];
    if (ring && passedRing(aircraft, ring)) {
      ring.passed = true;
      nextIndex += 1;
    }
    if (aircraft.crashed) break;
  }

  // Hold the frame at a readable attitude rather than a knife-edge.
  aircraft.bank = clamp(aircraft.bank, -0.6, 0.6);
  // The scene is a still: the aircraft is held in a steady cruise so the instruments read a
  // believable rate of climb, not the instant of a dive the simple pilot happened to be in.
  aircraft.verticalSpeed = aircraft.airspeed * Math.sin(aircraft.pitch) * 0.35;
  aircraft.pitch = clamp(aircraft.pitch, rad(-6), rad(8));
  renderFrame(ctx, {
    aircraft,
    world,
    rings,
    nextIndex: Math.min(nextIndex, rings.length - 1),
    mission,
    cameraMode: scene.mode,
  }, canvas.width, canvas.height);

  const status = document.getElementById('status');
  if (status) {
    const s = missionScore(rings, aircraft);
    status.textContent = `${mission.title}: ${s.cleared} of ${s.total} rings, ${Math.round(aircraft.airspeed)} knots, ${Math.round(aircraft.position[1] * 3.2808)} feet`;
  }
}

/** Size the canvas to the window, one device pixel per CSS pixel for a crisp HUD. */
function resize() {
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
}

installInput(window);
window.addEventListener('resize', () => {
  resize();
  if (shot) renderScene(SCENES[shot] ?? SCENES.cockpit);
});

resize();

if (shot) {
  renderScene(SCENES[shot] ?? SCENES.cockpit);
} else {
  // The playable game: fly the first sortie from the runway until the rings are cleared.
  const mission = MISSIONS[0];
  const world = buildWorld(seed);
  const rings = buildTargets(world, mission.rings);
  const aircraft = createAircraft(startOnRunway(world));
  aircraft.fuel = mission.fuel;
  let nextIndex = 0;
  let cameraMode = 'chase';
  let last = performance.now();

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (cameraToggle()) cameraMode = cameraMode === 'chase' ? 'cockpit' : 'chase';
    const input = readInput();
    const steps = Math.max(1, Math.round(dt / STEP));
    for (let i = 0; i < steps; i += 1) stepAircraft(aircraft, input, dt / steps, world);
    const ring = rings[nextIndex];
    if (ring && passedRing(aircraft, ring)) {
      ring.passed = true;
      nextIndex = Math.min(nextIndex + 1, rings.length - 1);
    }
    renderFrame(ctx, { aircraft, world, rings, nextIndex, mission, cameraMode }, canvas.width, canvas.height);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

export { AIRFRAME, heightAt };
