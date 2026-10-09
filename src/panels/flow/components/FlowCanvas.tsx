import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GrafanaTheme2 } from '@grafana/data';
import { Input } from '@grafana/ui';
import { applyBinding, formatValue, type FieldValue } from '../lib/data';
import { groupPalette } from '../lib/datadriven';
import { edgeGeometry, hitNode, nearestSide, portOffsets, snap, uniqueId, zoomAt } from '../lib/geometry';
import { groupSegments, type GroupHints } from '../lib/groups';
import {
  DEFAULT_EDGE,
  DEFAULT_NODE,
  type FlowDiagram,
  type FlowEdge,
  type FlowNode,
  type FlowOptions,
  type FlowSelection,
  type LinkTrigger,
  type Point,
  type ResolvedSide,
  type Viewport,
} from '../types';
import { Defs } from './Defs';
import { EdgeView, type ResolvedEdge } from './EdgeView';
import { NodeView } from './NodeView';
import { Particles } from './Particles';
import type { Tool } from './Toolbar';

export interface FlowCanvasProps {
  diagram: FlowDiagram;
  width: number;
  height: number;
  theme: GrafanaTheme2;
  options: FlowOptions;
  fields: Map<string, FieldValue>;
  editing: boolean;
  tool: Tool;
  selection?: FlowSelection;
  viewport: Viewport;
  animate: boolean;
  uid: string;
  /** Enter / leave opacities keyed by `node:<id>` / `edge:<id>` (data-driven diagrams) */
  opacity?: Map<string, number>;
  /** Draw a faint container around every node group */
  groupBoxes?: boolean;
  /** Ring index / ring centre per node from the auto layout; makes radial group boxes follow the arcs */
  groupHints?: GroupHints;
  /** View mode: Ctrl/⌘ + wheel (plain wheel in view-panel mode) zooms, drag pans, double-click on the canvas fits */
  zoomEnabled?: boolean;
  /** Link for a node (view mode only); undefined = no link */
  linkFor?: (node: FlowNode) => string | undefined;
  linkTrigger?: LinkTrigger;
  onOpenLink?: (href: string) => void;
  /** Runs on the link trigger before the link; returning true consumes the click (e.g. sets a variable). */
  onNodeAction?: (node: FlowNode) => boolean;
  onFit?: () => void;
  onViewport: (vp: Viewport) => void;
  onSelect: (sel?: FlowSelection) => void;
  /** Transient update while dragging (no undo entry) */
  onDraft: (d: FlowDiagram) => void;
  /** Final update (creates an undo entry) */
  onCommit: (d: FlowDiagram) => void;
  onTool: (t: Tool) => void;
}

type Drag =
  | { type: 'node'; id: string; start: Point; orig: Point; moved: boolean }
  | { type: 'pan'; start: Point; orig: Viewport }
  | { type: 'cp'; edgeId: string; index: 0 | 1 }
  | { type: 'endpoint'; edgeId: string; end: 'a' | 'b'; pos: Point }
  | { type: 'port'; fromId: string; side: ResolvedSide; pos: Point };

const STATUS_COLOR: Record<string, string> = { ok: 'green', warn: 'orange', error: 'red', none: 'text' };

const colorOf = (theme: GrafanaTheme2, c: string | undefined, fallback: string) => {
  const name = c && c.trim() ? c : fallback;
  if (name === 'text') {
    return theme.colors.text.secondary;
  }
  return theme.visualization.getColorByName(name);
};

const sanitizeId = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '');

