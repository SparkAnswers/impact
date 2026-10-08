import {
  adaptiveDelay,
  advancePlayhead,
  breathing,
  canScroll,
  interpolateAt,
  underrunDelay,
  easeTowards,
  inferSampleInterval,
  isStale,
  liveWindow,
  parseRefreshInterval,
  scrollX,
  staleThreshold,
  trailAlpha,
  tween,
} from '../lib/live';
import { frameSubscriberCount, subscribeFrames } from '../lib/scheduler';

describe('inferSampleInterval', () => {
  it('returns the median gap of the last timestamps', () => {
    expect(inferSampleInterval([0, 1000, 2000, 3000, 4000])).toBe(1000);
    expect(inferSampleInterval([0, 1000, 2000, 9000, 10000, 11000])).toBe(1000);
  });
  it('ignores nulls and non-increasing timestamps', () => {
    expect(inferSampleInterval([0, null, 1000, 1000, 2000])).toBe(1000);
  });
  it('is null with fewer than two timestamps', () => {
    expect(inferSampleInterval([5000])).toBeNull();
    expect(inferSampleInterval([])).toBeNull();
  });
  it('only looks at the last n', () => {
    const t = [0, 60000, 120000, 121000, 122000, 123000];
    expect(inferSampleInterval(t, 3)).toBe(1000);
  });
});

describe('refresh + stale', () => {
  it('parses refresh strings', () => {
    expect(parseRefreshInterval('10s')).toBe(10000);
    expect(parseRefreshInterval('1m')).toBe(60000);
    expect(parseRefreshInterval('')).toBeNull();
    expect(parseRefreshInterval(undefined)).toBeNull();
    expect(parseRefreshInterval('nope')).toBeNull();
  });
  it('threshold is max(3x sample, 2x refresh, 60 s floor)', () => {
    expect(staleThreshold(1000, 10000)).toBe(60000);
    expect(staleThreshold(30000, 10000)).toBe(90000);
    expect(staleThreshold(null, 40000)).toBe(80000);
    expect(staleThreshold(1000, null)).toBe(60000);
    expect(staleThreshold(null, null)).toBeNull();
    expect(staleThreshold(1000, 10000, 0)).toBe(20000);
  });
  it('detects stale samples', () => {
    expect(isStale(100000, 90000, 20000)).toBe(false);
    expect(isStale(110000, 90000, 20000)).toBe(false);
    expect(isStale(130001, 100000, 20000)).toBe(true);
    expect(isStale(130001, null, 20000)).toBe(false);
    expect(isStale(130001, 0, null)).toBe(false);
  });
});

describe('scroll offset', () => {
  it('slides the newest sample left as wall-clock time passes', () => {
    const dataTo = 100000;
    const span = 60000;
    const receivedAt = 100000;
    const w0 = liveWindow(dataTo, span, receivedAt, 100000);
    expect(scrollX(100000, w0)).toBeCloseTo(1);
    const w1 = liveWindow(dataTo, span, receivedAt, 106000);
    expect(scrollX(100000, w1)).toBeCloseTo(0.9);
    expect(scrollX(40000, w1)).toBeCloseTo(-0.1);
  });
  it('is back at the right edge once new data arrives', () => {
    const w = liveWindow(110000, 60000, 110000, 110000);
    expect(scrollX(110000, w)).toBeCloseTo(1);
  });
  it('never moves backwards in time', () => {
    const w = liveWindow(100000, 60000, 100000, 90000);
    expect(w.to).toBe(100000);
  });
  it('only scrolls for ranges that end at the time they arrived', () => {
    expect(canScroll(100000, 100500, 10000)).toBe(true);
    expect(canScroll(100000, 3700000, 10000)).toBe(false);
  });
});

