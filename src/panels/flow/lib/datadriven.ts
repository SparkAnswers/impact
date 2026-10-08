import { getDisplayProcessor, type Field, type GrafanaTheme2 } from '@grafana/data';
import { formatValue, type FieldValue } from './data';
import type { Graph, GraphEdge } from './frames';
import { DEFAULT_PARTICLES, EMPTY_DIAGRAM, type DataOptions, type EdgeBinding, type FlowDiagram, type FlowEdge, type FlowNode, type NodeOverride, type Point } from '../types';

/** Longest label drawn on a data node before it is shortened with an ellipsis. */
export const MAX_LABEL = 28;

export const shortLabel = (s: string, max = MAX_LABEL) => (s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s);

/** Width/height of a data node from its label (cards are sized to the text so names stay readable). */
export function nodeSize(label: string, fontSize: number, withValue: boolean): { w: number; h: number } {
  const w = Math.round(Math.min(260, Math.max(96, 28 + label.length * fontSize * 0.6)));
  return { w, h: withValue ? 52 : 44 };
}

/** Key of the synthetic field that carries a data edge's value (see {@link buildDataDiagram}). */
export const edgeFieldKey = (edgeId: string, secondary = false) => `${secondary ? 'edge2' : 'edge'}:${edgeId}`;
export const nodeFieldKey = (nodeId: string) => `node:${nodeId}`;

/** Colour for a group: the theme's classic palette, by group index (groups sorted by name). */
export function groupPalette(groups: string[], theme: GrafanaTheme2): Map<string, string> {
  const palette = theme.visualization.palette.length ? theme.visualization.palette : ['blue', 'green', 'purple', 'orange', 'red', 'yellow'];
  const out = new Map<string, string>();
  groups
    .slice()
    .sort()
    .forEach((g, i) => out.set(g, palette[i % palette.length]));
  return out;
}

export interface BuiltDiagram {
  diagram: FlowDiagram;
  /** Synthetic field values keyed by `edge:<id>` / `edge2:<id>` / `node:<id>` so the usual binding code applies */
  fields: Map<string, FieldValue>;
  groups: string[];
  groupColors: Map<string, string>;
}

function fieldValue(name: string, field: Field | undefined, value: number | undefined, theme: GrafanaTheme2): FieldValue | undefined {
  if (value === undefined || !field) {
    return undefined;
  }
  const processor = field.display ?? getDisplayProcessor({ field, theme });
  return { name, field, value, display: processor(value) };
}

function binding(name: string, mapTo: DataOptions['valueMap'], field: Field | undefined, lo: number, hi: number): EdgeBinding | undefined {
  if (mapTo === 'none' || !field) {
    return undefined;
  }
  return { field: name, mapTo, min: field.config?.min ?? lo, max: field.config?.max ?? hi };
}

const range = (edges: GraphEdge[], pick: (e: GraphEdge) => number | undefined) => {
  let lo = 0;
  let hi = -Infinity;
  for (const e of edges) {
    const v = pick(e);
    if (v !== undefined) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  }
  return { lo, hi: hi === -Infinity ? 100 : hi === lo ? lo + 1 : hi };
};

/**
 * Build a diagram from an extracted graph and node positions. Edge values are exposed as synthetic
 * fields (`edge:<id>`) and bound through the standard binding machinery, so thresholds, units and
 * colour schemes of the value field apply exactly like on hand-drawn edges.
 */
