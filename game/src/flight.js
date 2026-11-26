// The flight model: throttle, lift, drag, bank and stall. One fixed step per frame, no clock
// inside the physics, so a given input sequence always flies the same path.

import { V3, clamp, rad } from './math3d.js';
import { heightAt } from './world.js';

export const AIRFRAME = {
  maxThrust: 78,        // knots gained per second at full throttle on the deck
  drag: 0.055,          // parasitic drag, per knot of airspeed
  groundDrag: 34,       // knots per second scrubbed by rolling drag: idle settles near a taxi speed
  inducedDrag: 0.000022,
  gravity: 46,          // knots per second of airspeed lost with the nose straight up and no power
  liftFactor: 1.0,
  stallSpeed: 92,
  neverExceed: 430,     // knots: past this the airframe pushes its nose over instead of accelerating
  maxBank: rad(68),
  pitchRate: rad(62),
  rollRate: rad(115),
  yawRate: rad(28),
  groundFriction: 0.72,
  gearBrake: 1.1,
  taxiThrust: 0.34,     // the idle stop: below it the engine barely pulls against rolling drag
  fuelBurnIdle: 0.0012, // fraction of a tank per second at the idle stop
  fuelBurnFull: 0.0062, // and at the throttle stop; a tank lasts about 2.7 minutes flat out
  maxFuel: 1,
};

/** A new aircraft, parked on the runway heading north. */
export function createAircraft(start) {
  return {
    position: start.position.slice(),
    heading: start.heading,
    pitch: 0,
    bank: 0,
    airspeed: 0,           // knots
    verticalSpeed: 0,      // knots, positive up
    throttle: 0,
    fuel: AIRFRAME.maxFuel,
    gearDown: true,
    onGround: true,
    airborne: false,       // set once the wheels leave the deck: onGround alone cannot tell a stopped
                           // aircraft on the strip from one in the air, both are `true`/`false` apart
    stalled: false,
    crashed: false,
    damage: 0,
    altitude: start.position[1],
  };
}

/** How long one second of flight time is: the speed is in knots and the world in metres. */
export const TIME_SCALE = 0.5;
/** The aircraft's forward vector in world space. */
export function forwardVector(state) {
  const cp = Math.cos(state.pitch);
  return [Math.sin(state.heading) * cp, Math.sin(state.pitch), Math.cos(state.heading) * cp];
}

/**
 * Advance the aircraft by `dt` seconds. `input` is the keyboard state: pitch (-1..1), roll (-1..1),
 * yaw (-1..1) and throttle (-1..1, a nudge up or down).
 */