describe('easing helpers', () => {
  it('easeTowards converges and settles exactly', () => {
    let v = 0;
    for (let i = 0; i < 400; i++) {
      v = easeTowards(v, 10, 16, 250);
    }
    expect(v).toBe(10);
    expect(easeTowards(0, 10, 16, 0)).toBe(10);
  });
  it('tween is bounded', () => {
    expect(tween(0, 10, -5, 700)).toBe(0);
    expect(tween(0, 10, 700, 700)).toBe(10);
    const mid = tween(0, 10, 350, 700);
    expect(mid).toBeGreaterThan(5);
    expect(mid).toBeLessThan(10);
  });
  it('breathing oscillates around 1 within the amplitude', () => {
    const vals = [0, 300, 600, 900, 1200, 1800, 2400].map((t) => breathing(t, 2400, 0.4));
    expect(Math.max(...vals)).toBeLessThanOrEqual(1.2 + 1e-9);
    expect(Math.min(...vals)).toBeGreaterThanOrEqual(0.8 - 1e-9);
    expect(breathing(500, 2400, 0)).toBe(1);
  });
  it('trailAlpha fades to zero at the window end', () => {
    expect(trailAlpha(0, 4000)).toBe(1);
    expect(trailAlpha(4000, 4000)).toBe(0);
    expect(trailAlpha(2000, 4000)).toBeCloseTo(0.25);
    expect(trailAlpha(-500, 4000)).toBe(0);
  });
});

describe('scheduler', () => {
  it('shares one loop and stops when the last subscriber leaves', () => {
    const rafSpy = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    const cafSpy = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    const a = subscribeFrames(() => {});
    const b = subscribeFrames(() => {});
    expect(frameSubscriberCount()).toBe(2);
    expect(rafSpy).toHaveBeenCalledTimes(1);
    a();
    expect(cafSpy).not.toHaveBeenCalled();
    b();
    expect(frameSubscriberCount()).toBe(0);
    expect(cafSpy).toHaveBeenCalledTimes(1);
    rafSpy.mockRestore();
    cafSpy.mockRestore();
  });
});

describe('playback delay', () => {
  it('adapts to the observed refresh with a latency margin and clamps', () => {
    expect(adaptiveDelay(10000, null, 200)).toBe(13500); // 1.25 x 10 s + 1 s minimum margin
    expect(adaptiveDelay(10000, null, 2000)).toBe(15500); // margin 1.5 x latency
    expect(adaptiveDelay(null, 30000, 0)).toBe(38500); // dashboard refresh fallback
    expect(adaptiveDelay(null, null, 0)).toBe(15000); // nothing known yet
    expect(adaptiveDelay(500, null, 0)).toBe(2000); // min 2 s
    expect(adaptiveDelay(600000, null, 0)).toBe(300000); // max 5 min
  });
  it('underrun delay covers the gap plus margin', () => {
    expect(underrunDelay(130000, 100000, 0)).toBe(31000);
  });
});

describe('advancePlayhead', () => {
  const newest = 100000;
  it('starts at wall - delay when the buffer is healthy', () => {
    expect(advancePlayhead(null, 110000, 15000, newest, 16)).toBe(95000);
  });
  it('starts at the newest sample when the delay is too small', () => {
    expect(advancePlayhead(null, 110000, 5000, newest, 16)).toBe(newest);
  });
  it('moves at wall-clock speed while behind the target', () => {
    expect(advancePlayhead(95000, 110016, 15000, newest, 16)).toBe(95016);
  });
  it('never passes the newest sample and never moves backwards', () => {
    let p = 99900;
    for (let i = 0; i < 400; i++) {
      const next = advancePlayhead(p, 120000 + i * 16, 2000, newest, 16);
      expect(next).toBeLessThanOrEqual(newest);
      expect(next).toBeGreaterThanOrEqual(p);
      p = next;
    }
    expect(p).toBeCloseTo(newest, 3);
  });
  it('holds when the delay grows past the current lag instead of jumping back', () => {
    expect(advancePlayhead(95000, 110000, 20000, newest, 16)).toBe(95000);
  });
  it('resumes normal speed once new data extends the cap', () => {
    const held = advancePlayhead(99990, 110000, 2000, newest, 16);
    expect(held).toBeLessThanOrEqual(newest);
    const next = advancePlayhead(held, 110016, 2000, 130000, 16);
    expect(next).toBeCloseTo(held + 16, 6);
  });
});

describe('interpolateAt', () => {
  const t = [0, 1000, 2000, 4000];
  const v = [0, 10, 20, 40];
  it('interpolates linearly between neighbours', () => {
    expect(interpolateAt(t, v, 500)).toBeCloseTo(5);
    expect(interpolateAt(t, v, 3000)).toBeCloseTo(30);
    expect(interpolateAt(t, v, 1000)).toBe(10);
  });
  it('clamps to the ends and handles empty input', () => {
    expect(interpolateAt(t, v, -5)).toBe(0);
    expect(interpolateAt(t, v, 9000)).toBe(40);
    expect(interpolateAt([], [], 1)).toBeNull();
  });
});
