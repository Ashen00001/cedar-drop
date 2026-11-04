import { createNoise, hash, hash2, smooth } from './noise';
import type { Feature, Obstacle, Vec3 } from './types';

export const TW = 3.0;
export const CELL = 4;
export const FEATURES = ['rollers', 'kicker', 'table', 'gap'] as const;

export interface WorldOptions {
  seed?: number;
  curves?: number;
  steep?: number;
  stunts?: number;
}

export function createWorld(opts: WorldOptions = {}) {
  const seed = opts.seed ?? 90210,
    curves = opts.curves ?? 0.5,
    steep = opts.steep ?? 0.5,
    stunts = opts.stunts ?? 0.5;
  const noise = createNoise(seed);
  const so = seed === 90210 ? 0 : hash(seed) * 1000,
    hs = Math.imul(seed | 0, 2654435761) | 0;
  const A = 0.4 + curves * 1.2,
    SLOPE = 0.08 + steep * 0.2,
    J0 = 140,
    JP = Math.round(140 - stunts * 90),
    JS = 0.6 + stunts * 0.8;
  const h2 = (a: number, b: number) => hash2(a + hs, b - hs);

  const trailX = (z: number) =>
    A *
    (34 * Math.sin(z * 0.0105 + so) +
      17 * Math.sin(z * 0.0237 + 1.3 + so * 1.7) +
      7 * Math.sin(z * 0.057 + 2.1 + so * 0.3));
  const trailDX = (z: number) =>
    A *
    (34 * 0.0105 * Math.cos(z * 0.0105 + so) +
      17 * 0.0237 * Math.cos(z * 0.0237 + 1.3 + so * 1.7) +
      7 * 0.057 * Math.cos(z * 0.057 + 2.1 + so * 0.3));
  const trailDDX = (z: number) =>
    -A *
    (34 * 0.0105 * 0.0105 * Math.sin(z * 0.0105 + so) +
      17 * 0.0237 * 0.0237 * Math.sin(z * 0.0237 + 1.3 + so * 1.7) +
      7 * 0.057 * 0.057 * Math.sin(z * 0.057 + 2.1 + so * 0.3));
  const trailDist = (x: number, z: number) => {
    const d = trailDX(z);
    return Math.abs(x - trailX(z)) / Math.sqrt(1 + d * d);
  };
  const macro = (x: number, z: number) =>
    -SLOPE * z + 14 * noise(x * 0.004 + 7.1, z * 0.004) + 5 * noise(x * 0.011, z * 0.011 + 3.3);

  function featureAt(z: number): Feature | null {
    if (z < J0) return null;
    const idx = Math.floor((z - J0) / JP),
      s = z - J0 - idx * JP,
      r = hash(idx * 7 + 3 + hs);
    const H = (1.5 + hash(idx * 13 + 1 + hs) * 1.7) * JS,
      L = 2.4 * H;
    const type = r < 0.15 ? 0 : r < 0.45 ? 1 : r < 0.75 ? 2 : 3;
    return { idx, s, type, name: FEATURES[type], H, L, start: J0 + idx * JP, len: 60 };
  }

  function jumpH(z: number, d: number): number {
    if (z < J0) return 0;
    const idx = Math.floor((z - J0) / JP),
      s = z - J0 - idx * JP;
    if (s > 60) return 0;
    const m = 1 - smooth(TW - 0.5, TW + 1.3, d);
    if (m <= 0) return 0;
    const r = hash(idx * 7 + 3 + hs),
      H = (1.5 + hash(idx * 13 + 1 + hs) * 1.7) * JS,
      L = 2.4 * H;
    let h = 0;
    if (r < 0.15) {
      if (s < 40) {
        const q = Math.sin((s * Math.PI) / 8);
        h = 0.75 * q * q * JS;
      }
    } else if (s < L) h = H * (s / L) * (s / L);
    else if (r < 0.45) {
      if (s < L + 3) h = H * (1 - (s - L) / 3);
    } else if (r < 0.75) {
      const T = 5 + H * 2,
        K = 5.5 * H;
      if (s < L + T) h = H;
      else if (s < L + T + K) h = H * (1 - (s - L - T) / K);
    } else {
      const G = 2 + H * 0.9,
        K = 6 * H,
        a = L + 1.2,
        b = a + G,
        c = b + 1.2;
      if (s < a) h = H - ((H + 0.4) * (s - L)) / 1.2;
      else if (s < b) h = -0.4;
      else if (s < c) h = -0.4 + ((0.9 * H + 0.4) * (s - b)) / 1.2;
      else if (s < c + K) h = 0.9 * H * (1 - (s - c) / K);
    }
    return h * m;
  }

  function heightAt(x: number, z: number): number {
    const tx = trailX(z),
      dx = trailDX(z),
      o = x - tx,
      d = Math.abs(o) / Math.sqrt(1 + dx * dx);
    const far = smooth(TW, 50, d);
    const nat =
      macro(x, z) +
      far * (10 * noise(x * 0.018 + 11, z * 0.018) + 3 * noise(x * 0.05 + 3, z * 0.05)) +
      0.9 * noise(x * 0.09, z * 0.09 + 5) +
      0.25 * noise(x * 0.33, z * 0.33);
    if (d > TW + 16) return nat;
    const berm =
      Math.min(1.6, Math.max(0, -o * trailDDX(z) * 14)) * (1 - smooth(TW + 0.5, TW + 4, d));
    const trail = macro(tx, z) + 0.15 * noise(z * 0.13, 1.7) + berm + jumpH(z, d);
    return trail + (nat - trail) * smooth(TW * 0.85, TW + 16, d);
  }

  function normalAt(x: number, z: number, out: Vec3): Vec3 {
    const e = 0.35,
      hx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e),
      hz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
    const il = 1 / Math.hypot(hx, 1, hz);
    out.x = -hx * il;
    out.y = il;
    out.z = -hz * il;
    return out;
  }

  function scatterCell(gx: number, gz: number): Obstacle | null {
    const h1 = h2(gx, gz);
    const x = (gx + 0.05 + h2(gx + 31, gz) * 0.9) * CELL,
      z = (gz + 0.05 + h2(gx, gz + 57) * 0.9) * CELL;
    const td = trailDist(x, z);
    if (z < 40 && td < 14) return null;
    const dens = 0.3 + 0.42 * noise(x * 0.012 + 40, z * 0.012);
    if (h1 < dens * smooth(TW + 4, TW + 14, td) && td > TW + 4) {
      const s = 0.75 + h2(gx + 5, gz + 9) * 0.7;
      return {
        tree: true,
        id: gx * 100003 + gz,
        x,
        z,
        s,
        w: (1.5 + h2(gx + 2, gz + 3) * 0.8) * s,
        h: (6 + h2(gx + 8, gz + 1) * 3.5) * s,
        c: h2(gx + 4, gz + 4),
        rot: h1 * 40,
        r: 0.3 * s,
      };
    }
    if (h1 > 0.972 && td > TW + 1.2) {
      const s = 0.5 + h2(gx + 6, gz + 6) * 1.1;
      return { tree: false, id: gx * 100003 + gz, x, z, s, a: h1 * 90, r: s * 0.85 };
    }
    return null;
  }

  return {
    seed,
    noise,
    opts: { seed, curves, steep, stunts },
    TW,
    CELL,
    J0,
    JP,
    trailX,
    trailDX,
    trailDDX,
    trailDist,
    macro,
    jumpH,
    featureAt,
    heightAt,
    normalAt,
    scatterCell,
  };
}

export type World = ReturnType<typeof createWorld>;
