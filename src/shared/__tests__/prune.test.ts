import { edgeId, type Graph, type GraphEdge, type GraphNode } from '../graph/frames';
import { collapseGroups, EMPTY_HIDDEN, pruneActive, pruneGraph } from '../graph/prune';

const node = (id: string, extra: Partial<GraphNode> = {}): GraphNode => ({ id, explicit: false, ...extra });
const edge = (source: string, target: string, value?: number, extra: Partial<GraphEdge> = {}): GraphEdge => ({
  id: edgeId(source, target),
  source,
  target,
  value,
  ...extra,
});

function graph(nodes: GraphNode[], edges: GraphEdge[], notices: string[] = []): Graph {
  const sorted = nodes.slice().sort((a, b) => (a.id < b.id ? -1 : 1));
  return { nodes: sorted, edges, notices, totalNodes: nodes.length, totalEdges: edges.length };
}

/**
 *  web → api → db
 *         ↓
 *       cache → disk
 *  api, db and cache are in groups; `lonely` is an explicit node without edges.
 */
const fixture = () =>
  graph(
    [
      node('web'),
      node('api', { group: 'backend', value: 2 }),
      node('db', { group: 'data', value: 5 }),
      node('cache', { group: 'data', value: 3, status: 'warn' }),
      node('disk'),
      node('lonely', { explicit: true }),
    ],
    [edge('web', 'api', 10), edge('api', 'db', 4), edge('api', 'cache', 1, { value2: 0.5 }), edge('cache', 'disk', 2)],
    ['Top 4 of 9 edges']
  );

const ids = (g: Graph) => g.nodes.map((n) => n.id);
const eids = (g: Graph) => g.edges.map((e) => e.id);

