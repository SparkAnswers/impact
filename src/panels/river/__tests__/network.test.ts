import { type DataFrame, FieldType, toDataFrame } from '@grafana/data';
import {
  autoPositions,
  buildNetwork,
  demoNetworkFrames,
  countCrossings,
  dominantEdges,
  reduceCrossings,
  spreadLabels,
  edgePath,
  edgesToChannels,
  extractNetwork,
  findCaptionEdge,
  hasEdges,
  networkParticleCounts,
  resolvePositions,
  reversePairs,
} from '../lib/network';
import { allocateParticles } from '../lib/render';
import { DEFAULT_NETWORK, MAX_NETWORK_CHANNELS, MAX_NETWORK_NODES, MAX_TOTAL_PARTICLES, MIN_NETWORK_PARTICLES } from '../types';

const edgeFrame = (rows: Array<[string, string, number, number?]>): DataFrame =>
  toDataFrame({
    refId: 'A',
    fields: [
      { name: 'source', type: FieldType.string, values: rows.map((r) => r[0]) },
      { name: 'target', type: FieldType.string, values: rows.map((r) => r[1]) },
      { name: 'value', type: FieldType.number, values: rows.map((r) => r[2]), config: { unit: 'short' } },
      { name: 'errors', type: FieldType.number, values: rows.map((r) => r[3] ?? null) },
    ],
  });

const small = edgeFrame([
  ['a', 'b', 10, 2],
  ['b', 'a', -4, 1],
  ['a', 'c', 6, 4],
]);

const W = 800;
const H = 400;

describe('edge → channel conversion', () => {
  it('makes one channel per edge, bound to the edge value with a shared range', () => {
    const graph = extractNetwork([small], DEFAULT_NETWORK);
    const pos = resolvePositions(graph, autoPositions(graph, 'lr', 2, 14), undefined);
    const bound = edgesToChannels(graph, pos, DEFAULT_NETWORK, W, H);
    expect(bound.map((b) => b.channel.id)).toEqual(['a→b', 'b→a', 'a→c']);
    expect(bound.map((b) => b.latest)).toEqual([10, -4, 6]);
    expect(bound.every((b) => b.range[0] === -4 && b.range[1] === 10)).toBe(true);
    expect(bound.every((b) => b.channel.path.length === 3)).toBe(true);
    expect(bound[0].field?.config.unit).toBe('short');
  });

  it('flows negative links backwards with "By sign" and forwards otherwise', () => {
    const graph = extractNetwork([small], DEFAULT_NETWORK);
    const pos = resolvePositions(graph, autoPositions(graph, 'lr', 2, 14), undefined);
    const bySign = edgesToChannels(graph, pos, { ...DEFAULT_NETWORK, direction: 'bySign' }, W, H);
    expect(bySign.map((b) => b.direction)).toEqual([1, -1, 1]);
    const fwd = edgesToChannels(graph, pos, { ...DEFAULT_NETWORK, direction: 'forward' }, W, H);
    expect(fwd.map((b) => b.direction)).toEqual([1, 1, 1]);
  });

  it('uses a fixed width, or the second value normalised to its maximum', () => {
    const graph = extractNetwork([small], DEFAULT_NETWORK);
    const pos = resolvePositions(graph, autoPositions(graph, 'lr', 2, 14), undefined);
    const fixed = edgesToChannels(graph, pos, { ...DEFAULT_NETWORK, widthPx: 40 }, W, H);
    expect(fixed.map((b) => b.channel.widthPx)).toEqual([40, 40, 40]);
    const withErrors = { ...DEFAULT_NETWORK, widthPx: 40, value2Field: 'errors' };
    const byErrors = edgesToChannels(extractNetwork([small], withErrors), pos, withErrors, W, H);
    expect(byErrors.map((b) => b.channel.widthPx)).toEqual([20, 10, 40]);
  });

  it('reads labelled series too (source/target labels, last value)', () => {
    const series = toDataFrame({
      refId: 'B',
      fields: [
        { name: 'time', type: FieldType.time, values: [1, 2] },
        { name: 'rate', type: FieldType.number, values: [1, 7], labels: { source: 'x', target: 'y' } },
      ],
    });
    const graph = extractNetwork([series], DEFAULT_NETWORK);
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0].value).toBe(7);
    expect(hasEdges([series], DEFAULT_NETWORK)).toBe(true);
    expect(hasEdges([], DEFAULT_NETWORK)).toBe(false);
  });
});

