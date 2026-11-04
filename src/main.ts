import * as THREE from 'three';
import './style.css';
import { createAudio } from './audio';
import { createHud } from './hud';
import { createInput } from './input';
import { createBike, resetBike, speedOf, stepBike } from './physics';
import { createCam } from './render/camera';
import { createRagdoll } from './render/ragdoll';
import { createRider } from './render/rider';
import { createTerrain } from './render/terrain';
import { bank, createScore, handleEvent, tickScore } from './tricks';
import type { Inputs } from './types';
import { createWorld } from './world';

const el = (id: string): HTMLElement => {
  const e = document.getElementById(id);
  if (!e) throw new Error(`missing #${id}`);
  return e;
};
const store = {
  get(k: string): string | null {
    try {
      return localStorage.getItem('cedardrop.' + k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string | number) {
    try {
      localStorage.setItem('cedardrop.' + k, String(v));
    } catch {
      /* storage unavailable */
    }
  },
};

const canvas = el('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const SKY_H = new THREE.Color('#cfdcdc'),
  SKY_Z = new THREE.Color('#4f88bf');
scene.background = SKY_H;
scene.fog = new THREE.Fog(SKY_H, 70, 240);
const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 900);

const dome = (() => {
  const g = new THREE.SphereGeometry(600, 32, 16),
    p = g.attributes.position,
    c = new Float32Array(p.count * 3),
    col = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    col.copy(SKY_H).lerp(SKY_Z, Math.pow(Math.max(0, p.getY(i) / 600), 0.55));
    c[i * 3] = col.r;
    c[i * 3 + 1] = col.g;
    c[i * 3 + 2] = col.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  const m = new THREE.Mesh(
    g,
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
    }),
  );
  m.renderOrder = -1;
  scene.add(m);
  return m;
})();
scene.add(new THREE.HemisphereLight('#e4f0ff', '#56663a', 1.25));
const sun = new THREE.DirectionalLight('#fff0d4', 2.5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 220 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);

const quality = { radius: 3, low: false };
const W = createWorld();
const terrain = createTerrain(scene, W, quality);
const bike = createBike(W);
const rider = createRider(scene);
const rag = createRagdoll(scene, W);
const cam = createCam(camera, W);
const input = createInput();
const audio = createAudio();
const hud = createHud();
const S = createScore(+(store.get('best') ?? 0) || 0);
const saveBest = (v: number) => store.set('best', v);

let running = false,
  paused = false,
  startZ = 0,
  pendingHop = false;

function placeOnTrail(z: number) {
  const f = W.featureAt(z);
  if (f && f.s < f.len + 2) z = f.start + f.len + 4;
  resetBike(bike, W.trailX(z), z, Math.atan2(W.trailDX(z), 1), 4);
  rider.reattach();
  rag.clear();
  rider.update(bike, { lean: 0 }, 0);
}
function newRun() {
  Object.assign(S, { score: 0, combo: 0, mult: 1, timer: 0, dist: 0, top: 0, bails: 0, used: {} });
  placeOnTrail(12);
  startZ = bike.C.z;
  cam.snap(bike);
}
function respawn() {
  const z = (bike.state === 'bail' && rag.bikePos ? rag.bikePos.z : bike.C.z) - 4;
  if (bike.state === 'ride' && S.combo > 0) {
    S.combo = 0;
    S.mult = 1;
    S.used = {};
  }
  placeOnTrail(z);
}

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
function applyQuality(low: boolean) {
  quality.low = low;
  quality.radius = low ? 2 : 3;
  renderer.setPixelRatio(low ? 1 : Math.min(devicePixelRatio, 1.5));
  sun.castShadow = !low;
  const fog = scene.fog as THREE.Fog;
  fog.near = low ? 50 : 70;
  fog.far = low ? 160 : 240;
  resize();
}
addEventListener('resize', resize);

const startEl = el('start'),
  pauseEl = el('pause'),
  lowq = el('lowq') as HTMLInputElement;
