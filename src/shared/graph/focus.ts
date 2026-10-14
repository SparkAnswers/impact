import type { Graph } from './frames';

/** Which way a focus walks from the clicked node. */
export type FocusDirection = 'both' | 'down' | 'up';

export interface FocusOptions {
  /** Hops to follow from the node; 0 = the whole chain (every ancestor and descendant). */
  hops: number;
  direction: FocusDirection;
}

export const DEFAULT_FOCUS: FocusOptions = { hops: 0, direction: 'both' };

/**
 * Ids reachable from `start` along the edges: downstream (source → target), upstream (target → source) or both,
 * within `hops` steps (0 = unlimited). Always contains `start`. Pure and deterministic.
 */
export function focusIds(edges: Array<{ source: string; target: string }>, start: string, opts: FocusOptions): Set<string> {
  const down = new Map<string, string[]>();
  const up = new Map<string, string[]>();
  for (const e of edges) {
    (down.get(e.source) ?? down.set(e.source, []).get(e.source)!).push(e.target);
    (up.get(e.target) ?? up.set(e.target, []).get(e.target)!).push(e.source);
  }
  const keep = new Set<string>([start]);
  const limit = opts.hops > 0 ? opts.hops : Infinity;
  const walk = (adj: Map<string, string[]>) => {
    let frontier = [start];
    const seen = new Set<string>([start]);
    for (let d = 0; d < limit && frontier.length; d++) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const n of adj.get(id) ?? []) {
          if (!seen.has(n)) {
            seen.add(n);
            keep.add(n);
            next.push(n);
          }
        }
      }
      frontier = next;
    }
  };
  if (opts.direction !== 'up') {
    walk(down);
  }
  if (opts.direction !== 'down') {
    walk(up);
  }
  return keep;
}

/** The graph reduced to the focus set around `start`; edges between kept nodes only. Unknown `start` returns the graph unchanged. */
export function focusGraph(graph: Graph, start: string, opts: FocusOptions): Graph {
  if (!graph.nodes.some((n) => n.id === start)) {
    return graph;
  }
  const keep = focusIds(graph.edges, start, opts);
  return {
    ...graph,
    nodes: graph.nodes.filter((n) => keep.has(n.id)),
    edges: graph.edges.filter((e) => keep.has(e.source) && keep.has(e.target)),
  };
}