describe('pruneGraph', () => {
  it('returns the graph unchanged (same arrays) when nothing applies', () => {
    const g = fixture();
    const { graph: out, removed } = pruneGraph(g, {}, EMPTY_HIDDEN);
    expect(out.nodes).toBe(g.nodes);
    expect(out.edges).toBe(g.edges);
    expect(out.notices).toEqual(['Top 4 of 9 edges']);
    expect(removed).toEqual({ nodes: 0, edges: 0 });
    expect(pruneActive({}, EMPTY_HIDDEN)).toBe(false);
    expect(pruneActive(undefined, undefined)).toBe(false);
    expect(pruneActive({ maxDepth: 2 }, EMPTY_HIDDEN)).toBe(true);
    expect(pruneActive({}, { nodes: ['x'], groups: [] })).toBe(true);
  });

  it('never mutates the input', () => {
    const g = fixture();
    const snapshot = JSON.stringify(g);
    pruneGraph(
      g,
      { hideLeaves: true, minValue: 2, maxDepth: 2, collapseGroups: true },
      { nodes: ['web'], groups: ['data'] }
    );
    expect(JSON.stringify(g)).toBe(snapshot);
  });

  it('hides nodes and whole groups and drops their edges', () => {
    const { graph: out, removed } = pruneGraph(fixture(), {}, { nodes: ['disk'], groups: ['data'] });
    expect(ids(out)).toEqual(['api', 'lonely', 'web']);
    expect(eids(out)).toEqual(['web→api']);
    expect(removed).toEqual({ nodes: 3, edges: 3 });
    expect(out.notices).toEqual(['Top 4 of 9 edges', '3 nodes hidden']);
  });

  it('min value drops weak edges and the nodes they alone connected, but keeps explicit nodes', () => {
    const { graph: out, removed } = pruneGraph(fixture(), { minValue: 2 }, EMPTY_HIDDEN);
    // api→cache (1) goes; cache still has cache→disk (2) so it stays.
    expect(eids(out)).toEqual(['web→api', 'api→db', 'cache→disk']);
    expect(ids(out)).toEqual(['api', 'cache', 'db', 'disk', 'lonely', 'web']);
    expect(removed).toEqual({ nodes: 0, edges: 1 });
    expect(out.notices).toContain('1 edge below 2');

    const strict = pruneGraph(fixture(), { minValue: 5 }, EMPTY_HIDDEN).graph;
    expect(eids(strict)).toEqual(['web→api']);
    // db, cache and disk only existed through dropped edges; lonely is explicit and stays.
    expect(ids(strict)).toEqual(['api', 'lonely', 'web']);
  });

  it('min value keeps edges without a value', () => {
    const g = graph([node('a'), node('b')], [edge('a', 'b')]);
    expect(pruneGraph(g, { minValue: 100 }, EMPTY_HIDDEN).graph.edges).toHaveLength(1);
  });

  it('max depth keeps N hops from the roots and treats 0 as "all"', () => {
    expect(ids(pruneGraph(fixture(), { maxDepth: 0 }, EMPTY_HIDDEN).graph)).toHaveLength(6);
    const one = pruneGraph(fixture(), { maxDepth: 1 }, EMPTY_HIDDEN);
    // Roots: web and lonely (no incoming edge). One hop from web: api.
    expect(ids(one.graph)).toEqual(['api', 'lonely', 'web']);
    expect(eids(one.graph)).toEqual(['web→api']);
    expect(one.graph.notices).toContain('3 nodes beyond depth 1');
    expect(ids(pruneGraph(fixture(), { maxDepth: 2 }, EMPTY_HIDDEN).graph)).toEqual([
      'api',
      'cache',
      'db',
      'lonely',
      'web',
    ]);
    expect(ids(pruneGraph(fixture(), { maxDepth: 3 }, EMPTY_HIDDEN).graph)).toHaveLength(6);
  });

  it('max depth starts from the most connected node when every node has an incoming edge', () => {
    // a ↔ b cycle plus hub b → c, b → d, d → e: no roots, b has the most edges.
    const g = graph(
      [node('a'), node('b'), node('c'), node('d'), node('e')],
      [edge('a', 'b'), edge('b', 'a'), edge('b', 'c'), edge('b', 'd'), edge('d', 'e'), edge('e', 'd')]
    );
    expect(ids(pruneGraph(g, { maxDepth: 1 }, EMPTY_HIDDEN).graph)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('hide leaves drops single-edge nodes once and never goes below two nodes', () => {
    const { graph: out, removed } = pruneGraph(fixture(), { hideLeaves: true }, EMPTY_HIDDEN);
    // web (1 edge), db (1 edge), disk (1 edge) are leaves; lonely has no edge and is not a leaf.
    expect(ids(out)).toEqual(['api', 'cache', 'lonely']);
    expect(eids(out)).toEqual(['api→cache']);
    expect(removed).toEqual({ nodes: 3, edges: 3 });
    expect(out.notices).toContain('3 leaves hidden');
    // Applied once: api and cache now have one edge each but are not removed.
    const chain = graph([node('a'), node('b'), node('c')], [edge('a', 'b'), edge('b', 'c')]);
    expect(ids(pruneGraph(chain, { hideLeaves: true }, EMPTY_HIDDEN).graph)).toEqual(['a', 'b', 'c']); // would leave 1 node: skipped
    const pair = graph([node('a'), node('b')], [edge('a', 'b')]);
    expect(ids(pruneGraph(pair, { hideLeaves: true }, EMPTY_HIDDEN).graph)).toEqual(['a', 'b']);
    const star = graph(
      [node('h'), node('a'), node('b'), node('c'), node('x'), node('y')],
      [edge('h', 'a'), edge('h', 'b'), edge('h', 'c'), edge('x', 'y'), edge('y', 'x'), edge('x', 'h')]
    );
    expect(ids(pruneGraph(star, { hideLeaves: true }, EMPTY_HIDDEN).graph)).toEqual(['h', 'x', 'y']);
  });

  it('collapse groups merges members into one node per group with summed edges and values', () => {
    const { graph: out, removed } = pruneGraph(fixture(), { collapseGroups: true }, EMPTY_HIDDEN);
    expect(ids(out)).toEqual(['backend', 'data', 'disk', 'lonely', 'web']);
    const data = out.nodes.find((n) => n.id === 'data')!;
    expect(data).toMatchObject({ id: 'data', label: 'data', group: 'data', value: 8, status: 'warn', explicit: false });
    expect(out.nodes.find((n) => n.id === 'backend')).toMatchObject({ label: 'backend', group: 'backend', value: 2 });
    expect(out.nodes.find((n) => n.id === 'web')).toEqual(node('web'));
    expect(eids(out)).toEqual(['web→backend', 'backend→data', 'data→disk']);
    const bd = out.edges.find((e) => e.id === 'backend→data')!;
    expect(bd).toMatchObject({
      source: 'backend',
      target: 'data',
      value: 5,
      value2: 0.5,
      sourceGroup: 'backend',
      targetGroup: 'data',
    });
    expect(removed).toEqual({ nodes: 0, edges: 0 });
    expect(out.notices).toContain('2 groups collapsed');
  });

  it('collapse groups drops edges inside a group and is a no-op without groups', () => {
    const g = graph(
      [node('a', { group: 'g' }), node('b', { group: 'g' }), node('c')],
      [edge('a', 'b', 1), edge('b', 'c', 2), edge('a', 'c', 3)]
    );
    const c = collapseGroups(g.nodes, g.edges);
    expect(c.groups).toBe(1);
    expect(c.nodes.map((n) => n.id)).toEqual(['c', 'g']);
    expect(c.edges).toHaveLength(1);
    expect(c.edges[0]).toMatchObject({ id: 'g→c', value: 5 });
    const plain = graph([node('a'), node('b')], [edge('a', 'b')]);
    const same = collapseGroups(plain.nodes, plain.edges);
    expect(same.nodes).toBe(plain.nodes);
    expect(same.groups).toBe(0);
  });

  it('applies the rules in order: hidden, min value, max depth, leaves, collapse', () => {
    // Hiding `web` first makes `api` a root; depth 1 then keeps api, db, cache; leaves removes db; collapse merges.
    const { graph: out, removed } = pruneGraph(
      fixture(),
      { minValue: 2, maxDepth: 1, hideLeaves: true, collapseGroups: true },
      { nodes: ['web'], groups: [] }
    );
    // After hidden: api,db,cache,disk,lonely / api→db(4), api→cache(1), cache→disk(2)
    // After minValue 2: api→cache dropped; nodes api,db,cache,disk,lonely (cache still has cache→disk)
    // After depth 1 (roots api, cache, lonely): api,db,cache,disk,lonely (all within one hop)
    // After leaves: api(1), db(1), cache(1), disk(1) are all leaves -> would leave only lonely: skipped
    // After collapse: backend(api), data(db,cache), disk, lonely; edges backend→data(4), data→disk(2)
    expect(ids(out)).toEqual(['backend', 'data', 'disk', 'lonely']);
    expect(eids(out)).toEqual(['backend→data', 'data→disk']);
    expect(removed).toEqual({ nodes: 1, edges: 2 });
    expect(out.notices).toEqual(['Top 4 of 9 edges', '1 node hidden', '1 edge below 2', '2 groups collapsed']);
  });

  it('is deterministic and keeps the truncation counts', () => {
    const a = pruneGraph(fixture(), { hideLeaves: true, collapseGroups: true }, { nodes: [], groups: ['backend'] });
    const b = pruneGraph(fixture(), { hideLeaves: true, collapseGroups: true }, { nodes: [], groups: ['backend'] });
    expect(a).toEqual(b);
    expect(a.graph.totalNodes).toBe(6);
    expect(a.graph.totalEdges).toBe(4);
  });
});
