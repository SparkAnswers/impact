export type LayoutDirection = 'lr' | 'tb' | 'radial';

export interface Point {
  x: number;
  y: number;
}

/**
 * Hand-rolled layered ("Sugiyama-lite") and radial layouts for data-driven diagrams.
 * Deterministic: the same ids, edges and sizes always produce the same positions (ties are broken by id).
 */

export interface LayoutNode {
  id: string;
  w: number;
  h: number;
  /** Optional group; nodes of a group are kept adjacent within a layer (or on a ring) */
  group?: string;
}

export interface LayoutEdge {
  source: string;
  target: string;
}

export interface LayoutOptions {
  direction: LayoutDirection;
  /** Distance between layers (edge length), in canvas px */
  layerGap: number;
  /** Distance between neighbouring nodes in a layer, in canvas px */
  nodeGap: number;
  /** Extra distance between neighbouring nodes of *different* groups in a layer (room for group boxes) */
  groupGap?: number;
  /**
   * Width / height of the panel. When set, the layer gap is stretched (up to 4x) so the diagram's aspect
   * approaches the panel's; a 2 → 1 → 17 fan-out otherwise becomes a thin tall strip after fit-to-panel.
   */
  aspect?: number;
  /**
   * Layered layouts only: fold a layer with more than this many nodes into ceil(n / wrap) side-by-side bands
   * (sub-columns separated by nodeGap) so one huge fan-out does not become a single very long column.
   * 0 / undefined = never wrap.
   */
  wrap?: number;
}

export interface LayoutResult {
  positions: Map<string, Point>;
  /** Layer index per node (layered layouts) or ring index = hop distance from the component's hub (radial) */
  ranks: Map<string, number>;
  /** Radial layouts only: centre of the ring system each node sits on (one per connected component) */
  centres?: Map<string, Point>;
}

const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Drop edges that close a cycle (DFS back edges) so the graph can be ranked. Self loops are dropped too.
 * Nodes are visited in id order so the result is deterministic.
 */
export function breakCycles(nodes: LayoutNode[], edges: LayoutEdge[]): LayoutEdge[] {
  const out = new Map<string, LayoutEdge[]>();
  for (const e of edges) {
    if (e.source === e.target) {
      continue;
    }
    const list = out.get(e.source) ?? [];
    list.push(e);
    out.set(e.source, list);
  }
  const state = new Map<string, 1 | 2>(); // 1 = on stack, 2 = done
  const keep: LayoutEdge[] = [];
  const visit = (id: string) => {
    state.set(id, 1);
    for (const e of (out.get(id) ?? []).slice().sort((a, b) => (a.target < b.target ? -1 : a.target > b.target ? 1 : 0))) {
      const s = state.get(e.target);
      if (s === 1) {
        continue; // back edge
      }
      keep.push(e);
      if (!s) {
        visit(e.target);
      }
    }
    state.set(id, 2);
  };
  for (const n of nodes.slice().sort(byId)) {
    if (!state.has(n.id)) {
      visit(n.id);
    }
  }
  return keep;
}

/** Longest-path ranking from the sources (nodes with no incoming edge). Requires an acyclic edge set. */
export function rankNodes(nodes: LayoutNode[], edges: LayoutEdge[]): Map<string, number> {
  const ids = nodes.map((n) => n.id);
  const incoming = new Map<string, number>(ids.map((id) => [id, 0]));
  const out = new Map<string, string[]>();
  for (const e of edges) {
    if (!incoming.has(e.source) || !incoming.has(e.target)) {
      continue;
    }
    incoming.set(e.target, (incoming.get(e.target) ?? 0) + 1);
    const list = out.get(e.source) ?? [];
    list.push(e.target);
    out.set(e.source, list);
  }
  const rank = new Map<string, number>(ids.map((id) => [id, 0]));
  const queue = ids.filter((id) => incoming.get(id) === 0).sort();
  while (queue.length) {
    const id = queue.shift()!;
    const r = rank.get(id) ?? 0;
    for (const t of out.get(id) ?? []) {
      rank.set(t, Math.max(rank.get(t) ?? 0, r + 1));
      const left = (incoming.get(t) ?? 0) - 1;
      incoming.set(t, left);
      if (left === 0) {
        queue.push(t);
      }
    }
  }
  return rank;
}

