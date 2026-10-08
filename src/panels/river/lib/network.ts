import { type DataFrame, type Field, FieldType, toDataFrame } from '@grafana/data';
import { type FieldNames, type Graph, type GraphEdge, type NodeStatus, edgeId, extractGraph } from '../../../shared/graph/frames';
import { type LayoutDirection, layoutGraph } from '../../../shared/graph/layout';
import {
  type Channel,
  DEFAULT_NETWORK,
  MAX_NETWORK_CHANNELS,
  MAX_NETWORK_NODES,
  MIN_NETWORK_PARTICLES,
  type NetworkLayout,
  type NetworkOptions,
  type Waypoint,
  createChannel,
} from '../types';
import type { BoundChannel } from './data';
import { clampWaypoint, type Point } from './path';

/**
 * "Network map" mode: every edge of a data-driven graph (source, target, value) becomes a channel that
 * flows between two node pucks. Node positions come from the shared layered / radial layout, from a
 * list typed into the editor, or from drag handles on the canvas; the three are merged in that order of
 * precedence (dragged wins).
 */

export interface NetworkNode {
  id: string;
  label: string;
  status?: NodeStatus;
  /** Centre in CSS px. */
  x: number;
  y: number;
  /** Puck radius in CSS px. */
  r: number;
}

export interface NetworkModel {
  graph: Graph;
  nodes: NetworkNode[];
  /** One bound channel per edge, in edge order. */
  bound: BoundChannel[];
  /** Normalised positions actually used (after overrides), for the editor and the drag handles. */
  positions: Map<string, Waypoint>;
  /** Sum of all edge values (edges without a value count as 0). */
  total: number;
  /** Value and name shown by the caption: the selected channel, or the total. */
  captionValue: number | undefined;
  captionName: string;
  notices: string[];
  /** Field the values came from (unit, decimals, thresholds). */
  valueField?: Field;
}

/** Field names understood by the shared graph parser, from the network options. */
export function networkFieldNames(n: Partial<NetworkOptions> | undefined): FieldNames {
  const o = { ...DEFAULT_NETWORK, ...(n ?? {}) };
  return {
    sourceField: o.sourceField,
    targetField: o.targetField,
    valueField: o.valueField,
    value2Field: o.value2Field,
    labelField: o.labelField,
    sourceGroupField: '',
    targetGroupField: '',
    nodeIdField: o.nodeIdField,
    nodeLabelField: o.nodeLabelField,
    nodeGroupField: '',
    nodeStatusField: o.nodeStatusField,
    nodeValueField: '',
  };
}

/** Parses frames into a graph capped at the network limits (top edges by value, most connected nodes). */
export function extractNetwork(frames: DataFrame[], n: Partial<NetworkOptions> | undefined): Graph {
  return extractGraph(frames, { ...networkFieldNames(n), maxEdges: MAX_NETWORK_CHANNELS, maxNodes: MAX_NETWORK_NODES });
}

/** Does the query describe at least one edge with the configured field names? */
export function hasEdges(frames: DataFrame[], n: Partial<NetworkOptions> | undefined): boolean {
  return extractNetwork(frames, n).edges.length > 0;
}

const PAD_X = 0.08;
const PAD_Y = 0.14;

/**
 * For ranking only: a reverse pair is collapsed to its stronger direction (larger |value|, id as tie-break),
 * so the layered layout follows the dominant flow instead of whichever direction the cycle breaker met first.
 */
export function dominantEdges(edges: GraphEdge[]): GraphEdge[] {
  const byId = new Map(edges.map((e) => [e.id, e]));
  return edges.filter((e) => {
    const rev = byId.get(edgeId(e.target, e.source));
    if (!rev || rev === e) {
      return true;
    }
    const a = Math.abs(e.value ?? 0);
    const b = Math.abs(rev.value ?? 0);
    return a > b || (a === b && e.id < rev.id);
  });
}

/**
 * Auto layout as normalised positions (0..1). Deterministic for a given node set, so positions are stable
 * across refreshes. The layout box is stretched to the padded panel so a wide panel spreads the layers.
 */