describe('reverse pairs', () => {
  it('detects both members of a reverse pair', () => {
    const graph = extractNetwork([small], DEFAULT_NETWORK);
    expect(Array.from(reversePairs(graph.edges)).sort()).toEqual(['a→b', 'b→a']);
  });

  it('offsets the two directions to opposite sides of the straight line', () => {
    const a = { x: 100, y: 200 };
    const b = { x: 500, y: 200 };
    const ab = edgePath(a, b, { rA: 14, rB: 14, endLateral: 20, curve: 0 });
    const ba = edgePath(b, a, { rA: 14, rB: 14, endLateral: 20, curve: 0 });
    // a → b travels +x; right of travel in canvas coordinates is +y. b → a is the mirror.
    expect(ab[1].y).toBeCloseTo(220);
    expect(ba[1].y).toBeCloseTo(180);
    expect(ab[0].x).toBeGreaterThan(a.x + 14);
    expect(ab[2].x).toBeLessThan(b.x - 14);
    // separation at the middle is twice the lateral offset
    expect(Math.abs(ab[1].y - ba[1].y)).toBeCloseTo(40);
  });

  it('bends single links gently and keeps the separation of pairs wider than the channels', () => {
    const graph = extractNetwork([small], DEFAULT_NETWORK);
    const pos = new Map([
      ['a', { x: 0.1, y: 0.5 }],
      ['b', { x: 0.9, y: 0.5 }],
      ['c', { x: 0.5, y: 0.1 }],
    ]);
    const bound = edgesToChannels(graph, pos, { ...DEFAULT_NETWORK, widthPx: 30, curve: 0.1 }, W, H);
    const ab = bound[0].channel.path.map((p) => ({ x: p.x * W, y: p.y * H }));
    const ba = bound[1].channel.path.map((p) => ({ x: p.x * W, y: p.y * H }));
    const sep = Math.abs(ab[1].y - ba[1].y);
    expect(sep).toBeGreaterThan(30 + 8);
    // single link a → c: control point is off the straight line, but not by much
    const ac = bound[2].channel.path.map((p) => ({ x: p.x * W, y: p.y * H }));
    const mx = (ac[0].x + ac[2].x) / 2;
    const my = (ac[0].y + ac[2].y) / 2;
    const off = Math.hypot(ac[1].x - mx, ac[1].y - my);
    expect(off).toBeGreaterThan(5);
    expect(off).toBeLessThan(80);
    // A negative curve bends to the other side of the straight line; 0 is straight.
    const neg = edgesToChannels(graph, pos, { ...DEFAULT_NETWORK, widthPx: 30, curve: -0.1 }, W, H)[2].channel.path.map((p) => ({ x: p.x * W, y: p.y * H }));
    expect(Math.sign(neg[1].x - mx)).toBe(-Math.sign(ac[1].x - mx));
    const straight = edgesToChannels(graph, pos, { ...DEFAULT_NETWORK, widthPx: 30, curve: 0 }, W, H)[2].channel.path.map((p) => ({ x: p.x * W, y: p.y * H }));
    expect(Math.hypot(straight[1].x - mx, straight[1].y - my)).toBeLessThan(1e-6);
  });
});