/** Order nodes within each layer by the barycenter of their neighbours, a few sweeps down and up. */
export function orderLayers(layers: string[][], edges: LayoutEdge[], groups: Map<string, string | undefined>, sweeps = 4): string[][] {
  const pos = new Map<string, number>();
  const setPos = () => layers.forEach((layer) => layer.forEach((id, i) => pos.set(id, i)));
  setPos();
  const down = new Map<string, string[]>(); // neighbours in the previous layer
  const up = new Map<string, string[]>(); // neighbours in the next layer
  const layerOf = new Map<string, number>();
  layers.forEach((layer, i) => layer.forEach((id) => layerOf.set(id, i)));
  for (const e of edges) {
    const ls = layerOf.get(e.source);
    const lt = layerOf.get(e.target);
    if (ls === undefined || lt === undefined || ls === lt) {
      continue;
    }
    const [lo, hi] = ls < lt ? [e.source, e.target] : [e.target, e.source];
    (down.get(hi) ?? down.set(hi, []).get(hi)!).push(lo);
    (up.get(lo) ?? up.set(lo, []).get(lo)!).push(hi);
  }
  const bary = (id: string, nb: Map<string, string[]>) => {
    const list = nb.get(id);
    if (!list || !list.length) {
      return undefined;
    }
    return list.reduce((s, n) => s + (pos.get(n) ?? 0), 0) / list.length;
  };
  // Group order: per layer by mean barycenter during the first sweeps, then one global order (mean position
  // over all layers) so groups stack in the same sequence in every layer and group boxes do not interleave.
  let globalGroupOrder: Map<string, number> | undefined;
  const sortLayer = (layer: string[], nb: Map<string, string[]>) => {
    const keyed = layer.map((id, i) => ({ id, i, b: bary(id, nb) ?? i }));
    const groupMean = new Map<string, number>();
    const groupCount = new Map<string, number>();
    for (const k of keyed) {
      const g = groups.get(k.id) ?? '';
      groupMean.set(g, (groupMean.get(g) ?? 0) + k.b);
      groupCount.set(g, (groupCount.get(g) ?? 0) + 1);
    }
    const gkey = (id: string) => {
      const g = groups.get(id) ?? '';
      if (globalGroupOrder && g) {
        return globalGroupOrder.get(g) ?? 0;
      }
      return (groupMean.get(g) ?? 0) / (groupCount.get(g) ?? 1);
    };
    keyed.sort((a, b) => {
      const ga = groups.get(a.id) ?? '';
      const gb = groups.get(b.id) ?? '';
      if (ga !== gb) {
        return gkey(a.id) - gkey(b.id) || (ga < gb ? -1 : 1);
      }
      return a.b - b.b || a.i - b.i;
    });
    return keyed.map((k) => k.id);
  };
  const sweep = () => {
    for (let i = 1; i < layers.length; i++) {
      layers[i] = sortLayer(layers[i], down);
      setPos();
    }
    for (let i = layers.length - 2; i >= 0; i--) {
      layers[i] = sortLayer(layers[i], up);
      setPos();
    }
  };
  for (let s = 0; s < sweeps; s++) {
    sweep();
  }
  const hasGroups = Array.from(groups.values()).some((g) => !!g);
  if (hasGroups) {
    const sum = new Map<string, number>();
    const cnt = new Map<string, number>();
    for (const layer of layers) {
      layer.forEach((id, i) => {
        const g = groups.get(id);
        if (g) {
          // Relative position (0..1) so long layers do not dominate.
          sum.set(g, (sum.get(g) ?? 0) + i / Math.max(1, layer.length - 1));
          cnt.set(g, (cnt.get(g) ?? 0) + 1);
        }
      });
    }
    const ordered = Array.from(sum.keys()).sort((a, b) => sum.get(a)! / cnt.get(a)! - sum.get(b)! / cnt.get(b)! || (a < b ? -1 : 1));
    globalGroupOrder = new Map(ordered.map((g, i) => [g, i + 1]));
    for (let s = 0; s < 2; s++) {
      sweep();
    }
  }
  return layers;
}

