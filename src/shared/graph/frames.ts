import { FieldType, getFieldDisplayName, type DataFrame, type Field } from '@grafana/data';

/** Node health as understood by the graph parsers (shared by the flow and river panels). */
export type NodeStatus = 'ok' | 'warn' | 'error' | 'none';

/** Default truncation caps (callers pass their own via `ExtractOptions`). */
export const MAX_DATA_NODES = 400;
export const MAX_DATA_EDGES = 1500;

/** Last non-null value of a field (numbers, or strings that parse as numbers). */
export function lastValue(field: Field): number | undefined {
  const values = field.values;
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i];
    if (v !== null && v !== undefined && !(typeof v === 'number' && Number.isNaN(v))) {
      return typeof v === 'number' ? v : Number(v);
    }
  }
  return undefined;
}

/**
 * Turn query results into a graph. Two frame shapes are understood:
 *
 * 1. Table-shaped edge frames: a string `source` and `target` field (names configurable) plus optional
 *    value / label / group fields. Every row is an edge. This is what a Prometheus instant query in
 *    "Table" format produces (one string field per label).
 * 2. Series-shaped edge frames: a numeric field whose `labels` contain the source and target names
 *    (one series per edge, e.g. `client`/`server`); the last value of the series is the edge value.
 *
 * Node frames are optional: a frame with the node id field (default `id`) and no source/target
 * fields adds nodes or decorates the ones derived from the edges.
 */

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  value?: number;
  value2?: number;
  label?: string;
  sourceGroup?: string;
  targetGroup?: string;
  /** Field the value came from (for unit / thresholds / colour scheme) */
  valueField?: Field;
  value2Field?: Field;
}

export interface GraphNode {
  id: string;
  label?: string;
  group?: string;
  status?: NodeStatus;
  value?: number;
  valueField?: Field;
  /** True when the node came from a node frame rather than from an edge endpoint */
  explicit: boolean;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Human-readable notices (truncation, missing fields) */
  notices: string[];
  /** Counts before truncation */
  totalNodes: number;
  totalEdges: number;
}

/** Configurable field / label names used to find edges and nodes in query results. */
export interface FieldNames {
  sourceField: string;
  targetField: string;
  valueField: string;
  value2Field: string;
  labelField: string;
  sourceGroupField: string;
  targetGroupField: string;
  nodeIdField: string;
  nodeLabelField: string;
  nodeGroupField: string;
  nodeStatusField: string;
  nodeValueField: string;
}

const norm = (s: string | undefined) => (s ?? '').trim().toLowerCase();

const isScalar = (f: Field) => f.type === FieldType.string || f.type === FieldType.number || f.type === FieldType.boolean || f.type === FieldType.other;

/** Find a field by configured name (matches `name` or display name, case-insensitive). */
export function findField(frame: DataFrame, series: DataFrame[], name: string): Field | undefined {
  const want = norm(name);
  if (!want) {
    return undefined;
  }
  return (
    frame.fields.find((f) => norm(f.name) === want) ??
    frame.fields.find((f) => norm(getFieldDisplayName(f, frame, series)) === want) ??
    frame.fields.find((f) => norm(f.config?.displayName) === want)
  );
}

const firstNumeric = (frame: DataFrame, exclude: Array<Field | undefined>) =>
  frame.fields.find((f) => f.type === FieldType.number && !exclude.includes(f));

const str = (v: unknown): string | undefined => {
  if (v === null || v === undefined) {
    return undefined;
  }
  const s = typeof v === 'string' ? v : String(v);
  const t = s.replace(/[<>]/g, '').trim();
  return t ? t.slice(0, 200) : undefined;
};

