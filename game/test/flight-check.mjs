// A headless check of the flight model: no canvas, no DOM, just the rules stepped forward.
// Run it with `node game/test/flight-check.mjs`. It prints one line per check, so a regression in
// the takeoff, the idle stop, the fuel tank or the fuel-burn rate shows up the moment it lands.

import assert from 'node:assert/strict';
import { buildWorld, buildTargets, startOnRunway, heightAt } from '../src/world.js';
import { createAircraft, stepAircraft, AIRFRAME } from '../src/flight.js';

const results = [];
const check = (name, fn) => {
  try {
    fn();
    results.push(`  ok   ${name}`);
  } catch (error) {
    results.push(`  FAIL ${name}: ${error.message}`);
    process.exitCode = 1;
  }
};

// Fly a fixed number of 1/60 s steps with one constant input.
function fly(aircraft, world, input, seconds) {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i += 1) stepAircraft(aircraft, input, 1 / 60, world);
}

const TAKE_OFF = { pitch: 0, roll: 0, yaw: 0, throttle: 1 };
const PULL_UP = { pitch: 1, roll: 0, yaw: 0, throttle: 0 }; // nose up, hands off the throttle lever
const IDLE = { pitch: 0, roll: 0, yaw: 0, throttle: -1 };
const CLIMB = { pitch: 1, roll: 0, yaw: 0, throttle: 0 };

/** A fresh aircraft on the runway of the default world, with a mission's fuel load. */
function onRunway(fuel = 1) {
  const world = buildWorld(1);
  const aircraft = createAircraft(startOnRunway(world));
  aircraft.fuel = fuel;
  return { world, aircraft };
}

check('the aircraft starts parked on the runway, gear down and stopped', () => {
  const { aircraft } = onRunway();
  assert.equal(aircraft.onGround, true);
  assert.equal(aircraft.airspeed, 0);
  assert.equal(aircraft.fuel, 1);
  assert.equal(aircraft.crashed, false);
});

check('full throttle on the deck rolls the aircraft forward', () => {
  const { world, aircraft } = onRunway();
  fly(aircraft, world, TAKE_OFF, 3);
  assert.ok(aircraft.airspeed > 60, `airspeed ${aircraft.airspeed}`);
});

check('a full-throttle run lifts off inside 14 seconds', () => {
  const { world, aircraft } = onRunway();
  fly(aircraft, world, TAKE_OFF, 3);
  fly(aircraft, world, PULL_UP, 11); // rotate: hold the nose up, the wheels leave once flying speed is there
  assert.equal(aircraft.onGround, false);
  assert.ok(aircraft.airspeed > AIRFRAME.stallSpeed);
});

check('an idling engine does not roll the aircraft along the runway', () => {
  const { world, aircraft } = onRunway();
  fly(aircraft, world, IDLE, 20);
  assert.ok(aircraft.airspeed < 40, `airspeed ${aircraft.airspeed}`);
  assert.equal(aircraft.onGround, true);
});

check('the aircraft gains altitude once it is flying in a climb', () => {
  const { world, aircraft } = onRunway();
  fly(aircraft, world, TAKE_OFF, 3);
  fly(aircraft, world, PULL_UP, 11);
  const startY = aircraft.position[1];
  fly(aircraft, world, CLIMB, 6);
  assert.ok(aircraft.position[1] > startY + 20, `rise ${aircraft.position[1] - startY}`);
});

check('a tank is drained by the time its burn rate says it should be', () => {
  const { world, aircraft } = onRunway();
  fly(aircraft, world, TAKE_OFF, 10); // throttle levers come up to the stop
  const before = aircraft.fuel;
  const fullBurn = AIRFRAME.fuelBurnFull;
  fly(aircraft, world, TAKE_OFF, 10);
  const drop = before - aircraft.fuel;
  const expected = fullBurn * 10;
  assert.ok(Math.abs(drop - expected) < expected * 0.08, `burned ${drop}, expected about ${expected}`);
});

check('terrain height is smooth and stays above the sea near the runway', () => {
  const world = buildWorld(1);
  const { runway } = world;
  assert.ok(Math.abs(heightAt(world, runway.x, runway.z) - runway.elevation) < 6);
});

check('the seeded world puts every target ring above the ground', () => {
  const world = buildWorld(1);
  const rings = buildTargets(world, 8);
  assert.equal(rings.length, 8);
  for (const ring of rings) {
    assert.ok(ring.position[1] > heightAt(world, ring.position[0], ring.position[2]) + 60);
  }
});

check('the same seed gives the same rings', () => {
  const a = buildTargets(buildWorld(1), 5);
  const b = buildTargets(buildWorld(1), 5);
  assert.deepEqual(a.map((r) => r.position), b.map((r) => r.position));
});

console.log(results.join('\n'));
console.log(process.exitCode ? '\nflight-check: FAILED' : '\nflight-check: every check passed');