export function autoPositions(graph: Graph, direction: LayoutDirection, aspect: number, nodeSize: number): Map<string, Waypoint> {
  const out = new Map<string, Waypoint>();
  if (!graph.nodes.length) {
    return out;
  }
  const size = Math.max(8, nodeSize) * 2;
  const nodes = graph.nodes.map((n) => ({ id: n.id, w: size * 2.4, h: size * 1.6 }));
  const edges = dominantEdges(graph.edges).map((e) => ({ source: e.source, target: e.target }));
  const res = layoutGraph(nodes, edges, { direction, layerGap: size * 3, nodeGap: size, aspect: aspect > 0 ? aspect : 1.6 });
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const centres = new Map<string, Point>();
  for (const n of nodes) {
    const p = res.positions.get(n.id) ?? { x: 0, y: 0 };
    const c = { x: p.x + n.w / 2, y: p.y + n.h / 2 };
    centres.set(n.id, c);
    minX = Math.min(minX, c.x);
    maxX = Math.max(maxX, c.x);
    minY = Math.min(minY, c.y);
    maxY = Math.max(maxY, c.y);
  }
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  for (const [id, c] of centres) {
    out.set(id, {
      x: spanX > 0 ? PAD_X + ((c.x - minX) / spanX) * (1 - 2 * PAD_X) : 0.5,
      y: spanY > 0 ? PAD_Y + ((c.y - minY) / spanY) * (1 - 2 * PAD_Y) : 0.5,
    });
  }
  return direction === 'radial' ? out : reduceCrossings(out, graph.edges, direction === 'tb' ? 'x' : 'y');
}

const segmentsCross = (a1: Point, a2: Point, b1: Point, b2: Point) => {
  const d = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = d(b1, b2, a1);
  const d2 = d(b1, b2, a2);
  const d3 = d(a1, a2, b1);
  const d4 = d(a1, a2, b2);
  return d1 * d2 < 0 && d3 * d4 < 0;
};

/** Number of pairs of straight links that cross (links sharing a node never count). */
export function countCrossings(positions: Map<string, Waypoint>, edges: Array<{ source: string; target: string }>): number {
  let n = 0;
  for (let i = 0; i < edges.length; i++) {
    const a = edges[i];
    const a1 = positions.get(a.source);
    const a2 = positions.get(a.target);
    if (!a1 || !a2) {
      continue;
    }
    for (let j = i + 1; j < edges.length; j++) {
      const b = edges[j];
      if (b.source === a.source || b.source === a.target || b.target === a.source || b.target === a.target) {
        continue;
      }
      const b1 = positions.get(b.source);
      const b2 = positions.get(b.target);
      if (b1 && b2 && segmentsCross(a1, a2, b1, b2)) {
        n++;
      }
    }
  }
  return n;
}

/**
 * Crossing reduction on top of the layered layout. Nodes sharing a layer (same coordinate on the main
 * axis) keep the layer's slots but may change order: a few barycenter sweeps (each layer ordered by the
 * mean slot of its neighbours in the previous / next layer) are evaluated and the best one kept, then
 * pairwise swaps are accepted while they lower the crossing count. Deterministic.
 */
export function reduceCrossings(positions: Map<string, Waypoint>, edges: Array<{ source: string; target: string }>, swapAxis: 'x' | 'y'): Map<string, Waypoint> {
  const out = new Map(Array.from(positions.entries()).map(([id, p]) => [id, { ...p }]));
  const mainAxis = swapAxis === 'y' ? 'x' : 'y';
  const byKey = new Map<string, string[]>();
  for (const [id, p] of out) {
    const key = p[mainAxis].toFixed(3);
    (byKey.get(key) ?? byKey.set(key, []).get(key)!).push(id);
  }
  const layers = Array.from(byKey.entries())
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([, ids]) => ids.sort((a, b) => out.get(a)![swapAxis] - out.get(b)![swapAxis] || (a < b ? -1 : 1)));
  const slots = layers.map((layer) => layer.map((id) => out.get(id)![swapAxis]));
  const layerOf = new Map<string, number>();
  layers.forEach((layer, i) => layer.forEach((id) => layerOf.set(id, i)));
  const neighbours = new Map<string, string[]>();
  for (const e of edges) {
    if (!layerOf.has(e.source) || !layerOf.has(e.target)) {
      continue;
    }
    (neighbours.get(e.source) ?? neighbours.set(e.source, []).get(e.source)!).push(e.target);
    (neighbours.get(e.target) ?? neighbours.set(e.target, []).get(e.target)!).push(e.source);
  }
  const apply = (order: string[][]) => order.forEach((layer, li) => layer.forEach((id, i) => (out.get(id)![swapAxis] = slots[li][i])));
  const clone = (order: string[][]) => order.map((l) => l.slice());
  const score = (order: string[][]) => {
    apply(order);
    return countCrossings(out, edges);
  };

  let best = clone(layers);
  let bestScore = score(best);
  let current = clone(layers);
  const sortLayer = (li: number, ref: number) => {
    const layer = current[li];
    const index = new Map(layer.map((id, i) => [id, i]));
    const refPos = new Map(current[ref].map((id, i) => [id, i]));
    const bary = (id: string) => {
      const list = (neighbours.get(id) ?? []).filter((n) => refPos.has(n));
      return list.length ? list.reduce((s, n) => s + refPos.get(n)!, 0) / list.length : index.get(id)!;
    };
    current[li] = layer.slice().sort((a, b) => bary(a) - bary(b) || index.get(a)! - index.get(b)!);
  };
  for (let sweep = 0; sweep < 4 && bestScore > 0; sweep++) {
    for (let li = 1; li < current.length; li++) {
      sortLayer(li, li - 1);
    }
    let c = score(current);
    if (c < bestScore) {
      bestScore = c;
      best = clone(current);
    }
    for (let li = current.length - 2; li >= 0; li--) {
      sortLayer(li, li + 1);
    }
    c = score(current);
    if (c < bestScore) {
      bestScore = c;
      best = clone(current);
    }
  }
  current = clone(best);
  for (let pass = 0; pass < 8 && bestScore > 0; pass++) {
    let improved = false;
    for (const layer of current) {
      for (let i = 0; i < layer.length; i++) {
        for (let j = i + 1; j < layer.length; j++) {
          [layer[i], layer[j]] = [layer[j], layer[i]];
          const c = score(current);
          if (c < bestScore) {
            bestScore = c;
            improved = true;
          } else {
            [layer[i], layer[j]] = [layer[j], layer[i]];
          }
        }
      }
    }
    if (!improved) {
      break;
    }
  }
  apply(current);
  return out;
}

