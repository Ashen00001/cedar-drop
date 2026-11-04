import * as THREE from 'three';
import { TUNING } from '../physics';
import type { Bike } from '../physics';
import type { Inputs } from '../types';

type P3 = readonly [number, number, number];
type Pose = readonly [number, number, number, number, number, number, number];

const V3 = THREE.Vector3,
  UP = new V3(0, 1, 0);
export const PIV = 1.1;
const NONE: Pose = [0, 0, 0, 0, 0, 0, 0];
const POSE: Pose[] = [
  [-0.25, 0.05, 0, 0, 0.55, 0, -0.25],
  [0, 0.28, 0, -0.35, 0, 0, 0],
  [0, 0.18, -0.42, 1.1, 0, 0, 0],
  [0, 0.12, -0.2, -0.3, 0, 0, 0],
  [0.25, 0.05, 0, 0, -0.55, 0, 0.25],
  [0, 0, 0, 0, 0, 0.9, 0.4],
  [0, -0.22, 0.05, 0.45, 0, 0, 0],
  [0, 0.3, -0.1, 0.2, 0, 0, 0],
];

export function createRider(scene: THREE.Scene) {
  const root = new THREE.Group(),
    lean = new THREE.Group(),
    pivot = new THREE.Group();
  root.add(lean);
  lean.add(pivot);
  scene.add(root);

  const lam = (c: string) => new THREE.MeshLambertMaterial({ color: c });
  const frame = lam('#2ec4b6'),
    dark = lam('#1d2126'),
    tire = lam('#191919'),
    rim = lam('#b9bcc0'),
    jersey = lam('#ff7a1a'),
    pants = lam('#2b3440'),
    helmet = lam('#f2efe6'),
    glove = lam('#20262e'),
    pack = lam('#3b4a3f');

  const tube = (parent: THREE.Object3D, a: P3, b: P3, r: number, mat: THREE.Material, dy = 0) => {
    const A = new V3(a[0], a[1] + dy, a[2]),
      B = new V3(b[0], b[1] + dy, b[2]);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, A.distanceTo(B), 7), mat);
    m.position.copy(A).add(B).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(UP, B.clone().sub(A).normalize());
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  const box = (parent: THREE.Object3D, s: P3, p: P3, mat: THREE.Material, dy = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...s), mat);
    m.position.set(p[0], p[1] + dy, p[2]);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  const wheel = (z: number) => {
    const w = new THREE.Group();
    w.position.set(0, 0.41, z);
    const t = new THREE.Mesh(
      new THREE.TorusGeometry(0.37, 0.058, 8, 24).rotateY(Math.PI / 2),
      tire,
    );
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.016, 5, 24).rotateY(Math.PI / 2), rim);
    t.castShadow = true;
    w.add(t, r);
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.6, 0.012), rim);
      s.rotation.x = (i * Math.PI) / 4;
      w.add(s);
    }
    lean.add(w);
    return w;
  };
  const wheelR = wheel(-0.56),
    wheelF = wheel(0.58);
  const bb: P3 = [0, 0.36, -0.02],
    seat: P3 = [0, 0.9, -0.22],
    head: P3 = [0, 0.98, 0.4],
    headLo: P3 = [0, 0.82, 0.45],
    ra: P3 = [0, 0.41, -0.56],
    fa: P3 = [0, 0.41, 0.58];
  tube(lean, bb, headLo, 0.036, frame);
  tube(lean, seat, head, 0.03, frame);
  tube(lean, bb, seat, 0.034, frame);
  for (const x of [-0.06, 0.06]) {
    tube(lean, [x, bb[1], bb[2]], [x, ra[1], ra[2]], 0.022, frame);
    tube(lean, [x, seat[1] - 0.05, seat[2]], [x, ra[1], ra[2]], 0.02, frame);
  }
  for (const x of [-0.07, 0.07]) tube(lean, [x, head[1], head[2]], [x, fa[1], fa[2]], 0.03, dark);
  tube(lean, head, [0, 1.08, 0.36], 0.025, dark);
  tube(lean, [-0.37, 1.08, 0.36], [0.37, 1.08, 0.36], 0.017, dark);
  box(lean, [0.11, 0.04, 0.24], [0, 0.94, -0.25], dark);
  box(lean, [0.07, 0.07, 0.2], [0, 0.55, -0.25], dark);

  const dy = -PIV;
  for (const sx of [-1, 1]) {
    const foot: P3 = [sx * 0.14, 0.42, 0.02],
      knee: P3 = [sx * 0.17, 0.8, 0.2],
      hip: P3 = [sx * 0.11, 1.04, -0.12];
    tube(pivot, foot, knee, 0.055, pants, dy);
    tube(pivot, knee, hip, 0.068, pants, dy);
    box(pivot, [0.09, 0.07, 0.22], [foot[0], foot[1] - 0.02, foot[2] + 0.02], dark, dy);
    const sh: P3 = [sx * 0.19, 1.4, 0.13],
      el: P3 = [sx * 0.28, 1.21, 0.28],
      hand: P3 = [sx * 0.33, 1.08, 0.36];
    tube(pivot, sh, el, 0.05, jersey, dy);
    tube(pivot, el, hand, 0.042, jersey, dy);
    box(pivot, [0.07, 0.07, 0.08], hand, glove, dy);
  }
  tube(pivot, [0, 1.02, -0.12], [0, 1.42, 0.12], 0.14, jersey, dy);
  box(pivot, [0.26, 0.3, 0.12], [0, 1.28, -0.1], pack, dy);
  const hm = new THREE.Mesh(new THREE.SphereGeometry(0.155, 14, 10), helmet);
  hm.position.set(0, 1.6 + dy, 0.24);
  hm.castShadow = true;
  pivot.add(hm);
  box(pivot, [0.2, 0.05, 0.12], [0, 1.62, 0.38], dark, dy);
  pivot.position.y = PIV;

  let wheelRot = 0,
    wheelV = 0,
    turnT = 0,
    rollS = 0;

  function update(b: Bike, inp: Pick<Inputs, 'lean'>, dt: number) {
    const k = 1 - Math.exp(-14 * dt);
    if (b.state === 'ride') {
      root.position.set(b.B.x - b.U.x * 0.41, b.B.y - b.U.y * 0.41, b.B.z - b.U.z * 0.41);
      root.quaternion.set(b.q.x, b.q.y, b.q.z, b.q.w);
      if (!b.inAir && b.contact[1]) wheelV = b.vLong;
      else wheelV *= Math.exp(-0.6 * dt);
      wheelF.position.y = 0.41 + Math.min(b.comp[0], TUNING.travel + 0.04);
      wheelR.position.y = 0.41 + Math.min(b.comp[1], TUNING.travel + 0.04);
    }
    wheelRot += (wheelV * dt) / 0.43;
    wheelF.rotation.x = wheelR.rotation.x = wheelRot;
    const P: Pose = b.state === 'ride' && b.inAir && b.tIdx >= 0 ? POSE[b.tIdx] : NONE,
      m = P === NONE ? 0 : Math.min(1, Math.hypot(b.tx, b.ty));
    const roll = P[6] * m;
    rollS += (roll - rollS) * k;
    lean.rotation.z = rollS;
    turnT += (P[5] * m - turnT) * k;
    const wy = -b.whip * 0.8 + turnT;
    lean.rotation.y = wy;
    lean.position.set(-0.58 * Math.sin(wy), 0, 0.58 - 0.58 * Math.cos(wy));
    if (pivot.parent === lean) {
      pivot.position.x += (P[0] * m - pivot.position.x) * k;
      pivot.position.y += (PIV + (b.e - TUNING.eRest) * 0.95 + P[1] * m - pivot.position.y) * k;
      pivot.position.z += (b.lo * 0.9 + P[2] * m - pivot.position.z) * k;
      const tilt = (TUNING.eRest - b.e) * 0.6 + (b.inAir ? 0 : inp.lean * 0.18) + P[3] * m;
      pivot.rotation.x += (tilt - pivot.rotation.x) * k;
      pivot.rotation.z += (P[4] * m - pivot.rotation.z) * k;
      pivot.rotation.y = b.whip * 0.45;
    }
  }

  function reattach() {
    if (pivot.parent !== lean) lean.add(pivot);
    pivot.position.set(0, PIV, 0);
    pivot.quaternion.identity();
  }

  return { root, lean, pivot, update, reattach };
}

export type Rider = ReturnType<typeof createRider>;
