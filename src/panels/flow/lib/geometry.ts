import type { ControlPoint, EdgeStyle, FlowEdge, FlowNode, Point, PortSide, ResolvedSide } from '../types';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const center = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/**
 * Resolve an `auto` side by picking the side of `from` that faces `to`.
 */
export function resolveSide(from: Rect, to: Rect, side: PortSide | undefined): ResolvedSide {
  if (side && side !== 'auto') {
    return side;
  }
  const a = center(from);
  const b = center(to);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  // Bias horizontally: left/right ports read better for flow diagrams unless the target is clearly above/below.
  if (Math.abs(dx) * 1.3 >= Math.abs(dy)) {
    return dx >= 0 ? 'right' : 'left';
  }
  return dy >= 0 ? 'bottom' : 'top';
}

/** Point on the boundary of a rect for a given side. `t` (0..1) shifts along the side; default is the middle. */
export function portPoint(r: Rect, side: ResolvedSide, t = 0.5): Point {
  switch (side) {
    case 'left':
      return { x: r.x, y: r.y + r.h * t };
    case 'right':
      return { x: r.x + r.w, y: r.y + r.h * t };
    case 'top':
      return { x: r.x + r.w * t, y: r.y };
    case 'bottom':
      return { x: r.x + r.w * t, y: r.y + r.h };
  }
}

/** Nearest side of `r` to point `p` (used when dropping an edge endpoint on a node). */
export function nearestSide(r: Rect, p: Point): ResolvedSide {
  const d: Array<[ResolvedSide, number]> = [
    ['left', Math.abs(p.x - r.x)],
    ['right', Math.abs(p.x - (r.x + r.w))],
    ['top', Math.abs(p.y - r.y)],
    ['bottom', Math.abs(p.y - (r.y + r.h))],
  ];
  d.sort((a, b) => a[1] - b[1]);
  return d[0][0];
}

const sideNormal = (side: ResolvedSide): Point => {
  switch (side) {
    case 'left':
      return { x: -1, y: 0 };
    case 'right':
      return { x: 1, y: 0 };
    case 'top':
      return { x: 0, y: -1 };
    case 'bottom':
      return { x: 0, y: 1 };
  }
};

export interface EdgeGeometry {
  a: Point;
  b: Point;
  aSide: ResolvedSide;
  bSide: ResolvedSide;
  /** Bezier control points in absolute coordinates (bezier style only) */
  c1?: Point;
  c2?: Point;
  d: string;
}

const f = (n: number) => (Math.round(n * 100) / 100).toString();

/**
 * Spread multiple edges attached to the same node side so their ports do not overlap.
 * Returns `t` values (0..1 along the side) keyed by edge id and endpoint.
 */
export function portOffsets(nodes: FlowNode[], edges: FlowEdge[]): Map<string, number> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const groups = new Map<string, Array<{ key: string; other: Point }>>();
  for (const e of edges) {
    const from = byId.get(e.from);
    const to = byId.get(e.to);
    if (!from || !to) {
      continue;
    }
    const aSide = resolveSide(from, to, e.fromSide);
    const bSide = resolveSide(to, from, e.toSide);
    const push = (nodeId: string, side: ResolvedSide, key: string, other: Rect) => {
      const k = `${nodeId}:${side}`;
      const list = groups.get(k) ?? [];
      list.push({ key, other: center(other) });
      groups.set(k, list);
    };
    push(from.id, aSide, `${e.id}:a`, to);
    push(to.id, bSide, `${e.id}:b`, from);
  }
  const out = new Map<string, number>();
  for (const [k, list] of groups) {
    const side = k.split(':')[1] as ResolvedSide;
    const horizontal = side === 'left' || side === 'right';
    // Sort by the position of the far node so edges never cross at the port.
    list.sort((p, q) => (horizontal ? p.other.y - q.other.y : p.other.x - q.other.x));
    const n = list.length;
    list.forEach((item, i) => out.set(item.key, (i + 1) / (n + 1)));
  }
  return out;
}

export function straightPath(a: Point, b: Point): string {
  return `M${f(a.x)} ${f(a.y)} L${f(b.x)} ${f(b.y)}`;
}

export function bezierPath(a: Point, b: Point, c1: Point, c2: Point): string {
  return `M${f(a.x)} ${f(a.y)} C${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(b.x)} ${f(b.y)}`;
}

/** Default bezier control points pushed out of the node along the side normal. */
export function defaultControls(a: Point, b: Point, aSide: ResolvedSide, bSide: ResolvedSide, curvature: number) {
  const na = sideNormal(aSide);
  const nb = sideNormal(bSide);
  const dist = Math.max(40, Math.hypot(b.x - a.x, b.y - a.y) * curvature);
  return {
    c1: { x: a.x + na.x * dist, y: a.y + na.y * dist },
    c2: { x: b.x + nb.x * dist, y: b.y + nb.y * dist },
  };
}

