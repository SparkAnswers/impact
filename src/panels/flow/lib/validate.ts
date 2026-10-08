import {
  DEFAULT_EDGE,
  DEFAULT_NODE,
  DEFAULT_PARTICLES,
  EMPTY_DIAGRAM,
  type EdgeBinding,
  type EdgeDash,
  type EdgeStyle,
  type FlowDiagram,
  type FlowEdge,
  type FlowNode,
  type NodeShape,
  type NodeStatus,
  type PortSide,
} from '../types';

export type ValidationResult = { ok: true; diagram: FlowDiagram } | { ok: false; errors: string[] };

const SHAPES: NodeShape[] = ['card', 'pill', 'hub', 'circle'];
const STATUSES: NodeStatus[] = ['ok', 'warn', 'error', 'none'];
const SIDES: PortSide[] = ['auto', 'left', 'right', 'top', 'bottom'];
const STYLES: EdgeStyle[] = ['bezier', 'orthogonal', 'straight', 'step'];
const DASHES: EdgeDash[] = ['solid', 'dash', 'dot'];
const BIND_TARGETS = ['speed', 'color', 'width'] as const;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const oneOf = <T extends string>(v: unknown, list: readonly T[]): v is T => isStr(v) && (list as readonly string[]).includes(v);

/** Strip anything that could be interpreted as markup or a script URL from user text. */
export const cleanText = (v: unknown, max = 120): string =>
  isStr(v) ? v.replace(/[<>]/g, '').replace(/javascript:/gi, '').slice(0, max) : '';

function validateNode(raw: unknown, i: number, errors: string[]): FlowNode | undefined {
  if (!isObj(raw)) {
    errors.push(`nodes[${i}] must be an object`);
    return;
  }
  const id = cleanText(raw.id, 64);
  if (!id) {
    errors.push(`nodes[${i}].id must be a non-empty string`);
    return;
  }
  for (const k of ['x', 'y'] as const) {
    if (!isNum(raw[k])) {
      errors.push(`nodes[${i}].${k} must be a number`);
    }
  }
  if (raw.shape !== undefined && !oneOf(raw.shape, SHAPES)) {
    errors.push(`nodes[${i}].shape must be one of ${SHAPES.join(', ')}`);
  }
  if (raw.status !== undefined && !oneOf(raw.status, STATUSES)) {
    errors.push(`nodes[${i}].status must be one of ${STATUSES.join(', ')}`);
  }
  const node: FlowNode = {
    ...DEFAULT_NODE,
    id,
    label: cleanText(raw.label) || id,
    x: isNum(raw.x) ? raw.x : 0,
    y: isNum(raw.y) ? raw.y : 0,
    w: isNum(raw.w) && raw.w > 0 ? raw.w : DEFAULT_NODE.w,
    h: isNum(raw.h) && raw.h > 0 ? raw.h : DEFAULT_NODE.h,
    shape: oneOf(raw.shape, SHAPES) ? raw.shape : 'card',
    status: oneOf(raw.status, STATUSES) ? raw.status : 'none',
  };
  if (isStr(raw.sublabel) && raw.sublabel) {
    node.sublabel = cleanText(raw.sublabel);
  }
  if (isStr(raw.icon) && raw.icon) {
    node.icon = cleanText(raw.icon, 40);
  }
  if (isStr(raw.color) && raw.color) {
    node.color = cleanText(raw.color, 40);
  }
  if (isStr(raw.valueField) && raw.valueField) {
    node.valueField = cleanText(raw.valueField, 200);
  }
  if (isStr(raw.valueFormat) && raw.valueFormat) {
    node.valueFormat = cleanText(raw.valueFormat, 60);
  }
  return node;
}

