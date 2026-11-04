import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COMBO_T, bank, createScore, handleEvent, tickScore } from '../src/tricks';
import type { LandEvent, Score, Ui } from '../src/types';

const land = (over: Partial<LandEvent> = {}): LandEvent => ({
  type: 'land',
  air: 1.2,
  flips: 0,
  spins: 0,
  fakie: false,
  clean: false,
  grade: 'clean',
  impact: 3,
  thRel: 0,
  ...over,
});

describe('scoring', () => {
  let S: Score;
  let popup: ReturnType<typeof vi.fn<Ui['popup']>>;
  let ui: Ui;
  beforeEach(() => {
    S = createScore(0);
    popup = vi.fn<Ui['popup']>();
    ui = { popup };
  });

  it('ignores tiny hops', () => {
    handleEvent(S, ui, land({ air: 0.4 }));
    expect(S.combo).toBe(0);
    expect(popup).not.toHaveBeenCalled();
  });

  it('scores plain air and starts the combo timer', () => {
    handleEvent(S, ui, land({ air: 2 }));
    expect(S.combo).toBeGreaterThan(0);
    expect(S.timer).toBe(COMBO_T);
    expect(popup.mock.calls[0][0]).toBe('Huge air');
  });

  it('names flips and scales points quadratically', () => {
    handleEvent(S, ui, land({ flips: 1 }));
    const single = S.combo;
    expect(popup.mock.calls[0][0]).toBe('Backflip');
    S = createScore(0);
    handleEvent(S, ui, land({ flips: 2 }));
    expect(popup.mock.calls[1][0]).toBe('Double Backflip');
    expect(S.combo).toBeGreaterThan(single * 3);
    S = createScore(0);
    handleEvent(S, ui, land({ flips: -1 }));
    expect(popup.mock.calls[2][0]).toBe('Frontflip');
  });

  it('combines flips and spins', () => {
    handleEvent(S, ui, land({ flips: 1, spins: 2 }));
    expect(popup.mock.calls[0][0]).toBe('Backflip + 720');
  });

  it('pays a perfect landing more than a clean one', () => {
    const a = createScore(0),
      b = createScore(0);
    handleEvent(a, ui, land({ flips: 1, grade: 'clean' }));
    handleEvent(b, ui, land({ flips: 1, grade: 'perfect' }));
    expect(b.combo).toBeGreaterThan(a.combo);
  });

  it('penalises repeating the same trick', () => {
    const tweak = { type: 'tweak', name: 'Superman', idx: 2, time: 1 } as const;
    handleEvent(S, ui, tweak);
    const first = S.combo;
    handleEvent(S, ui, tweak);
    const second = S.combo - first;
    expect(second).toBeLessThan(first);
    expect(popup.mock.calls[1][1]).toContain('repeat');
  });

  it('caps the multiplier at 8', () => {
    for (let i = 0; i < 50; i++) handleEvent(S, ui, { type: 'whip' });
    expect(S.mult).toBeLessThanOrEqual(8);
  });

  it('a bail wipes the combo', () => {
    handleEvent(S, ui, land({ flips: 1 }));
    expect(S.combo).toBeGreaterThan(0);
    handleEvent(S, ui, { type: 'bail', reason: 'Hugged a tree' });
    expect(S.combo).toBe(0);
    expect(S.mult).toBe(1);
    expect(S.bails).toBe(1);
    expect(popup).toHaveBeenLastCalledWith('Hugged a tree', 'Combo lost', true);
  });
});

describe('banking', () => {
  it('banks combo times multiplier and records a new best', () => {
    const S = createScore(100),
      save = vi.fn(),
      ui: Ui = { popup: vi.fn<Ui['popup']>() };
    S.combo = 500;
    S.mult = 3;
    bank(S, ui, save);
    expect(S.score).toBe(1500);
    expect(S.best).toBe(1500);
    expect(save).toHaveBeenCalledWith(1500);
    expect(S.combo).toBe(0);
    expect(S.mult).toBe(1);
  });

  it('does not touch the best when the score is lower', () => {
    const S = createScore(9999),
      save = vi.fn();
    S.combo = 100;
    bank(S, { popup: vi.fn() }, save);
    expect(S.best).toBe(9999);
    expect(save).not.toHaveBeenCalled();
  });

  it('banks automatically when the combo timer runs out on the ground', () => {
    const S = createScore(0),
      save = vi.fn(),
      ui: Ui = { popup: vi.fn<Ui['popup']>() };
    S.combo = 400;
    S.timer = 1;
    tickScore(S, ui, 0.5, true, save);
    expect(S.score).toBe(0);
    tickScore(S, ui, 0.6, true, save);
    expect(S.score).toBe(400);
  });

  it('keeps the combo alive while airborne', () => {
    const S = createScore(0);
    S.combo = 400;
    S.timer = 0.1;
    tickScore(S, { popup: vi.fn() }, 5, false, vi.fn());
    expect(S.combo).toBe(400);
  });
});
