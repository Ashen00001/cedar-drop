import * as THREE from 'three';
import { angDiff } from '../noise';
import type { Bike } from '../physics';
import type { World } from '../world';
import type { Rider } from './rider';

export function createCam(camera: THREE.PerspectiveCamera, W: World) {
  const c = { yaw: 0, pos: new THREE.Vector3(), fov: 72, mode: 0 };
  const look = new THREE.Vector3(),
    want = new THREE.Vector3();

  function snap(b: Bike) {
    c.yaw = b.psi;
    c.pos.set(b.C.x - Math.sin(b.psi) * 5, b.C.y + 2, b.C.z - Math.cos(b.psi) * 5);
  }

  function update(dt: number, b: Bike, rider: Rider, focus: THREE.Vector3) {
    let yawT = c.yaw;
    if (b.state === 'ride') {
      if (!b.inAir) yawT = b.psi;
      else {
        const hs = Math.hypot(b.vC.x, b.vC.z);
        if (hs > 1.5) yawT = Math.atan2(b.vC.x, b.vC.z);
      }
    }
    c.yaw += angDiff(yawT, c.yaw) * (1 - Math.exp(-dt * (b.inAir ? 2.5 : 5)));
    const sp = b.state === 'ride' ? Math.hypot(b.vC.x, b.vC.y, b.vC.z) : 0;
    c.fov += (70 + Math.min(20, sp * 0.7) - c.fov) * (1 - Math.exp(-dt * 3));
    if (c.mode === 2 && b.state === 'ride') {
      camera.position.set(0, 1.62, 0.3);
      rider.root.localToWorld(camera.position);
      look.set(0, 1.25, 8);
      rider.root.localToWorld(look);
      camera.lookAt(look);
      c.pos.copy(camera.position);
    } else {
      const far = c.mode === 1,
        dist = far ? 8.5 : 4.8,
        hgt = far ? 3.6 : 2.0;
      want.set(focus.x - Math.sin(c.yaw) * dist, focus.y + hgt, focus.z - Math.cos(c.yaw) * dist);
      const gy = W.heightAt(want.x, want.z) + 0.9;
      if (want.y < gy) want.y = gy;
      c.pos.lerp(want, 1 - Math.exp(-dt * 9));
      const cg = W.heightAt(c.pos.x, c.pos.z) + 0.6;
      if (c.pos.y < cg) c.pos.y = cg;
      camera.position.copy(c.pos);
      look.set(focus.x + Math.sin(c.yaw) * 3, focus.y + 1.1, focus.z + Math.cos(c.yaw) * 3);
      camera.lookAt(look);
    }
    camera.fov = c.fov;
    camera.updateProjectionMatrix();
  }

  return {
    update,
    snap,
    get mode() {
      return c.mode;
    },
    set mode(m: number) {
      c.mode = m;
    },
  };
}

export type Cam = ReturnType<typeof createCam>;
