import { breakCycles, layeredLayout, layoutGraph, nodeSetKey, radialLayout, rankNodes, type LayoutEdge, type LayoutNode } from '../lib/layout';

const n = (id: string, group?: string): LayoutNode => ({ id, w: 140, h: 52, group });
const e = (source: string, target: string): LayoutEdge => ({ source, target });
const opts = { direction: 'lr' as const, layerGap: 120, nodeGap: 24 };

const overlaps = (nodes: LayoutNode[], pos: Map<string, { x: number; y: number }>) => {
  const rects = nodes.map((nd) => ({ ...pos.get(nd.id)!, w: nd.w, h: nd.h }));
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i];
      const b = rects[j];
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
        return true;
      }
    }
  }
  return false;
};

describe('layout', () => {
  it('ranks by longest path from the sources', () => {
    const nodes = [n('a'), n('b'), n('c'), n('d')];
    const ranks = rankNodes(nodes, [e('a', 'b'), e('b', 'c'), e('a', 'c'), e('d', 'c')]);
    expect(ranks.get('a')).toBe(0);
    expect(ranks.get('d')).toBe(0);
    expect(ranks.get('b')).toBe(1);
    expect(ranks.get('c')).toBe(2); // longest path a→b→c
  });

  it('breaks cycles deterministically and still ranks every node', () => {
    const nodes = [n('a'), n('b'), n('c')];
    const kept = breakCycles(nodes, [e('a', 'b'), e('b', 'c'), e('c', 'a'), e('b', 'b')]);
    expect(kept).toHaveLength(2);
    const ranks = rankNodes(nodes, kept);
    expect(Array.from(ranks.values()).sort()).toEqual([0, 1, 2]);
  });

  it('places layers left to right without overlaps and keeps edges pointing right', () => {
    const nodes = [n('web'), n('api'), n('db'), n('cache'), n('auth'), n('queue'), n('worker')];
    const edges = [e('web', 'api'), e('web', 'auth'), e('api', 'db'), e('api', 'cache'), e('api', 'queue'), e('queue', 'worker'), e('worker', 'db')];
    const { positions, ranks } = layeredLayout(nodes, edges, opts);
    expect(positions.size).toBe(7);
    expect(overlaps(nodes, positions)).toBe(false);
    for (const ed of edges) {
      expect(positions.get(ed.target)!.x).toBeGreaterThan(positions.get(ed.source)!.x);
    }
    expect(ranks.get('db')).toBe(4);
    // Layer spacing: node width + layer gap.
    expect(positions.get('api')!.x - positions.get('web')!.x).toBe(140 + 120);
  });

  it('top to bottom swaps the axes', () => {
    const nodes = [n('a'), n('b'), n('c')];
    const { positions } = layeredLayout(nodes, [e('a', 'b'), e('a', 'c')], { ...opts, direction: 'tb' });
    expect(positions.get('b')!.y).toBeGreaterThan(positions.get('a')!.y);
    expect(positions.get('b')!.y).toBe(positions.get('c')!.y);
    expect(positions.get('c')!.x - positions.get('b')!.x).toBe(140 + 24);
    expect(overlaps(nodes, positions)).toBe(false);
  });

  it('is deterministic regardless of input order', () => {
    const nodes = [n('x'), n('m'), n('a'), n('k'), n('z')];
    const edges = [e('x', 'm'), e('a', 'm'), e('m', 'k'), e('m', 'z'), e('a', 'z')];
    const one = layeredLayout(nodes, edges, opts).positions;
    const two = layeredLayout(nodes.slice().reverse(), edges.slice().reverse(), opts).positions;
    expect(Array.from(one.entries()).sort()).toEqual(Array.from(two.entries()).sort());
  });

  it('reduces crossings with barycenter ordering', () => {
    // Two sources each feeding one target; a naive id order (a1,a2 | b2,b1) would cross.
    const nodes = [n('a1'), n('a2'), n('b1'), n('b2')];
    const edges = [e('a1', 'b2'), e('a2', 'b1')];
    const { positions } = layeredLayout(nodes, edges, opts);
    const order = (ids: string[]) => ids.sort((p, q) => positions.get(p)!.y - positions.get(q)!.y);
    expect(order(['b1', 'b2'])).toEqual(order(['a2', 'a1']).map((id) => (id === 'a2' ? 'b1' : 'b2')));
  });

  it('keeps groups adjacent within a layer', () => {
    const nodes = [n('s'), n('p1', 'ns-a'), n('p2', 'ns-b'), n('p3', 'ns-a'), n('p4', 'ns-b')];
    const edges = [e('s', 'p1'), e('s', 'p2'), e('s', 'p3'), e('s', 'p4')];
    const { positions } = layeredLayout(nodes, edges, opts);
    const ordered = ['p1', 'p2', 'p3', 'p4'].sort((p, q) => positions.get(p)!.y - positions.get(q)!.y).map((id) => nodes.find((x) => x.id === id)!.group);
    expect(ordered.join(',')).toMatch(/^(ns-a,ns-a,ns-b,ns-b|ns-b,ns-b,ns-a,ns-a)$/);
  });

  it('radial layout centres the hub and rings the rest without overlaps', () => {
    const nodes = [n('hub'), ...Array.from({ length: 10 }, (_, i) => n(`leaf${i}`)), n('far')];
    const edges = [...Array.from({ length: 10 }, (_, i) => e('hub', `leaf${i}`)), e('leaf0', 'far')];
    const { positions, ranks } = radialLayout(nodes, edges, { ...opts, direction: 'radial' });
    expect(positions.get('hub')).toEqual({ x: -70, y: -26 });
    expect(ranks.get('far')).toBe(2);
    expect(overlaps(nodes, positions)).toBe(false);
    // Ring 2 lies outside ring 1 (vertically, the single far node sits at the bottom of its ring).
    const cy = (id: string) => Math.abs(positions.get(id)!.y + 26);
    for (let i = 0; i < 10; i++) {
      expect(cy('far')).toBeGreaterThan(cy(`leaf${i}`));
    }
    // Wide panel: the rings become ellipses that follow the aspect, still without overlaps.
    const wide = radialLayout(nodes, edges, { ...opts, direction: 'radial', aspect: 2.5 }).positions;
    expect(overlaps(nodes, wide)).toBe(false);
    const xs = Array.from(wide.values()).map((p) => p.x);
    const ys = Array.from(wide.values()).map((p) => p.y);
    const w = Math.max(...xs) - Math.min(...xs) + 140;
    const h = Math.max(...ys) - Math.min(...ys) + 52;
    expect(w / h).toBeGreaterThan(1.8);
    expect(layoutGraph(nodes, edges, { ...opts, direction: 'radial' }).positions.get('hub')).toEqual({ x: -70, y: -26 });
  });

  it('handles empty input and isolated nodes', () => {
    expect(layeredLayout([], [], opts).positions.size).toBe(0);
    expect(radialLayout([], [], opts).positions.size).toBe(0);
    const { positions } = layeredLayout([n('a'), n('b')], [], opts);
    expect(overlaps([n('a'), n('b')], positions)).toBe(false);
  });

  it('stretches the layer gap towards the panel aspect, bounded at 4x', () => {
    const nodes = [n('src'), ...Array.from({ length: 12 }, (_, i) => n(`t${i}`))];
    const edges = Array.from({ length: 12 }, (_, i) => e('src', `t${i}`));
    const plain = layeredLayout(nodes, edges, opts).positions;
    const wide = layeredLayout(nodes, edges, { ...opts, aspect: 2 }).positions;
    const gap = (pos: Map<string, { x: number }>) => pos.get('t0')!.x - pos.get('src')!.x - 140;
    expect(gap(plain)).toBe(120);
    expect(gap(wide)).toBeGreaterThan(120);
    expect(gap(wide)).toBeLessThanOrEqual(480);
    expect(overlaps(nodes, wide)).toBe(false);
    // Never narrower than the configured gap.
    expect(gap(layeredLayout(nodes, edges, { ...opts, aspect: 0.1 }).positions)).toBe(120);
  });

  it('nodeSetKey ignores order and edges but not layout options', () => {
    expect(nodeSetKey([n('b'), n('a')], opts)).toBe(nodeSetKey([n('a'), n('b')], opts));
    expect(nodeSetKey([n('a')], opts)).not.toBe(nodeSetKey([n('a')], { ...opts, direction: 'tb' }));
  });
});