describe('positions', () => {
  it('ranks a reverse pair by its stronger direction, not by id order', () => {
    // access-2 → dist-2 (140) is weaker than dist-2 → access-2 (220): dist-2 must stay upstream.
    const graph = extractNetwork(demoNetworkFrames(0), DEFAULT_NETWORK);
    expect(dominantEdges(graph.edges).map((e) => e.id)).not.toContain('access-2→dist-2');
    expect(dominantEdges(graph.edges).map((e) => e.id)).toContain('dist-2→access-2');
    const pos = autoPositions(graph, 'lr', 2, 14);
    expect(pos.get('core-a')!.x).toBeLessThan(pos.get('dist-2')!.x);
    expect(pos.get('dist-2')!.x).toBeLessThan(pos.get('access-2')!.x);
    expect(pos.get('dist-1')!.x).toBeCloseTo(pos.get('dist-3')!.x, 5);
    expect(pos.get('access-1')!.x).toBeCloseTo(pos.get('access-4')!.x, 5);
    expect(pos.get('storage')!.x).toBeGreaterThan(pos.get('access-4')!.x);
  });

  it('auto positions are normalised, padded, stable and distinct', () => {
    const graph = extractNetwork([small], DEFAULT_NETWORK);
    const p1 = autoPositions(graph, 'lr', 2, 14);
    const p2 = autoPositions(graph, 'lr', 2, 14);
    expect(Array.from(p1.entries())).toEqual(Array.from(p2.entries()));
    for (const p of p1.values()) {
      expect(p.x).toBeGreaterThanOrEqual(0.05);
      expect(p.x).toBeLessThanOrEqual(0.95);
      expect(p.y).toBeGreaterThanOrEqual(0.1);
      expect(p.y).toBeLessThanOrEqual(0.9);
    }
    const keys = Array.from(p1.values()).map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(p1.get('a')!.x).toBeLessThan(p1.get('b')!.x);
  });

  it('spreads each layer evenly across the cross axis, keeping order, unless switched off', () => {
    // one source feeding three targets: with spreading the source sits mid-height and the targets span it.
    const frame = toDataFrame({
      refId: 'A',
      fields: [
        { name: 'source', type: FieldType.string, values: ['s', 's', 's', 's2'] },
        { name: 'target', type: FieldType.string, values: ['t1', 't2', 't3', 't1'] },
        { name: 'value', type: FieldType.number, values: [1, 2, 3, 4] },
      ],
    });
    const graph = extractNetwork([frame], DEFAULT_NETWORK);
    const spread = autoPositions(graph, 'lr', 3, 14);
    const ys = ['t1', 't2', 't3'].map((id) => spread.get(id)!.y).sort((a, b) => a - b);
    expect(ys[0]).toBeCloseTo(0.14, 5);
    expect(ys[1]).toBeCloseTo(0.5, 5);
    expect(ys[2]).toBeCloseTo(0.86, 5);
    const src = ['s', 's2'].map((id) => spread.get(id)!.y).sort((a, b) => a - b);
    expect(src[0]).toBeCloseTo(0.14, 5);
    expect(src[1]).toBeCloseTo(0.86, 5);
    const compact = autoPositions(graph, 'lr', 3, 14, false);
    const cs = ['s', 's2'].map((id) => compact.get(id)!.y).sort((a, b) => a - b);
    expect(cs[1] - cs[0]).toBeLessThan(0.72);
    // Top to bottom spreads along x instead.
    const tb = autoPositions(graph, 'tb', 1, 14);
    const xs = ['t1', 't2', 't3'].map((id) => tb.get(id)!.x).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(0.08, 5);
    expect(xs[1]).toBeCloseTo(0.5, 5);
    expect(xs[2]).toBeCloseTo(0.92, 5);
  });

  it('typed positions override the auto layout and dragged overrides win over both', () => {
    const graph = extractNetwork([small], DEFAULT_NETWORK);
    const auto = autoPositions(graph, 'lr', 2, 14);
    const pos = resolvePositions(graph, auto, {
      positions: [
        { id: 'a', x: 0.2, y: 0.3 },
        { id: 'b', x: 0.7, y: 0.3 },
        { id: 'zzz', x: 0, y: 0 },
      ],
      overrides: { b: { x: 0.9, y: 0.9 }, c: { x: 1.4, y: -1 } },
    });
    expect(pos.get('a')).toEqual({ x: 0.2, y: 0.3 });
    expect(pos.get('b')).toEqual({ x: 0.9, y: 0.9 });
    expect(pos.get('c')).toEqual({ x: 1, y: 0 });
    expect(pos.has('zzz')).toBe(false);
  });

  it('falls back to the auto layout for unknown ids and ignores malformed entries', () => {
    const graph = extractNetwork([small], DEFAULT_NETWORK);
    const auto = autoPositions(graph, 'lr', 2, 14);
    const pos = resolvePositions(graph, auto, { positions: [{ id: 'a', x: Number.NaN, y: 0.1 }], overrides: { a: { x: 0.5 } as any } });
    expect(pos.get('a')).toEqual(auto.get('a'));
  });
});

describe('crossing reduction and labels', () => {
  it('swaps nodes within a layer when it removes crossings', () => {
    const pos = new Map([
      ['a', { x: 0.1, y: 0.3 }],
      ['b', { x: 0.1, y: 0.7 }],
      ['c', { x: 0.9, y: 0.3 }],
      ['d', { x: 0.9, y: 0.7 }],
    ]);
    const edges = [
      { source: 'a', target: 'd' },
      { source: 'b', target: 'c' },
    ];
    expect(countCrossings(pos, edges)).toBe(1);
    const fixed = reduceCrossings(pos, edges, 'y');
    expect(countCrossings(fixed, edges)).toBe(0);
    // input untouched, layer membership preserved
    expect(pos.get('a')).toEqual({ x: 0.1, y: 0.3 });
    expect(fixed.get('c')!.x).toBe(0.9);
    expect(new Set(Array.from(fixed.values()).map((p) => p.y))).toEqual(new Set([0.3, 0.7]));
  });

  it('the demo auto layout has few crossings', () => {
    const graph = extractNetwork(demoNetworkFrames(0), DEFAULT_NETWORK);
    const pos = autoPositions(graph, 'lr', 2, 14);
    expect(countCrossings(pos, graph.edges)).toBeLessThanOrEqual(2);
  });

  it('slides colliding value labels along their path', () => {
    // two channels whose midpoints coincide: the second one moves
    const pts = spreadLabels(2, (i, t) => ({ x: 100 + (i ? (t - 0.5) * 400 : 0), y: 50 }));
    expect(pts[0]).toEqual({ x: 100, y: 50 });
    expect(pts[1].x).not.toBe(100);
    expect(Math.abs(pts[1].x - 100)).toBeGreaterThanOrEqual(72);
  });
});

