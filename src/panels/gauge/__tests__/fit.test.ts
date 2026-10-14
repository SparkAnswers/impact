import { clearHalfWidth, fitLine } from '../lib/draw';
import { computeLayout } from '../lib/layout';

// A canvas context stub where every character is 6 px wide at 10 px font (scaled by the font size).
function ctxStub(): CanvasRenderingContext2D {
  let size = 10;
  return {
    set font(f: string) {
      size = Number(/(\d+(?:\.\d+)?)px/.exec(f)?.[1] ?? 10);
    },
    measureText: (t: string) => ({ width: t.length * 0.6 * size }),
  } as unknown as CanvasRenderingContext2D;
}

describe('fitLine', () => {
  it('keeps text that fits, shrinks the font first, then shortens with an ellipsis', () => {
    const ctx = ctxStub();
    expect(fitLine(ctx, 'short', 12, '400', 'sans', 200)).toEqual({ size: 12, text: 'short' });
    expect(fitLine(ctx, 'short', 12, '400', 'sans', Infinity)).toEqual({ size: 12, text: 'short' });
    // 20 chars at 12 px = 144 px; 100 px asks for 8.3 px, floor 8 is below the 9 px minimum: shrink to 9 then cut.
    const r = fitLine(ctx, 'twenty characters!!!', 12, '400', 'sans', 100);
    expect(r.size).toBe(9);
    expect(r.text.endsWith('…')).toBe(true);
    expect(r.text.length * 0.6 * 9).toBeLessThanOrEqual(100);
    // Enough room for a smaller font: no ellipsis.
    const s = fitLine(ctx, 'twenty characters!!!', 12, '400', 'sans', 130);
    expect(s.text).toBe('twenty characters!!!');
    expect(s.size).toBeLessThan(12);
  });
});

describe('clearHalfWidth', () => {
  // The topology dashboard gauge: 300° arc opening at the bottom, tick labels on, a wide short panel.
  const arc = { startAngle: 120, sweepAngle: 300, clockwise: true };
  const input = { width: 520, height: 200, arc, ringWidth: 14, showTicks: true, showTickLabels: true, showValue: true, showSecondary: true, showSubtitle: true, titlePosition: 'hidden' as const };
  const L = computeLayout(input);
  const model = { arc, ringWidth: 14 };

  it('is the inner chord inside the ring and narrows to the gap between the arc ends below it', () => {
    const inside = clearHalfWidth(model, L, L.cy, 10);
    expect(inside).toBeCloseTo(Math.sqrt(L.innerRadius ** 2 - 100) - 2, 1);
    // Level with the ring ends: only the gap between them, minus the ring band.
    const atEnds = clearHalfWidth(model, L, L.cy + L.r * Math.sin((120 * Math.PI) / 180) - 2, 8);
    expect(atEnds).toBeLessThan(L.r * 0.5);
    expect(atEnds).toBeGreaterThan(0);
    // Level with the end tick labels (below the ring band): limited by the labels, still well inside the chord.
    const atLabels = clearHalfWidth(model, L, L.cy + L.tickLabelRadius * Math.sin((120 * Math.PI) / 180) + 2, 8);
    expect(atLabels).toBeLessThan(inside);
    expect(atLabels).toBeGreaterThan(0);
    // Far below everything: unconstrained.
    expect(clearHalfWidth(model, L, L.cy + L.tickLabelRadius + 40, 8)).toBe(Infinity);
  });

  it('an arc that ends above the centre leaves the bottom free', () => {
    const half = { startAngle: 180, sweepAngle: 180, clockwise: true };
    const L2 = computeLayout({ ...input, arc: half });
    expect(clearHalfWidth({ arc: half, ringWidth: 14 }, L2, L2.cy + L2.innerRadius + 10, 8)).toBe(Infinity);
  });
});
