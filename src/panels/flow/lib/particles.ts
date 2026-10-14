import type { FlowEdge } from '../types';

/** How edge particles are drawn (Animation → Particles). */
export type ParticleMode = 'animated' | 'static' | 'hidden';

/** Default cap on the number of particles drawn at once; 0 disables the cap. */
export const DEFAULT_PARTICLE_LIMIT = 400;

/** Above this many particles the glow filter is dropped: SVG filters per circle are what makes big graphs crawl. */
export const GLOW_LIMIT = 150;

export interface ParticleBudget {
  /** Particles to draw per edge id (edges without particles are absent) */
  counts: Map<string, number>;
  /** Total after the cap */
  total: number;
  /** The configured counts exceeded the limit and were scaled down */
  limited: boolean;
}

/**
 * Per-edge particle counts under a global cap. When the configured total exceeds `limit`, every count is
 * scaled down proportionally (never below one per edge); when there are more edges than the limit, the
 * widest edges keep their single particle and the rest get none.
 */
export function budgetParticles(edges: Array<Pick<FlowEdge, 'id' | 'particles' | 'stroke'>>, limit: number): ParticleBudget {
  const counts = new Map<string, number>();
  let total = 0;
  for (const e of edges) {
    if (!e.particles.enabled) {
      continue;
    }
    const n = Math.max(0, Math.round(e.particles.count));
    if (n > 0) {
      counts.set(e.id, n);
      total += n;
    }
  }
  if (limit <= 0 || total <= limit) {
    return { counts, total, limited: false };
  }
  if (counts.size > limit) {
    const keep = edges
      .filter((e) => counts.has(e.id))
      .sort((a, b) => (b.stroke ?? 0) - (a.stroke ?? 0))
      .slice(0, limit);
    const kept = new Map(keep.map((e) => [e.id, 1]));
    return { counts: kept, total: kept.size, limited: true };
  }
  const scale = limit / total;
  let sum = 0;
  for (const [id, n] of counts) {
    const scaled = Math.max(1, Math.floor(n * scale));
    counts.set(id, scaled);
    sum += scaled;
  }
  return { counts, total: sum, limited: true };
}

/** Whether particles are drawn at all for a mode and the resolved animation state. */
export function particlesVisible(mode: ParticleMode, animate: boolean): boolean {
  return mode === 'static' || (mode === 'animated' && animate);
}

/**
 * Points sampled along a path at equal arc-length steps, so the per-frame loop interpolates between
 * them instead of calling `getPointAtLength` (which re-walks the path geometry) for every particle.
 */
export interface SampledPath {
  d: string;
  /** x0, y0, x1, y1, … for `steps + 1` points */
  pts: Float32Array;
  steps: number;
}

export function samplePath(path: SVGPathElement, d: string): SampledPath | undefined {
  if (typeof path.getTotalLength !== 'function') {
    return undefined;
  }
  const len = path.getTotalLength();
  if (!len) {
    return undefined;
  }
  const steps = Math.min(160, Math.max(8, Math.ceil(len / 6)));
  const pts = new Float32Array((steps + 1) * 2);
  for (let i = 0; i <= steps; i++) {
    const p = path.getPointAtLength((i / steps) * len);
    pts[i * 2] = p.x;
    pts[i * 2 + 1] = p.y;
  }
  return { d, pts, steps };
}

/** Point at fraction `t` (0..1) of a sampled path. */
export function pointAt(s: SampledPath, t: number): { x: number; y: number } {
  const f = Math.min(1, Math.max(0, t)) * s.steps;
  const i = Math.min(s.steps - 1, Math.floor(f));
  const k = f - i;
  const x0 = s.pts[i * 2];
  const y0 = s.pts[i * 2 + 1];
  const x1 = s.pts[(i + 1) * 2];
  const y1 = s.pts[(i + 1) * 2 + 1];
  return { x: x0 + (x1 - x0) * k, y: y0 + (y1 - y0) * k };
}
