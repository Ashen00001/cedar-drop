import { clamp, wrap } from './noise';
import type { BikeEvent, Inputs, Quat, Surface, Vec3 } from './types';
import type { World } from './world';

export const TUNING = {
  g: 9.81,
  half: 0.57,
  hubDrop: 0.25,
  R: 0.42,
  k: 50,
  c: 6,
  cRebound: 22,
  damperScale: 0.5,
  maxPull: -2,
  minForce: -3,
  bumpStart: 0.3,
  kBump: 600,
  drag: 0.06,
  rollFric: { dirt: 0.5, grass: 1.8, rock: 0.9 } satisfies Record<Surface, number>,
  accelMin: 1.8,
  accelMax: 6,
  accelRef: 7,
  pedalFadeStart: 13,
  pedalFadeEnd: 18,
  maxSteer: 20,
  steerFalloff: 0.4,
  steerFallStart: 2,
  steerRate: 2.5,
  wheelbase: 1.2,
  yawFollow: 8,
  grip: 25,
  slideGrip: 5,
  slipStart: 2,
  slipFull: 10,
  gripRecover: 5,
  slideYaw: 5,
  leanPitch: 7,
  leanCurve: 2.5,
  manualDamp: 3,
  accelPitch: 0.08,
  flipAccel: 15,
  spinAccel: 15,
  angDrag: 2,
  sideBail: 60,
  yawRate: 6.5,
  yawResp: 10,
  yawStop: 10,
  pitchRate: 4.8,
  pitchResp: 8,
  pitchStop: 5,
  leanFromG: 0.85,
  rollK: 57,
  rollDamp: 10,
  landAbsorb: 0.55,
  stickTime: 0.4,
  stickDamp: 3,
  stickVel: 0.6,
  airWindow: 0.5,
  minMult: 0.25,
  levelGain: 4,
  levelRamp: 3,
  levelStart: 0.5,
  hopSmooth: 0.15,
  hopMaxSpeed: 5,
  hopForce: 2,
  hopPitch: 1.2,
  coyote: 0.05,
  pump: 0.25,
  hopPulse: 0.25,
  impact: { x: 100, y: 500, z: 250 },
  impactSpeed: 7.5,
  head: { x: 0, y: 1.0, z: 0.05 },
  chest: { x: 0, y: 0.55, z: -0.05 },
  eRest: 0.6,
  travel: 0.3,
};

export interface Bike {
  world: World;
  p: Vec3;
  v: Vec3;
  vPrev: Vec3;
  q: Quat;
  w: Vec3;
  F: Vec3;
  U: Vec3;
  Rt: Vec3;
  B: Vec3;
  gUp: Vec3;
  gF: Vec3;
  gR: Vec3;
  readonly C: Vec3;
  readonly vC: Vec3;
  psi: number;
  th: number;
  thRel: number;
  tapT: number;
  load: number;
  spinRamp: number;
  tx: number;
  ty: number;
  tIdx: number;
  tT: number;
  whipV: number;
  roll: number;
  landT: number;
  leanG: number;
  upS: Vec3;
  gp: number;
  hs: number;
  hsV: number;
  hopPulseT: number;
  hopping: boolean;
  hopDir: Vec3;
  hopK: number;
  steer: number;
  grip: number;
  ng: number;
  contact: [boolean, boolean];
  comp: [number, number];
  anyC: boolean;
  inAir: boolean;
  airT: number;
  sinceRear: number;
  flipAxis: Vec3;
  multP: number;
  multS: number;
  hadP: number;
  hadS: number;
  pt: number;
  st: number;
  stMax: number;
  spinV: number;
  latchP: number;
  latchS: number;
  lvl: number;
  landN: Vec3;
  predT: number;
  e: number;
  lo: number;
  whip: number;
  vLong: number;
  slip: number;
  surface: Surface;
  onTrail: boolean;
  state: 'ride' | 'bail';
  reason: string;
  events: BikeEvent[];
  lastNear: number;
  aLong: number;
}

const DEG = Math.PI / 180,
  RAYS = [-1.25, -0.85, -0.45, 0, 0.45, 0.85, 1.25];
