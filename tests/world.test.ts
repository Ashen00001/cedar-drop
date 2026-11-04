import { describe, expect, it } from 'vitest';
import { CELL, TW, createWorld } from '../src/world';

describe('world generation', () => {
  const W = createWorld();

  it('is deterministic for a given seed and differs across seeds', () => {
    const a = createWorld({ seed: 7 }),
      b = createWorld({ seed: 7 }),
      c = createWorld({ seed: 8 });
    expect(a.heightAt(12.3, 456.7)).toBe(b.heightAt(12.3, 456.7));
    expect(a.trailX(300)).toBe(b.trailX(300));
    expect(a.trailX(300)).not.toBe(c.trailX(300));
  });

  it('descends along the trail', () => {
    const h0 = W.heightAt(W.trailX(0), 0),
      h1 = W.heightAt(W.trailX(2000), 2000);
    expect(h1).toBeLessThan(h0 - 50);
  });

  it('trail derivative matches a numeric derivative', () => {
    for (const z of [0, 100, 555, 1200, 3000]) {
      const e = 0.01;
      const num = (W.trailX(z + e) - W.trailX(z - e)) / (2 * e);
      expect(W.trailDX(z)).toBeCloseTo(num, 4);
    }
  });

  it('height field is continuous', () => {
    for (let i = 0; i < 500; i++) {
      const x = W.trailX(i * 7) + ((i % 9) - 4) * 2,
        z = i * 7;
      expect(Math.abs(W.heightAt(x + 0.01, z) - W.heightAt(x, z))).toBeLessThan(0.1);
      expect(Math.abs(W.heightAt(x, z + 0.01) - W.heightAt(x, z))).toBeLessThan(0.1);
    }
  });

  it('normals are unit length and point up', () => {
    const n = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < 300; i++) {
      W.normalAt(i * 3.1 - 200, i * 5.3, n);
      expect(Math.hypot(n.x, n.y, n.z)).toBeCloseTo(1, 6);
      expect(n.y).toBeGreaterThan(0);
    }
  });

  it('has no jumps before the first feature, then repeats them on a fixed period', () => {
    expect(W.featureAt(W.J0 - 1)).toBeNull();
    expect(W.jumpH(W.J0 - 1, 0)).toBe(0);
    const f = W.featureAt(W.J0 + 1);
    expect(f).not.toBeNull();
    expect(f?.start).toBe(W.J0);
    expect(W.featureAt(W.J0 + W.JP + 1)?.start).toBe(W.J0 + W.JP);
  });

  it('only raises jump height on the trail, never far from it', () => {
    const z = W.J0 + 30;
    expect(W.jumpH(z, 0)).toBeGreaterThanOrEqual(0);
    expect(W.jumpH(z, TW + 5)).toBe(0);
  });

  it('keeps 14m around the start of the trail clear and never puts trees on the trail', () => {
    for (let gz = -5; gz < 10; gz++)
      for (let gx = -40; gx < 40; gx++) {
        const o = W.scatterCell(gx, gz);
        if (o && o.z < 40) expect(W.trailDist(o.x, o.z)).toBeGreaterThanOrEqual(14);
      }
    let seen = 0;
    for (let gz = 40; gz < 400; gz++)
      for (let gx = -60; gx < 60; gx++) {
        const o = W.scatterCell(gx, gz);
        if (!o) continue;
        seen++;
        expect(W.trailDist(o.x, o.z)).toBeGreaterThan(TW);
        expect(o.x).toBeGreaterThanOrEqual(gx * CELL);
        expect(o.x).toBeLessThan((gx + 1) * CELL);
      }
    expect(seen).toBeGreaterThan(100);
  });

  it('scatter is deterministic', () => {
    for (let i = 0; i < 100; i++) {
      expect(W.scatterCell(i, i * 3)).toEqual(W.scatterCell(i, i * 3));
    }
  });
});