export const FlowCanvas: React.FC<FlowCanvasProps> = (props) => {
  const {
    diagram,
    width,
    height,
    theme,
    options,
    fields,
    editing,
    tool,
    selection,
    viewport,
    animate,
    uid,
    opacity,
    groupBoxes,
    groupHints,
    zoomEnabled,
    linkFor,
    linkTrigger = 'off',
    onOpenLink,
    onNodeAction,
    onFit,
    onViewport,
    onSelect,
    onDraft,
    onCommit,
    onTool,
  } = props;
  const viewZoom = !editing && !!zoomEnabled;
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<Drag | undefined>(undefined);
  const draftRef = useRef<FlowDiagram>(diagram);
  useEffect(() => {
    draftRef.current = diagram;
  }, [diagram]);
  const spaceRef = useRef(false);
  const [preview, setPreview] = useState<{ from: Point; to: Point } | undefined>();
  const [pendingFrom, setPendingFrom] = useState<string | undefined>();
  const [renaming, setRenaming] = useState<{ id: string; value: string } | undefined>();

  const nodeMap = useMemo(() => new Map(diagram.nodes.map((n) => [n.id, n])), [diagram.nodes]);
  const offsets = useMemo(() => portOffsets(diagram.nodes, diagram.edges), [diagram.nodes, diagram.edges]);
  const edgeColorFallback = options.appearance.edgeColor || 'blue';

  const resolved = useMemo<ResolvedEdge[]>(() => {
    const out: ResolvedEdge[] = [];
    for (const edge of diagram.edges) {
      const from = nodeMap.get(edge.from);
      const to = nodeMap.get(edge.to);
      if (!from || !to) {
        continue;
      }
      const geo = edgeGeometry(edge, from, to, offsets);
      const bound = applyBinding(edge.bind, fields);
      const bound2 = applyBinding(edge.bind2, fields);
      const color = bound.color ?? bound2.color ?? colorOf(theme, edge.color, edgeColorFallback);
      const width = bound.width ?? bound2.width ?? edge.stroke;
      out.push({
        edge,
        geo,
        color,
        width,
        speed: bound.speed ?? bound2.speed ?? 1,
        reversed: bound.reversed || bound2.reversed,
        markerId: `${uid}-arrow-${sanitizeId(edge.id)}`,
      });
    }
    return out;
  }, [diagram.edges, nodeMap, offsets, fields, theme, edgeColorFallback, uid]);

  const markers = useMemo(() => resolved.filter((r) => r.edge.arrow).map((r) => ({ id: r.markerId!, color: r.color })), [resolved]);

  // Faint rounded containers per node group, one per layer segment so boxes never cover other groups' nodes.
  const fontSize = options.appearance.fontSize || 12;
  const groups = useMemo(() => {
    if (!groupBoxes) {
      return [];
    }
    const names = Array.from(new Set(diagram.nodes.map((n) => n.group).filter((g): g is string => !!g)));
    if (!names.length) {
      return [];
    }
    const colors = groupPalette(names, theme);
    const labelH = fontSize + 4;
    const nodeGap = options.data?.nodeGap ?? 24;
    const groupGap = options.data?.groupBoxes === false ? 0 : fontSize + 10;
    const pad = Math.min(14, Math.max(4, Math.floor((nodeGap + groupGap - labelH) / 2)));
    return groupSegments(diagram.nodes, options.data?.layout ?? 'lr', pad, labelH, groupHints).map((seg) => ({
      ...seg,
      color: colorOf(theme, colors.get(seg.group), 'blue'),
    }));
  }, [groupBoxes, groupHints, diagram.nodes, theme, fontSize, options.data?.nodeGap, options.data?.groupBoxes, options.data?.layout]);

  const nodeOpacity = (id: string) => opacity?.get(`node:${id}`);
  const edgeOpacity = (e: FlowEdge) => {
    const own = opacity?.get(`edge:${e.id}`);
    const ends = Math.min(nodeOpacity(e.from) ?? 1, nodeOpacity(e.to) ?? 1);
    return own === undefined ? ends : Math.min(own, ends);
  };

  const gridSize = Math.max(4, options.layout.gridSize || diagram.grid.size || 20);
  const snapOn = options.layout.snap && diagram.grid.snap;
  const toLocal = useCallback(
    (clientX: number, clientY: number): Point => {
      const rect = svgRef.current?.getBoundingClientRect();
      const x = clientX - (rect?.left ?? 0);
      const y = clientY - (rect?.top ?? 0);
      return { x: (x - viewport.x) / viewport.zoom, y: (y - viewport.y) / viewport.zoom };
    },
    [viewport]
  );

  // ---- keyboard: space for panning -------------------------------------------------------------
  useEffect(() => {
    if (!editing) {
      return;
    }
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement)) {
        spaceRef.current = true;
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceRef.current = false;
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [editing]);

  // ---- wheel zoom (native listener so preventDefault works) ------------------------------------
  const viewportRef = useRef(viewport);
  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);
  useEffect(() => {
    const el = svgRef.current;
    if (!el || (!editing && !viewZoom)) {
      return;
    }
    const onWheel = (e: WheelEvent) => {
      if (!editing) {
        // View mode: plain wheel keeps scrolling the dashboard; Ctrl/⌘ + wheel (also trackpad pinch) zooms,
        // and so does the plain wheel when the panel is viewed on its own (view panel / fullscreen).
        const alone = /[?&]viewPanel=/.test(window.location.search);
        if (!(e.ctrlKey || e.metaKey || alone)) {
          return;
        }
      }
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      // Pinch gestures arrive as Ctrl + wheel with small deltas; scale them up a bit.
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.004 : 0.0015));
      onViewport(zoomAt(viewportRef.current, e.clientX - rect.left, e.clientY - rect.top, factor));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [editing, viewZoom, onViewport]);

  // ---- helpers ------------------------------------------------------------------------------------
  const capture = (e: React.PointerEvent) => {
    try {
      svgRef.current?.setPointerCapture(e.pointerId);
    } catch {
      // jsdom and some browsers throw when capture is unavailable; dragging still works via bubbling.
    }
  };

  const updateDraft = (fn: (d: FlowDiagram) => FlowDiagram) => {
    const next = fn(draftRef.current);
    draftRef.current = next;
    onDraft(next);
  };

  const createEdge = (fromId: string, toId: string, fromSide: ResolvedSide | 'auto', toSide: ResolvedSide | 'auto') => {
    if (fromId === toId) {
      return;
    }
    const d = draftRef.current;
    const id = uniqueId('edge', new Set(d.edges.map((e) => e.id)));
    const edge: FlowEdge = {
      ...DEFAULT_EDGE,
      particles: { ...DEFAULT_EDGE.particles },
      id,
      from: fromId,
      to: toId,
      fromSide,
      toSide,
      color: '',
    };
    onCommit({ ...d, edges: [...d.edges, edge] });
    onSelect({ kind: 'edge', id });
  };

  const addNodeAt = (p: Point) => {
    const d = draftRef.current;
    const id = uniqueId('node', new Set(d.nodes.map((n) => n.id)));
    const node: FlowNode = {
      ...DEFAULT_NODE,
      id,
      label: `Node ${d.nodes.length + 1}`,
      x: snap(p.x - DEFAULT_NODE.w / 2, gridSize, snapOn),
      y: snap(p.y - DEFAULT_NODE.h / 2, gridSize, snapOn),
    };
    onCommit({ ...d, nodes: [...d.nodes, node] });
    onSelect({ kind: 'node', id });
    onTool('select');
  };

  // ---- pointer handlers --------------------------------------------------------------------------
  const onBackgroundDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!editing) {
      if (viewZoom && (e.button === 0 || e.button === 1)) {
        dragRef.current = { type: 'pan', start: { x: e.clientX, y: e.clientY }, orig: viewport };
        capture(e);
      }
      return;
    }
    if (e.button === 1 || spaceRef.current || (e.button === 0 && e.altKey)) {
      e.preventDefault();
      dragRef.current = { type: 'pan', start: { x: e.clientX, y: e.clientY }, orig: viewport };
      capture(e);
      return;
    }
    if (e.button !== 0) {
      return;
    }
    if (tool === 'addNode') {
      addNodeAt(toLocal(e.clientX, e.clientY));
      return;
    }
    setPendingFrom(undefined);
    onSelect(undefined);
  };

  const onNodeDown = (e: React.PointerEvent<SVGGElement>, node: FlowNode) => {
    if (!editing) {
      e.stopPropagation();
      return;
    }
    e.stopPropagation();
    if (e.button === 1 || spaceRef.current) {
      dragRef.current = { type: 'pan', start: { x: e.clientX, y: e.clientY }, orig: viewport };
      capture(e);
      return;
    }
    if (e.button !== 0) {
      return;
    }
    if (tool === 'addEdge') {
      if (!pendingFrom) {
        setPendingFrom(node.id);
        onSelect({ kind: 'node', id: node.id });
      } else {
        createEdge(pendingFrom, node.id, 'auto', 'auto');
        setPendingFrom(undefined);
        onTool('select');
      }
      return;
    }
    if (tool === 'addNode') {
      return;
    }
    onSelect({ kind: 'node', id: node.id });
    dragRef.current = { type: 'node', id: node.id, start: toLocal(e.clientX, e.clientY), orig: { x: node.x, y: node.y }, moved: false };
    capture(e);
  };

  const onPortDown = (e: React.PointerEvent<SVGCircleElement>, node: FlowNode, side: ResolvedSide) => {
    if (!editing || e.button !== 0) {
      return;
    }
    const p = toLocal(e.clientX, e.clientY);
    dragRef.current = { type: 'port', fromId: node.id, side, pos: p };
    setPreview({ from: p, to: p });
    capture(e);
  };

  const onEdgeDown = (e: React.PointerEvent<SVGPathElement>, edge: FlowEdge) => {
    if (!editing || e.button !== 0) {
      return;
    }
    e.stopPropagation();
    onSelect({ kind: 'edge', id: edge.id });
  };

  const onControlDown = (e: React.PointerEvent<SVGCircleElement>, edgeId: string, index: 0 | 1) => {
    e.stopPropagation();
    dragRef.current = { type: 'cp', edgeId, index };
    capture(e);
  };

  const onEndpointDown = (e: React.PointerEvent<SVGRectElement>, edgeId: string, end: 'a' | 'b') => {
    e.stopPropagation();
    const p = toLocal(e.clientX, e.clientY);
    dragRef.current = { type: 'endpoint', edgeId, end, pos: p };
    capture(e);
  };

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) {
      return;
    }
    const p = toLocal(e.clientX, e.clientY);
    switch (drag.type) {
      case 'pan': {
        onViewport({ ...drag.orig, x: drag.orig.x + (e.clientX - drag.start.x), y: drag.orig.y + (e.clientY - drag.start.y) });
        return;
      }
      case 'node': {
        const nx = snap(drag.orig.x + (p.x - drag.start.x), gridSize, snapOn);
        const ny = snap(drag.orig.y + (p.y - drag.start.y), gridSize, snapOn);
        drag.moved = drag.moved || nx !== drag.orig.x || ny !== drag.orig.y;
        updateDraft((d) => ({ ...d, nodes: d.nodes.map((n) => (n.id === drag.id ? { ...n, x: nx, y: ny } : n)) }));
        return;
      }
      case 'cp': {
        const item = resolved.find((r) => r.edge.id === drag.edgeId);
        if (!item || !item.geo.c1 || !item.geo.c2) {
          return;
        }
        const cps: [Point, Point] = [item.geo.c1, item.geo.c2];
        cps[drag.index] = p;
        const rel: FlowEdge['controlPoints'] = [
          { dx: Math.round(cps[0].x - item.geo.a.x), dy: Math.round(cps[0].y - item.geo.a.y) },
          { dx: Math.round(cps[1].x - item.geo.b.x), dy: Math.round(cps[1].y - item.geo.b.y) },
        ];
        updateDraft((d) => ({ ...d, edges: d.edges.map((ed) => (ed.id === drag.edgeId ? { ...ed, controlPoints: rel } : ed)) }));
        return;
      }
      case 'port': {
        drag.pos = p;
        setPreview((pv) => (pv ? { ...pv, to: p } : pv));
        return;
      }
      case 'endpoint': {
        drag.pos = p;
        const item = resolved.find((r) => r.edge.id === drag.edgeId);
        if (item) {
          setPreview(drag.end === 'a' ? { from: p, to: item.geo.b } : { from: item.geo.a, to: p });
        }
        return;
      }
    }
  };

  const onUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    dragRef.current = undefined;
    setPreview(undefined);
    if (!drag) {
      return;
    }
    try {
      svgRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    switch (drag.type) {
      case 'node':
        if (drag.moved) {
          onCommit(draftRef.current);
        }
        return;
      case 'cp':
        onCommit(draftRef.current);
        return;
      case 'port': {
        const target = hitNode(draftRef.current.nodes, drag.pos);
        if (target && target.id !== drag.fromId) {
          createEdge(drag.fromId, target.id, drag.side, nearestSide(target, drag.pos));
        }
        return;
      }
      case 'endpoint': {
        const target = hitNode(draftRef.current.nodes, drag.pos);
        if (!target) {
          return;
        }
        const side = nearestSide(target, drag.pos);
        const d = draftRef.current;
        const next = d.edges.map((ed) => {
          if (ed.id !== drag.edgeId) {
            return ed;
          }
          const patch = drag.end === 'a' ? { from: target.id, fromSide: side } : { to: target.id, toSide: side };
          const other = drag.end === 'a' ? ed.to : ed.from;
          if (other === target.id) {
            return ed;
          }
          return { ...ed, ...patch, controlPoints: undefined };
        });
        onCommit({ ...d, edges: next });
        return;
      }
      case 'pan':
        return;
    }
  };

  const hrefOf = (node: FlowNode) => (!editing && linkTrigger !== 'off' && linkFor ? linkFor(node) : undefined);

  const onNodeDoubleClick = (node: FlowNode) => {
    if (editing) {
      setRenaming({ id: node.id, value: node.label });
      return;
    }
    if (linkTrigger === 'dblclick') {
      if (onNodeAction?.(node)) {
        return;
      }
      const href = hrefOf(node);
      if (href) {
        onOpenLink?.(href);
      }
    }
  };

  const onNodeClick = (node: FlowNode) => {
    if (!editing && linkTrigger === 'click') {
      if (onNodeAction?.(node)) {
        return;
      }
      const href = hrefOf(node);
      if (href) {
        onOpenLink?.(href);
      }
    }
  };

  const onCanvasDoubleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!viewZoom || !onFit) {
      return;
    }
    const target = e.target as Element;
    if (target.closest?.('[data-testid^="flow-node-"]') || target.closest?.('[data-testid^="flow-edge-"]')) {
      return;
    }
    onFit();
  };

  const finishRename = (commit: boolean) => {
    if (!renaming) {
      return;
    }
    if (commit) {
      const label = renaming.value.replace(/[<>]/g, '').trim();
      if (label) {
        onCommit({ ...draftRef.current, nodes: draftRef.current.nodes.map((n) => (n.id === renaming.id ? { ...n, label } : n)) });
      }
    }
    setRenaming(undefined);
  };

  // ---- rendering ----------------------------------------------------------------------------------
  const bg = options.appearance.background;
  const showGrid = (bg === 'dots' || bg === 'lines' || editing) && diagram.grid.show;
  const gridId = `${uid}-grid`;
  const bgFill = bg === 'transparent' ? 'none' : theme.isDark ? '#111217' : theme.colors.background.canvas;
  const gridStroke = theme.isDark ? '#2a2f36' : theme.colors.border.weak;
  const selectedEdge = selection?.kind === 'edge' ? resolved.find((r) => r.edge.id === selection.id) : undefined;
  const renamingNode = renaming ? nodeMap.get(renaming.id) : undefined;
  const fontFamily = theme.typography.fontFamily;
  const minimal = options.appearance.nodeStyle === 'minimal';
  const cursor = editing ? (tool === 'addNode' ? 'copy' : tool === 'addEdge' ? 'crosshair' : undefined) : viewZoom ? 'grab' : undefined;

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block', fontFamily, cursor, touchAction: editing || viewZoom ? 'none' : undefined, background: bg === 'transparent' ? 'transparent' : undefined }}
      onPointerDown={onBackgroundDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onDoubleClick={onCanvasDoubleClick}
      data-testid="flow-canvas"
    >
      <Defs uid={uid} markers={markers} />
      {showGrid && (
        <pattern
          id={gridId}
          width={gridSize}
          height={gridSize}
          patternUnits="userSpaceOnUse"
          patternTransform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.zoom})`}
        >
          {bg === 'lines' ? (
            <path d={`M${gridSize} 0 H0 V${gridSize}`} fill="none" stroke={gridStroke} strokeWidth={0.6} />
          ) : (
            <circle cx={gridSize / 2} cy={gridSize / 2} r={1} fill={gridStroke} />
          )}
        </pattern>
      )}
      {bgFill !== 'none' && <rect width={width} height={height} fill={bgFill} />}
      {showGrid && <rect width={width} height={height} fill={`url(#${gridId})`} />}
      <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.zoom})`}>
        {groups.length > 0 && (
          <g data-testid="flow-groups" style={{ pointerEvents: 'none' }}>
            {groups.map((g, i) => (
              <g key={`${g.group}:${i}`} data-testid={`flow-group-${g.group}`}>
                <rect x={g.x} y={g.y} width={g.w} height={g.h} rx={12} fill={g.color} opacity={0.07} />
                <rect x={g.x} y={g.y} width={g.w} height={g.h} rx={12} fill="none" stroke={g.color} opacity={0.35} strokeDasharray="4 3" />
                {g.first && (
                  <text x={g.x + 10} y={g.y + fontSize + 2} fill={g.color} fontSize={fontSize - 1} fontWeight={600} opacity={0.9} style={{ userSelect: 'none' }}>
                    {g.group}
                  </text>
                )}
              </g>
            ))}
          </g>
        )}
        <g>
          {resolved.map((item) => (
            <EdgeView
              key={item.edge.id}
              item={item}
              theme={theme}
              uid={uid}
              selected={selection?.kind === 'edge' && selection.id === item.edge.id}
              editing={editing}
              opacity={edgeOpacity(item.edge)}
              fontSize={Math.max(8, fontSize - 2)}
              onPointerDown={onEdgeDown}
            />
          ))}
        </g>
        <Particles edges={resolved} uid={uid} speed={options.animation.speed * options.appearance.particleSpeed} animate={animate} highlight={theme.isDark ? '#ffffff' : theme.colors.text.primary} />
        <g>
          {diagram.nodes.map((n) => {
            const fv = n.valueField ? fields.get(n.valueField) : undefined;
            const value = formatValue(fv, n.valueFormat);
            const accent = colorOf(theme, n.color, STATUS_COLOR[n.status ?? 'none']);
            const isSel = selection?.kind === 'node' && selection.id === n.id;
            return (
              <NodeView
                key={n.id}
                node={n}
                theme={theme}
                uid={uid}
                nodeStyle={minimal ? 'minimal' : 'cards'}
                fontSize={fontSize}
                imageSize={options.appearance.imageSize}
                value={value}
                accent={accent}
                selected={isSel || pendingFrom === n.id}
                editing={editing}
                opacity={nodeOpacity(n.id)}
                linked={!!hrefOf(n)}
                onClick={onNodeClick}
                onPointerDown={onNodeDown}
                onDoubleClick={onNodeDoubleClick}
                onPortPointerDown={onPortDown}
              />
            );
          })}
        </g>
        {editing && selectedEdge && (
          <g data-testid="flow-edge-handles">
            {selectedEdge.geo.c1 && selectedEdge.geo.c2 && (
              <>
                {[
                  [selectedEdge.geo.a, selectedEdge.geo.c1, 0],
                  [selectedEdge.geo.b, selectedEdge.geo.c2, 1],
                ].map(([anchor, cp, idx]) => {
                  const a = anchor as Point;
                  const c = cp as Point;
                  const i = idx as 0 | 1;
                  return (
                    <React.Fragment key={i}>
                      <line x1={a.x} y1={a.y} x2={c.x} y2={c.y} stroke={theme.colors.text.primary} strokeWidth={1} opacity={0.5} strokeDasharray="2 2" />
                      <circle
                        cx={c.x}
                        cy={c.y}
                        r={5}
                        fill={theme.colors.background.primary}
                        stroke={theme.colors.text.primary}
                        strokeWidth={1.5}
                        style={{ cursor: 'move' }}
                        data-testid={`flow-cp-${i}`}
                        onPointerDown={(e) => onControlDown(e, selectedEdge.edge.id, i)}
                      />
                    </React.Fragment>
                  );
                })}
              </>
            )}
            {(['a', 'b'] as const).map((end) => {
              const p = selectedEdge.geo[end];
              return (
                <rect
                  key={end}
                  x={p.x - 4}
                  y={p.y - 4}
                  width={8}
                  height={8}
                  fill={theme.colors.text.primary}
                  stroke={selectedEdge.color}
                  strokeWidth={1.5}
                  style={{ cursor: 'grab' }}
                  data-testid={`flow-endpoint-${end}`}
                  onPointerDown={(e) => onEndpointDown(e, selectedEdge.edge.id, end)}
                />
              );
            })}
          </g>
        )}
        {preview && (
          <line x1={preview.from.x} y1={preview.from.y} x2={preview.to.x} y2={preview.to.y} stroke={theme.colors.primary.main} strokeWidth={1.5} strokeDasharray="4 4" style={{ pointerEvents: 'none' }} />
        )}
        {renamingNode && (
          <foreignObject x={renamingNode.x} y={renamingNode.y + renamingNode.h + 4} width={Math.max(160, renamingNode.w)} height={36}>
            <div onPointerDown={(e) => e.stopPropagation()}>
              <Input
                autoFocus
                value={renaming?.value ?? ''}
                aria-label="Node label"
                onChange={(e) => setRenaming((r) => (r ? { ...r, value: e.currentTarget.value } : r))}
                onBlur={() => finishRename(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    finishRename(true);
                  } else if (e.key === 'Escape') {
                    finishRename(false);
                  }
                  e.stopPropagation();
                }}
              />
            </div>
          </foreignObject>
        )}
      </g>
    </svg>
  );
};

