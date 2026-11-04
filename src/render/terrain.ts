import * as THREE from 'three';
import { smooth } from '../noise';
import type { Obstacle, RockObstacle, TreeObstacle } from '../types';
import type { World } from '../world';

const C = (h: string) => new THREE.Color(h);
const G_A = C('#5d7d38'),
  G_B = C('#7d9645'),
  G_DRY = C('#a7a05c'),
  ROCK = C('#7a766d'),
  DIRT = C('#8f5d38'),
  PACKED = C('#76482a'),
  LEAF_A = C('#24452b'),
  LEAF_B = C('#3d6233');
const terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const trunkMat = new THREE.MeshLambertMaterial({ color: '#5b4030' });
const leafMat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
const rockMat = new THREE.MeshStandardMaterial({
  color: '#8c8981',
  roughness: 1,
  flatShading: true,
});
const postMat = new THREE.MeshLambertMaterial({ color: '#ff7a1a' });
const trunkGeo = new THREE.CylinderGeometry(0.16, 0.26, 1, 5).translate(0, 0.5, 0);
const leafGeo = new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0);
const rockGeo = new THREE.IcosahedronGeometry(1, 0);
const postGeo = new THREE.CylinderGeometry(0.05, 0.05, 1, 5).translate(0, 0.5, 0);
const UP = new THREE.Vector3(0, 1, 0),
  _M = new THREE.Matrix4(),
  _Q = new THREE.Quaternion(),
  _S = new THREE.Vector3(),
  _P = new THREE.Vector3(),
  _C = new THREE.Color(),
  _E = new THREE.Euler();

export const CHUNK = 64;
const RES = 64;

export interface Quality {
  radius: number;
  low: boolean;
}

type Placed<T> = T & { y: number };

function instanced<T>(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  list: T[],
  fn: (m: THREE.InstancedMesh, t: T, i: number) => void,
) {
  const m = new THREE.InstancedMesh(geo, mat, list.length);
  list.forEach((t, i) => fn(m, t, i));
  m.castShadow = true;
  m.computeBoundingSphere();
  return m;
}

interface Chunk {
  cx: number;
  cz: number;
  g: THREE.Group;
  dispose(): void;
}

