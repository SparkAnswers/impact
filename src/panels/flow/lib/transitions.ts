import type { FlowDiagram } from '../types';

/**
 * Enter / leave opacity tweens for data-driven diagrams: nodes (and edges) that appear fade in,
 * ones that disappear linger while fading out. Pure bookkeeping; the panel drives it with timestamps.
 */

export const FADE_MS = 450;

export interface FadeEntry {
  kind: 'node' | 'edge';
  id: string;
  dir: 'in' | 'out';
  start: number;
}

export interface FadeState {
  /** Last diagram seen (leaving elements are copied from it) */
  previous: FlowDiagram;
  entries: Map<string, FadeEntry>;
}

export const emptyFade = (diagram: FlowDiagram): FadeState => ({ previous: diagram, entries: new Map() });

const key = (kind: 'node' | 'edge', id: string) => `${kind}:${id}`;

/** Register additions/removals between the previous and the next diagram. */
export function diffFade(state: FadeState, next: FlowDiagram, now: number): FadeState {
  const entries = new Map(state.entries);
  const prevNodes = new Set(state.previous.nodes.map((n) => n.id));
  const prevEdges = new Set(state.previous.edges.map((e) => e.id));
  const nextNodes = new Set(next.nodes.map((n) => n.id));
  const nextEdges = new Set(next.edges.map((e) => e.id));
  const mark = (kind: 'node' | 'edge', id: string, dir: 'in' | 'out') => {
    const k = key(kind, id);
    const cur = entries.get(k);
    if (cur && cur.dir === dir) {
      return;
    }
    // Reversing mid-tween: start from the equivalent progress so the opacity does not jump.
    const progress = cur ? Math.min(1, (now - cur.start) / FADE_MS) : 0;
    entries.set(k, { kind, id, dir, start: cur ? now - (1 - progress) * FADE_MS : now });
  };
  for (const id of nextNodes) {
    if (!prevNodes.has(id) || entries.get(key('node', id))?.dir === 'out') {
      mark('node', id, 'in');
    }
  }
  for (const id of prevNodes) {
    if (!nextNodes.has(id)) {
      mark('node', id, 'out');
    }
  }
  for (const id of nextEdges) {
    if (!prevEdges.has(id) || entries.get(key('edge', id))?.dir === 'out') {
      mark('edge', id, 'in');
    }
  }
  for (const id of prevEdges) {
    if (!nextEdges.has(id)) {
      mark('edge', id, 'out');
    }
  }
  // Leaving elements are kept in `previous` until they are gone so repeated diffs do not lose them.
  const leavingNodes = state.previous.nodes.filter((n) => !nextNodes.has(n.id) && entries.get(key('node', n.id))?.dir === 'out');
  const leavingEdges = state.previous.edges.filter((e) => !nextEdges.has(e.id) && entries.get(key('edge', e.id))?.dir === 'out');
  return { previous: { ...next, nodes: [...next.nodes, ...leavingNodes], edges: [...next.edges, ...leavingEdges] }, entries };
}

export interface FadeFrame {
  diagram: FlowDiagram;
  /** Opacity per `node:<id>` / `edge:<id>` (absent = 1) */
  opacity: Map<string, number>;
  /** True while something is still tweening */
  active: boolean;
  state: FadeState;
}

/** Evaluate the tweens at `now`: returns the diagram to draw (including leaving elements) and opacities. */
export function fadeFrame(state: FadeState, now: number): FadeFrame {
  const opacity = new Map<string, number>();
  const entries = new Map(state.entries);
  let active = false;
  const gone = new Set<string>();
  for (const [k, e] of state.entries) {
    const t = Math.min(1, Math.max(0, (now - e.start) / FADE_MS));
    const o = e.dir === 'in' ? t : 1 - t;
    if (t >= 1) {
      entries.delete(k);
      if (e.dir === 'out') {
        gone.add(k);
      }
      continue;
    }
    active = true;
    opacity.set(k, Math.round(o * 100) / 100);
  }
  const nodes = state.previous.nodes.filter((n) => !gone.has(key('node', n.id)));
  const edges = state.previous.edges.filter((e) => !gone.has(key('edge', e.id)));
  const diagram = gone.size ? { ...state.previous, nodes, edges } : state.previous;
  return { diagram, opacity, active, state: { previous: diagram, entries } };
}
