import type { BikeEvent, LandEvent, LandingGrade, Score, Ui } from './types';

export const COMBO_T = 3.2;
const GRADE: Record<LandingGrade, [number, string]> = {
  perfect: [1.25, 'Clean landing'],
  clean: [1, ''],
  sketchy: [0.5, 'Sketchy'],
};
const REPEAT = [1, 0.6, 0.35, 0.2];

export function createScore(best = 0): Score {
  return { score: 0, combo: 0, mult: 1, timer: 0, best, dist: 0, top: 0, bails: 0, used: {} };
}

function add(S: Score, ui: Ui, name: string, pts: number, multAdd: number, sub: string) {
  const n = S.used[name] || 0;
  S.used[name] = n + 1;
  const r = REPEAT[Math.min(n, REPEAT.length - 1)];
  pts = Math.round(pts * r);
  S.combo += pts;
  S.mult = Math.min(8, S.mult + multAdd * r);
  S.timer = COMBO_T;
  ui.popup(name, '+' + pts.toLocaleString() + (sub ? ' · ' + sub : '') + (n ? ' · repeat' : ''));
}

function landing(S: Score, ui: Ui, ev: LandEvent) {
  const names: string[] = [];
  let pts = 0;
  if (ev.flips) {
    const n = Math.abs(ev.flips);
    names.push(
      (n === 2 ? 'Double ' : n === 3 ? 'Triple ' : n > 3 ? n + '× ' : '') +
        (ev.flips > 0 ? 'Backflip' : 'Frontflip'),
    );
    pts += 700 * n * n;
  }
  if (ev.spins) {
    names.push(String(ev.spins * 360));
    pts += 450 * ev.spins * ev.spins;
  }
  if (ev.air > 0.5) pts += Math.round((ev.air - 0.3) * 150);
  if (!names.length) {
    if (ev.air < 0.75) return;
    names.push(ev.air > 1.8 ? 'Huge air' : 'Air');
  }
  const [m, label] = GRADE[ev.grade];
  pts = Math.round(pts * m);
  add(
    S,
    ui,
    names.join(' + '),
    pts,
    ev.flips || ev.spins ? 1 : 0.5,
    label || ev.air.toFixed(1) + 's air',
  );
}

export function handleEvent(S: Score, ui: Ui, ev: BikeEvent) {
  if (ev.type === 'land') landing(S, ui, ev);
  else if (ev.type === 'tweak')
    add(
      S,
      ui,
      ev.name,
      Math.round(250 + Math.min(ev.time, 1.5) * 500),
      0.5,
      ev.time.toFixed(1) + 's',
    );
  else if (ev.type === 'whip') add(S, ui, 'Whip', 300, 0.5, '');
  else if (ev.type === 'near') add(S, ui, 'Close call', 80, 0.5, 'Threaded it');
  else if (ev.type === 'bail') {
    S.bails++;
    const lost = S.combo > 0;
    S.combo = 0;
    S.mult = 1;
    S.timer = 0;
    S.used = {};
    ui.popup(ev.reason, lost ? 'Combo lost' : '', true);
  }
}

export function bank(S: Score, ui: Ui, save: (best: number) => void) {
  if (S.combo > 0) {
    const total = Math.round(S.combo * S.mult);
    S.score += total;
    ui.popup('Banked +' + total.toLocaleString(), '', false, true);
    if (S.score > S.best) {
      S.best = S.score;
      save(S.best);
    }
  }
  S.combo = 0;
  S.mult = 1;
  S.timer = 0;
  S.used = {};
}

export function tickScore(
  S: Score,
  ui: Ui,
  dt: number,
  grounded: boolean,
  save: (best: number) => void,
) {
  if (grounded && S.combo > 0) {
    S.timer -= dt;
    if (S.timer <= 0) bank(S, ui, save);
  }
}