const invLerp = (a: number, b: number, x: number) => clamp((x - a) / (b - a), 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const V = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
const Q = (): Quat => ({ x: 0, y: 0, z: 0, w: 1 });
const set = (o: Vec3, x: number, y: number, z: number): Vec3 => {
  o.x = x;
  o.y = y;
  o.z = z;
  return o;
};
const cp = (o: Vec3, a: Vec3) => set(o, a.x, a.y, a.z);
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3, o: Vec3) =>
  set(o, a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const len = (a: Vec3) => Math.hypot(a.x, a.y, a.z);
const norm = (a: Vec3) => {
  const l = len(a) || 1;
  a.x /= l;
  a.y /= l;
  a.z /= l;
  return a;
};
const addS = (o: Vec3, a: Vec3, s: number) => {
  o.x += a.x * s;
  o.y += a.y * s;
  o.z += a.z * s;
  return o;
};

function qRot(q: Quat, v: Vec3, o: Vec3): Vec3 {
  const ix = q.w * v.x + q.y * v.z - q.z * v.y,
    iy = q.w * v.y + q.z * v.x - q.x * v.z,
    iz = q.w * v.z + q.x * v.y - q.y * v.x,
    iw = -q.x * v.x - q.y * v.y - q.z * v.z;
  return set(
    o,
    ix * q.w - iw * q.x - iy * q.z + iz * q.y,
    iy * q.w - iw * q.y - iz * q.x + ix * q.z,
    iz * q.w - iw * q.z - ix * q.y + iy * q.x,
  );
}

function qPre(r: Quat, q: Quat): Quat {
  const x = r.x * q.w + r.w * q.x + r.y * q.z - r.z * q.y,
    y = r.y * q.w + r.w * q.y + r.z * q.x - r.x * q.z,
    z = r.z * q.w + r.w * q.z + r.x * q.y - r.y * q.x,
    w = r.w * q.w - r.x * q.x - r.y * q.y - r.z * q.z;
  const l = Math.hypot(x, y, z, w) || 1;
  q.x = x / l;
  q.y = y / l;
  q.z = z / l;
  q.w = w / l;
  return q;
}

function qAxis(a: Vec3, ang: number, o: Quat): Quat {
  const s = Math.sin(ang / 2);
  o.x = a.x * s;
  o.y = a.y * s;
  o.z = a.z * s;
  o.w = Math.cos(ang / 2);
  return o;
}

function qFromTo(a: Vec3, b: Vec3, o: Quat): Quat {
  let r = dot(a, b) + 1;
  if (r < 1e-6) {
    r = 0;
    if (Math.abs(a.x) > Math.abs(a.z)) {
      o.x = -a.y;
      o.y = a.x;
      o.z = 0;
    } else {
      o.x = 0;
      o.y = -a.z;
      o.z = a.y;
    }
  } else {
    o.x = a.y * b.z - a.z * b.y;
    o.y = a.z * b.x - a.x * b.z;
    o.z = a.x * b.y - a.y * b.x;
  }
  o.w = r;
  const l = Math.hypot(o.x, o.y, o.z, o.w) || 1;
  o.x /= l;
  o.y /= l;
  o.z /= l;
  o.w /= l;
  return o;
}

const _ax = V();
function qScale(q: Quat, t: number, o: Quat): Quat {
  const ang = 2 * Math.acos(clamp(q.w, -1, 1)),
    s = Math.sqrt(Math.max(0, 1 - q.w * q.w));
  if (s < 1e-6 || ang < 1e-6) {
    o.x = 0;
    o.y = 0;
    o.z = 0;
    o.w = 1;
    return o;
  }
  return qAxis(set(_ax, q.x / s, q.y / s, q.z / s), ang * t, o);
}

const X1 = V(1, 0, 0),
  XN = V(-1, 0, 0),
  Y1 = V(0, 1, 0),
  Z1 = V(0, 0, 1);

export function createBike(world: World): Bike {
  return {
    world,
    p: V(),
    v: V(),
    vPrev: V(),
    q: Q(),
    w: V(),
    F: V(),
    U: V(),
    Rt: V(),
    B: V(),
    gUp: V(0, 1, 0),
    gF: V(0, 0, 1),
    gR: V(-1, 0, 0),
    get C() {
      return this.p;
    },
    get vC() {
      return this.v;
    },
    psi: 0,
    th: 0,
    thRel: 0,
    tapT: 0,
    load: 0,
    spinRamp: 0,
    tx: 0,
    ty: 0,
    tIdx: -1,
    tT: 0,
    whipV: 0,
    roll: 0,
    landT: 9,
    leanG: 0,
    upS: V(0, 1, 0),
    gp: 0,
    hs: 0,
    hsV: 0,
    hopPulseT: 0,
    hopping: false,
    hopDir: V(),
    hopK: 0,
    steer: 0,
    grip: TUNING.grip,
    ng: 1,
    contact: [false, false],
    comp: [0, 0],
    anyC: true,
    inAir: false,
    airT: 0,
    sinceRear: 0,
    flipAxis: V(-1, 0, 0),
    multP: 1,
    multS: 1,
    hadP: 0,
    hadS: 0,
    pt: 0,
    st: 0,
    stMax: 0,
    spinV: 0,
    latchP: 0,
    latchS: 0,
    lvl: 0,
    landN: V(0, 1, 0),
    predT: 0,
    e: TUNING.eRest,
    lo: 0,
    whip: 0,
    vLong: 0,
    slip: 0,
    surface: 'dirt',
    onTrail: true,
    state: 'ride',
    reason: '',
    events: [],
    lastNear: -1,
    aLong: 0,
  };
}

function axes(b: Bike) {
  qRot(b.q, Z1, b.F);
  qRot(b.q, Y1, b.U);
  qRot(b.q, XN, b.Rt);
}

function refresh(b: Bike) {
  axes(b);
  b.psi = Math.atan2(b.F.x, b.F.z);
  b.th = Math.asin(clamp(b.F.y, -1, 1));
  set(
    b.B,
    b.p.x - b.U.x * TUNING.hubDrop,
    b.p.y - b.U.y * TUNING.hubDrop,
    b.p.z - b.U.z * TUNING.hubDrop,
  );
}

export function resetBike(b: Bike, x: number, z: number, heading: number, speed: number) {
  const T = TUNING,
    W = b.world,
    n = W.normalAt(x, z, V());
  const th = Math.atan(-(n.x * Math.sin(heading) + n.z * Math.cos(heading)) / n.y),
    qa = Q();
  qAxis(X1, -th, b.q);
  qPre(qAxis(Y1, heading, qa), b.q);
  axes(b);
  const y = W.heightAt(x, z) + (T.R + T.hubDrop - 0.1) / Math.cos(th);
  set(b.p, x, y, z);
  set(b.v, b.F.x * speed, b.F.y * speed, b.F.z * speed);
  cp(b.vPrev, b.v);
  set(b.w, 0, 0, 0);
  Object.assign(b, {
    hs: 0,
    hsV: 0,
    hopPulseT: 0,
    hopping: false,
    steer: 0,
    grip: T.grip,
    ng: 1,
    anyC: true,
    inAir: false,
    airT: 0,
    sinceRear: 0,
    pt: 0,
    st: 0,
    spinV: 0,
    lvl: 0,
    state: 'ride',
    reason: '',
    lo: 0,
    whip: 0,
    whipV: 0,
    roll: 0,
    landT: 9,
    leanG: 0,
    tx: 0,
    ty: 0,
    tIdx: -1,
    tT: 0,
  });
  b.contact[0] = b.contact[1] = true;
  b.events.length = 0;
  refresh(b);
}

function bail(b: Bike, reason: string) {
  if (b.state !== 'ride') return;
  b.state = 'bail';
  b.reason = reason;
  b.events.push({ type: 'bail', reason });
}

function takeoff(b: Bike, inp: Inputs) {
  b.inAir = true;
  b.airT = 0;
  b.pt = 0;
  b.st = 0;
  b.stMax = 0;
  b.tIdx = -1;
  b.tT = 0;
  b.multP = 1;
  b.multS = 1;
  b.hadP = 0;
  b.hadS = 0;
  b.lvl = TUNING.levelStart;
  b.predT = 0;
  cp(b.flipAxis, b.Rt);
  b.latchP = Math.abs(inp.flip) > 0.2 ? 1 : 0;
  b.events.push({ type: 'takeoff' });
}

function land(b: Bike) {
  const T = TUNING;
  if (Math.hypot(b.tx, b.ty) > 0.5) {
    endTweak(b);
    return bail(b, 'Still tweaking');
  }
  endTweak(b);
  const n = b.gUp,
    sp = len(b.v),
    air = b.airT;
  const tilt = Math.acos(clamp(dot(b.U, n), -1, 1));
  const vh = Math.hypot(b.v.x, b.v.z);
  const yawErr = vh > 1 ? Math.abs(wrap(Math.atan2(b.v.x, b.v.z) - b.psi)) : 0;
  const clean =
    air > 1 && tilt < 20 * DEG && yawErr < 15 * DEG && sp > 0.1 && Math.abs(dot(b.v, n)) / sp < 0.4;
  if (yawErr > T.sideBail * DEG && yawErr < Math.PI - 0.6 && sp > 5)
    return bail(b, 'Landed sideways');
  const vn = dot(b.v, n);
  if (vn < 0) {
    addS(b.v, n, -vn * T.landAbsorb);
    addS(b.vPrev, n, -vn * T.landAbsorb);
  }
  b.landT = 0;
  b.events.push({
    type: 'land',
    air,
    flips: Math.round(b.pt / (Math.PI * 2)),
    spins: Math.floor((Math.abs(b.st) + 0.25 * Math.PI * 2) / (Math.PI * 2)),
    fakie: Math.abs(wrap(b.st)) > Math.PI / 2,
    clean,
    grade: clean ? 'perfect' : 'clean',
    impact: -dot(b.v, n),
    thRel: b.thRel,
  });
  b.spinV = 0;
}

export const TWEAKS = [
  'Nac-nac',
  'Heel clicker',
  'Superman',
  'Seat grab',
  'Can-can',
  'Turndown',
  'Tuck no-hander',
  'No-footer',
] as const;

function endTweak(b: Bike) {
  if (b.tIdx >= 0 && b.tT > 0.15)
    b.events.push({ type: 'tweak', name: TWEAKS[b.tIdx], idx: b.tIdx, time: b.tT });
  b.tIdx = -1;
  b.tT = 0;
}

function tweaks(b: Bike, inp: Inputs, dt: number) {
  const x = inp.trickX || 0,
    y = inp.trickY || 0,
    m = Math.hypot(x, y),
    k = 1 - Math.exp(-10 * dt);
  b.tx += (x - b.tx) * k;
  b.ty += (y - b.ty) * k;
  if (m > 0.5) {
    const idx = (Math.round(Math.atan2(y, x) / (Math.PI / 4)) + 8) % 8;
    if (idx !== b.tIdx) {
      endTweak(b);
      b.tIdx = idx;
    }
    b.tT += dt;
  } else if (b.tIdx >= 0) endTweak(b);
}

function predictLanding(b: Bike): boolean {
  const W = b.world,
    T = TUNING,
    p = { x: b.p.x, y: b.p.y, z: b.p.z },
    v = { x: b.v.x, y: b.v.y, z: b.v.z },
    h = 0.05,
    off = T.R + T.hubDrop;
  for (let i = 0; i < 60; i++) {
    v.y -= T.g * h;
    p.x += v.x * h;
    p.y += v.y * h;
    p.z += v.z * h;
    if (p.y - off <= W.heightAt(p.x, p.z)) {
      W.normalAt(p.x, p.z, b.landN);
      return true;
    }
  }
  set(b.landN, 0, 1, 0);
  return false;
}

const _h = V(),
  _d = V(),
  _P = V(),
  _n = V(),
  _ns = V(),
  _best = V(),
  _r = V(),
  _vp = V(),
  _t = V(),
  _t2 = V(),
  _q = Q(),
  _q2 = Q(),
  _a = V(),
  _bp = V();

function wheels(b: Bike, dt: number): boolean {
  const T = TUNING,
    W = b.world;
  let any = false,
    sumF = 0;
  set(b.gUp, 0, 0, 0);
  for (let i = 0; i < 2; i++) {
    const sg = i === 0 ? 1 : -1;
    set(
      _h,
      b.p.x + b.F.x * T.half * sg - b.U.x * T.hubDrop,
      b.p.y + b.F.y * T.half * sg - b.U.y * T.hubDrop,
      b.p.z + b.F.z * T.half * sg - b.U.z * T.hubDrop,
    );
    let best = 0;
    set(_ns, 0, 0, 0);
    for (const a of RAYS) {
      const ca = Math.cos(a),
        sa = Math.sin(a);
      set(_d, -b.U.x * ca + b.F.x * sa, -b.U.y * ca + b.F.y * sa, -b.U.z * ca + b.F.z * sa);
      set(_P, _h.x + _d.x * T.R, _h.y + _d.y * T.R, _h.z + _d.z * T.R);
      const gy = W.heightAt(_P.x, _P.z);
      if (_P.y > gy + 0.05) continue;
      W.normalAt(_P.x, _P.z, _n);
      const comp = -(_P.y - gy) * _n.y;
      if (comp <= 0) continue;
      addS(_ns, _n, comp);
      if (comp > best) {
        best = comp;
        cp(_best, _P);
      }
    }
    if (best <= 0) {
      b.contact[i] = false;
      b.comp[i] = 0;
      continue;
    }
    norm(_ns);
    set(_r, _best.x - b.p.x, _best.y - b.p.y, _best.z - b.p.z);
    cross(b.w, _r, _vp);
    addS(_vp, b.v, 1);
    const VZ = Math.max(-dot(_vp, _ns) * T.damperScale, T.maxPull);
    let Fm =
      best * T.k + VZ * (VZ > 0 ? T.c : T.cRebound * (b.landT < T.stickTime ? T.stickDamp : 1));
    if (best > T.bumpStart) Fm += (best - T.bumpStart) * T.kBump;
    Fm = Math.max(Fm, T.minForce);
    Fm *=
      lerp(1, 0.6, invLerp(0.7, 1, Math.abs(dot(_ns, b.Rt)))) *
      (1 + Math.max(-0.75, b.load || 0) * 0.3);
    addS(b.v, _ns, Fm * dt);
    addS(_r, b.Rt, -dot(_r, b.Rt));
    cross(_r, set(_t, _ns.x * Fm, _ns.y * Fm, _ns.z * Fm), _t2);
    addS(b.w, _t2, dt);
    addS(b.gUp, _ns, 1);
    b.contact[i] = true;
    b.comp[i] = best;
    sumF += Math.max(0, Fm);
    any = true;
    if (i === 1) {
      const onTrail = W.trailDist(_best.x, _best.z) < W.TW + 0.4;
      b.onTrail = onTrail;
      b.surface = _ns.y < 0.8 ? 'rock' : onTrail ? 'dirt' : 'grass';
    }
  }
  b.ng += (clamp(sumF / T.g, 0, 1) - b.ng) * Math.min(1, 5 * dt);
  if (any) {
    norm(b.gUp);
    cross(b.gUp, b.Rt, b.gF);
    norm(b.gF);
    cross(b.gF, b.gUp, b.gR);
  } else {
    set(b.gUp, 0, 1, 0);
    set(b.gF, b.F.x, 0, b.F.z);
    norm(b.gF);
    cross(b.gF, b.gUp, b.gR);
  }
  return any;
}

function rotateWorld(b: Bike, axis: Vec3, ang: number, pivot: Vec3 | null) {
  qAxis(axis, ang, _q);
  if (pivot) {
    set(_t, b.p.x - pivot.x, b.p.y - pivot.y, b.p.z - pivot.z);
    qRot(_q, _t, _t2);
    set(b.p, pivot.x + _t2.x, pivot.y + _t2.y, pivot.z + _t2.z);
  }
  qPre(_q, b.q);
}

function obstacles(b: Bike) {
  const W = b.world,
    C = W.CELL,
    x = b.p.x,
    z = b.p.z,
    gx0 = Math.floor(x / C),
    gz0 = Math.floor(z / C),
    sp = len(b.v),
    bottom = b.p.y - 0.7;
  for (let gz = gz0 - 1; gz <= gz0 + 1; gz++)
    for (let gx = gx0 - 1; gx <= gx0 + 1; gx++) {
      const o = W.scatterCell(gx, gz);
      if (!o) continue;
      const ex = x - o.x,
        ez = z - o.z;
      if (Math.abs(ex) > 3.5 || Math.abs(ez) > 3.5) continue;
      const y = W.heightAt(o.x, o.z),
        top = o.tree ? y + 1.2 * o.s + o.h : y + o.s * 0.55;
      if (bottom > top) continue;
      const dd = ex * ex + ez * ez,
        rr = o.r + 0.35;
      if (dd < rr * rr) {
        if (sp > 4.5) {
          bail(b, o.tree ? 'Hugged a tree' : 'Hit a rock');
          return;
        }
        const d = Math.sqrt(dd) || 1e-3,
          nx = ex / d,
          nz = ez / d;
        b.p.x = o.x + nx * rr;
        b.p.z = o.z + nz * rr;
        const vn = b.v.x * nx + b.v.z * nz;
        if (vn < 0) {
          b.v.x -= nx * vn;
          b.v.z -= nz * vn;
        }
      } else if (o.tree && dd < (rr + 1.1) ** 2 && o.id !== b.lastNear && sp > 9) {
        b.lastNear = o.id;
        b.events.push({ type: 'near' });
      }
    }
}

function bodyHits(b: Bike): boolean {
  const W = b.world,
    T = TUNING;
  for (const pt of [T.head, T.chest]) {
    qRot(b.q, pt, _bp);
    addS(_bp, b.p, 1);
    if (_bp.y < W.heightAt(_bp.x, _bp.z)) return true;
  }
  return false;
}

export function stepBike(b: Bike, inp: Inputs, dt: number) {
  if (b.state !== 'ride') return;
  const T = TUNING;
  axes(b);
  cp(b.vPrev, b.v);

  if (inp.hop) b.hopPulseT = T.hopPulse;
  if (inp.hopTap && b.tapT <= 0) b.tapT = 0.24;
  const target =
    b.tapT > 0.12 ? -1 : b.tapT > 0 || b.hopPulseT > 0 ? 1 : clamp(-inp.bodyY * 1.7, -1, 1);
  b.hopPulseT -= dt;
  b.tapT -= dt;
  const prevHs = b.hs;
  {
    const st = T.hopSmooth,
      om = 2 / st,
      x = om * dt,
      ex = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x),
      mx = T.hopMaxSpeed * st;
    const ch = clamp(b.hs - target, -mx, mx),
      tmp = (b.hsV + om * ch) * dt;
    b.hsV = (b.hsV - om * tmp) * ex;
    b.hs = b.hs - ch + (ch + tmp) * ex;
  }
  const dState = b.hs - prevHs;
  const rate = dState / dt;
  b.load = clamp((b.hs < 0 ? rate : -rate) * T.pump, -1.5, 1.5);

  if (!b.hopping && b.hs < -0.25 && target > 0.75 && (b.anyC || b.sinceRear < T.coyote)) {
    b.hopping = true;
    set(b.hopDir, lerp(b.gUp.x, 0, 0.4), lerp(b.gUp.y, 1, 0.4), lerp(b.gUp.z, 0, 0.4));
    norm(b.hopDir);
    let k = T.hopForce / Math.max(1, dot(b.v, b.hopDir)) ** 2;
    if (!b.contact[0]) k *= 0.85;
    if (!b.contact[1]) k *= 0.55;
    b.hopK = k;
    addS(b.w, b.Rt, T.hopPitch);
    b.events.push({ type: 'hop' });
  }
  if (b.hopping) {
    if (b.hs < 0) addS(b.v, b.hopDir, 10 * b.hopK * dt);
    else b.hopping = false;
  }

  b.v.y -= T.g * dt;
  const any = wheels(b, dt);
  b.anyC = any;
  if (any && b.landT < T.stickTime) {
    const vn = dot(b.v, b.gUp);
    if (vn > T.stickVel) {
      addS(b.v, b.gUp, T.stickVel - vn);
      addS(b.vPrev, b.gUp, T.stickVel - vn);
    }
  }
  addS(b.v, b.v, -T.drag * dt);

  const gU = b.gUp,
    gF = b.gF,
    gR = b.gR;
  b.gp = Math.asin(clamp(gF.y, -1, 1));
  b.thRel = wrap(b.th - b.gp);
  if (any) {
    const vz = dot(b.v, gF),
      vx = dot(b.v, gR),
      sp = len(b.v),
      brake = inp.brake * inp.brake;
    const sr = T.steerRate * (Math.abs(inp.steerRaw) < 0.05 && b.grip > 0.95 * T.grip ? 2 : 1);
    b.steer += clamp(inp.steerRaw - b.steer, -sr * dt, sr * dt);
    const fall =
      1 /
      (1 +
        T.steerFalloff * Math.pow(Math.max(Math.abs(vz) - T.steerFallStart, 0) / (1 + brake), 1.1));
    const delta = b.steer * T.maxSteer * fall * lerp(1, 0.5, Math.abs(b.hs)) * DEG;
    const yaw = ((-vz * Math.tan(delta)) / T.wheelbase) * (1 + brake);
    const skid = invLerp(T.grip, T.slideGrip, b.grip),
      kin = 1 - Math.min(skid * 1.75, 1);
    if (kin > 0 && b.contact[1]) {
      set(_a, b.p.x - b.F.x * T.half, b.p.y - b.F.y * T.half, b.p.z - b.F.z * T.half);
      rotateWorld(b, gU, yaw * kin * dt, _a);
    }
    b.leanG +=
      (clamp(-Math.atan2(vz * yaw, T.g) * T.leanFromG, -0.9, 0.9) - b.leanG) * Math.min(1, 8 * dt);
    const lu = Math.min(1, 5 * dt);
    b.upS.x += (gU.x - b.upS.x) * lu;
    b.upS.y += (gU.y - b.upS.y) * lu;
    b.upS.z += (gU.z - b.upS.z) * lu;
    norm(b.upS);
    const leanNow = -Math.asin(clamp(dot(b.Rt, b.upS), -1, 1));
    if (Math.abs(leanNow) < Math.PI / 2) addS(b.w, b.F, (b.leanG - leanNow) * T.rollK * dt);
    const wr = dot(b.w, b.F);
    addS(b.w, b.F, -wr * Math.min(1, T.rollDamp * dt));
    const wy = dot(b.w, gU);
    if (kin < 1) addS(b.w, gU, (yaw - wy) * (1 - kin) * Math.min(1, T.yawFollow * dt));
    if (Math.abs(inp.bodyX) > 0.2) addS(b.w, gU, -inp.bodyX * T.slideYaw * dt);
    const slip = lerp(Math.abs(vx), sp, clamp(brake + Math.abs(inp.bodyX) * 0.5, 0, 1));
    let gT = lerp(T.grip, T.slideGrip, invLerp(T.slipStart, T.slipFull, slip));
    if (Math.abs(inp.bodyX) > 0.5) gT = T.slideGrip;
    b.grip = gT < b.grip ? gT : b.grip + (gT - b.grip) * Math.min(1, T.gripRecover * dt);
    const G = b.grip * b.ng;
    const wy2 = dot(b.w, gU);
    addS(
      b.w,
      gU,
      -Math.sign(wy2) * Math.min(Math.abs(wy2), (0.5 * G + 0.5 * G * Math.abs(wy2)) * dt),
    );
    const dvx = Math.sign(vx) * Math.min(Math.abs(vx), (0.5 * G + 0.5 * G * Math.abs(vx)) * dt);
    addS(b.v, gR, -dvx);
    const rr = 0.5 * T.rollFric[b.surface],
      Hd = lerp(rr, b.grip, brake);
    const dvz =
      Math.sign(vz) * Math.min(Math.abs(vz), (Hd + 0.17 * (Hd - rr) * Math.abs(vz)) * b.ng * dt);
    addS(b.v, gF, -dvz);
    let aLong = -dvz / dt;
    if (b.contact[1] && inp.throttle > 0) {
      const r = clamp(1 - Math.abs(vz) / T.accelRef, 0, 1),
        a =
          lerp(T.accelMin, T.accelMax, r * r) *
          (1 - invLerp(T.pedalFadeStart, T.pedalFadeEnd, sp)) *
          inp.throttle;
      addS(b.v, gF, a * dt);
      aLong += a;
    }
    b.aLong = aLong;
    if (b.load) addS(b.v, gF, -b.load * T.g * gF.y * b.ng * dt);
    const lc = Math.sign(inp.lean) * Math.abs(inp.lean) ** T.leanCurve;
    addS(b.w, b.Rt, (-T.leanPitch * lc + T.accelPitch * aLong) * dt);
    if (b.contact[0] !== b.contact[1]) {
      const wp = dot(b.w, b.Rt);
      addS(b.w, b.Rt, -wp * (1 - Math.exp(-T.manualDamp * dt)));
    }
    b.vLong = vz;
    b.slip = Math.abs(vx);
    b.whip = 0;
    b.roll *= Math.exp(-10 * dt);
    b.landT += dt;
    b.tx *= Math.exp(-12 * dt);
    b.ty *= Math.exp(-12 * dt);
  } else {
    b.airT += dt;
    if (Math.abs(inp.flip) < 0.2) b.latchP = 0;
    const fi = b.latchP && inp.kbFlip ? 0 : inp.flip,
      si = inp.steerRaw;
    const comboP = lerp(1, 0.8, Math.abs(fi) * Math.abs(si)),
      comboS = lerp(1, 0.8, Math.abs(fi) * Math.abs(si));
    const wp = dot(b.w, b.Rt),
      pIn = Math.abs(fi) > 0.15;
    const wpT = pIn ? -fi * T.pitchRate * comboP : 0,
      wpN = wp + (wpT - wp) * (1 - Math.exp(-(pIn ? T.pitchResp : T.pitchStop) * dt));
    addS(b.w, b.Rt, wpN - wp);
    const wo = dot(b.w, b.Rt);
    set(_t, b.w.x - b.Rt.x * wo, b.w.y - b.Rt.y * wo, b.w.z - b.Rt.z * wo);
    addS(b.w, _t, -Math.min(1, T.angDrag * dt));
    const yr = Math.abs(si) > 0.15;
    b.spinV +=
      (-si * T.yawRate * comboS - b.spinV) * (1 - Math.exp(-(yr ? T.yawResp : T.yawStop) * dt));
    rotateWorld(b, b.U, b.spinV * dt, null);
    b.pt += wpN * dt;
    b.st += b.spinV * dt;
    const ast = Math.abs(b.st);
    b.stMax = Math.max(b.stMax, ast);
    if (b.stMax > 0.5 && ast < 0.15 && b.stMax < Math.PI) {
      b.stMax = 0;
      b.events.push({ type: 'whip' });
    }
    b.predT -= dt;
    if (b.predT <= 0) {
      predictLanding(b);
      b.predT = 0.04;
    }
    b.lvl += (1 - Math.min(1, Math.abs(fi)) - b.lvl) * Math.min(1, T.levelRamp * dt);
    axes(b);
    const ang = Math.acos(clamp(dot(b.U, b.landN), -1, 1));
    if (ang > 1e-3 && ang < Math.PI / 2) {
      qFromTo(b.U, b.landN, _q2);
      qScale(_q2, Math.min(1, T.levelGain * b.lvl * dt), _q);
      qPre(_q, b.q);
      qRot(_q, b.w, _t);
      cp(b.w, _t);
    }
    tweaks(b, inp, dt);
    b.sinceRear += dt;
  }

  axes(b);
  const wl = len(b.w);
  if (wl > 1e-6) {
    set(_t, b.w.x / wl, b.w.y / wl, b.w.z / wl);
    qPre(qAxis(_t, wl * dt, _q), b.q);
  }
  axes(b);
  addS(b.p, b.v, dt);

  if (any) {
    if (b.inAir && b.airT > 0.1) land(b);
    b.inAir = false;
    b.airT = 0;
    b.sinceRear = b.contact[1] ? 0 : b.sinceRear + dt;
  } else if (!b.inAir) {
    axes(b);
    takeoff(b, inp);
  }

  b.e = T.eRest + 0.2 * b.hs;
  b.lo += (inp.lean * 0.15 - b.lo) * (1 - Math.exp(-6 * dt));

  refresh(b);
  if (len(b.vPrev) > T.impactSpeed) {
    set(_a, (b.v.x - b.vPrev.x) / dt, (b.v.y - b.vPrev.y) / dt + T.g, (b.v.z - b.vPrev.z) / dt);
    if (Math.abs(dot(_a, b.Rt)) > T.impact.x) return bail(b, 'Landed sideways');
    if (Math.abs(dot(_a, b.U)) > T.impact.y) return bail(b, 'Too hard');
    if (Math.abs(dot(_a, b.F)) > T.impact.z) return bail(b, 'Cased it');
  }
  const upside = dot(b.U, b.gUp) < 0;
  if ((upside || !any || dot(b.v, b.gF) < -5) && bodyHits(b))
    return bail(b, upside ? (b.th > 0 ? 'Looped out' : 'Over the bars') : 'Head first');
  obstacles(b);
}

export const speedOf = (b: Bike): number => len(b.v);
