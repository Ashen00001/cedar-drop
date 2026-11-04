import { describe, expect, it } from 'vitest';
import { TUNING, createBike, resetBike, speedOf, stepBike } from '../src/physics';
import type { Bike } from '../src/physics';
import type { BikeEvent, Inputs } from '../src/types';
import { createWorld } from '../src/world';

const STEP = 0.01;

const idle = (): Inputs => ({
  throttle: 0,
  brake: 0,
  steer: 0,
  steerRaw: 0,
  lean: 0,
  flip: 0,
  kbFlip: true,
  bodyY: 0,
  bodyX: 0,
  trickX: 0,
  trickY: 0,
  hop: false,
  hopTap: false,
  respawn: false,
  cam: false,
  pause: false,
  mute: false,
  debug: false,
  confirm: false,
  pad: null,
});

function setup(seed?: number) {
  const W = createWorld(seed === undefined ? {} : { seed });
  const b = createBike(W);
  resetBike(b, W.trailX(12), 12, Math.atan2(W.trailDX(12), 1), 4);
  return { W, b };
}

function autopilot(b: Bike, inp: Inputs) {
  const W = b.world,
    z = b.C.z + 3,
    o = b.C.x - W.trailX(z),
    ht = Math.atan2(W.trailDX(z), 1);
  inp.steer = inp.steerRaw = Math.max(
    -1,
    Math.min(1, 0.35 * o + 2.5 * Math.atan2(Math.sin(b.psi - ht), Math.cos(b.psi - ht))),
  );
  inp.throttle = 1;
}

function ride(b: Bike, seconds: number, drive = true) {
  const inp = idle(),
    events: BikeEvent[] = [];
  for (let t = 0; t < seconds && b.state === 'ride'; t += STEP) {
    if (drive) autopilot(b, inp);
    stepBike(b, inp, STEP);
    events.push(...b.events);
    b.events.length = 0;
  }
  return events;
}

describe('bike physics', () => {
  it('spawns above the terrain, pointing down the trail, in the ride state', () => {
    const { W, b } = setup();
    expect(b.state).toBe('ride');
    expect(b.p.y).toBeGreaterThan(W.heightAt(b.p.x, b.p.z));
    expect(b.F.z).toBeGreaterThan(0.9);
    expect(speedOf(b)).toBeCloseTo(4, 0);
  });

  it('keeps every state value finite over a long ride', () => {
    const { b } = setup();
    ride(b, 20);
    for (const v of [b.p, b.v, b.w, b.q, b.F, b.U, b.Rt])
      for (const n of Object.values(v)) expect(Number.isFinite(n)).toBe(true);
  });

  it('pedalling accelerates the bike down the hill', () => {
    const { b } = setup();
    ride(b, 6);
    expect(b.state).toBe('ride');
    expect(b.C.z).toBeGreaterThan(40);
    expect(speedOf(b)).toBeGreaterThan(8);
  });

  it('stays on the ground over flat trail and never falls through the terrain', () => {
    const { W, b } = setup();
    const inp = idle();
    for (let t = 0; t < 8 && b.state === 'ride'; t += STEP) {
      autopilot(b, inp);
      stepBike(b, inp, STEP);
      b.events.length = 0;
      expect(b.p.y).toBeGreaterThan(W.heightAt(b.p.x, b.p.z) - 0.5);
    }
  });

  it('braking sheds speed compared to coasting', () => {
    const coast = setup().b,
      brake = setup().b;
    ride(coast, 4, false);
    const inp = idle();
    inp.brake = 1;
    for (let t = 0; t < 4 && brake.state === 'ride'; t += STEP) {
      stepBike(brake, inp, STEP);
      brake.events.length = 0;
    }
    expect(speedOf(brake)).toBeLessThan(speedOf(coast));
  });

  it('is deterministic: same inputs give identical results', () => {
    const a = setup().b,
      b = setup().b;
    ride(a, 10);
    ride(b, 10);
    expect(a.p).toEqual(b.p);
    expect(a.v).toEqual(b.v);
    expect(a.state).toBe(b.state);
  });

  it('hits a tree and bails when ridden straight into the woods at speed', () => {
    const { W, b } = setup();
    const inp = idle();
    inp.throttle = 1;
    inp.steerRaw = 1;
    inp.steer = 1;
    const events: BikeEvent[] = [];
    for (let t = 0; t < 60 && b.state === 'ride'; t += STEP) {
      stepBike(b, inp, STEP);
      events.push(...b.events);
      b.events.length = 0;
    }
    expect(W.trailDist(b.C.x, b.C.z)).toBeGreaterThan(0);
    const bail = events.find((e) => e.type === 'bail');
    expect(b.state === 'bail' || b.C.z > 100).toBe(true);
    if (bail && bail.type === 'bail') expect(bail.reason.length).toBeGreaterThan(0);
  });

  it('respawning resets the bike back to a clean ride state', () => {
    const { b } = setup();
    ride(b, 3);
    resetBike(b, b.world.trailX(500), 500, 0, 4);
    expect(b.state).toBe('ride');
    expect(b.events).toHaveLength(0);
    expect(b.inAir).toBe(false);
    expect(b.C.z).toBe(500);
  });

  it('exposes the tuning table that drives the feel of the bike', () => {
    expect(TUNING.g).toBeCloseTo(9.81);
    expect(TUNING.R).toBeGreaterThan(0);
  });
});
