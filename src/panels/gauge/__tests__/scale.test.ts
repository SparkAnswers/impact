import { type ArcSpec, fractionToAngle, fractionToValue, normalizeScale, type ScaleSpec, signedArc, valueToAngle, valueToFraction } from '../lib/scale';

const linear: ScaleSpec = { min: -50, max: 200, zero: 0, kind: 'linear' };
const sqrt: ScaleSpec = { min: -50, max: 200, zero: 0, kind: 'sqrt' };
const arcCCW: ArcSpec = { startAngle: 225, sweepAngle: 195, clockwise: false };
const arcCW: ArcSpec = { startAngle: 180, sweepAngle: 180, clockwise: true };
const rad = (d: number) => (d * Math.PI) / 180;

describe('normalizeScale', () => {
  it('places the zero mark proportionally by default', () => {
    expect(normalizeScale(linear).zeroPosition).toBeCloseTo(0.2);
  });
  it('clamps zero into the range and repairs inverted ranges', () => {
    const s = normalizeScale({ min: 10, max: 5, zero: -3, kind: 'linear' });
    expect(s.max).toBeGreaterThan(s.min);
    expect(s.zero).toBe(s.min);
  });
});

describe('valueToFraction', () => {
  it('maps linear values proportionally on each side of zero', () => {
    expect(valueToFraction(0, linear)).toBeCloseTo(0.2);
    expect(valueToFraction(200, linear)).toBeCloseTo(1);
    expect(valueToFraction(100, linear)).toBeCloseTo(0.6);
    expect(valueToFraction(-50, linear)).toBeCloseTo(0);
    expect(valueToFraction(-25, linear)).toBeCloseTo(0.1);
  });
  it('compresses the high end with sqrt', () => {
    expect(valueToFraction(50, sqrt)).toBeCloseTo(0.2 + Math.sqrt(0.25) * 0.8);
    expect(valueToFraction(-12.5, sqrt)).toBeCloseTo(0.2 - Math.sqrt(0.25) * 0.2);
    expect(valueToFraction(50, sqrt)).toBeGreaterThan(valueToFraction(50, linear));
  });
  it('clamps outside the range', () => {
    expect(valueToFraction(999, linear)).toBe(1);
    expect(valueToFraction(-999, linear)).toBe(0);
  });
  it('respects an explicit zero position', () => {
    const s: ScaleSpec = { ...linear, zeroPosition: 0.8 };
    expect(valueToFraction(0, s)).toBeCloseTo(0.8);
    expect(valueToFraction(200, s)).toBeCloseTo(1);
    expect(valueToFraction(-50, s)).toBeCloseTo(0);
  });
  it('round-trips through fractionToValue for every scale kind', () => {
    for (const kind of ['linear', 'sqrt', 'log'] as const) {
      const s: ScaleSpec = { ...linear, kind };
      for (const v of [-50, -20, 0, 1, 37, 150, 200]) {
        expect(fractionToValue(valueToFraction(v, s), s)).toBeCloseTo(v, 6);
      }
    }
  });
});

describe('angles', () => {
  it('counter-clockwise arcs put max at the start angle', () => {
    expect(fractionToAngle(1, arcCCW)).toBeCloseTo(rad(225));
    expect(fractionToAngle(0, arcCCW)).toBeCloseTo(rad(420));
  });
  it('clockwise arcs put min at the start angle', () => {
    expect(fractionToAngle(0, arcCW)).toBeCloseTo(rad(180));
    expect(fractionToAngle(1, arcCW)).toBeCloseTo(rad(360));
    expect(valueToAngle(5, { min: 0, max: 10, zero: 0, kind: 'linear' }, arcCW)).toBeCloseTo(rad(270));
  });
});

describe('signedArc', () => {
  it('positive values sweep from the zero mark towards max', () => {
    const a = signedArc(100, linear, arcCCW);
    expect(a.positive).toBe(true);
    expect(a.from).toBeCloseTo(fractionToAngle(0.2, arcCCW));
    expect(a.to).toBeCloseTo(fractionToAngle(0.6, arcCCW));
    expect(a.size).toBeCloseTo(rad(0.4 * 195));
  });
  it('negative values sweep the other way', () => {
    const a = signedArc(-50, linear, arcCCW);
    expect(a.positive).toBe(false);
    expect(a.to).toBeCloseTo(fractionToAngle(0, arcCCW));
    expect(a.size).toBeCloseTo(rad(0.2 * 195));
    expect(Math.sign(a.to - a.from)).toBe(-Math.sign(signedArc(100, linear, arcCCW).to - signedArc(100, linear, arcCCW).from));
  });
  it('is empty at the zero mark', () => {
    expect(signedArc(0, linear, arcCCW).size).toBeCloseTo(0);
  });
});

describe('layout text fitting', () => {
  const { computeLayout } = jest.requireActual('../lib/layout');
  const base = { arc: arcCCW, ringWidth: 5, showTicks: true, showTickLabels: true, showValue: true, showSecondary: true, showSubtitle: true, titlePosition: 'top' as const };
  it('keeps the subtitle inside short panels or hides it', () => {
    for (const [w, h] of [[500, 220], [500, 260], [400, 300], [700, 240], [300, 500]]) {
      const L = computeLayout({ ...base, width: w, height: h });
      const bottom = L.showSubtitle ? L.subtitleY + L.subtitleFont * 0.3 : L.showSecondary ? L.secondaryY + L.secondaryFont * 0.3 : L.valueY + 2;
      expect(bottom).toBeLessThanOrEqual(h - 4);
    }
  });
});
