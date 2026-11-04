import type { Inputs } from './types';

const DZ = 0.15;
const dz = (v: number) => (Math.abs(v) < DZ ? 0 : (v - Math.sign(v) * DZ) / (1 - DZ));
const BLOCK = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'F3'];

export function createInput() {
  const keys = new Set<string>(),
    edges = new Set<string>();
  let prev: boolean[] = [],
    steerS = 0,
    hopQ = false,
    crouchT = 0;

  addEventListener('keydown', (e) => {
    const tag = (e.target as HTMLElement).tagName;
    if (BLOCK.includes(e.code) && tag !== 'BUTTON' && tag !== 'INPUT') e.preventDefault();
    if (!e.repeat) edges.add(e.code);
    keys.add(e.code);
  });
  addEventListener('keyup', (e) => {
    keys.delete(e.code);
    if (e.code === 'Space') hopQ = true;
  });
  addEventListener('blur', () => keys.clear());

  function pad(): Gamepad | null {
    try {
      for (const g of navigator.getGamepads?.() || []) if (g && g.connected) return g;
    } catch {
      /* gamepad API unavailable */
    }
    return null;
  }

  function read(dt: number): Inputs {
    const k = (c: string) => (keys.has(c) ? 1 : 0);
    const o: Inputs = {
      throttle: k('KeyW'),
      brake: k('KeyS'),
      steer: 0,
      steerRaw: k('KeyD') - k('KeyA'),
      lean: k('KeyE') - k('KeyQ'),
      flip: k('KeyW') - k('KeyS'),
      kbFlip: true,
      bodyY: k('Space'),
      bodyX: 0,
      trickX: k('ArrowRight') - k('ArrowLeft'),
      trickY: k('ArrowUp') - k('ArrowDown'),
      hop: false,
      hopTap: false,
      respawn: edges.has('KeyR'),
      cam: edges.has('KeyC'),
      pause: edges.has('Escape') || edges.has('KeyP'),
      mute: edges.has('KeyM'),
      debug: edges.has('F3'),
      confirm: edges.has('Enter'),
      pad: null,
    };
    let crouching = !!o.bodyY,
      released = hopQ;
    hopQ = false;
    let analog = false;
    const g = pad();
    if (g) {
      const ax = (i: number) => g.axes[i] || 0,
        bt = (i: number) => g.buttons[i] || { pressed: false, value: 0 },
        edge = (i: number) => bt(i).pressed && !prev[i];
      const std = g.mapping === 'standard' || g.axes.length < 6;
      const lx = dz(ax(0)),
        ly = dz(ax(1)),
        rx = dz(std ? ax(2) : ax(3)),
        ry = dz(std ? ax(3) : ax(4));
      const trig = (i: number) => (g.axes.length > 5 ? Math.max(0, (ax(i) + 1) / 2) : 0);
      if (lx) {
        o.steerRaw = lx;
        analog = true;
      }
      if (ly) {
        o.lean = -ly;
        o.flip = -ly;
        o.kbFlip = false;
      }
      if (rx || ry) {
        o.trickX = rx;
        o.trickY = -ry;
      }
      o.throttle = Math.max(o.throttle, bt(7).value, bt(7).pressed ? 1 : 0, std ? 0 : trig(5));
      o.brake = Math.max(o.brake, bt(6).value, bt(6).pressed ? 1 : 0, std ? 0 : trig(2));
      if (bt(0).pressed) {
        o.bodyY = 1;
        crouching = true;
      } else if (prev[0]) released = true;
      if (edge(3)) o.respawn = true;
      if (edge(8)) o.cam = true;
      if (edge(9)) o.pause = true;
      if (edge(9) || edge(0)) o.confirm = true;
      prev = g.buttons.map((b) => b.pressed);
      o.pad = {
        id: g.id,
        mapping: g.mapping,
        axes: g.axes.map((v) => v.toFixed(2)),
        buttons: g.buttons.map((b, i) => (b.pressed ? i : -1)).filter((i) => i >= 0),
      };
    }
    if (crouching) crouchT += dt;
    if (released && !crouching) {
      o.hop = true;
      o.hopTap = crouchT < 0.12;
      crouchT = 0;
    }
    steerS = analog ? o.steerRaw : steerS + (o.steerRaw - steerS) * (1 - Math.exp(-dt * 9));
    o.steer = steerS;
    edges.clear();
    return o;
  }
  return { read };
}