lowq.checked = store.get('low') === '1';
lowq.addEventListener('change', () => {
  applyQuality(lowq.checked);
  store.set('low', lowq.checked ? '1' : '0');
});
el('best').textContent = S.best ? 'Best ' + S.best.toLocaleString() : '';

function start() {
  if (running) return;
  audio.init();
  running = true;
  paused = false;
  startEl.hidden = true;
  el('hint').hidden = false;
  canvas.focus();
  setTimeout(() => {
    el('hint').hidden = true;
  }, 15000);
}
function setPaused(p: boolean) {
  if (!running) return;
  paused = p;
  pauseEl.hidden = !p;
  if (p) {
    el('pauseStats').textContent =
      `Score ${S.score.toLocaleString()} · ${(S.dist / 1000).toFixed(2)} km · top ${Math.round(S.top * 3.6)} km/h · ${S.bails} bails · best ${S.best.toLocaleString()}`;
    audio.suspend();
    el('resume').focus();
  } else {
    audio.resume();
    canvas.focus();
  }
}
el('go').addEventListener('click', start);
el('resume').addEventListener('click', () => setPaused(false));
el('restart').addEventListener('click', () => {
  bank(S, hud, saveBest);
  newRun();
  setPaused(false);
});
addEventListener('blur', () => {
  if (running) setPaused(true);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && running) setPaused(true);
});

applyQuality(lowq.checked);
newRun();
terrain.stream(bike.C, true);
el('go').focus();

const auto = location.hash === '#autoride';
function autopilot(i: Inputs) {
  const z = bike.C.z + 3,
    o = bike.C.x - W.trailX(z),
    ht = Math.atan2(W.trailDX(z), 1);
  i.steer = i.steerRaw = Math.max(
    -1,
    Math.min(1, 0.35 * o + 2.5 * Math.atan2(Math.sin(bike.psi - ht), Math.cos(bike.psi - ht))),
  );
  i.throttle = 1;
  if (!running) i.confirm = true;
}

const STEP = 0.01;
let last = performance.now(),
  acc = 0;
function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const inp = input.read(dt);
  if (auto) autopilot(inp);
  if (!running) {
    if (inp.confirm) start();
  } else {
    if (inp.pause) setPaused(!paused);
    if (inp.mute) audio.setMuted(!audio.muted);
    if (inp.cam) cam.mode = (cam.mode + 1) % 3;
  }
  if (running && !paused) {
    acc += dt;
    pendingHop = pendingHop || inp.hop;
    while (acc >= STEP) {
      if (bike.state === 'ride') {
        inp.hop = pendingHop;
        pendingHop = false;
        stepBike(bike, inp, STEP);
        for (const ev of bike.events) {
          handleEvent(S, hud, ev);
          if (ev.type === 'land') audio.thud(Math.min(1, ev.impact / 9));
          if (ev.type === 'bail') {
            audio.thud(1);
            rag.start(rider, bike);
          }
        }
        bike.events.length = 0;
      } else rag.step(STEP);
      acc -= STEP;
    }
    if (bike.state === 'ride') {
      tickScore(S, hud, dt, !bike.inAir, saveBest);
      S.top = Math.max(S.top, speedOf(bike));
      S.dist = Math.max(S.dist, bike.C.z - startZ);
    }
    if (inp.respawn && (bike.state === 'ride' || rag.time > 0.6)) respawn();
    else if (bike.state === 'bail' && rag.time > 2.6) respawn();
  } else acc = 0;

  rider.update(bike, inp, dt);
  const focus = bike.state === 'bail' && rag.focus ? rag.focus : rider.root.position;
  cam.update(dt, bike, rider, focus);
  sun.position.set(focus.x + 40, focus.y + 75, focus.z - 28);
  sun.target.position.copy(focus);
  sun.target.updateMatrixWorld();
  dome.position.copy(camera.position);
  terrain.stream(bike.state === 'bail' && rag.bikePos ? rag.bikePos : bike.C, false);
  const sp = speedOf(bike);
  hud.update(S, bike, W, sp, inp);
  audio.update(
    running && !paused && bike.state === 'ride',
    sp,
    !bike.inAir,
    bike.onTrail,
    bike.slip,
  );
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