export function createTerrain(scene: THREE.Scene, W: World, quality: Quality) {
  const chunks = new Map<string, Chunk>(),
    TW = W.TW;

  function surfColor(x: number, z: number, ny: number, out: THREE.Color) {
    const d = W.trailDist(x, z),
      n = W.noise(x * 0.03 + 9, z * 0.03),
      n2 = W.noise(x * 0.21, z * 0.21);
    out.copy(G_A).lerp(G_B, 0.5 + 0.5 * n);
    if (n2 > 0.2) out.lerp(G_DRY, Math.min(1, (n2 - 0.2) * 2.5) * 0.7);
    if (ny < 0.84) out.lerp(ROCK, smooth(0.84, 0.64, ny));
    const tr = 1 - smooth(TW - 0.4, TW + 1.1, d);
    if (tr > 0) out.lerp(W.jumpH(z, d) !== 0 ? PACKED : DIRT, tr * (0.9 + 0.1 * n2));
  }

  function build(cx: number, cz: number): Chunk {
    const N = RES,
      st = CHUNK / N,
      x0 = cx * CHUNK,
      z0 = cz * CHUNK,
      Wd = N + 3,
      H = new Float32Array(Wd * Wd);
    for (let j = 0; j < Wd; j++)
      for (let i = 0; i < Wd; i++) H[j * Wd + i] = W.heightAt(x0 + (i - 1) * st, z0 + (j - 1) * st);
    const vc = (N + 1) * (N + 1),
      pos = new Float32Array(vc * 3),
      nor = new Float32Array(vc * 3),
      col = new Float32Array(vc * 3);
    for (let j = 0, k = 0; j <= N; j++)
      for (let i = 0; i <= N; i++, k++) {
        const x = x0 + i * st,
          z = z0 + j * st,
          hi = (j + 1) * Wd + (i + 1);
        const nx = -(H[hi + 1] - H[hi - 1]) / (2 * st),
          nz = -(H[hi + Wd] - H[hi - Wd]) / (2 * st),
          il = 1 / Math.hypot(nx, 1, nz);
        pos[k * 3] = x;
        pos[k * 3 + 1] = H[hi];
        pos[k * 3 + 2] = z;
        nor[k * 3] = nx * il;
        nor[k * 3 + 1] = il;
        nor[k * 3 + 2] = nz * il;
        surfColor(x, z, il, _C);
        col[k * 3] = _C.r;
        col[k * 3 + 1] = _C.g;
        col[k * 3 + 2] = _C.b;
      }
    const idx = new Uint16Array(N * N * 6);
    for (let j = 0, p = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const a = j * (N + 1) + i,
          b = a + 1,
          c = a + N + 1,
          d = c + 1;
        idx.set([a, c, b, b, c, d], p);
        p += 6;
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    const g = new THREE.Group(),
      mesh = new THREE.Mesh(geo, terrainMat);
    mesh.receiveShadow = true;
    g.add(mesh);

    const trees: Placed<TreeObstacle>[] = [],
      rocks: Placed<RockObstacle>[] = [],
      posts: { x: number; y: number; z: number }[] = [],
      n = CHUNK / W.CELL;
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const o: Obstacle | null = W.scatterCell(cx * n + i, cz * n + j);
        if (!o) continue;
        const y = W.heightAt(o.x, o.z);
        if (o.tree) trees.push({ ...o, y });
        else rocks.push({ ...o, y });
      }
    for (let z = Math.ceil(z0 / 18) * 18; z < z0 + CHUNK; z += 18) {
      const tx = W.trailX(z),
        dx = W.trailDX(z),
        sec = Math.sqrt(1 + dx * dx);
      for (const side of [-1, 1]) {
        const x = tx + side * (TW + 0.9) * sec;
        if (x >= x0 && x < x0 + CHUNK) posts.push({ x, y: W.heightAt(x, z), z });
      }
    }
    if (trees.length) {
      g.add(
        instanced(trunkGeo, trunkMat, trees, (m, t, i) => {
          _Q.setFromAxisAngle(UP, t.rot);
          _M.compose(_P.set(t.x, t.y - 0.2, t.z), _Q, _S.set(t.s, 1.8 * t.s, t.s));
          m.setMatrixAt(i, _M);
        }),
      );
      g.add(
        instanced(leafGeo, leafMat, trees, (m, t, i) => {
          _Q.setFromAxisAngle(UP, t.rot);
          _M.compose(_P.set(t.x, t.y + 1.2 * t.s, t.z), _Q, _S.set(t.w, t.h, t.w));
          m.setMatrixAt(i, _M);
          m.setColorAt(i, _C.copy(LEAF_A).lerp(LEAF_B, t.c));
        }),
      );
    }
    if (rocks.length)
      g.add(
        instanced(rockGeo, rockMat, rocks, (m, t, i) => {
          _Q.setFromEuler(_E.set(t.a, t.a * 1.7, t.a * 0.6));
          _M.compose(_P.set(t.x, t.y, t.z), _Q, _S.set(t.s, t.s * 0.7, t.s * 1.1));
          m.setMatrixAt(i, _M);
        }),
      );
    if (posts.length)
      g.add(
        instanced(postGeo, postMat, posts, (m, t, i) => {
          _M.compose(_P.set(t.x, t.y, t.z), _Q.identity(), _S.set(1, 1.1, 1));
          m.setMatrixAt(i, _M);
        }),
      );
    return {
      cx,
      cz,
      g,
      dispose() {
        g.traverse((o) => {
          if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
          else if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose();
        });
      },
    };
  }

  function stream(focus: { x: number; z: number }, all: boolean) {
    const pcx = Math.floor(focus.x / CHUNK),
      pcz = Math.floor(focus.z / CHUNK),
      R = quality.radius;
    for (const [key, c] of chunks)
      if (Math.abs(c.cx - pcx) > R + 1 || Math.abs(c.cz - pcz) > R + 1) {
        scene.remove(c.g);
        c.dispose();
        chunks.delete(key);
      }
    for (let pass = 0; pass < (all ? 99 : 1); pass++) {
      let best: [number, number] | null = null,
        bd = 1e9;
      for (let dz = -R; dz <= R; dz++)
        for (let dx = -R; dx <= R; dx++) {
          if (all && (Math.abs(dx) > 1 || Math.abs(dz) > 1)) continue;
          if (chunks.has(pcx + dx + ',' + (pcz + dz))) continue;
          const d = dx * dx + dz * dz - (dz > 0 ? 0.6 : 0);
          if (d < bd) {
            bd = d;
            best = [pcx + dx, pcz + dz];
          }
        }
      if (!best) return;
      const c = build(best[0], best[1]);
      chunks.set(best.join(','), c);
      scene.add(c.g);
    }
  }

  function clear() {
    for (const c of chunks.values()) {
      scene.remove(c.g);
      c.dispose();
    }
    chunks.clear();
  }
  return { stream, clear };
}

export type Terrain = ReturnType<typeof createTerrain>;