describe('caps and budget', () => {
  it('keeps at most 60 channels and 100 nodes', () => {
    const rows: Array<[string, string, number]> = [];
    for (let i = 0; i < 150; i++) {
      rows.push([`n${i}`, `n${(i + 1) % 150}`, i]);
    }
    const graph = extractNetwork([edgeFrame(rows)], DEFAULT_NETWORK);
    expect(graph.edges.length).toBeLessThanOrEqual(MAX_NETWORK_CHANNELS);
    expect(graph.nodes.length).toBeLessThanOrEqual(MAX_NETWORK_NODES);
    expect(graph.notices.join(' ')).toMatch(/Showing 60 of 150/);
    // highest values are kept
    expect(graph.edges.every((e) => (e.value ?? 0) >= 90)).toBe(true);
  });

  it('splits the particle budget by value share with a floor, then caps the total', () => {
    const counts = networkParticleCounts([900, 100, 0], 1000);
    expect(counts).toEqual([900, MIN_NETWORK_PARTICLES, MIN_NETWORK_PARTICLES]);
    const capped = allocateParticles(networkParticleCounts(Array(60).fill(1000), 60000), MAX_TOTAL_PARTICLES);
    expect(capped.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(MAX_TOTAL_PARTICLES);
    expect(networkParticleCounts([], 1000)).toEqual([]);
    expect(networkParticleCounts([undefined, undefined], 1000)).toEqual([500, 500]);
  });
});

describe('buildNetwork', () => {
  it('returns pucks in px, a total and notices', () => {
    const m = buildNetwork([small], DEFAULT_NETWORK, W, H);
    expect(m.nodes.map((n) => n.id)).toEqual(['a', 'b', 'c']);
    expect(m.nodes.every((n) => n.x >= 0 && n.x <= W && n.y >= 0 && n.y <= H && n.r === 14)).toBe(true);
    expect(m.total).toBe(12);
    expect(m.captionValue).toBe(12);
    expect(m.captionName).toBe('Total');
    expect(m.valueField?.name).toBe('value');
  });

  it('focus narrows the map to the node and its chain, keeps the full count, ignores unknown ids', () => {
    // demo network: core-a → dist-1/dist-2, dist-1 → access-1/access-2, …; storage hangs off access-4 only.
    const all = buildNetwork(demoNetworkFrames(0), DEFAULT_NETWORK, W, H);
    const m = buildNetwork(demoNetworkFrames(0), DEFAULT_NETWORK, W, H, 'storage');
    expect(m.focusId).toBe('storage');
    expect(m.allNodes).toBe(all.nodes.length);
    const ids = new Set(m.nodes.map((n) => n.id));
    // Upstream through access-4 and dist-3 (and, via the access-3 ⇄ dist-3 reverse pair, further up); never access-1.
    expect(['storage', 'access-4', 'dist-3', 'core-b'].every((id) => ids.has(id))).toBe(true);
    expect(ids.has('access-1')).toBe(false);
    expect(m.nodes.length).toBeLessThan(all.nodes.length);
    expect(m.bound.every((b) => ids.has(b.channel.id.split('→')[0]) && ids.has(b.channel.id.split('→')[1]))).toBe(true);
    // One hop downstream only.
    const one = buildNetwork(demoNetworkFrames(0), { ...DEFAULT_NETWORK, focusHops: 1, focusDirection: 'down' }, W, H, 'core-a');
    expect(one.nodes.map((n) => n.id).sort()).toEqual(['core-a', 'dist-1', 'dist-2']);
    const none = buildNetwork(demoNetworkFrames(0), DEFAULT_NETWORK, W, H, 'nope');
    expect(none.focusId).toBeUndefined();
    expect(none.nodes.length).toBe(all.nodes.length);
  });

  it('caption follows the selected channel', () => {
    const m = buildNetwork([small], { ...DEFAULT_NETWORK, captionChannel: 'A > C' }, W, H);
    expect(m.captionValue).toBe(6);
    expect(m.captionName).toBe('a → c');
    expect(findCaptionEdge(m.graph, 'nope')).toBeUndefined();
    expect(findCaptionEdge(m.graph, 'b→a')?.value).toBe(-4);
  });

  it('decorates nodes from a node frame (label, status)', () => {
    const m = buildNetwork(demoNetworkFrames(0), DEFAULT_NETWORK, W, H);
    expect(m.graph.edges).toHaveLength(14);
    expect(m.nodes).toHaveLength(10);
    expect(m.nodes.find((n) => n.id === 'dist-3')?.status).toBe('warn');
    expect(m.nodes.find((n) => n.id === 'core-a')?.label).toBe('CORE A');
    expect(reversePairs(m.graph.edges).size).toBe(4);
  });
});
