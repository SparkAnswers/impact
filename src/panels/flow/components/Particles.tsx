import React, { useEffect, useMemo, useRef } from 'react';
import type { ResolvedEdge } from './EdgeView';

export interface ParticlesProps {
  edges: ResolvedEdge[];
  uid: string;
  /** Global multiplier from the Animation + Appearance options */
  speed: number;
  /** When false, particles are drawn at static positions (reduced motion / animation off) */
  animate: boolean;
  highlight: string;
}

interface Slot {
  edgeId: string;
  index: number;
  count: number;
}

/** Seconds for one particle to travel the full edge at speed 1. */
const BASE_PERIOD = 2.5;

type PathMap = Map<string, SVGPathElement | null>;
type CircleMap = Map<string, SVGCircleElement | null>;

/** Write particle positions straight to the DOM for every edge. */
function placeAll(paths: PathMap, circles: CircleMap, progress: Map<string, number>, edges: ResolvedEdge[]) {
  const byId = new Map(edges.map((e) => [e.edge.id, e]));
  for (const [key, path] of paths) {
    const item = byId.get(key);
    if (!path || !item || typeof path.getTotalLength !== 'function') {
      continue;
    }
    const len = path.getTotalLength();
    if (!len) {
      continue;
    }
    const count = Math.max(0, Math.round(item.edge.particles.count));
    const p0 = progress.get(key) ?? 0;
    for (let i = 0; i < count; i++) {
      const t = (((p0 + i / count) % 1) + 1) % 1;
      const pt = path.getPointAtLength(t * len);
      for (const suffix of ['o', 'i']) {
        const c = circles.get(`${key}:${i}:${suffix}`);
        if (c) {
          c.setAttribute('cx', pt.x.toFixed(2));
          c.setAttribute('cy', pt.y.toFixed(2));
        }
      }
    }
  }
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Travelling particles for every edge. A single requestAnimationFrame loop moves all circles using
 * `getPointAtLength` on hidden measuring paths; this stays smooth for dozens of edges because React is
 * not involved per frame (attributes are written directly).
 */
export const Particles: React.FC<ParticlesProps> = ({ edges, uid, speed, animate, highlight }) => {
  const paths = useRef<PathMap>(new Map());
  const circles = useRef<CircleMap>(new Map());
  const progress = useRef(new Map<string, number>());
  const edgesRef = useRef(edges);
  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  const slots = useMemo(() => {
    const out: Slot[] = [];
    for (const e of edges) {
      if (!e.edge.particles.enabled) {
        continue;
      }
      const count = Math.max(0, Math.round(e.edge.particles.count));
      for (let i = 0; i < count; i++) {
        out.push({ edgeId: e.edge.id, index: i, count });
      }
    }
    return out;
  }, [edges]);

  const reduced = prefersReducedMotion();
  const running = animate && !reduced;

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let active = true;

    const place = () => placeAll(paths.current, circles.current, progress.current, edgesRef.current);

    const tick = (now: number) => {
      if (!active) {
        return;
      }
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!document.hidden) {
        for (const item of edgesRef.current) {
          const key = item.edge.id;
          const dir = item.reversed ? -1 : 1;
          const v = (item.edge.particles.speed * item.speed * speed * dir) / BASE_PERIOD;
          progress.current.set(key, ((progress.current.get(key) ?? 0) + v * dt) % 1);
        }
        place();
      }
      raf = requestAnimationFrame(tick);
    };

    place();
    if (running) {
      raf = requestAnimationFrame(tick);
    }
    const onVisibility = () => {
      last = performance.now();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      active = false;
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [running, speed, slots]);

  // Re-place whenever geometry changes (e.g. a node is dragged) without restarting the loop.
  useEffect(() => {
    placeAll(paths.current, circles.current, progress.current, edges);
  }, [edges]);

  const byId = useMemo(() => new Map(edges.map((e) => [e.edge.id, e])), [edges]);

  return (
    <g style={{ pointerEvents: 'none' }} data-testid="flow-particles">
      {edges.map((e) => (
        <path
          key={e.edge.id}
          d={e.geo.d}
          fill="none"
          stroke="none"
          ref={(el) => {
            paths.current.set(e.edge.id, el);
          }}
        />
      ))}
      {slots.map((s) => {
        const item = byId.get(s.edgeId);
        if (!item) {
          return null;
        }
        const size = item.edge.particles.size;
        const r = Math.max(1, size * 0.6 + item.width * 0.4);
        return (
          <React.Fragment key={`${s.edgeId}:${s.index}`}>
            <circle
              r={r + 1.8}
              fill={item.color}
              opacity={0.5}
              filter={`url(#${uid}-pglow)`}
              ref={(el) => {
                circles.current.set(`${s.edgeId}:${s.index}:o`, el);
              }}
            />
            <circle
              r={r}
              fill={highlight}
              filter={`url(#${uid}-pglow)`}
              ref={(el) => {
                circles.current.set(`${s.edgeId}:${s.index}:i`, el);
              }}
            />
          </React.Fragment>
        );
      })}
    </g>
  );
};
