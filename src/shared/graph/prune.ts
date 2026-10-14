import { edgeId, type Graph, type GraphEdge, type GraphNode, type NodeStatus } from './frames';

/**
 * Rule-based pruning of an extracted graph, applied before layout. Pure and deterministic: the input is never
 * mutated, node order stays sorted by id, edge order is the input order.
 */

export interface PruneRules {
  /** Drop nodes with exactly one edge (applied once, never below two nodes) */
  hideLeaves?: boolean;
  /** Drop edges whose value is below this (edges without a value stay); unset or blank = off */
  minValue?: number;
  /** Keep nodes within N hops of the roots (0 / unset = all) */
  maxDepth?: number;
  /** One node per group with summed edges */
  collapseGroups?: boolean;
}

/** Items hidden by hand (context menu), stored with the panel. */
export interface HiddenItems {
  nodes: string[];
  groups: string[];
}

export const EMPTY_HIDDEN: HiddenItems = { nodes: [], groups: [] };
export const DEFAULT_PRUNE: PruneRules = {};

export interface PruneResult {
  graph: Graph;
  /** Nodes and edges dropped by the hidden list and the rules (collapsing groups is not counted) */
  removed: { nodes: number; edges: number };
}

const byId = (a: GraphNode, b: GraphNode) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** True when the rules and hidden list would change nothing (lets callers skip the work). */
export function pruneActive(rules: PruneRules | undefined, hidden: HiddenItems | undefined): boolean {
  return (
    !!rules?.hideLeaves ||
    (rules?.minValue !== undefined && rules.minValue !== null && Number.isFinite(rules.minValue)) ||
    (rules?.maxDepth ?? 0) > 0 ||
    !!rules?.collapseGroups ||
    (hidden?.nodes.length ?? 0) > 0 ||
    (hidden?.groups.length ?? 0) > 0
  );
}

/** Edges whose both endpoints are still present. */
function edgesAmong(edges: GraphEdge[], keep: Set<string>): GraphEdge[] {
  return edges.filter((e) => keep.has(e.source) && keep.has(e.target));
}

function degrees(nodes: GraphNode[], edges: GraphEdge[]): Map<string, number> {
  const d = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  for (const e of edges) {
    d.set(e.source, (d.get(e.source) ?? 0) + 1);
    d.set(e.target, (d.get(e.target) ?? 0) + 1);
  }
  return d;
}

/** Hidden nodes and groups. */
function applyHidden(
  nodes: GraphNode[],
  edges: GraphEdge[],
  hidden: HiddenItems
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  if (!hidden.nodes.length && !hidden.groups.length) {
    return { nodes, edges };
  }
  const ids = new Set(hidden.nodes);
  const groups = new Set(hidden.groups);
  const kept = nodes.filter((n) => !ids.has(n.id) && !(n.group && groups.has(n.group)));
  return { nodes: kept, edges: edgesAmong(edges, new Set(kept.map((n) => n.id))) };
}

/** Edges below the value threshold, then nodes that lost all their edges (explicit nodes stay). */
function applyMinValue(
  nodes: GraphNode[],
  edges: GraphEdge[],
  min: number
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const kept = edges.filter((e) => e.value === undefined || e.value >= min);
  if (kept.length === edges.length) {
    return { nodes, edges };
  }
  const connected = new Set<string>();
  for (const e of kept) {
    connected.add(e.source);
    connected.add(e.target);
  }
  const hadEdge = new Set<string>();
  for (const e of edges) {
    hadEdge.add(e.source);
    hadEdge.add(e.target);
  }
  // Nodes that were only there because of a dropped edge go; explicit nodes and nodes that never had edges stay.
  return { nodes: nodes.filter((n) => n.explicit || connected.has(n.id) || !hadEdge.has(n.id)), edges: kept };
}

/**
 * Nodes within `depth` hops (either direction) of the roots. Roots are the nodes without an incoming edge; when
 * every node has one (cycles), the root is the node with the most edges (first by id on ties), like the radial hub.
 */
function applyMaxDepth(
  nodes: GraphNode[],
  edges: GraphEdge[],
  depth: number
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  if (!nodes.length) {
    return { nodes, edges };
  }
  const incoming = new Set(edges.map((e) => e.target));
  let roots = nodes.filter((n) => !incoming.has(n.id)).map((n) => n.id);
  if (!roots.length) {
    const deg = degrees(nodes, edges);
    let hub = nodes[0];
    for (const n of nodes) {
      if ((deg.get(n.id) ?? 0) > (deg.get(hub.id) ?? 0)) {
        hub = n;
      }
    }
    roots = [hub.id];
  }
  const adjacent = new Map<string, string[]>();
  for (const e of edges) {
    (adjacent.get(e.source) ?? adjacent.set(e.source, []).get(e.source)!).push(e.target);
    (adjacent.get(e.target) ?? adjacent.set(e.target, []).get(e.target)!).push(e.source);
  }
  const dist = new Map<string, number>(roots.map((r) => [r, 0]));
  const queue = roots.slice();
  while (queue.length) {
    const id = queue.shift()!;
    const d = dist.get(id)!;
    if (d >= depth) {
      continue;
    }
    for (const next of adjacent.get(id) ?? []) {
      if (!dist.has(next)) {
        dist.set(next, d + 1);
        queue.push(next);
      }
    }
  }
  const kept = nodes.filter((n) => dist.has(n.id));
  return { nodes: kept, edges: edgesAmong(edges, new Set(kept.map((n) => n.id))) };
}

