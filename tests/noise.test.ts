import { describe, expect, it } from 'vitest';
import { angDiff, clamp, createNoise, hash, hash2, smooth, wrap } from '../src/noise';

describe('helpers', () => {
  it('clamps', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(clamp(0.4, 0, 1)).toBe(0.4);
  });

  it('smooth is 0 below, 1 above and monotonic between', () => {
    expect(smooth(0, 1, -1)).toBe(0);
    expect(smooth(0, 1, 2)).toBe(1);
    let prev = 0;
    for (let x = 0; x <= 1; x += 0.05) {
      const v = smooth(0, 1, x);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('wraps angles into [-pi, pi]', () => {
    for (const a of [-10, -3.5, 0, 3.5, 10, 100]) {
      const w = wrap(a);
      expect(w).toBeGreaterThanOrEqual(-Math.PI - 1e-9);
      expect(w).toBeLessThanOrEqual(Math.PI + 1e-9);
      expect(Math.cos(w)).toBeCloseTo(Math.cos(a));
    }
    expect(angDiff(0.1, Math.PI * 2 - 0.1)).toBeCloseTo(0.2);
  });
});

describe('hash', () => {
  it('is deterministic and in [0, 1)', () => {
    for (let i = -50; i < 50; i++) {
      const h = hash(i);
      expect(h).toBe(hash(i));
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
    }
    expect(hash2(3, 4)).toBe(hash2(3, 4));
    expect(hash2(3, 4)).not.toBe(hash2(4, 3));
  });
});

describe('createNoise', () => {
  it('is deterministic per seed', () => {
    const a = createNoise(1234),
      b = createNoise(1234);
    for (let i = 0; i < 100; i++) expect(a(i * 0.37, i * 0.91)).toBe(b(i * 0.37, i * 0.91));
  });

  it('differs between seeds', () => {
    const a = createNoise(1),
      b = createNoise(2);
    let diff = 0;
    for (let i = 0; i < 100; i++) if (a(i * 0.37, i * 0.91) !== b(i * 0.37, i * 0.91)) diff++;
    expect(diff).toBeGreaterThan(50);
  });

  it('stays bounded and is continuous', () => {
    const n = createNoise(90210);
    for (let i = 0; i < 2000; i++) {
      const x = i * 0.173,
        y = i * 0.311;
      const v = n(x, y);
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
      expect(Math.abs(n(x + 1e-4, y) - v)).toBeLessThan(0.01);
    }
  });
});