function validateBinding(raw: unknown, i: number, errors: string[]): EdgeBinding | undefined {
  if (!isObj(raw)) {
    errors.push(`edges[${i}].bind must be an object`);
    return;
  }
  if (!isStr(raw.field) || !raw.field) {
    errors.push(`edges[${i}].bind.field must be a non-empty string`);
    return;
  }
  if (!oneOf(raw.mapTo, BIND_TARGETS)) {
    errors.push(`edges[${i}].bind.mapTo must be one of ${BIND_TARGETS.join(', ')}`);
    return;
  }
  const bind: EdgeBinding = { field: cleanText(raw.field, 200), mapTo: raw.mapTo };
  if (isNum(raw.min)) {
    bind.min = raw.min;
  }
  if (isNum(raw.max)) {
    bind.max = raw.max;
  }
  if (typeof raw.reverseBelowZero === 'boolean') {
    bind.reverseBelowZero = raw.reverseBelowZero;
  }
  return bind;
}

function validateEdge(raw: unknown, i: number, nodeIds: Set<string>, errors: string[]): FlowEdge | undefined {
  if (!isObj(raw)) {
    errors.push(`edges[${i}] must be an object`);
    return;
  }
  const id = cleanText(raw.id, 64);
  if (!id) {
    errors.push(`edges[${i}].id must be a non-empty string`);
    return;
  }
  const from = cleanText(raw.from, 64);
  const to = cleanText(raw.to, 64);
  if (!nodeIds.has(from)) {
    errors.push(`edges[${i}].from references unknown node "${from}"`);
  }
  if (!nodeIds.has(to)) {
    errors.push(`edges[${i}].to references unknown node "${to}"`);
  }
  if (raw.style !== undefined && !oneOf(raw.style, STYLES)) {
    errors.push(`edges[${i}].style must be one of ${STYLES.join(', ')}`);
  }
  if (raw.dash !== undefined && !oneOf(raw.dash, DASHES)) {
    errors.push(`edges[${i}].dash must be one of ${DASHES.join(', ')}`);
  }
  for (const k of ['fromSide', 'toSide'] as const) {
    if (raw[k] !== undefined && !oneOf(raw[k], SIDES)) {
      errors.push(`edges[${i}].${k} must be one of ${SIDES.join(', ')}`);
    }
  }
  let controlPoints: FlowEdge['controlPoints'];
  if (raw.controlPoints !== undefined) {
    const cp = raw.controlPoints;
    const okCp =
      Array.isArray(cp) && cp.length === 2 && cp.every((c) => isObj(c) && isNum(c.dx) && isNum(c.dy));
    if (!okCp) {
      errors.push(`edges[${i}].controlPoints must be two {dx, dy} points`);
    } else {
      const [p, q] = cp as Array<{ dx: number; dy: number }>;
      controlPoints = [
        { dx: p.dx, dy: p.dy },
        { dx: q.dx, dy: q.dy },
      ];
    }
  }
  const p = isObj(raw.particles) ? raw.particles : {};
  const edge: FlowEdge = {
    ...DEFAULT_EDGE,
    id,
    from,
    to,
    fromSide: oneOf(raw.fromSide, SIDES) ? raw.fromSide : 'auto',
    toSide: oneOf(raw.toSide, SIDES) ? raw.toSide : 'auto',
    style: oneOf(raw.style, STYLES) ? raw.style : 'bezier',
    curvature: isNum(raw.curvature) ? Math.min(1, Math.max(0, raw.curvature)) : DEFAULT_EDGE.curvature,
    stroke: isNum(raw.stroke) ? Math.min(12, Math.max(0.5, raw.stroke)) : DEFAULT_EDGE.stroke,
    color: isStr(raw.color) ? cleanText(raw.color, 40) : '',
    dash: oneOf(raw.dash, DASHES) ? raw.dash : 'solid',
    arrow: typeof raw.arrow === 'boolean' ? raw.arrow : DEFAULT_EDGE.arrow,
    glow: typeof raw.glow === 'boolean' ? raw.glow : DEFAULT_EDGE.glow,
    particles: {
      enabled: typeof p.enabled === 'boolean' ? p.enabled : DEFAULT_PARTICLES.enabled,
      count: isNum(p.count) ? Math.min(12, Math.max(0, Math.round(p.count))) : DEFAULT_PARTICLES.count,
      speed: isNum(p.speed) ? Math.min(5, Math.max(0, p.speed)) : DEFAULT_PARTICLES.speed,
      size: isNum(p.size) ? Math.min(8, Math.max(0.5, p.size)) : DEFAULT_PARTICLES.size,
    },
  };
  if (controlPoints) {
    edge.controlPoints = controlPoints;
  }
  if (raw.bind !== undefined && raw.bind !== null) {
    const bind = validateBinding(raw.bind, i, errors);
    if (bind) {
      edge.bind = bind;
    }
  }
  return edge;
}