/** Layered layout. Returns absolute top-left positions for every node. */
export function layeredLayout(nodes: LayoutNode[], edges: LayoutEdge[], opts: LayoutOptions): LayoutResult {
  const sorted = nodes.slice().sort(byId);
  const acyclic = breakCycles(sorted, edges);
  const ranks = rankNodes(sorted, acyclic);
  const size = new Map(sorted.map((n) => [n.id, n]));
  const groups = new Map(sorted.map((n) => [n.id, n.group]));
  const depth = sorted.reduce((m, n) => Math.max(m, ranks.get(n.id) ?? 0), 0);
  const layers: string[][] = Array.from({ length: depth + 1 }, () => []);
  for (const n of sorted) {
    layers[ranks.get(n.id) ?? 0].push(n.id);
  }
  orderLayers(layers, acyclic, groups);

  const horizontal = opts.direction !== 'tb';
  // Main axis = along the flow (x for left-to-right), cross axis = within a layer.
  const main = (n: LayoutNode) => (horizontal ? n.w : n.h);
  const cross = (n: LayoutNode) => (horizontal ? n.h : n.w);
  const groupGap = opts.groupGap ?? 0;
  // Gap after node i of a band: the node gap, plus the group gap when the next node belongs to another group.
  const gapAfter = (band: string[], i: number) =>
    i >= band.length - 1 ? 0 : opts.nodeGap + ((groups.get(band[i]) ?? '') !== (groups.get(band[i + 1]) ?? '') ? groupGap : 0);
  // Long layers are folded into several bands that sit side by side along the main axis; ordering is kept so
  // crossing reduction and group contiguity survive. Without wrapping every layer is exactly one band.
  const bands = layers.flatMap((layer, li) => wrapLayer(layer, opts.wrap).map((ids, bi) => ({ ids, layer: li, band: bi })));
  const extents = bands.map(({ ids }) => {
    const items = ids.map((id) => size.get(id)!);
    const length = items.reduce((s, n, i) => s + cross(n) + gapAfter(ids, i), 0);
    const thickness = items.reduce((m, n) => Math.max(m, main(n)), 0);
    return { length, thickness };
  });
  const tallest = extents.reduce((m, e) => Math.max(m, e.length), 0);
  // Gap after band bi: nodeGap to the next band of the same layer, the layer gap to the next layer.
  const sameLayerNext = (bi: number) => bi < bands.length - 1 && bands[bi + 1].layer === bands[bi].layer;
  let layerGap = opts.layerGap;
  if (opts.aspect && opts.aspect > 0 && layers.length > 1) {
    const sumThickness = extents.reduce((s, e, bi) => s + e.thickness + (sameLayerNext(bi) ? opts.nodeGap : 0), 0);
    const wanted = horizontal ? tallest * opts.aspect : tallest / opts.aspect;
    layerGap = Math.round(Math.min(opts.layerGap * 4, Math.max(opts.layerGap, (wanted - sumThickness) / (layers.length - 1))));
  }
  const positions = new Map<string, Point>();
  let mainPos = 0;
  bands.forEach(({ ids, band }, bi) => {
    const { length, thickness } = extents[bi];
    // Alternate bands of a wrapped layer are staggered by half a node step so edges to the next layer are less
    // likely to run straight through a neighbouring band's nodes.
    const stagger = band % 2 === 1 ? (cross(size.get(ids[0])!) + opts.nodeGap) / 2 : 0;
    let crossPos = (tallest - length) / 2 + stagger;
    ids.forEach((id, i) => {
      const n = size.get(id)!;
      // Centre each node on the band's main axis so mixed widths still align.
      const m = mainPos + (thickness - main(n)) / 2;
      positions.set(id, horizontal ? { x: Math.round(m), y: Math.round(crossPos) } : { x: Math.round(crossPos), y: Math.round(m) });
      crossPos += cross(n) + gapAfter(ids, i);
    });
    mainPos += thickness + (sameLayerNext(bi) ? opts.nodeGap : layerGap);
  });
  return { positions, ranks };
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface RadialComponent {
  ids: string[];
  hub: string;
  /** Local positions, hub centred at (0, 0) */
  positions: Map<string, Point>;
  bounds: Bounds;
}

/** Connected components of the undirected graph; discovered and listed in id order (deterministic). */
function connectedComponents(sorted: LayoutNode[], adj: Map<string, Set<string>>): string[][] {
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const n of sorted) {
    if (seen.has(n.id)) {
      continue;
    }
    const comp: string[] = [];
    const queue = [n.id];
    seen.add(n.id);
    while (queue.length) {
      const id = queue.shift()!;
      comp.push(id);
      for (const nb of Array.from(adj.get(id) ?? []).sort()) {
        if (!seen.has(nb)) {
          seen.add(nb);
          queue.push(nb);
        }
      }
    }
    out.push(comp.sort());
  }
  return out;
}

