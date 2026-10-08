import {
  breathing,
  canScroll,
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
  it('threshold is max(3x sample, 2x refresh)', () => {
    expect(staleThreshold(1000, 10000)).toBe(20000);
    expect(staleThreshold(15000, 10000)).toBe(45000);
    expect(staleThreshold(null, 10000)).toBe(20000);
    expect(staleThreshold(1000, null)).toBe(3000);
    expect(staleThreshold(null, null)).toBeNull();
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