/**
 * Places one label per channel near its midpoint, sliding a label along its own path when it would sit
 * on top of an earlier one. `pointAt(i, t)` gives the label position of channel i at fraction t.
 */
export function spreadLabels(count: number, pointAt: (i: number, t: number) => Point, boxW = 72, boxH = 18): Point[] {
  const placed: Point[] = [];
  const collides = (p: Point) => placed.some((q) => Math.abs(q.x - p.x) < boxW && Math.abs(q.y - p.y) < boxH);
  for (let i = 0; i < count; i++) {
    let chosen = pointAt(i, 0.5);
    for (const t of [0.5, 0.38, 0.62, 0.28, 0.72, 0.2, 0.8]) {
      const p = pointAt(i, t);
      if (!collides(p)) {
        chosen = p;
        break;
      }
    }
    placed.push(chosen);
  }
  return placed;
}

const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

/**
 * Final normalised position per node: dragged override, then the typed position, then the auto layout.
 * Unknown ids in the layout are ignored.
 */
export function resolvePositions(graph: Graph, auto: Map<string, Waypoint>, layout: Partial<NetworkLayout> | undefined): Map<string, Waypoint> {
  const typed = new Map<string, Waypoint>();
  for (const p of layout?.positions ?? []) {
    if (p && typeof p.id === 'string' && finite(p.x) && finite(p.y)) {
      typed.set(p.id, clampWaypoint({ x: p.x, y: p.y }));
    }
  }
  const overrides = layout?.overrides ?? {};
  const out = new Map<string, Waypoint>();
  for (const n of graph.nodes) {
    const o = overrides[n.id];
    if (o && finite(o.x) && finite(o.y)) {
      out.set(n.id, clampWaypoint(o));
    } else {
      out.set(n.id, typed.get(n.id) ?? auto.get(n.id) ?? { x: 0.5, y: 0.5 });
    }
  }
  return out;
}

/** Edges whose reverse (target→source) is also present. Both members get a lateral offset. */
export function reversePairs(edges: GraphEdge[]): Set<string> {
  const ids = new Set(edges.map((e) => e.id));
  const out = new Set<string>();
  for (const e of edges) {
    if (e.source !== e.target && ids.has(edgeId(e.target, e.source))) {
      out.add(e.id);
    }
  }
  return out;
}

export interface EdgePathOptions {
  /** Puck radii at the two ends (the path starts and ends just outside them). */
  rA: number;
  rB: number;
  /** Lateral offset (px, right of travel) applied at both ends: separates reverse pairs. */
  endLateral: number;
  /** Extra lateral offset at the midpoint as a fraction of the length: the gentle bend. */
  curve: number;
}

/**
 * Waypoints (px) for a channel from a to b: start just outside a's puck, a mid control point offset
 * to the right of travel, end just outside b's puck. Reverse pairs use opposite normals, so their
 * centrelines end up `2 * endLateral + 2 * curve * length` apart at the middle.
 */
