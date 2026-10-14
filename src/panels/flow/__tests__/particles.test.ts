import { DEFAULT_PARTICLES } from '../types';
import { budgetParticles, particlesVisible, pointAt, type SampledPath } from '../lib/particles';

const edge = (id: string, count: number, stroke = 2, enabled = true) => ({ id, stroke, particles: { ...DEFAULT_PARTICLES, count, enabled } });

describe('budgetParticles', () => {
  it('passes configured counts through under the limit and skips disabled edges', () => {
    const b = budgetParticles([edge('a', 2), edge('b', 3), edge('c', 5, 2, false), edge('d', 0)], 400);
    expect([...b.counts]).toEqual([
      ['a', 2],
      ['b', 3],
    ]);
    expect(b.total).toBe(5);
    expect(b.limited).toBe(false);
  });

  it('0 means no limit', () => {
    const b = budgetParticles([edge('a', 100), edge('b', 100)], 0);
    expect(b.total).toBe(200);
    expect(b.limited).toBe(false);
  });

  it('scales counts down proportionally, never below one per edge', () => {
    const b = budgetParticles([edge('a', 8), edge('b', 4), edge('c', 1)], 6);
    expect(b.counts.get('a')).toBe(3);
    expect(b.counts.get('b')).toBe(1);
    expect(b.counts.get('c')).toBe(1);
    expect(b.total).toBe(5);
    expect(b.limited).toBe(true);
  });

  it('with more edges than the limit, the widest edges keep a single particle', () => {
    const b = budgetParticles([edge('thin', 2, 1), edge('wide', 2, 6), edge('mid', 2, 3)], 2);
    expect([...b.counts.keys()].sort()).toEqual(['mid', 'wide']);
    expect(b.total).toBe(2);
    expect(b.limited).toBe(true);
  });
});

describe('particlesVisible', () => {
  it('animated follows the animation state, static always shows, hidden never', () => {
    expect(particlesVisible('animated', true)).toBe(true);
    expect(particlesVisible('animated', false)).toBe(false);
    expect(particlesVisible('static', false)).toBe(true);
    expect(particlesVisible('hidden', true)).toBe(false);
  });
});

describe('pointAt', () => {
  const s: SampledPath = { d: 'M0 0 L100 0', steps: 2, pts: new Float32Array([0, 0, 50, 10, 100, 0]) };
  it('interpolates between samples and clamps t', () => {
    expect(pointAt(s, 0)).toEqual({ x: 0, y: 0 });
    expect(pointAt(s, 0.25)).toEqual({ x: 25, y: 5 });
    expect(pointAt(s, 0.5)).toEqual({ x: 50, y: 10 });
    expect(pointAt(s, 1)).toEqual({ x: 100, y: 0 });
    expect(pointAt(s, 1.5)).toEqual({ x: 100, y: 0 });
    expect(pointAt(s, -1)).toEqual({ x: 0, y: 0 });
  });
});