/**
 * Split an ordered layer into ceil(n / wrap) bands of near-equal size (the first bands take the remainder).
 * Returns the layer unchanged as a single band when wrap is 0 / undefined or the layer is short enough.
 */
export function wrapLayer(layer: string[], wrap: number | undefined): string[][] {
  const max = Math.floor(wrap ?? 0);
  if (max <= 0 || layer.length <= max) {
    return [layer];
  }
  const count = Math.ceil(layer.length / max);
  const base = Math.floor(layer.length / count);
  const extra = layer.length % count;
  const out: string[][] = [];
  let at = 0;
  for (let b = 0; b < count; b++) {
    const len = base + (b < extra ? 1 : 0);
    out.push(layer.slice(at, at + len));
    at += len;
  }
  return out;
}

/**
 * Radial layout of one connected component: the node with the most edges at (0, 0), the rest on rings by hop
 * distance. Fills `ranks` for the component's nodes.
 */
function radialComponent(
  ids: string[],
  size: Map<string, LayoutNode>,
  adj: Map<string, Set<string>>,
  degree: Map<string, number>,
  ranks: Map<string, number>,
  opts: LayoutOptions,
  aspect: number | undefined
): RadialComponent {
  const members = ids.map((id) => size.get(id)!);
  const positions = new Map<string, Point>();
  const hub = members.reduce((best, n) => ((degree.get(n.id) ?? 0) > (degree.get(best.id) ?? 0) ? n : best), members[0]);
  // BFS hop distance from the hub.
  ranks.set(hub.id, 0);
  const queue = [hub.id];
  while (queue.length) {
    const id = queue.shift()!;
    const r = ranks.get(id) ?? 0;
    for (const nb of Array.from(adj.get(id) ?? []).sort()) {
      if (!ranks.has(nb)) {
        ranks.set(nb, r + 1);
        queue.push(nb);
      }
    }
  }
  const rings = new Map<number, LayoutNode[]>();
  let maxRank = 0;
  for (const n of members) {
    const r = ranks.get(n.id)!;
    maxRank = Math.max(maxRank, r);
    (rings.get(r) ?? rings.set(r, []).get(r)!).push(n);
  }
  const maxW = members.reduce((m, n) => Math.max(m, n.w), 0);
  const maxH = members.reduce((m, n) => Math.max(m, n.h), 0);
  positions.set(hub.id, { x: -hub.w / 2, y: -hub.h / 2 });
  // Rings are ellipses: the horizontal radius is driven by node widths (nodes sit side by side at the top and
  // bottom), the vertical one by node heights (nodes stack at the sides). The ellipse then follows the panel
  // aspect so fit-to-panel can use most of the area instead of shrinking a tall circle.
  let rx = 0;
  let ry = 0;
  const angle = new Map<string, number>([[hub.id, 0]]);
  for (let r = 1; r <= maxRank; r++) {
    const ring = rings.get(r);
    if (!ring || !ring.length) {
      continue;
    }
    const n = ring.length;
    // 1.08: chords are shorter than arcs.
    let nx = Math.max(rx + maxW + opts.nodeGap, (n * (maxW + opts.nodeGap) * 1.08) / (2 * Math.PI), rx + opts.layerGap);
    let ny = Math.max(ry + maxH + opts.nodeGap, (n * (maxH + opts.nodeGap) * 1.08) / (2 * Math.PI), ry + opts.layerGap * 0.5);
    if (aspect && aspect > 0) {
      nx = Math.max(nx, ny * aspect);
      ny = Math.max(ny, nx / aspect);
    }
    rx = nx;
    ry = ny;
    // Mean angle of the parents (neighbours on the previous ring); ordering by it keeps spokes from crossing.
    const parentAngle = (nd: LayoutNode) => {
      const parents = Array.from(adj.get(nd.id) ?? []).filter((p) => (ranks.get(p) ?? Infinity) === r - 1);
      if (!parents.length) {
        return Infinity;
      }
      return parents.reduce((s, p) => s + (angle.get(p) ?? 0), 0) / parents.length;
    };
    const keyed = ring.map((nd) => ({ n: nd, g: nd.group ?? '', a: parentAngle(nd) }));
    // Members of a group are contiguous on the ring (one arc per group); arcs are ordered by the group's mean
    // parent angle, nodes inside an arc by their own parent angle, then id. Ungrouped nodes are placed
    // individually by their parent angle.
    const groupSum = new Map<string, number>();
    const groupCount = new Map<string, number>();
    for (const k of keyed) {
      if (k.g && Number.isFinite(k.a)) {
        groupSum.set(k.g, (groupSum.get(k.g) ?? 0) + k.a);
        groupCount.set(k.g, (groupCount.get(k.g) ?? 0) + 1);
      }
    }
    const clusterKey = (k: { g: string; a: number }) => (k.g && groupCount.get(k.g) ? groupSum.get(k.g)! / groupCount.get(k.g)! : k.a);
    keyed.sort((p, q) => {
      if (p.g !== q.g) {
        const d = clusterKey(p) - clusterKey(q);
        if (d !== 0 && Number.isFinite(d)) {
          return d;
        }
        return p.g < q.g ? -1 : 1;
      }
      return p.a - q.a || byId(p.n, q.n);
    });
    // Stagger alternate rings by half a step so nodes of neighbouring rings are not radially aligned.
    const stagger = r % 2 === 0 ? 0.5 : 0;
    keyed.forEach((item, i) => {
      const a = ((i + stagger) / keyed.length) * Math.PI * 2 - Math.PI / 2;
      angle.set(item.n.id, a);
      positions.set(item.n.id, { x: Math.round(Math.cos(a) * rx - item.n.w / 2), y: Math.round(Math.sin(a) * ry - item.n.h / 2) });
    });
  }
  const bounds: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const n of members) {
    const p = positions.get(n.id)!;
    bounds.minX = Math.min(bounds.minX, p.x);
    bounds.minY = Math.min(bounds.minY, p.y);
    bounds.maxX = Math.max(bounds.maxX, p.x + n.w);
    bounds.maxY = Math.max(bounds.maxY, p.y + n.h);
  }
  return { ids, hub: hub.id, positions, bounds };
}

