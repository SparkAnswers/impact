import type { LayoutDirection, FlowNode } from '../types';

export interface GroupSegment {
  group: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** True for the first segment of a group (the one that carries the label) */
  first: boolean;
}

/**
 * Group boxes as one rounded rectangle per *layer segment*: nodes of a group whose extents along the flow
 * axis overlap (= same layer) share a box, so a group spread over several layers gets several boxes and
 * never covers nodes of other groups in between. Works on any node positions (layout, overrides, radial).
 */
export function groupSegments(nodes: FlowNode[], direction: LayoutDirection, pad: number, labelHeight: number): GroupSegment[] {
  const horizontal = direction !== 'tb';
  const lo = (n: FlowNode) => (horizontal ? n.x : n.y);
  const hi = (n: FlowNode) => (horizontal ? n.x + n.w : n.y + n.h);
  const byGroup = new Map<string, FlowNode[]>();
  for (const n of nodes) {
    if (n.group) {
      (byGroup.get(n.group) ?? byGroup.set(n.group, []).get(n.group)!).push(n);
    }
  }
  const out: GroupSegment[] = [];
  for (const [group, list] of Array.from(byGroup.entries()).sort(([a], [b]) => (a < b ? -1 : 1))) {
    const sorted = list.slice().sort((a, b) => lo(a) - lo(b) || a.id.localeCompare(b.id));
    const clusters: FlowNode[][] = [];
    let end = -Infinity;
    for (const n of sorted) {
      if (clusters.length && lo(n) < end) {
        clusters[clusters.length - 1].push(n);
        end = Math.max(end, hi(n));
      } else {
        clusters.push([n]);
        end = hi(n);
      }
    }
    clusters.forEach((c, i) => {
      const x0 = Math.min(...c.map((n) => n.x)) - pad;
      const y0 = Math.min(...c.map((n) => n.y)) - pad;
      const x1 = Math.max(...c.map((n) => n.x + n.w)) + pad;
      const y1 = Math.max(...c.map((n) => n.y + n.h)) + pad;
      const first = i === 0;
      out.push({ group, x: x0, y: first ? y0 - labelHeight : y0, w: x1 - x0, h: y1 - (first ? y0 - labelHeight : y0), first });
    });
  }
  return out;
}

/** True when two segments of different groups overlap (used by tests). */
export function segmentsOverlap(a: GroupSegment, b: GroupSegment): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}