/** Nodes with exactly one edge, once. Skipped when fewer than two nodes would remain. */
function applyHideLeaves(nodes: GraphNode[], edges: GraphEdge[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const deg = degrees(nodes, edges);
  const kept = nodes.filter((n) => deg.get(n.id) !== 1);
  if (kept.length === nodes.length || kept.length < 2) {
    return { nodes, edges };
  }
  return { nodes: kept, edges: edgesAmong(edges, new Set(kept.map((n) => n.id))) };
}

const STATUS_RANK: Record<NodeStatus, number> = { none: 0, ok: 1, warn: 2, error: 3 };

const worse = (a: NodeStatus | undefined, b: NodeStatus | undefined): NodeStatus | undefined => {
  if (!a) {
    return b;
  }
  if (!b) {
    return a;
  }
  return STATUS_RANK[b] > STATUS_RANK[a] ? b : a;
};

/**
 * One node per group (id and label = group name), edges summed between groups, self-edges dropped. Ungrouped
 * nodes and their edges are untouched. The group node's value is the sum of the member values (when any has one)
 * and its status the worst member status.
 */
export function collapseGroups(
  nodes: GraphNode[],
  edges: GraphEdge[]
): { nodes: GraphNode[]; edges: GraphEdge[]; groups: number } {
  const groupOf = new Map<string, string>();
  const merged = new Map<string, GraphNode>();
  const out: GraphNode[] = [];
  for (const n of nodes) {
    if (!n.group) {
      out.push(n);
      continue;
    }
    groupOf.set(n.id, n.group);
    const prev = merged.get(n.group);
    if (!prev) {
      const node: GraphNode = { id: n.group, label: n.group, group: n.group, explicit: n.explicit };
      if (n.value !== undefined) {
        node.value = n.value;
        node.valueField = n.valueField;
      }
      if (n.status) {
        node.status = n.status;
      }
      merged.set(n.group, node);
      continue;
    }
    if (n.value !== undefined) {
      prev.value = (prev.value ?? 0) + n.value;
      prev.valueField = prev.valueField ?? n.valueField;
    }
    const status = worse(prev.status, n.status);
    if (status) {
      prev.status = status;
    }
    prev.explicit = prev.explicit || n.explicit;
  }
  if (!merged.size) {
    return { nodes, edges, groups: 0 };
  }
  const outEdges = new Map<string, GraphEdge>();
  for (const e of edges) {
    const source = groupOf.get(e.source) ?? e.source;
    const target = groupOf.get(e.target) ?? e.target;
    if (source === target && (groupOf.has(e.source) || groupOf.has(e.target))) {
      continue;
    }
    const id = edgeId(source, target);
    const prev = outEdges.get(id);
    if (!prev) {
      outEdges.set(id, {
        ...e,
        id,
        source,
        target,
        sourceGroup: groupOf.get(e.source) ?? e.sourceGroup,
        targetGroup: groupOf.get(e.target) ?? e.targetGroup,
      });
      continue;
    }
    if (e.value !== undefined) {
      prev.value = (prev.value ?? 0) + e.value;
      prev.valueField = prev.valueField ?? e.valueField;
    }
    if (e.value2 !== undefined) {
      prev.value2 = (prev.value2 ?? 0) + e.value2;
      prev.value2Field = prev.value2Field ?? e.value2Field;
    }
  }
  // A group named like an ungrouped node merges into it (same id); keep ids unique.
  const seen = new Set(out.map((n) => n.id));
  for (const g of merged.values()) {
    if (!seen.has(g.id)) {
      out.push(g);
    }
  }
  return { nodes: out.sort(byId), edges: Array.from(outEdges.values()), groups: merged.size };
}

/**
 * Apply the hidden list and the prune rules in a fixed order: hidden nodes and groups, min value, max depth, hide
 * leaves, collapse groups. Notices describing what went are appended to the graph's notices.
 */
export function pruneGraph(graph: Graph, rules: PruneRules | undefined, hidden: HiddenItems | undefined): PruneResult {
  const r = rules ?? DEFAULT_PRUNE;
  const h = hidden ?? EMPTY_HIDDEN;
  const notices = graph.notices.slice();
  let nodes = graph.nodes;
  let edges = graph.edges;
  const removed = { nodes: 0, edges: 0 };
  const step = (
    next: { nodes: GraphNode[]; edges: GraphEdge[] },
    notice: (nodes: number, edges: number) => string | undefined
  ) => {
    const dn = nodes.length - next.nodes.length;
    const de = edges.length - next.edges.length;
    removed.nodes += dn;
    removed.edges += de;
    nodes = next.nodes;
    edges = next.edges;
    if (dn > 0 || de > 0) {
      const text = notice(dn, de);
      if (text) {
        notices.push(text);
      }
    }
  };

  step(applyHidden(nodes, edges, h), (n) => (n > 0 ? `${plural(n, 'node')} hidden` : undefined));
  const min = r.minValue;
  if (min !== undefined && min !== null && Number.isFinite(min)) {
    step(applyMinValue(nodes, edges, min), (_n, e) => `${plural(e, 'edge')} below ${min}`);
  }
  const depth = r.maxDepth ?? 0;
  if (depth > 0) {
    step(applyMaxDepth(nodes, edges, depth), (n) => `${plural(n, 'node')} beyond depth ${depth}`);
  }
  if (r.hideLeaves) {
    step(applyHideLeaves(nodes, edges), (n) => (n === 1 ? '1 leaf hidden' : `${n} leaves hidden`));
  }
  if (r.collapseGroups) {
    const c = collapseGroups(nodes, edges);
    nodes = c.nodes;
    edges = c.edges;
    if (c.groups > 0) {
      notices.push(`${plural(c.groups, 'group')} collapsed`);
    }
  }
  return { graph: { ...graph, nodes, edges, notices }, removed };
}