/**
 * Radial layout: the node with the most edges in the middle, the rest on rings (by hop distance); members of a
 * group sit next to each other on their ring. Every connected component gets its own hub and rings, then the
 * components are packed row by row (largest first, isolated nodes last) into a block that roughly follows the
 * panel aspect, so a disconnected graph does not end up as one cluster with strays flung far away.
 * `ranks` is the hop distance inside the node's component; `centres` the hub centre of that component.
 */
export function radialLayout(nodes: LayoutNode[], edges: LayoutEdge[], opts: LayoutOptions): LayoutResult {
  const sorted = nodes.slice().sort(byId);
  const positions = new Map<string, Point>();
  const ranks = new Map<string, number>();
  const centres = new Map<string, Point>();
  if (!sorted.length) {
    return { positions, ranks, centres };
  }
  const size = new Map(sorted.map((n) => [n.id, n]));
  const degree = new Map<string, number>();
  const adj = new Map<string, Set<string>>();
  for (const e of edges) {
    if (!size.has(e.source) || !size.has(e.target) || e.source === e.target) {
      continue;
    }
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
    (adj.get(e.source) ?? adj.set(e.source, new Set()).get(e.source)!).add(e.target);
    (adj.get(e.target) ?? adj.set(e.target, new Set()).get(e.target)!).add(e.source);
  }
  const componentIds = connectedComponents(sorted, adj);
  const single = componentIds.length === 1;
  // With several components the rings stay round; the packing takes care of the aspect.
  const comps = componentIds.map((ids) => radialComponent(ids, size, adj, degree, ranks, opts, single ? opts.aspect : undefined));
  if (single) {
    for (const [id, p] of comps[0].positions) {
      positions.set(id, p);
      centres.set(id, { x: 0, y: 0 });
    }
    return { positions, ranks, centres };
  }
  // Pack: connected components by node count (then area) descending, isolated nodes last, in rows whose
  // width aims at the panel aspect (a square block when no aspect is known).
  const width = (c: RadialComponent) => c.bounds.maxX - c.bounds.minX;
  const height = (c: RadialComponent) => c.bounds.maxY - c.bounds.minY;
  const order = comps.slice().sort((a, b) => {
    const sa = a.ids.length > 1 ? 0 : 1;
    const sb = b.ids.length > 1 ? 0 : 1;
    return sa - sb || b.ids.length - a.ids.length || width(b) * height(b) - width(a) * height(a) || (a.hub < b.hub ? -1 : 1);
  });
  const gap = Math.max(4, opts.nodeGap) * 2;
  const aspect = opts.aspect && opts.aspect > 0 ? opts.aspect : 1;
  const total = order.reduce((s, c) => s + (width(c) + gap) * (height(c) + gap), 0);
  const widest = order.reduce((m, c) => Math.max(m, width(c)), 0);
  const rowWidth = Math.max(widest, Math.sqrt(total * aspect));
  let x = 0;
  let y = 0;
  let rowH = 0;
  for (const c of order) {
    const w = width(c);
    const h = height(c);
    if (x > 0 && x + w > rowWidth) {
      y += rowH + gap;
      x = 0;
      rowH = 0;
    }
    const dx = Math.round(x - c.bounds.minX);
    const dy = Math.round(y - c.bounds.minY);
    for (const [id, p] of c.positions) {
      positions.set(id, { x: p.x + dx, y: p.y + dy });
      centres.set(id, { x: dx, y: dy });
    }
    x += w + gap;
    rowH = Math.max(rowH, h);
  }
  return { positions, ranks, centres };
}

export function layoutGraph(nodes: LayoutNode[], edges: LayoutEdge[], opts: LayoutOptions): LayoutResult {
  return opts.direction === 'radial' ? radialLayout(nodes, edges, opts) : layeredLayout(nodes, edges, opts);
}

/** Signature of the node set (used to decide whether a re-layout is needed). */
export const nodeSetKey = (nodes: Array<{ id: string }>, opts: LayoutOptions) =>
  `${opts.direction}|${opts.layerGap}|${opts.nodeGap}|${opts.groupGap ?? ''}|${opts.aspect ?? ''}|${opts.wrap ?? ''}|${nodes
    .map((n) => n.id)
    .sort()
    .join('\n')}`;