export function buildDataDiagram(graph: Graph, positions: Map<string, Point>, opts: DataOptions, theme: GrafanaTheme2, fontSize: number): BuiltDiagram {
  const fields = new Map<string, FieldValue>();
  const groups = Array.from(new Set(graph.nodes.map((n) => n.group).filter((g): g is string => !!g)));
  const groupColors = groupPalette(groups, theme);

  const nodes: FlowNode[] = graph.nodes.map((n) => {
    const key = nodeFieldKey(n.id);
    const fv = fieldValue(key, n.valueField, n.value, theme);
    if (fv) {
      fields.set(key, fv);
    }
    const label = shortLabel(n.label ?? n.id);
    const { w, h } = nodeSize(label, fontSize, !!fv);
    const p = positions.get(n.id) ?? { x: 0, y: 0 };
    const status = n.status ?? (n.group ? 'ok' : 'none');
    const node: FlowNode = { id: n.id, label, x: p.x, y: p.y, w, h, shape: 'card', status };
    if (n.group) {
      node.group = n.group;
      if (status === 'ok' || status === 'none') {
        node.color = groupColors.get(n.group);
      }
    }
    if (label !== (n.label ?? n.id)) {
      node.sublabel = shortLabel(n.id, 40);
    }
    if (fv) {
      node.valueField = key;
    }
    return node;
  });

  const rects = new Map(nodes.map((n) => [n.id, n]));
  const r1 = range(graph.edges, (e) => e.value);
  const r2 = range(graph.edges, (e) => e.value2);
  const edges: FlowEdge[] = graph.edges.map((e) => {
    const from = rects.get(e.source);
    const to = rects.get(e.target);
    // Keep the bezier control offset at ~55% of the gap between the nodes (along the layout axis) so long
    // jumps across several rows do not overshoot the next column.
    let curvature = 0.5;
    if (from && to) {
      const gapX = Math.max(0, Math.max(from.x, to.x) - Math.min(from.x + from.w, to.x + to.w));
      const gapY = Math.max(0, Math.max(from.y, to.y) - Math.min(from.y + from.h, to.y + to.h));
      const gap = opts.layout === 'tb' ? gapY : opts.layout === 'radial' ? Math.max(gapX, gapY) : gapX;
      const len = Math.hypot(to.x + to.w / 2 - (from.x + from.w / 2), to.y + to.h / 2 - (from.y + from.h / 2));
      if (len > 0) {
        curvature = Math.round(Math.min(0.55, Math.max(0.08, (0.55 * Math.max(gap, 40)) / len)) * 100) / 100;
      }
    }
    const k1 = edgeFieldKey(e.id);
    const k2 = edgeFieldKey(e.id, true);
    const f1 = fieldValue(k1, e.valueField, e.value, theme);
    const f2 = fieldValue(k2, e.value2Field, e.value2, theme);
    if (f1) {
      fields.set(k1, f1);
    }
    if (f2) {
      fields.set(k2, f2);
    }
    const edge: FlowEdge = {
      id: e.id,
      from: e.source,
      to: e.target,
      fromSide: 'auto',
      toSide: 'auto',
      style: 'bezier',
      curvature,
      stroke: 1.5,
      color: '',
      dash: 'solid',
      arrow: true,
      glow: true,
      particles: { ...DEFAULT_PARTICLES },
    };
    const b1 = f1 ? binding(k1, opts.valueMap, e.valueField, r1.lo, r1.hi) : undefined;
    const b2 = f2 ? binding(k2, opts.value2Map, e.value2Field, r2.lo, r2.hi) : undefined;
    if (b1) {
      edge.bind = b1;
    }
    if (b2) {
      edge.bind2 = b2;
    }
    const label = e.label ?? (opts.showEdgeValues ? formatValue(f1) : undefined);
    if (label) {
      edge.label = shortLabel(label, 24);
    }
    return edge;
  });

  return { diagram: { ...EMPTY_DIAGRAM, nodes, edges }, fields, groups, groupColors };
}

const OVERRIDE_KEYS: Array<keyof NodeOverride> = ['x', 'y', 'label', 'color', 'icon', 'shape', 'status'];

/** Apply per-node overrides (position, look) on top of a data-driven diagram. Unknown ids are ignored. */
export function mergeOverrides(diagram: FlowDiagram, overrides: Record<string, NodeOverride> | undefined): FlowDiagram {
  if (!overrides || !Object.keys(overrides).length) {
    return diagram;
  }
  return {
    ...diagram,
    nodes: diagram.nodes.map((n) => {
      const o = overrides[n.id];
      if (!o) {
        return n;
      }
      const out: FlowNode = { ...n };
      for (const k of OVERRIDE_KEYS) {
        const v = o[k];
        if (v !== undefined && v !== null && v !== '') {
          (out as unknown as Record<string, unknown>)[k] = v;
        }
      }
      // Restyled nodes need room: a longer label, the hub badge, the pill's dot + icon, or an icon.
      if (o.label) {
        out.w = Math.max(out.w, Math.round(28 + o.label.length * 7.2));
      }
      if (out.shape === 'hub') {
        out.w += 44;
      } else if (out.shape === 'pill') {
        out.w += 24;
      }
      if (o.icon && out.shape !== 'circle') {
        out.w += 22;
      }
      return out;
    }),
  };
}

/** Record moved nodes (compared with the diagram before the drag) as position overrides. */
export function overridesFromMove(prev: Record<string, NodeOverride> | undefined, before: FlowDiagram, after: FlowDiagram): Record<string, NodeOverride> {
  const out: Record<string, NodeOverride> = { ...(prev ?? {}) };
  const was = new Map(before.nodes.map((n) => [n.id, n]));
  for (const n of after.nodes) {
    const b = was.get(n.id);
    if (b && (b.x !== n.x || b.y !== n.y)) {
      out[n.id] = { ...out[n.id], x: n.x, y: n.y };
    }
  }
  return out;
}

/** Strip empty override entries. */
export function cleanOverrides(overrides: Record<string, NodeOverride>): Record<string, NodeOverride> {
  const out: Record<string, NodeOverride> = {};
  for (const [id, o] of Object.entries(overrides)) {
    const entries = Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '');
    if (entries.length) {
      out[id] = Object.fromEntries(entries) as NodeOverride;
    }
  }
  return out;
}