/**
 * Validate an unknown value (typically parsed JSON) as a diagram. Returns a normalised diagram with
 * defaults applied, or a list of human-readable errors. Unknown keys are dropped.
 */
export function validateDiagram(raw: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isObj(raw)) {
    return { ok: false, errors: ['Diagram must be a JSON object with "nodes" and "edges" arrays'] };
  }
  if (!Array.isArray(raw.nodes)) {
    errors.push('"nodes" must be an array');
  }
  if (!Array.isArray(raw.edges)) {
    errors.push('"edges" must be an array');
  }
  if (errors.length) {
    return { ok: false, errors };
  }
  const nodes: FlowNode[] = [];
  const nodeIds = new Set<string>();
  (raw.nodes as unknown[]).forEach((n, i) => {
    const node = validateNode(n, i, errors);
    if (node) {
      if (nodeIds.has(node.id)) {
        errors.push(`nodes[${i}].id "${node.id}" is duplicated`);
      }
      nodeIds.add(node.id);
      nodes.push(node);
    }
  });
  const edges: FlowEdge[] = [];
  const edgeIds = new Set<string>();
  (raw.edges as unknown[]).forEach((e, i) => {
    const edge = validateEdge(e, i, nodeIds, errors);
    if (edge) {
      if (edgeIds.has(edge.id)) {
        errors.push(`edges[${i}].id "${edge.id}" is duplicated`);
      }
      edgeIds.add(edge.id);
      edges.push(edge);
    }
  });
  if (errors.length) {
    return { ok: false, errors };
  }
  const vp = isObj(raw.viewport) ? raw.viewport : {};
  const grid = isObj(raw.grid) ? raw.grid : {};
  return {
    ok: true,
    diagram: {
      nodes,
      edges,
      viewport: {
        x: isNum(vp.x) ? vp.x : 0,
        y: isNum(vp.y) ? vp.y : 0,
        zoom: isNum(vp.zoom) && vp.zoom > 0 ? Math.min(4, Math.max(0.1, vp.zoom)) : 1,
      },
      grid: {
        show: typeof grid.show === 'boolean' ? grid.show : EMPTY_DIAGRAM.grid.show,
        size: isNum(grid.size) && grid.size >= 4 ? grid.size : EMPTY_DIAGRAM.grid.size,
        snap: typeof grid.snap === 'boolean' ? grid.snap : EMPTY_DIAGRAM.grid.snap,
      },
    },
  };
}

/** Parse JSON text and validate it. */
export function parseDiagramJson(text: string): ValidationResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`] };
  }
  return validateDiagram(raw);
}

/** Normalise whatever is stored in options (older saves, partial objects) into a full diagram. */
export function normalizeDiagram(raw: unknown): FlowDiagram {
  const res = validateDiagram(raw);
  if (res.ok) {
    return res.diagram;
  }
  // Best effort: keep valid nodes, drop everything else.
  if (isObj(raw) && Array.isArray(raw.nodes)) {
    const nodes: FlowNode[] = [];
    const ids = new Set<string>();
    raw.nodes.forEach((n: unknown, i: number) => {
      const node = validateNode(n, i, []);
      if (node && !ids.has(node.id)) {
        ids.add(node.id);
        nodes.push(node);
      }
    });
    const edges: FlowEdge[] = [];
    if (Array.isArray(raw.edges)) {
      raw.edges.forEach((e: unknown, i: number) => {
        const errs: string[] = [];
        const edge = validateEdge(e, i, ids, errs);
        if (edge && !errs.length) {
          edges.push(edge);
        }
      });
    }
    return { ...EMPTY_DIAGRAM, nodes, edges };
  }
  return EMPTY_DIAGRAM;
}