/** Orthogonal path with rounded corners, routed through the midpoint between the two ports. */
export function orthogonalPath(a: Point, b: Point, aSide: ResolvedSide, bSide: ResolvedSide, radius = 10): string {
  const horizontal = aSide === 'left' || aSide === 'right';
  if (horizontal) {
    const dy = b.y - a.y;
    const dx = b.x - a.x;
    if (Math.abs(dy) < 2 * radius || Math.abs(dx) < 2 * radius) {
      return straightPath(a, b);
    }
    const mx = a.x + dx / 2;
    const sx = Math.sign(dx);
    const sy = Math.sign(dy);
    const r = Math.min(radius, Math.abs(dx) / 2, Math.abs(dy) / 2);
    return [
      `M${f(a.x)} ${f(a.y)}`,
      `H${f(mx - sx * r)}`,
      `Q${f(mx)} ${f(a.y)} ${f(mx)} ${f(a.y + sy * r)}`,
      `V${f(b.y - sy * r)}`,
      `Q${f(mx)} ${f(b.y)} ${f(mx + sx * r)} ${f(b.y)}`,
      `H${f(b.x)}`,
    ].join(' ');
  }
  const dy = b.y - a.y;
  const dx = b.x - a.x;
  if (Math.abs(dy) < 2 * radius || Math.abs(dx) < 2 * radius) {
    return straightPath(a, b);
  }
  const my = a.y + dy / 2;
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  const r = Math.min(radius, Math.abs(dx) / 2, Math.abs(dy) / 2);
  return [
    `M${f(a.x)} ${f(a.y)}`,
    `V${f(my - sy * r)}`,
    `Q${f(a.x)} ${f(my)} ${f(a.x + sx * r)} ${f(my)}`,
    `H${f(b.x - sx * r)}`,
    `Q${f(b.x)} ${f(my)} ${f(b.x)} ${f(my + sy * r)}`,
    `V${f(b.y)}`,
  ].join(' ');
}

/** Step path: leaves the start port straight, then a single sharp corner into the end port. */
export function stepPath(a: Point, b: Point, aSide: ResolvedSide): string {
  const horizontal = aSide === 'left' || aSide === 'right';
  if (horizontal) {
    const mx = a.x + (b.x - a.x) / 2;
    return `M${f(a.x)} ${f(a.y)} H${f(mx)} V${f(b.y)} H${f(b.x)}`;
  }
  const my = a.y + (b.y - a.y) / 2;
  return `M${f(a.x)} ${f(a.y)} V${f(my)} H${f(b.x)} V${f(b.y)}`;
}

export function buildPath(
  style: EdgeStyle,
  a: Point,
  b: Point,
  aSide: ResolvedSide,
  bSide: ResolvedSide,
  curvature: number,
  controlPoints?: [ControlPoint, ControlPoint]
): { d: string; c1?: Point; c2?: Point } {
  switch (style) {
    case 'straight':
      return { d: straightPath(a, b) };
    case 'orthogonal':
      return { d: orthogonalPath(a, b, aSide, bSide) };
    case 'step':
      return { d: stepPath(a, b, aSide) };
    case 'bezier':
    default: {
      const def = defaultControls(a, b, aSide, bSide, curvature);
      const c1 = controlPoints ? { x: a.x + controlPoints[0].dx, y: a.y + controlPoints[0].dy } : def.c1;
      const c2 = controlPoints ? { x: b.x + controlPoints[1].dx, y: b.y + controlPoints[1].dy } : def.c2;
      return { d: bezierPath(a, b, c1, c2), c1, c2 };
    }
  }
}

/** Full geometry for an edge given the node map and pre-computed port offsets. */
export function edgeGeometry(
  edge: FlowEdge,
  from: Rect,
  to: Rect,
  offsets?: Map<string, number>
): EdgeGeometry {
  const aSide = resolveSide(from, to, edge.fromSide);
  const bSide = resolveSide(to, from, edge.toSide);
  const a = portPoint(from, aSide, offsets?.get(`${edge.id}:a`) ?? 0.5);
  const b = portPoint(to, bSide, offsets?.get(`${edge.id}:b`) ?? 0.5);
  const built = buildPath(edge.style, a, b, aSide, bSide, edge.curvature, edge.controlPoints);
  return { a, b, aSide, bSide, ...built };
}

export const snap = (v: number, size: number, enabled: boolean) => (enabled && size > 0 ? Math.round(v / size) * size : v);

export function boundingBox(nodes: Rect[]): Rect | undefined {
  if (!nodes.length) {
    return undefined;
  }
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const n of nodes) {
    x0 = Math.min(x0, n.x);
    y0 = Math.min(y0, n.y);
    x1 = Math.max(x1, n.x + n.w);
    y1 = Math.max(y1, n.y + n.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Viewport that fits all nodes inside width x height with padding. */
export function fitViewport(nodes: Rect[], width: number, height: number, padding = 24) {
  const box = boundingBox(nodes);
  if (!box || width <= 0 || height <= 0) {
    return { x: 0, y: 0, zoom: 1 };
  }
  const zoom = Math.min(2, Math.max(0.2, Math.min((width - padding * 2) / Math.max(1, box.w), (height - padding * 2) / Math.max(1, box.h))));
  return {
    x: (width - box.w * zoom) / 2 - box.x * zoom,
    y: (height - box.h * zoom) / 2 - box.y * zoom,
    zoom: Math.round(zoom * 100) / 100,
  };
}

export function hitNode(nodes: FlowNode[], p: Point): FlowNode | undefined {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    if (p.x >= n.x && p.x <= n.x + n.w && p.y >= n.y && p.y <= n.y + n.h) {
      return n;
    }
  }
  return undefined;
}

export function uniqueId(prefix: string, taken: Set<string>): string {
  let i = taken.size + 1;
  while (taken.has(`${prefix}${i}`)) {
    i++;
  }
  return `${prefix}${i}`;
}
