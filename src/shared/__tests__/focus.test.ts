import { focusGraph, focusIds } from '../graph/focus';
import type { Graph } from '../graph/frames';

// a → b → c → d, b → e, x → c (a side feed)
const edges = [
  { source: 'a', target: 'b' },
  { source: 'b', target: 'c' },
  { source: 'c', target: 'd' },
  { source: 'b', target: 'e' },
  { source: 'x', target: 'c' },
];
const sorted = (s: Set<string>) => Array.from(s).sort();

describe('focusIds', () => {
  it('whole chain: every ancestor and descendant, not siblings', () => {
    expect(sorted(focusIds(edges, 'c', { hops: 0, direction: 'both' }))).toEqual(['a', 'b', 'c', 'd', 'x']);
    expect(sorted(focusIds(edges, 'e', { hops: 0, direction: 'both' }))).toEqual(['a', 'b', 'e']);
  });

  it('limits the walk to N hops and to one direction', () => {
    expect(sorted(focusIds(edges, 'c', { hops: 1, direction: 'both' }))).toEqual(['b', 'c', 'd', 'x']);
    expect(sorted(focusIds(edges, 'c', { hops: 1, direction: 'up' }))).toEqual(['b', 'c', 'x']);
    expect(sorted(focusIds(edges, 'c', { hops: 0, direction: 'down' }))).toEqual(['c', 'd']);
    expect(sorted(focusIds(edges, 'a', { hops: 2, direction: 'down' }))).toEqual(['a', 'b', 'c', 'e']);
  });

  it('survives cycles and unknown ids', () => {
    const cyc = [...edges, { source: 'd', target: 'a' }];
    expect(sorted(focusIds(cyc, 'a', { hops: 0, direction: 'down' }))).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(sorted(focusIds(edges, 'nope', { hops: 0, direction: 'both' }))).toEqual(['nope']);
  });
});

describe('focusGraph', () => {
  const graph: Graph = {
    nodes: ['a', 'b', 'c', 'd', 'e', 'x'].map((id) => ({ id, explicit: false })),
    edges: edges.map((e) => ({ ...e, id: `${e.source}→${e.target}` })),
    notices: [],
    totalNodes: 6,
    totalEdges: 5,
  };
  it('keeps the chain and the edges among it, and leaves an unknown start alone', () => {
    const g = focusGraph(graph, 'e', { hops: 0, direction: 'both' });
    expect(g.nodes.map((n) => n.id)).toEqual(['a', 'b', 'e']);
    expect(g.edges.map((e) => e.id)).toEqual(['a→b', 'b→e']);
    expect(g.totalNodes).toBe(6);
    expect(focusGraph(graph, 'zzz', { hops: 0, direction: 'both' })).toBe(graph);
  });
});