export function stepAircraft(state, input, dt, world) {
  if (state.crashed) return state;
  const A = AIRFRAME;

  // Throttle lever, a nudge per frame rather than a jump.
  state.throttle = clamp(state.throttle + input.throttle * 0.9 * dt, 0, 1);

  const groundHeight = heightAt(world, state.position[0], state.position[2]);
  // The wheels sit 6.5 m over the terrain when the aircraft is on the deck. Once the wheels have
  // left (`airborne`), the aircraft stays in the air until it is back down onto the ground, so a
  // bounce over a ridge does not turn the flight back into a taxi.
  if (state.airborne) {
    state.onGround = state.position[1] <= groundHeight + 6.5;
    if (state.onGround) {
      state.airborne = false;
      state.verticalSpeed = 0;
    }
  } else {
    state.onGround = true;
  }

  if (state.onGround) {
    // On the deck: nose wheel steering, brakes, and no lift until flying speed is reached.
    state.heading += input.yaw * A.yawRate * 0.7 * dt + input.roll * A.rollRate * 0.22 * dt;
    state.pitch *= 0.86;
    state.bank *= 0.86;
    // The engine idles at `taxiThrust`: under the stop the prop only winds down, over it the
    // aircraft pulls forward. Rolling drag is the constant deceleration `groundDrag`, so a throttle
    // left alone taxis slowly and a held one still reaches flying speed.
    const thrust = Math.max(state.throttle, A.taxiThrust) * A.maxThrust;
    const brake = input.pitch < -0.4 ? A.gearBrake * 62 : 0;
    state.airspeed = Math.max(0, state.airspeed + (thrust - brake - A.groundDrag) * dt);
    state.verticalSpeed = 0;
    state.altitude = 0;

    if (state.airspeed > A.stallSpeed + 8 && input.pitch > 0.25) {
      // Rotate: the nose lifts and the wheels leave the deck. This step's own altitude line runs
      // next, below, so the step that takes off is also the first step that climbs.
      state.onGround = false;
      state.airborne = true;
      state.pitch = rad(9);
      state.verticalSpeed = state.airspeed * Math.sin(state.pitch);
    }
  }

  if (!state.onGround) {
    // In the air: the attitude follows the stick, and the aircraft moves along the attitude it
    // ends the step with.
    state.pitch = clamp(state.pitch + input.pitch * A.pitchRate * dt, rad(-58), rad(58));
    state.bank = clamp(state.bank + input.roll * A.rollRate * dt, -A.maxBank, A.maxBank);
    if (Math.abs(input.roll) < 0.05) state.bank *= 1 - 1.6 * dt;

    // A banked aircraft turns; a turning aircraft loses airspeed to induced drag.
    const turn = Math.tan(state.bank) * (A.gravity / Math.max(state.airspeed, 40)) * A.liftFactor;
    state.heading += turn * dt + input.yaw * A.yawRate * dt;

    const climbing = Math.sin(state.pitch);
    // In the air the prop carries the idle stop too, just weaker: a closed throttle still ends in
    // a stall, but a cruise climb does not bleed the wing's last ten knots.
    const thrust = Math.max(state.throttle, A.taxiThrust * 0.55) * A.maxThrust;
    const drag = state.airspeed * A.drag * 2.4 + state.airspeed * state.airspeed * A.inducedDrag * 26;
    const gravityLoss = A.gravity * climbing;
    state.airspeed = Math.max(0, state.airspeed + (thrust - drag - gravityLoss) * dt);
    // Faster than the airframe is rated for, the wing gives up: the nose is pushed over by the
    // excess and the speed bleeds back into a dive rather than a vertical rocket.
    if (state.airspeed > A.neverExceed) {
      state.pitch -= rad(26) * dt;
      state.airspeed = A.neverExceed + (state.airspeed - A.neverExceed) * 0.7;
    }

    state.stalled = state.airspeed < A.stallSpeed;
    if (state.stalled) {
      // A stalled wing drops the nose, hard: the recovery is to dive and build speed.
      state.pitch = Math.max(rad(-52), state.pitch - rad(46) * dt);
      state.verticalSpeed = -Math.max(28, state.airspeed * 0.42);
    } else {
      state.verticalSpeed = state.airspeed * Math.sin(state.pitch);
    }

    // Knots to metres per second, times the game's time scale: the world runs at 1/2 real time, so
    // a 250-knot sortie stays inside the 6 km island and a tank lasts a few minutes.
    const ktToMs = 0.5144 * TIME_SCALE;
    const f = forwardVector(state);
    state.position[0] += f[0] * state.airspeed * ktToMs * dt;
    state.position[1] += state.verticalSpeed * ktToMs * dt;
    state.position[2] += f[2] * state.airspeed * ktToMs * dt;
    state.altitude = state.position[1] - groundHeight;
  }

  state.fuel = clamp(
    state.fuel - (A.fuelBurnIdle + state.throttle * (A.fuelBurnFull - A.fuelBurnIdle)) * dt,
    0,
    1,
  );

  // A wingtip in the terrain ends the sortie.
  const clearance = state.position[1] - groundHeight;
  if (clearance < 4.2 && state.airspeed > 60) {
    state.crashed = true;
    state.damage = 100;
  }

  return state;
}

/** The aircraft's velocity as a world vector, for the chase camera and the trails. */
export function velocityVector(state) {
  const f = forwardVector(state);
  return V3.mul(f, state.airspeed);
}
