type AudioCtor = typeof AudioContext;

export function createAudio() {
  let AC: AudioContext | null = null,
    master: GainNode,
    windG: GainNode,
    windF: BiquadFilterNode,
    rollG: GainNode,
    rollF: BiquadFilterNode,
    skidG: GainNode,
    brown: AudioBuffer,
    muted = false;

  function init() {
    if (AC) {
      void AC.resume?.();
      return;
    }
    try {
      const Ctor: AudioCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: AudioCtor }).webkitAudioContext;
      AC = new Ctor();
    } catch {
      return;
    }
    const ctx = AC;
    const len = ctx.sampleRate * 2;
    brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const white = ctx.createBuffer(1, len, ctx.sampleRate);
    const b = brown.getChannelData(0),
      w = white.getChannelData(0);
    let l = 0;
    for (let i = 0; i < len; i++) {
      const r = Math.random() * 2 - 1;
      w[i] = r;
      l = (l + 0.02 * r) / 1.02;
      b[i] = l * 3.5;
    }
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.8;
    master.connect(ctx.destination);
    const loop = (buf: AudioBuffer, type: BiquadFilterType, f: number, q?: number) => {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      const fl = ctx.createBiquadFilter();
      fl.type = type;
      fl.frequency.value = f;
      if (q) fl.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      s.connect(fl).connect(g).connect(master);
      s.start();
      return [fl, g] as const;
    };
    [windF, windG] = loop(white, 'bandpass', 500, 0.6);
    [rollF, rollG] = loop(brown, 'lowpass', 260);
    [, skidG] = loop(white, 'highpass', 2500);
  }

  function thud(p: number) {
    if (!AC || p < 0.05) return;
    const s = AC.createBufferSource(),
      f = AC.createBiquadFilter(),
      g = AC.createGain(),
      t = AC.currentTime;
    s.buffer = brown;
    f.type = 'lowpass';
    f.frequency.value = 170;
    s.connect(f).connect(g).connect(master);
    g.gain.setValueAtTime(p * 1.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    s.start(t, Math.random());
    s.stop(t + 0.4);
  }

  function update(ride: boolean, speed: number, grounded: boolean, onTrail: boolean, slip: number) {
    if (!AC) return;
    const t = AC.currentTime,
      sp = ride ? speed : 0;
    windG.gain.setTargetAtTime(Math.min(0.3, (sp / 24) ** 2 * 0.3), t, 0.15);
    windF.frequency.setTargetAtTime(300 + sp * 45, t, 0.2);
    rollG.gain.setTargetAtTime(ride && grounded ? Math.min(0.7, (sp / 14) * 0.6) : 0, t, 0.05);
    rollF.frequency.setTargetAtTime(onTrail ? 220 + sp * 8 : 420 + sp * 12, t, 0.1);
    skidG.gain.setTargetAtTime(
      ride && grounded && slip > 2.2 ? Math.min(0.12, (slip - 2.2) * 0.05) : 0,
      t,
      0.05,
    );
  }

  return {
    init,
    thud,
    update,
    suspend: () => void AC?.suspend?.(),
    resume: () => void AC?.resume?.(),
    setMuted(m: boolean) {
      muted = m;
      if (master) master.gain.value = m ? 0 : 0.8;
    },
    get muted() {
      return muted;
    },
  };
}

export type GameAudio = ReturnType<typeof createAudio>;