const num = (v: unknown): number | undefined => {
  if (v === null || v === undefined || v === '') {
    return undefined;
  }
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/** Interpret a status-ish string (after value mappings) as a node status. */
export function statusFromText(text: string | undefined, numeric?: number): NodeStatus | undefined {
  const t = norm(text);
  if (!t && numeric === undefined) {
    return undefined;
  }
  if (/\b(ok|up|healthy|running|bound|ready|green|good|normal|succeeded|available|active|1)\b/.test(t)) {
    return 'ok';
  }
  if (/\b(warn|warning|degraded|pending|yellow|orange|slow|busy|unknown|2)\b/.test(t)) {
    return 'warn';
  }
  if (/\b(error|err|down|failed|failure|critical|red|crashloopbackoff|lost|unbound|unavailable|3)\b/.test(t)) {
    return 'error';
  }
  if (numeric !== undefined) {
    return numeric <= 0 ? 'error' : numeric === 1 ? 'ok' : numeric === 2 ? 'warn' : 'error';
  }
  return 'none';
}

/** Status of a field value using the field's display processor (so standard value mappings apply). */
function statusOf(field: Field | undefined, index: number): NodeStatus | undefined {
  if (!field) {
    return undefined;
  }
  const raw = field.values[index];
  const text = field.display ? field.display(raw).text : str(raw);
  return statusFromText(text, num(raw));
}

export const edgeId = (source: string, target: string) => `${source}→${target}`;

interface Collected {
  edges: Map<string, GraphEdge>;
  nodes: Map<string, GraphNode>;
}

function addEdge(c: Collected, e: GraphEdge) {
  const prev = c.edges.get(e.id);
  if (!prev) {
    c.edges.set(e.id, e);
    return;
  }
  // Same source/target twice (e.g. several series per pair): sum the values, keep the first label.
  if (e.value !== undefined) {
    prev.value = (prev.value ?? 0) + e.value;
  }
  if (e.value2 !== undefined) {
    prev.value2 = (prev.value2 ?? 0) + e.value2;
  }
  prev.label = prev.label ?? e.label;
  prev.sourceGroup = prev.sourceGroup ?? e.sourceGroup;
  prev.targetGroup = prev.targetGroup ?? e.targetGroup;
}

function tableEdges(frame: DataFrame, series: DataFrame[], names: FieldNames, c: Collected): boolean {
  const src = findField(frame, series, names.sourceField);
  const tgt = findField(frame, series, names.targetField);
  if (!src || !tgt || !isScalar(src) || !isScalar(tgt)) {
    return false;
  }
  const label = findField(frame, series, names.labelField);
  const sg = findField(frame, series, names.sourceGroupField);
  const tg = findField(frame, series, names.targetGroupField);
  const v2 = findField(frame, series, names.value2Field);
  // Empty name: first numeric field. A name that matches nothing: no value.
  const v1 = names.valueField.trim() ? findField(frame, series, names.valueField) : firstNumeric(frame, [src, tgt, label, sg, tg, v2]);
  for (let i = 0; i < frame.length; i++) {
    const source = str(src.values[i]);
    const target = str(tgt.values[i]);
    if (!source || !target) {
      continue;
    }
    addEdge(c, {
      id: edgeId(source, target),
      source,
      target,
      value: v1 ? num(v1.values[i]) : undefined,
      value2: v2 ? num(v2.values[i]) : undefined,
      label: label ? str(label.values[i]) : undefined,
      sourceGroup: sg ? str(sg.values[i]) : undefined,
      targetGroup: tg ? str(tg.values[i]) : undefined,
      valueField: v1,
      value2Field: v2,
    });
  }
  return true;
}

function labelOf(labels: Record<string, string> | undefined, name: string): string | undefined {
  if (!labels) {
    return undefined;
  }
  const want = norm(name);
  if (!want) {
    return undefined;
  }
  for (const k of Object.keys(labels)) {
    if (norm(k) === want) {
      return str(labels[k]);
    }
  }
  return undefined;
}

/** Is this series the configured secondary value (matched by field name, display name or metric name)? */
function isSecondarySeries(field: Field, names: FieldNames): boolean {
  const want = norm(names.value2Field);
  if (!want) {
    return false;
  }
  return norm(field.name) === want || norm(field.config?.displayName) === want || norm(labelOf(field.labels, '__name__')) === want;
}

function seriesEdges(frame: DataFrame, names: FieldNames, c: Collected): boolean {
  let found = false;
  for (const field of frame.fields) {
    if (field.type !== FieldType.number || !field.labels || isSecondarySeries(field, names)) {
      continue;
    }
    const source = labelOf(field.labels, names.sourceField);
    const target = labelOf(field.labels, names.targetField);
    if (!source || !target) {
      continue;
    }
    found = true;
    addEdge(c, {
      id: edgeId(source, target),
      source,
      target,
      value: lastValue(field),
      label: labelOf(field.labels, names.labelField),
      sourceGroup: labelOf(field.labels, names.sourceGroupField),
      targetGroup: labelOf(field.labels, names.targetGroupField),
      valueField: field,
    });
  }
  return found;
}

/** Secondary values arriving as their own series (same source/target labels, different query). */
function seriesSecondary(frame: DataFrame, names: FieldNames, c: Collected): boolean {
  let found = false;
  for (const field of frame.fields) {
    if (field.type !== FieldType.number || !field.labels || !isSecondarySeries(field, names)) {
      continue;
    }
    const source = labelOf(field.labels, names.sourceField);
    const target = labelOf(field.labels, names.targetField);
    if (!source || !target) {
      continue;
    }
    const e = c.edges.get(edgeId(source, target));
    if (e) {
      e.value2 = lastValue(field);
      e.value2Field = field;
      found = true;
    }
  }
  return found;
}

function tableNodes(frame: DataFrame, series: DataFrame[], names: FieldNames, c: Collected): boolean {
  const idf = findField(frame, series, names.nodeIdField);
  if (!idf || !isScalar(idf)) {
    return false;
  }
  const label = findField(frame, series, names.nodeLabelField);
  const group = findField(frame, series, names.nodeGroupField);
  const status = findField(frame, series, names.nodeStatusField);
  const value = names.nodeValueField.trim() ? findField(frame, series, names.nodeValueField) : firstNumeric(frame, [idf, label, group, status]);
  for (let i = 0; i < frame.length; i++) {
    const id = str(idf.values[i]);
    if (!id) {
      continue;
    }
    const prev = c.nodes.get(id);
    const node: GraphNode = {
      id,
      label: (label ? str(label.values[i]) : undefined) ?? prev?.label,
      group: (group ? str(group.values[i]) : undefined) ?? prev?.group,
      status: statusOf(status, i) ?? prev?.status,
      value: value ? num(value.values[i]) : prev?.value,
      valueField: value ?? prev?.valueField,
      explicit: true,
    };
    c.nodes.set(id, node);
  }
  return true;
}

function seriesNodes(frame: DataFrame, names: FieldNames, c: Collected): boolean {
  let found = false;
  for (const field of frame.fields) {
    if (field.type !== FieldType.number || !field.labels) {
      continue;
    }
    const id = labelOf(field.labels, names.nodeIdField);
    if (!id || labelOf(field.labels, names.sourceField) || labelOf(field.labels, names.targetField)) {
      continue;
    }
    found = true;
    const prev = c.nodes.get(id);
    const statusText = labelOf(field.labels, names.nodeStatusField);
    c.nodes.set(id, {
      id,
      label: labelOf(field.labels, names.nodeLabelField) ?? prev?.label,
      group: labelOf(field.labels, names.nodeGroupField) ?? prev?.group,
      status: statusFromText(statusText) ?? prev?.status,
      value: lastValue(field),
      valueField: field,
      explicit: true,
    });
  }
  return found;
}

export interface ExtractOptions extends FieldNames {
  /** Keep only the N edges with the highest value (0 or undefined = no limit before the hard cap) */
  topN?: number;
  maxNodes?: number;
  maxEdges?: number;
}

/** Keep the N edges with the highest value; edges without a value come last and are kept in input order. */
export function topEdges(edges: GraphEdge[], n: number): GraphEdge[] {
  if (!n || n <= 0 || edges.length <= n) {
    return edges;
  }
  const indexed = edges.map((e, i) => ({ e, i }));
  indexed.sort((a, b) => {
    const av = a.e.value ?? -Infinity;
    const bv = b.e.value ?? -Infinity;
    return bv - av || a.i - b.i;
  });
  const keep = new Set(indexed.slice(0, n).map((x) => x.e.id));
  return edges.filter((e) => keep.has(e.id));
}

/** Build the graph from all frames. Node order is deterministic (sorted by id). */
export function extractGraph(series: DataFrame[], opts: ExtractOptions): Graph {
  const c: Collected = { edges: new Map(), nodes: new Map() };
  const notices: string[] = [];
  const secondaryFrames: DataFrame[] = [];
  for (const frame of series) {
    if (frame.fields.some((f) => f.type === FieldType.number && !!f.labels && isSecondarySeries(f, opts))) {
      secondaryFrames.push(frame);
    }
    if (tableEdges(frame, series, opts, c)) {
      continue;
    }
    if (seriesEdges(frame, opts, c)) {
      continue;
    }
    if (tableNodes(frame, series, opts, c)) {
      continue;
    }
    seriesNodes(frame, opts, c);
  }
  for (const frame of secondaryFrames) {
    seriesSecondary(frame, opts, c);
  }

  let edges = Array.from(c.edges.values());
  const totalEdges = edges.length;
  edges = topEdges(edges, opts.topN ?? 0);
  const maxEdges = opts.maxEdges ?? MAX_DATA_EDGES;
  if (edges.length > maxEdges) {
    edges = topEdges(edges, maxEdges);
    notices.push(`Showing ${maxEdges} of ${totalEdges} edges`);
  } else if (totalEdges > edges.length) {
    notices.push(`Top ${edges.length} of ${totalEdges} edges`);
  }

  // Nodes: explicit node frames plus the union of edge endpoints.
  const nodes = new Map<string, GraphNode>();
  for (const e of edges) {
    for (const [id, group] of [
      [e.source, e.sourceGroup],
      [e.target, e.targetGroup],
    ] as const) {
      const prev = nodes.get(id) ?? c.nodes.get(id) ?? { id, explicit: false };
      nodes.set(id, { ...prev, group: prev.group ?? group });
    }
  }
  for (const n of c.nodes.values()) {
    if (!nodes.has(n.id)) {
      nodes.set(n.id, n);
    }
  }
  let list = Array.from(nodes.values()).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const totalNodes = list.length;
  const maxNodes = opts.maxNodes ?? MAX_DATA_NODES;
  if (list.length > maxNodes) {
    // Keep the most connected nodes; drop edges that lost an endpoint.
    const degree = new Map<string, number>();
    for (const e of edges) {
      degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
      degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
    }
    list = list
      .map((n, i) => ({ n, i }))
      .sort((a, b) => (degree.get(b.n.id) ?? 0) - (degree.get(a.n.id) ?? 0) || a.i - b.i)
      .slice(0, maxNodes)
      .map((x) => x.n)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const keep = new Set(list.map((n) => n.id));
    edges = edges.filter((e) => keep.has(e.source) && keep.has(e.target));
    notices.push(`Showing ${maxNodes} of ${totalNodes} nodes`);
  }
  return { nodes: list, edges, notices, totalNodes, totalEdges };
}
