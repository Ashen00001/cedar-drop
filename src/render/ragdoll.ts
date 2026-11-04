import * as THREE from 'three';
import type { Bike } from '../physics';
import type { Vec3 } from '../types';
import type { World } from '../world';
import type { Rider } from './rider';

const V3 = THREE.Vector3,
  _q = new THREE.Quaternion(),
  _t = new V3(),
  _n: Vec3 = { x: 0, y: 1, z: 0 };
const rnd = (s: number) => (Math.random() * 2 - 1) * s;

interface Body {
  o: THREE.Object3D;
  v: THREE.Vector3;
  w: THREE.Vector3;
  r: number;
}

export function createRagdoll(scene: THREE.Scene, W: World) {
  const bodies: Body[] = [];
  let t = 0;

  function start(rider: Rider, b: Bike) {
    scene.attach(rider.pivot);
    const v = new V3(b.vC.x, b.vC.y, b.vC.z),
      fx = Math.sin(b.psi),
      fz = Math.cos(b.psi);
    bodies.length = 0;
    t = 0;
    bodies.push({
      o: rider.pivot,
      v: v
        .clone()
        .multiplyScalar(0.85)
        .add(new V3(0, 2.4, 0)),
      w: new V3(fz * 7 + rnd(3), rnd(4), -fx * 7 + rnd(3)),
      r: 0.35,
    });
    bodies.push({
      o: rider.root,
      v: v.clone().multiplyScalar(0.6),
      w: new V3(rnd(5), rnd(6), rnd(5)),
      r: 0.3,
    });
  }

  function step(dt: number) {
    t += dt;
    for (const b of bodies) {
      b.v.y -= 9.81 * dt;
      b.o.position.addScaledVector(b.v, dt);
      const wl = b.w.length();
      if (wl > 1e-4) {
        _q.setFromAxisAngle(_t.copy(b.w).divideScalar(wl), wl * dt);
        b.o.quaternion.premultiply(_q);
      }
      const p = b.o.position,
        gy = W.heightAt(p.x, p.z) + b.r;
      if (p.y < gy) {
        p.y = gy;
        W.normalAt(p.x, p.z, _n);
        const vn = b.v.x * _n.x + b.v.y * _n.y + b.v.z * _n.z;
        if (vn < 0) {
          b.v.x -= _n.x * vn * 1.35;
          b.v.y -= _n.y * vn * 1.35;
          b.v.z -= _n.z * vn * 1.35;
        }
        b.v.multiplyScalar(0.9);
        b.w.multiplyScalar(0.86);
      }
    }
  }

  return {
    start,
    step,
    get time() {
      return t;
    },
    get focus(): THREE.Vector3 | undefined {
      return bodies[0]?.o.position;
    },
    get bikePos(): THREE.Vector3 | undefined {
      return bodies[1]?.o.position;
    },
    clear() {
      bodies.length = 0;
    },
  };
}

export type Ragdoll = ReturnType<typeof createRagdoll>;
