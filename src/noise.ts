export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smooth = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const wrap = (a: number): number => a - Math.PI * 2 * Math.round(a / (Math.PI * 2));
export const angDiff = (a: number, b: number): number => wrap(a - b);

export function hash(n: number): number {
  let h = Math.imul((n | 0) ^ 0x27d4eb2d, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export const hash2 = (a: number, b: number): number =>
  hash(Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663));

function grad(h: number, x: number, y: number): number {
  switch (h & 7) {
    case 0:
      return x + y;
    case 1:
      return -x + y;
    case 2:
      return x - y;
    case 3:
      return -x - y;
    case 4:
      return x;
    case 5:
      return -x;
    case 6:
      return y;
    default:
      return -y;
  }
}
const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);

export type Noise = (x: number, y: number) => number;

export function createNoise(seed = 90210): Noise {
  const perm = new Uint8Array(512);
  let s = ((seed >>> 0) % 2147483646) + 1;
  const p = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) {
    s = (s * 16807) % 2147483647;
    const j = s % (i + 1);
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  return function noise(x, y) {
    const X = Math.floor(x),
      Y = Math.floor(y),
      xf = x - X,
      yf = y - Y,
      xi = X & 255,
      yi = Y & 255,
      u = fade(xf),
      v = fade(yf);
    const aa = perm[perm[xi] + yi],
      ab = perm[perm[xi] + yi + 1],
      ba = perm[perm[xi + 1] + yi],
      bb = perm[perm[xi + 1] + yi + 1];
    return (
      lerp(
        lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u),
        lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u),
        v,
      ) * 0.7
    );
  };
}
