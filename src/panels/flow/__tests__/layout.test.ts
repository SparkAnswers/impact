import { breakCycles, layeredLayout, layoutGraph, nodeSetKey, radialLayout, rankNodes, wrapLayer, type LayoutEdge, type LayoutNode } from '../lib/layout';

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

  it('radial layout keeps members of a group contiguous on their ring', () => {
    const groups = ['ns-a', 'ns-b', 'ns-c'];
    // Ids interleave the groups so a plain id order would scatter them around the ring.
    const leaves = Array.from({ length: 12 }, (_, i) => n(`leaf${i}`, groups[i % 3]));
    const nodes = [n('hub'), ...leaves];
    const edges = leaves.map((l) => e('hub', l.id));
    const { positions, ranks } = radialLayout(nodes, edges, { ...opts, direction: 'radial' });
    expect(overlaps(nodes, positions)).toBe(false);
    const angleOf = (id: string) => Math.atan2(positions.get(id)!.y + 26, positions.get(id)!.x + 70);
    const order = leaves
      .filter((l) => ranks.get(l.id) === 1)
      .sort((a, b) => angleOf(a.id) - angleOf(b.id))
      .map((l) => l.group!);
    // Each group is one uninterrupted arc (allowing one wrap-around at the start/end of the circle).
    const runs = order.filter((g, i) => i === 0 || g !== order[i - 1]);
    if (runs.length > 1 && runs[0] === runs[runs.length - 1]) {
      runs.pop();
    }
    expect(new Set(runs).size).toBe(runs.length);
    expect(runs.sort()).toEqual(groups);
  });

  it('radial layout gives each connected component its own hub and packs them without overlaps', () => {
    const a = [n('a'), ...Array.from({ length: 6 }, (_, i) => n(`a${i}`))];
    const b = [n('b'), ...Array.from({ length: 3 }, (_, i) => n(`b${i}`))];
    const nodes = [...b, ...a];
    const edges = [...a.slice(1).map((x) => e('a', x.id)), ...b.slice(1).map((x) => e('b', x.id)), e('b0', 'b1')];
    const { positions, ranks, centres } = radialLayout(nodes, edges, { ...opts, direction: 'radial' });
    expect(positions.size).toBe(nodes.length);
    expect(overlaps(nodes, positions)).toBe(false);
    expect(ranks.get('a')).toBe(0);
    expect(ranks.get('b')).toBe(0);
    expect(ranks.get('a3')).toBe(1);
    expect(ranks.get('b2')).toBe(1);
    // The bigger component comes first (row-major: top row, left), both have their own ring centre.
    expect(centres!.get('a')).not.toEqual(centres!.get('b'));
    expect(centres!.get('a0')).toEqual(centres!.get('a'));
    const top = (ids: LayoutNode[]) => Math.min(...ids.map((x) => positions.get(x.id)!.y));
    expect(top(a)).toBeLessThanOrEqual(top(b));
    // Each component's nodes sit around their hub, not around the other one.
    const dist = (id: string, hub: string) => Math.hypot(positions.get(id)!.x - positions.get(hub)!.x, positions.get(id)!.y - positions.get(hub)!.y);
    for (const x of a.slice(1)) {
      expect(dist(x.id, 'a')).toBeLessThan(dist(x.id, 'b'));
    }
    // Deterministic regardless of input order.
    const again = radialLayout(nodes.slice().reverse(), edges.slice().reverse(), { ...opts, direction: 'radial' }).positions;
    expect(Array.from(again.entries()).sort()).toEqual(Array.from(positions.entries()).sort());
  });

  it('radial layout places isolated nodes last and keeps many small components compact', () => {
    const hub = [n('hub'), ...Array.from({ length: 5 }, (_, i) => n(`leaf${i}`))];
    const singles = [n('lonely-a'), n('lonely-b'), n('lonely-c')];
    const nodes = [...singles, ...hub];
    const edges = hub.slice(1).map((x) => e('hub', x.id));
    const { positions, ranks } = radialLayout(nodes, edges, { ...opts, direction: 'radial' });
    expect(positions.size).toBe(nodes.length);
    expect(overlaps(nodes, positions)).toBe(false);
    for (const s of singles) {
      expect(ranks.get(s.id)).toBe(0);
      // Packed after the connected component: to its right or below it.
      const p = positions.get(s.id)!;
      const hx = Math.max(...hub.map((x) => positions.get(x.id)!.x + x.w));
      const hy = Math.max(...hub.map((x) => positions.get(x.id)!.y + x.h));
      expect(p.x >= hx || p.y >= hy).toBe(true);
    }
    // 150 service → process pairs: a grid that follows the panel aspect instead of one ring with long spokes.
    const pairs = Array.from({ length: 150 }, (_, i) => [n(`svc${i}`), n(`proc${i}`)]).flat();
    const pairEdges = Array.from({ length: 150 }, (_, i) => e(`svc${i}`, `proc${i}`));
    const grid = radialLayout(pairs, pairEdges, { ...opts, direction: 'radial', aspect: 2 });
    expect(overlaps(pairs, grid.positions)).toBe(false);
    const xs = Array.from(grid.positions.values()).map((p) => p.x);
    const ys = Array.from(grid.positions.values()).map((p) => p.y);
    const w = Math.max(...xs) - Math.min(...xs) + 140;
    const h = Math.max(...ys) - Math.min(...ys) + 52;
    expect(w / h).toBeGreaterThan(1.3);
    expect(w / h).toBeLessThan(3);
    for (let i = 0; i < 150; i++) {
      expect(grid.ranks.get(`svc${i}`)! + grid.ranks.get(`proc${i}`)!).toBe(1);
      // Partners stay next to each other.
      const s = grid.positions.get(`svc${i}`)!;
      const p = grid.positions.get(`proc${i}`)!;
      expect(Math.hypot(s.x - p.x, s.y - p.y)).toBeLessThan(140 + 24 + 52);
    }
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
    expect(nodeSetKey([n('a')], opts)).not.toBe(nodeSetKey([n('a')], { ...opts, wrap: 5 }));
  });

  describe('wrap', () => {
    const kids = Array.from({ length: 12 }, (_, i) => n(`t${i}`));
    const nodes = [n('src'), ...kids, n('sink')];
    const edges = [...kids.map((k) => e('src', k.id)), ...kids.map((k) => e(k.id, 'sink'))];

    it('splits an ordered layer into near-equal bands', () => {
      expect(wrapLayer(['a', 'b', 'c'], 0)).toEqual([['a', 'b', 'c']]);
      expect(wrapLayer(['a', 'b', 'c'], undefined)).toEqual([['a', 'b', 'c']]);
      expect(wrapLayer(['a', 'b', 'c'], 3)).toEqual([['a', 'b', 'c']]);
      expect(wrapLayer(['a', 'b', 'c', 'd', 'e'], 2)).toEqual([['a', 'b'], ['c', 'd'], ['e']]);
      expect(wrapLayer(['a', 'b', 'c', 'd', 'e', 'f', 'g'], 3)).toEqual([['a', 'b', 'c'], ['d', 'e'], ['f', 'g']]);
    });

    it('folds a 12-node layer into 3 bands with wrap 5, keeping ranks and the following layer after the last band', () => {
      const { positions, ranks } = layeredLayout(nodes, edges, { ...opts, wrap: 5 });
      expect(overlaps(nodes, positions)).toBe(false);
      const xs = Array.from(new Set(kids.map((k) => positions.get(k.id)!.x))).sort((a, b) => a - b);
      expect(xs).toHaveLength(3);
      // Bands are sub-columns separated by the node gap, not the layer gap.
      expect(xs[1] - xs[0]).toBe(140 + 24);
      expect(xs[2] - xs[1]).toBe(140 + 24);
      expect(xs[0]).toBe(140 + 120);
      // Four nodes per band.
      for (const x of xs) {
        expect(kids.filter((k) => positions.get(k.id)!.x === x)).toHaveLength(4);
      }
      // Ranks stay the logical layer index.
      for (const k of kids) {
        expect(ranks.get(k.id)).toBe(1);
      }
      expect(ranks.get('sink')).toBe(2);
      // The next real layer starts a layer gap after the last band.
      expect(positions.get('sink')!.x).toBe(xs[2] + 140 + 120);
      // Edges still point right.
      for (const ed of edges) {
        expect(positions.get(ed.target)!.x).toBeGreaterThan(positions.get(ed.source)!.x);
      }
      // The middle band is staggered by half a node step.
      const minY = (x: number) => Math.min(...kids.filter((k) => positions.get(k.id)!.x === x).map((k) => positions.get(k.id)!.y));
      expect(minY(xs[1]) - minY(xs[0])).toBe((52 + 24) / 2);
      expect(minY(xs[2])).toBe(minY(xs[0]));
    });

    it('wraps top to bottom along the y axis', () => {
      const { positions } = layeredLayout(nodes, edges, { ...opts, direction: 'tb', wrap: 5 });
      expect(overlaps(nodes, positions)).toBe(false);
      const ys = Array.from(new Set(kids.map((k) => positions.get(k.id)!.y))).sort((a, b) => a - b);
      expect(ys).toHaveLength(3);
      expect(ys[1] - ys[0]).toBe(52 + 24);
      expect(positions.get('sink')!.y).toBe(ys[2] + 52 + 120);
    });

    it('wrap 0 (or a wrap wider than the layer) gives the same positions as no wrap option', () => {
      const plain = layeredLayout(nodes, edges, opts).positions;
      expect(layeredLayout(nodes, edges, { ...opts, wrap: 0 }).positions).toEqual(plain);
      expect(layeredLayout(nodes, edges, { ...opts, wrap: 12 }).positions).toEqual(plain);
      expect(layoutGraph(nodes, edges, { ...opts, wrap: 0, aspect: 2 }).positions).toEqual(layoutGraph(nodes, edges, { ...opts, aspect: 2 }).positions);
    });

    it('wrapping makes a huge fan-out much shorter', () => {
      const many = Array.from({ length: 60 }, (_, i) => n(`c${i}`));
      const all = [n('root'), ...many];
      const ed = many.map((k) => e('root', k.id));
      const height = (pos: Map<string, { y: number }>) => Math.max(...all.map((k) => pos.get(k.id)!.y + 52)) - Math.min(...all.map((k) => pos.get(k.id)!.y));
      const tall = layeredLayout(all, ed, opts).positions;
      const wrapped = layeredLayout(all, ed, { ...opts, wrap: 10 }).positions;
      expect(overlaps(all, wrapped)).toBe(false);
      expect(height(wrapped)).toBeLessThan(height(tall) / 4);
    });
  });
});