export function edgePath(a: Point, b: Point, o: EdgePathOptions): Point[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) {
    // Self link or stacked nodes: a small loop to the right of the node.
    const r = Math.max(o.rA, 12);
    return [
      { x: a.x + r, y: a.y - r * 0.5 },
      { x: a.x + r * 3, y: a.y },
      { x: a.x + r, y: a.y + r * 0.5 },
    ];
  }
  const ux = dx / len;
  const uy = dy / len;
  // Right of travel in canvas coordinates (y down).
  const nx = -uy;
  const ny = ux;
  const gapA = Math.min(len * 0.4, o.rA + 3);
  const gapB = Math.min(len * 0.4, o.rB + 3);
  const el = o.endLateral;
  const ml = el + o.curve * len;
  const start = { x: a.x + ux * gapA + nx * el, y: a.y + uy * gapA + ny * el };
  const end = { x: b.x - ux * gapB + nx * el, y: b.y - uy * gapB + ny * el };
  const mid = { x: (a.x + b.x) / 2 + nx * ml, y: (a.y + b.y) / 2 + ny * ml };
  return [start, mid, end];
}

const widthOf = (e: GraphEdge, widthPx: number, maxV2: number) => {
  if (e.value2 === undefined || maxV2 <= 0) {
    return widthPx;
  }
  return widthPx * Math.max(0.25, Math.abs(e.value2) / maxV2);
};

/**
 * One channel per edge, bound to its value. All channels share one value range so the colour scale and
 * particle speed are comparable across the map.
 */
export function edgesToChannels(
  graph: Graph,
  positions: Map<string, Waypoint>,
  n: NetworkOptions,
  width: number,
  height: number
): BoundChannel[] {
  const pairs = reversePairs(graph.edges);
  const r = Math.max(4, n.nodeSize);
  const maxV2 = graph.edges.reduce((m, e) => Math.max(m, Math.abs(e.value2 ?? 0)), 0);
  let min = Infinity;
  let max = -Infinity;
  for (const e of graph.edges) {
    if (e.value !== undefined) {
      min = Math.min(min, e.value);
      max = Math.max(max, e.value);
    }
  }
  if (!Number.isFinite(min)) {
    min = 0;
    max = 1;
  }
  if (min === max) {
    min = Math.min(0, min);
    max = max === min ? min + 1 : max;
  }
  const widths = new Map(graph.edges.map((e) => [e.id, widthOf(e, n.widthPx, maxV2)]));
  const toPx = (p: Waypoint | undefined): Point => ({ x: (p?.x ?? 0.5) * width, y: (p?.y ?? 0.5) * height });
  const toNorm = (p: Point): Waypoint => ({ x: width > 0 ? p.x / width : 0, y: height > 0 ? p.y / height : 0 });

  return graph.edges.map((e) => {
    const w = widths.get(e.id) ?? n.widthPx;
    let endLateral = 0;
    if (pairs.has(e.id)) {
      const other = widths.get(edgeId(e.target, e.source)) ?? n.widthPx;
      endLateral = (w + other) / 4 + 4;
    }
    const pts = edgePath(toPx(positions.get(e.source)), toPx(positions.get(e.target)), {
      rA: r,
      rB: r,
      endLateral,
      curve: Math.max(0, n.curve),
    });
    const value = e.value ?? 0;
    const channel: Channel = createChannel({
      id: e.id,
      name: e.label ?? `${e.source} → ${e.target}`,
      path: pts.map(toNorm),
      speedSource: { mode: 'fixed', fixed: value },
      widthSource: { mode: 'fixed' },
      widthPx: w,
      colorScale: n.colorScale,
      scaleDomain: n.scaleDomain,
      particles: { ...n.particles, count: 0 },
      direction: n.direction,
      opacity: 0.9,
      smoothing: 1,
    });
    const direction: 1 | -1 = n.direction === 'reverse' ? -1 : n.direction === 'bySign' && value < 0 ? -1 : 1;
    return {
      channel,
      lanes: [{ name: channel.name, values: [value], field: e.valueField }],
      widths: null,
      latest: e.value,
      field: e.valueField,
      direction,
      range: [min, max],
    };
  });
}

/**
 * Particle request per channel: the budget split by absolute value share, with a floor so thin links
 * still move. The caller passes the result through `allocateParticles` for the hard cap.
 */
