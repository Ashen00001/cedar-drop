import { TUNING } from './physics';
import type { Bike } from './physics';
import { COMBO_T } from './tricks';
import type { Inputs, Score, Ui } from './types';
import type { World } from './world';

const el = (id: string): HTMLElement => {
  const e = document.getElementById(id);
  if (!e) throw new Error(`missing #${id}`);
  return e;
};

export interface Hud extends Ui {
  update(S: Score, b: Bike, W: World, speed: number, inp: Inputs): void;
}

export function createHud(): Hud {
  const h = {
    score: el('score'),
    combo: el('combo'),
    comboPts: el('comboPts'),
    mult: el('mult'),
    bar: el('barFill'),
    speed: el('speed'),
    dist: el('dist'),
    grade: el('grade'),
    sign: el('sign'),
    pops: el('pops'),
    debug: el('debug'),
  };
  const cache: Record<string, string> = {};
  let gradeS = 0,
    debugOn = false;
  const set = (k: keyof typeof h, v: string) => {
    if (cache[k] !== v) {
      cache[k] = v;
      h[k].textContent = v;
    }
  };

  function popup(title: string, sub?: string, bad?: boolean, mini?: boolean) {
    const d = document.createElement('div');
    d.className = 'pop' + (bad ? ' bad' : '') + (mini ? ' mini' : '');
    const t = document.createElement('div');
    t.textContent = title;
    d.append(t);
    if (sub) {
      const s = document.createElement('small');
      s.textContent = sub;
      d.append(s);
    }
    h.pops.prepend(d);
    setTimeout(() => d.remove(), 1650);
    while (h.pops.children.length > 3) h.pops.lastChild?.remove();
  }

  function update(S: Score, b: Bike, W: World, speed: number, inp: Inputs) {
    set('score', S.score.toLocaleString());
    h.combo.hidden = !(S.combo > 0);
    if (S.combo > 0) {
      set('comboPts', '+' + Math.round(S.combo).toLocaleString());
      set('mult', '×' + +S.mult.toFixed(1));
      h.bar.style.width = ((Math.max(0, S.timer) / COMBO_T) * 100).toFixed(1) + '%';
    }
    set('speed', String(Math.round(b.state === 'ride' ? speed * 3.6 : 0)));
    set('dist', (S.dist / 1000).toFixed(2) + ' km · top ' + Math.round(S.top * 3.6) + ' km/h');
    const z1 = b.C.z,
      z2 = z1 + 14,
      x1 = W.trailX(z1),
      x2 = W.trailX(z2);
    const g = ((W.heightAt(x1, z1) - W.heightAt(x2, z2)) / Math.hypot(14, x2 - x1)) * 100;
    gradeS += (g - gradeS) * 0.04;
    const off = b.state === 'ride' && W.trailDist(b.C.x, b.C.z) > W.TW + 3;
    set('grade', off ? 'Off trail' : 'Grade ' + Math.max(0, Math.round(gradeS)) + '%');
    const cls = gradeS < 8 ? 'green' : gradeS < 14 ? 'blue' : 'black',
      glyph = gradeS < 8 ? '●' : gradeS < 14 ? '■' : gradeS < 20 ? '◆' : '◆◆';
    if (cache.sign !== cls + glyph) {
      cache.sign = cls + glyph;
      h.sign.className = cls;
      h.sign.textContent = glyph;
    }
    if (inp.debug) {
      debugOn = !debugOn;
      h.debug.hidden = !debugOn;
    }
    if (debugOn) {
      const p = inp.pad,
        f = (n: number) => n.toFixed(2);
      h.debug.textContent = [
        p
          ? `pad: ${p.id.slice(0, 40)} (${p.mapping || 'no mapping'})`
          : 'pad: none (press a button)',
        p ? `axes: ${p.axes.join(' ')}` : '',
        p ? `buttons: ${p.buttons.join(',') || '-'}` : '',
        `throttle ${f(inp.throttle)} brake ${f(inp.brake)} steer ${f(inp.steer)} lean ${f(inp.lean)}`,
        `trick x ${f(inp.trickX)} y ${f(inp.trickY)} crouch ${inp.bodyY}`,
        `contact F${+b.contact[0]} R${+b.contact[1]} comp ${f(b.comp[0])}/${f(b.comp[1])} air ${b.inAir}`,
        `crouch e ${f(b.e)} (rest ${TUNING.eRest}) pitch ${f(b.th)} rel ${f(b.thRel)} slip ${f(b.slip)} ${b.surface}`,
      ]
        .filter(Boolean)
        .join('\n');
    }
  }
  return { popup, update };
}
