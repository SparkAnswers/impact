import type { LayoutDirection, FlowNode, Point } from '../types';

export interface GroupSegment {
  group: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** True for the segment of a group that carries the label (the first one in layered layouts) */
  first: boolean;
}

/** Optional layout facts that make radial segments exact (both come from the radial layout result). */
export interface GroupHints {
  /** Ring index per node (hop distance from its component's hub) */
  ranks?: Map<string, number>;
  /** Centre of the ring system each node sits on */
  centres?: Map<string, Point>;
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const boxOf = (c: FlowNode[], pad: number): Box => ({
  x0: Math.min(...c.map((n) => n.x)) - pad,
  y0: Math.min(...c.map((n) => n.y)) - pad,
  x1: Math.max(...c.map((n) => n.x + n.w)) + pad,
  y1: Math.max(...c.map((n) => n.y + n.h)) + pad,
});

const intrudes = (b: Box, n: FlowNode) => n.x < b.x1 && b.x0 < n.x + n.w && n.y < b.y1 && b.y0 < n.y + n.h;

/**
 * Group boxes as one rounded rectangle per *segment* of a group, so a group spread over several layers (or
 * rings) gets several boxes and never covers nodes of other groups in between.
 *
 * - Layered (`lr` / `tb`): nodes of a group whose extents along the flow axis overlap (= same layer) share a box.
 * - Radial: nodes of a group on the same ring (`hints.ranks`; one bucket per group without hints) are sorted by
 *   angle around their ring centre (`hints.centres`, else the centroid of all nodes) and split into contiguous
 *   arcs wherever the angular gap between neighbours exceeds 1.5x the median gap. An arc whose box would still
 *   cover a node of another group (long arcs bulge inwards) is halved until it does not. The label goes on the
 *   first arc with room above it.
 *
 * Works on any node positions (layout, overrides, radial).
 */
export function groupSegments(nodes: FlowNode[], direction: LayoutDirection, pad: number, labelHeight: number, hints?: GroupHints): GroupSegment[] {
  const byGroup = new Map<string, FlowNode[]>();
  for (const n of nodes) {
    if (n.group) {
      (byGroup.get(n.group) ?? byGroup.set(n.group, []).get(n.group)!).push(n);
    }
  }
  const out: GroupSegment[] = [];
  const emit = (group: string, clusters: FlowNode[][], labelIndex: number) => {
    clusters.forEach((c, i) => {
      const { x0, y0, x1, y1 } = boxOf(c, pad);
      const first = i === labelIndex;
      out.push({ group, x: x0, y: first ? y0 - labelHeight : y0, w: x1 - x0, h: y1 - (first ? y0 - labelHeight : y0), first });
    });
  };
  const groupsSorted = Array.from(byGroup.entries()).sort(([a], [b]) => (a < b ? -1 : 1));
  if (direction === 'radial') {
    const centroid = nodes.length
      ? { x: nodes.reduce((s, n) => s + n.x + n.w / 2, 0) / nodes.length, y: nodes.reduce((s, n) => s + n.y + n.h / 2, 0) / nodes.length }
      : { x: 0, y: 0 };
    for (const [group, list] of groupsSorted) {
      const foreign = nodes.filter((n) => n.group !== group);
      // Buckets: one per (ring centre, ring) so arcs on different rings or components never share a box.
      const buckets = new Map<string, { centre: Point; list: FlowNode[] }>();
      for (const n of list) {
        const centre = hints?.centres?.get(n.id) ?? centroid;
        const key = `${centre.x},${centre.y}|${hints?.ranks?.get(n.id) ?? 0}`;
        (buckets.get(key) ?? buckets.set(key, { centre, list: [] }).get(key)!).list.push(n);
      }
      const clusters: FlowNode[][] = [];
      for (const { centre, list: bucket } of Array.from(buckets.values())) {
        for (const run of arcs(bucket, centre)) {
          clusters.push(...splitIntruded(run, foreign, pad));
        }
      }
      // Deterministic order (by position), then the label on the first arc whose label strip is free.
      clusters.sort((a, b) => boxOf(a, 0).y0 - boxOf(b, 0).y0 || boxOf(a, 0).x0 - boxOf(b, 0).x0);
      let labelIndex = clusters.findIndex((c) => {
        const b = boxOf(c, pad);
        return !foreign.some((n) => intrudes({ ...b, y0: b.y0 - labelHeight }, n));
      });
      if (labelIndex < 0) {
        labelIndex = 0;
      }
      emit(group, clusters, labelIndex);
    }
    return out;
  }
  const horizontal = direction !== 'tb';
  const lo = (n: FlowNode) => (horizontal ? n.x : n.y);
  const hi = (n: FlowNode) => (horizontal ? n.x + n.w : n.y + n.h);
  for (const [group, list] of groupsSorted) {
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
    emit(group, clusters, 0);
  }
  return out;
}

/** Contiguous arcs of nodes around `centre`: a run breaks where the angular gap exceeds 1.5x the median gap. */
function arcs(list: FlowNode[], centre: Point): FlowNode[][] {
  if (list.length <= 2) {
    return [list];
  }
  const TAU = Math.PI * 2;
  const keyed = list
    .map((n) => ({ n, a: Math.atan2(n.y + n.h / 2 - centre.y, n.x + n.w / 2 - centre.x) }))
    .sort((p, q) => p.a - q.a || p.n.id.localeCompare(q.n.id));
  const count = keyed.length;
  const gaps = keyed.map((k, i) => (i < count - 1 ? keyed[i + 1].a - k.a : keyed[0].a + TAU - k.a));
  const sortedGaps = gaps.slice().sort((p, q) => p - q);
  const median = count % 2 ? sortedGaps[(count - 1) / 2] : (sortedGaps[count / 2 - 1] + sortedGaps[count / 2]) / 2;
  const threshold = median * 1.5;
  let largest = 0;
  gaps.forEach((g, i) => {
    if (g > gaps[largest]) {
      largest = i;
    }
  });
  if (gaps[largest] <= threshold) {
    return [keyed.map((k) => k.n)];
  }
  // Walk once around the ring starting after the largest gap, breaking at every oversized gap.
  const runs: FlowNode[][] = [[]];
  for (let step = 0; step < count; step++) {
    const i = (largest + 1 + step) % count;
    runs[runs.length - 1].push(keyed[i].n);
    if (step < count - 1 && gaps[i] > threshold) {
      runs.push([]);
    }
  }
  return runs;
}

/** Halve an arc (in ring order) until its padded box covers no node of another group. */
function splitIntruded(run: FlowNode[], foreign: FlowNode[], pad: number): FlowNode[][] {
  if (run.length <= 1) {
    return [run];
  }
  const b = boxOf(run, pad);
  if (!foreign.some((n) => intrudes(b, n))) {
    return [run];
  }
  const mid = Math.ceil(run.length / 2);
  return [...splitIntruded(run.slice(0, mid), foreign, pad), ...splitIntruded(run.slice(mid), foreign, pad)];
}

/** True when two segments of different groups overlap (used by tests). */
export function segmentsOverlap(a: GroupSegment, b: GroupSegment): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}