export function networkParticleCounts(values: Array<number | undefined>, budget: number, floor = MIN_NETWORK_PARTICLES): number[] {
  const abs = values.map((v) => Math.abs(v ?? 0));
  const sum = abs.reduce((a, b) => a + b, 0);
  const b = Math.max(0, budget);
  const f = Math.max(0, floor);
  if (!abs.length) {
    return [];
  }
  return abs.map((v) => Math.round(Math.max(f, sum > 0 ? (b * v) / sum : b / abs.length)));
}

/** Finds the edge named by `source>target` (or `source→target`), case-insensitive. */
export function findCaptionEdge(graph: Graph, selector: string | undefined): GraphEdge | undefined {
  const s = (selector ?? '').trim();
  if (!s) {
    return undefined;
  }
  const parts = s.split(/\s*(?:>|→|->)\s*/);
  if (parts.length !== 2) {
    return undefined;
  }
  const want = edgeId(parts[0], parts[1]).toLowerCase();
  return graph.edges.find((e) => e.id.toLowerCase() === want);
}

/** Builds everything the panel needs for network mode from the frames and options. */
export function buildNetwork(frames: DataFrame[], n: Partial<NetworkOptions> | undefined, width: number, height: number): NetworkModel {
  const opts: NetworkOptions = { ...DEFAULT_NETWORK, ...(n ?? {}), particles: { ...DEFAULT_NETWORK.particles, ...(n?.particles ?? {}) } };
  const graph = extractNetwork(frames, opts);
  const auto = autoPositions(graph, opts.layoutDirection, height > 0 ? width / height : 1.6, opts.nodeSize);
  const positions = resolvePositions(graph, auto, opts.layout);
  const r = Math.max(4, opts.nodeSize);
  const nodes: NetworkNode[] = graph.nodes.map((g) => {
    const p = positions.get(g.id) ?? { x: 0.5, y: 0.5 };
    return { id: g.id, label: g.label ?? g.id, status: g.status, x: p.x * width, y: p.y * height, r };
  });
  const bound = edgesToChannels(graph, positions, opts, width, height);
  const total = graph.edges.reduce((s, e) => s + (e.value ?? 0), 0);
  const selected = findCaptionEdge(graph, opts.captionChannel);
  const valueField = graph.edges.find((e) => e.valueField)?.valueField;
  return {
    graph,
    nodes,
    bound,
    positions,
    total,
    captionValue: selected ? selected.value : graph.edges.length ? total : undefined,
    captionName: selected ? (selected.label ?? `${selected.source} → ${selected.target}`) : 'Total',
    notices: graph.notices,
    valueField,
  };
}

/** Generated network for the demo mode: ten nodes, fourteen links including two reverse pairs. */
export function demoNetworkFrames(now: number): DataFrame[] {
  const links: Array<[string, string, number]> = [
    ['core-a', 'dist-1', 460],
    ['core-a', 'dist-2', 390],
    ['core-b', 'dist-1', 260],
    ['core-b', 'dist-2', 410],
    ['core-b', 'dist-3', 300],
    ['dist-1', 'access-1', 180],
    ['dist-1', 'access-2', 150],
    ['dist-2', 'access-2', 220],
    ['access-2', 'dist-2', 140],
    ['dist-2', 'access-3', 170],
    ['dist-3', 'access-3', 130],
    ['access-3', 'dist-3', 90],
    ['dist-3', 'access-4', 90],
    ['access-4', 'storage', 60],
  ];
  const t = now / 60000;
  const value = links.map(([, , base], i) => Math.round(base * (0.8 + 0.2 * Math.sin(t * 0.7 + i))));
  const edges = toDataFrame({
    refId: 'A',
    fields: [
      { name: 'source', type: FieldType.string, values: links.map((l) => l[0]) },
      { name: 'target', type: FieldType.string, values: links.map((l) => l[1]) },
      { name: 'value', type: FieldType.number, values: value, config: { unit: 'Mbits' } },
    ],
  });
  const ids = ['core-a', 'core-b', 'dist-1', 'dist-2', 'dist-3', 'access-1', 'access-2', 'access-3', 'access-4', 'storage'];
  const status = ids.map((id, i) => (id === 'dist-3' ? 'warn' : id === 'access-4' && Math.sin(t + i) > 0.6 ? 'error' : 'ok'));
  const nodes = toDataFrame({
    refId: 'N',
    fields: [
      { name: 'id', type: FieldType.string, values: ids },
      { name: 'label', type: FieldType.string, values: ids.map((id) => id.replace('-', ' ').toUpperCase()) },
      { name: 'status', type: FieldType.string, values: status },
    ],
  });
  return [edges, nodes];
}
