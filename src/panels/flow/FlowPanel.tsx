import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { css } from '@emotion/css';
import type { DataFrame, GrafanaTheme2, PanelProps } from '@grafana/data';
import { locationService } from '@grafana/runtime';
import { Button, usePanelContext, useStyles2, useTheme2 } from '@grafana/ui';
import { DemoBadge, edgeTable, useDemoFrames, type DemoGenerator } from '../../shared/demo';
import { useMotionAllowed } from '../../shared/motion';
import { EMPTY_HIDDEN, pruneGraph, type HiddenItems, type PruneRules } from '../../shared/graph/prune';
import { DEFAULT_FOCUS, focusGraph, focusIds, type FocusOptions } from '../../shared/graph/focus';
import { useQuickStart } from '../../shared/presets';
import { ReducedMotionHint } from '../../shared/ReducedMotionHint';
import { FlowCanvas, type PruneChange } from './components/FlowCanvas';
import { Toolbar, type Tool } from './components/Toolbar';
import { FLOW_PRESETS } from './presets';
import { ZoomControls } from './components/ZoomControls';
import { formatValue, indexFields } from './lib/data';
import { buildDataDiagram, mergeOverrides, nodeSize, overridesFromMove, shortLabel } from './lib/datadriven';
import { createExampleDiagram } from './lib/example';
import { extractGraph } from './lib/frames';
import { fitViewport, MAX_ZOOM, zoomAt } from './lib/geometry';
import { budgetParticles, DEFAULT_PARTICLE_LIMIT, particlesVisible } from './lib/particles';

const ZOOM_HINT_VIEW = 'Ctrl + scroll (⌘ on Mac) or pinch to zoom at the pointer · drag to pan · double-click a node to zoom onto it, empty canvas to fit';
const ZOOM_HINT_EDIT = 'Scroll to zoom at the pointer · Space, middle mouse or Alt + drag to pan';
import { currentVariable, openLink, resolveNodeLink, resolveNodeVariable, variableName, variableQuery } from './lib/links';
import { Chip, ChipRow } from './components/Chip';
import { VariableChip } from './components/VariableChip';
import type { GroupHints } from './lib/groups';
import { layoutGraph, nodeSetKey, type LayoutOptions, type LayoutResult } from './lib/layout';
import { diffFade, emptyFade, fadeFrame, type FadeState } from './lib/transitions';
import { emptyUndo, pushUndo, redo, undo, type UndoState } from './lib/undo';
import { normalizeDiagram } from './lib/validate';
import {
  DEFAULT_DATA_OPTIONS,
  DEFAULT_INTERACTION,
  DEFAULT_LINKS,
  type DataOptions,
  type DiagramSource,
  type FlowDiagram,
  type FlowNode,
  type FlowOptions,
  type FlowSelection,
  type Point,
  type Viewport,
} from './types';

/** Demo data: one edge table (12-node service graph, `source`/`target`/`value`), built through the data pipeline. */
const demoGenerator: DemoGenerator = () => [edgeTable()];

export const FLOW_NO_DATA_MESSAGE = 'Needs edge rows with source, target and value, or draw a diagram';
export const FLOW_DEMO_HINT = 'Showing a generated graph. Load the example, draw your own, or set Diagram source to Data.';

/** Design-mode chrome: floating toolbar + badge at the top, status chip at the bottom. */
const CHROME_TOP = 44;
const CHROME_BOTTOM = 28;

/** Fit the nodes into the area not covered by the design-mode toolbar and chips. */
function fitBelowChrome(nodes: FlowDiagram['nodes'], width: number, height: number): Viewport {
  const vp = fitViewport(nodes, width, Math.max(1, height - CHROME_TOP - CHROME_BOTTOM));
  return { ...vp, y: vp.y + CHROME_TOP };
}

const getStyles = (theme: GrafanaTheme2) => ({
  wrap: css({
    position: 'relative',
    overflow: 'hidden',
    outline: 'none',
    borderRadius: theme.shape.radius.default,
  }),
  chip: css({
    position: 'absolute',
    left: 8,
    bottom: 6,
    fontSize: 11,
    color: theme.colors.text.secondary,
    background: theme.colors.background.elevated,
    border: `1px solid ${theme.colors.border.medium}`,
    borderRadius: theme.shape.radius.default,
    padding: '1px 7px',
    pointerEvents: 'none',
  }),
  notice: css({
    position: 'absolute',
    left: 8,
    bottom: 6,
    fontSize: 11,
    color: theme.colors.warning.text,
    background: theme.colors.background.elevated,
    border: `1px solid ${theme.colors.warning.border}`,
    borderRadius: theme.shape.radius.default,
    padding: '1px 7px',
    pointerEvents: 'none',
  }),
  mode: css({
    position: 'absolute',
    right: 8,
    top: 8,
    fontSize: 10,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: theme.colors.primary.text,
    background: theme.colors.primary.transparent,
    border: `1px solid ${theme.colors.primary.border}`,
    borderRadius: theme.shape.radius.default,
    padding: '1px 6px',
    pointerEvents: 'none',
  }),
  badgeWrap: css({
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
  }),
  demoHint: css({
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 6,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing(1),
    fontSize: 11,
    color: theme.colors.text.secondary,
    textAlign: 'center',
    padding: theme.spacing(0, 1),
    pointerEvents: 'none',
    '& > *': { pointerEvents: 'auto' },
  }),
  empty: css({
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing(1),
    color: theme.colors.text.secondary,
    textAlign: 'center',
    padding: theme.spacing(2),
    pointerEvents: 'none',
    '& > *': { pointerEvents: 'auto' },
  }),
});

export const FlowPanel: React.FC<PanelProps<FlowOptions>> = ({
  options,
  onOptionsChange,
  onFieldConfigChange,
  data,
  width,
  height,
  replaceVariables,
  fieldConfig,
  timeZone,
  timeRange,
}) => {
  const theme = useTheme2();
  useQuickStart(FLOW_PRESETS, { options, fieldConfig, onOptionsChange, onFieldConfigChange });
  const styles = useStyles2(getStyles);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const panelContext = usePanelContext();
  const editing = !!options.layout?.editMode;
  const dataOpts: DataOptions = useMemo(() => ({ ...DEFAULT_DATA_OPTIONS, ...(options.data ?? {}) }), [options.data]);
  /** The source the user chose; `dataMode` below may differ when the demo graph stands in for an empty manual diagram. */
  const chosenMode: DiagramSource = dataOpts.source;
  const fontSize = options.appearance?.fontSize || 12;
  const animationEnabled = options.animation?.enabled !== false;
  const animate = useMotionAllowed(animationEnabled, options.animation?.reducedMotion);

  const stored = options.diagram;
  const manualDiagram = useMemo(() => normalizeDiagram(stored), [stored]);
  const manualEmpty = manualDiagram.nodes.length === 0;

  // ---- demo data --------------------------------------------------------------------------------
  // Data modes: the generated edge table replaces the query result when it yields no edges (or always).
  // Manual mode: only while the diagram is empty and not being designed, so a fresh panel shows a living
  // graph instead of a blank canvas; a drawn diagram never gets generated values.
  const demoEligible = chosenMode !== 'manual' || (manualEmpty && !editing);
  const hasEdges = useCallback((series: DataFrame[]) => extractGraph(series, dataOpts).edges.length > 0, [dataOpts]);
  const { frames, isDemo } = useDemoFrames(data, demoEligible ? options.demoData : 'off', demoGenerator, {
    fieldConfig,
    replaceVariables,
    theme,
    timeZone,
    timeRange,
    isUsable: hasEdges,
  });
  /** Manual mode showing the generated graph through the data pipeline. */
  const demoFallback = chosenMode === 'manual' && isDemo;
  const dataMode: DiagramSource = demoFallback ? 'data' : chosenMode;
  const isData = dataMode !== 'manual';
  const [draft, setDraft] = useState<FlowDiagram | undefined>();
  const [history, setHistory] = useState<UndoState<FlowDiagram>>(emptyUndo);
  const [tool, setTool] = useState<Tool>('select');
  const [rawSelection, setSelectionState] = useState<FlowSelection | undefined>();
  const [viewport, setViewportState] = useState<Viewport>(manualDiagram.viewport);

  // Track the committed diagram so we can tell our own option changes (already in history) from external ones
  // (inspector, JSON editor, dashboard reload) which get an undo entry of their own.
  const json = useMemo(() => JSON.stringify(manualDiagram), [manualDiagram]);
  const [emitted, setEmitted] = useState(json);
  const [tracked, setTracked] = useState({ json, diagram: manualDiagram });
  if (tracked.json !== json) {
    if (json !== emitted) {
      const prev = tracked.diagram;
      setHistory((h) => pushUndo(h, prev));
      setEmitted(json);
    }
    setTracked({ json, diagram: manualDiagram });
    setDraft(undefined);
  }

  // ---- data-driven diagram -------------------------------------------------------------------------
  // The generated edge table always has `source` / `target` / `value` columns, whatever the field options say.
  const extractOpts = useMemo(
    () => (isDemo ? { ...dataOpts, sourceField: 'source', targetField: 'target', valueField: 'value', value2Field: '' } : dataOpts),
    [isDemo, dataOpts]
  );
  const rawGraph = useMemo(() => (isData ? extractGraph(frames, extractOpts) : undefined), [isData, frames, extractOpts]);
  // Hidden list and prune rules (data modes only) sit between extraction and layout.
  const pruneRules = useMemo<PruneRules>(() => dataOpts.prune ?? {}, [dataOpts.prune]);
  const hidden = useMemo<HiddenItems>(() => dataOpts.hidden ?? EMPTY_HIDDEN, [dataOpts.hidden]);
  const hiddenCount = hidden.nodes.length + hidden.groups.length;
  const prunedGraph = useMemo(() => (rawGraph ? pruneGraph(rawGraph, pruneRules, hidden).graph : undefined), [rawGraph, pruneRules, hidden]);
  // Focus (session only): a stack of node ids; the last one is shown with its chain. Crumbs whose node left the
  // graph are dropped. Design mode never focuses.
  const focusOpts = useMemo<FocusOptions>(
    () => ({ hops: Math.max(0, options.interaction?.focusHops ?? DEFAULT_FOCUS.hops), direction: options.interaction?.focusDirection ?? DEFAULT_FOCUS.direction }),
    [options.interaction?.focusHops, options.interaction?.focusDirection]
  );
  const [focusStack, setFocusStack] = useState<string[]>([]);
  const focusCandidates = isData ? prunedGraph?.nodes : manualDiagram.nodes;
  const focusStackLive = useMemo(() => {
    if (editing || !focusStack.length || !focusCandidates) {
      return [];
    }
    const ids = new Set(focusCandidates.map((n) => n.id));
    return focusStack.filter((id) => ids.has(id));
  }, [editing, focusStack, focusCandidates]);
  const focusId = focusStackLive.length ? focusStackLive[focusStackLive.length - 1] : undefined;
  const graph = useMemo(() => (prunedGraph && focusId ? focusGraph(prunedGraph, focusId, focusOpts) : prunedGraph), [prunedGraph, focusId, focusOpts]);
  // Aspect is quantised so small resizes do not trigger a re-layout.
  const aspect = width > 0 && height > 0 ? Math.round((width / height) * 4) / 4 : undefined;
  const layoutOpts = useMemo<LayoutOptions>(
    () => ({
      direction: dataOpts.layout,
      layerGap: Math.max(20, dataOpts.layerGap),
      nodeGap: Math.max(4, dataOpts.nodeGap),
      // Room between groups in a layer for the group boxes and their label.
      groupGap: dataOpts.groupBoxes ? fontSize + 10 : 0,
      aspect,
      spread: Math.min(100, Math.max(0, dataOpts.spread ?? 100)) / 100,
      wrap: Math.max(0, dataOpts.wrap ?? 0),
      // Wrap layers after = 0 means automatic folding.
      autoWrap: !(dataOpts.wrap > 0),
    }),
    [dataOpts.layout, dataOpts.layerGap, dataOpts.nodeGap, dataOpts.spread, dataOpts.wrap, dataOpts.groupBoxes, fontSize, aspect]
  );
  // Positions are only recomputed when the node set (or the layout options) change, so refreshes do not reshuffle.
  const layoutKey = graph ? nodeSetKey(graph.nodes, layoutOpts) : '';
  const fresh = useMemo<LayoutResult>(() => {
    if (!graph) {
      return { positions: new Map<string, Point>(), ranks: new Map() };
    }
    const sized = graph.nodes.map((n) => ({ id: n.id, group: n.group, ...nodeSize(shortLabel(n.label ?? n.id), fontSize, n.value !== undefined) }));
    return layoutGraph(sized, graph.edges, layoutOpts);
  }, [graph, layoutOpts, fontSize]);
  const [layoutCache, setLayoutCache] = useState<{ key: string; layout: LayoutResult }>({ key: '', layout: { positions: new Map(), ranks: new Map() } });
  let layout = layoutCache.layout;
  if (layoutCache.key !== layoutKey) {
    layout = fresh;
    setLayoutCache({ key: layoutKey, layout: fresh });
  }
  const positions = layout.positions;
  // Ring index and ring centre per node let the group boxes follow the arcs of a radial layout.
  const groupHints = useMemo<GroupHints>(() => ({ ranks: layout.ranks, centres: layout.centres }), [layout]);
  const built = useMemo(() => (graph ? buildDataDiagram(graph, positions, dataOpts, theme, fontSize) : undefined), [graph, positions, dataOpts, theme, fontSize]);
  const derived = useMemo(() => {
    if (!built) {
      return undefined;
    }
    return dataMode === 'overrides' ? mergeOverrides(built.diagram, dataOpts.overrides) : built.diagram;
  }, [built, dataMode, dataOpts.overrides]);

  // Enter / leave tweens for data nodes and edges. `clock` is an animation time that only advances (by the
  // measured frame delta) while something is tweening, so render stays pure and nothing jumps after idle time.
  const [clock, setClock] = useState(0);
  const [fade, setFade] = useState<FadeState | undefined>(undefined);
  const [prevDerived, setPrevDerived] = useState(derived);
  if (prevDerived !== derived) {
    setPrevDerived(derived);
    setFade(derived ? (fade && animate ? diffFade(fadeFrame(fade, clock).state, derived, clock) : emptyFade(derived)) : undefined);
  }
  const frame = useMemo(() => (fade ? fadeFrame(fade, clock) : undefined), [fade, clock]);
  const fading = !!frame?.active;
  useEffect(() => {
    if (!fading) {
      return;
    }
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(100, Math.max(0, now - last));
      last = now;
      setClock((c) => c + dt);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [fading]);

  // Manual diagrams keep their positions under focus; only the chain's nodes and edges are drawn.
  const manualShown = useMemo<FlowDiagram>(() => {
    if (isData || !focusId) {
      return manualDiagram;
    }
    const keep = focusIds(
      manualDiagram.edges.map((e) => ({ source: e.from, target: e.to })),
      focusId,
      focusOpts
    );
    return { ...manualDiagram, nodes: manualDiagram.nodes.filter((n) => keep.has(n.id)), edges: manualDiagram.edges.filter((e) => keep.has(e.from) && keep.has(e.to)) };
  }, [isData, manualDiagram, focusId, focusOpts]);
  const diagram = isData ? (frame?.diagram ?? derived ?? manualShown) : manualShown;
  const fadeOpacity = isData ? frame?.opacity : undefined;

  // Data modes never use the saved manual viewport: the view is fitted (and follows resizes and node-set
  // changes) until the user pans or zooms in this session.
  const [userViewport, setUserViewport] = useState(false);
  const [prevIsData, setPrevIsData] = useState(isData);
  if (prevIsData !== isData) {
    setPrevIsData(isData);
    setUserViewport(false);
    setFocusStack([]);
  }
  // Entering or leaving a focus goes back to the fitted view of what is now shown.
  const [prevFocusId, setPrevFocusId] = useState(focusId);
  if (prevFocusId !== focusId) {
    setPrevFocusId(focusId);
    setUserViewport(false);
  }
  const focusOn = useCallback((id: string) => setFocusStack((s) => (s[s.length - 1] === id ? s : [...s, id])), []);
  const focusBack = useCallback(() => setFocusStack((s) => s.slice(0, -1)), []);
  const focusClear = useCallback(() => setFocusStack([]), []);
  const onFocusNode = useCallback((node: FlowNode) => focusOn(node.id), [focusOn]);
  // A big size change (leaving "view panel", a window resize, a re-arranged dashboard) drops a session zoom
  // and goes back to the fitted view: a viewport zoomed for a full-screen panel is useless in a small one.
  const lastSize = useRef({ width, height });
  useEffect(() => {
    const prev = lastSize.current;
    lastSize.current = { width, height };
    if (editing || !userViewport) {
      return;
    }
    if (Math.abs(width - prev.width) > prev.width * 0.2 || Math.abs(height - prev.height) > prev.height * 0.2) {
      setUserViewport(false);
    }
  }, [width, height, editing, userViewport]);

  const emit = useCallback(
    (next: FlowDiagram) => {
      setEmitted(JSON.stringify(next));
      onOptionsChange({ ...options, diagram: next });
    },
    [options, onOptionsChange]
  );

  const commitManual = useCallback(
    (next: FlowDiagram) => {
      setDraft(undefined);
      setHistory((h) => pushUndo(h, manualDiagram));
      emit({ ...next, viewport });
    },
    [emit, viewport, manualDiagram]
  );

  const commit = useCallback(
    (next: FlowDiagram) => {
      if (isData) {
        setDraft(undefined);
        // Data-driven: only node moves are kept, and only as overrides (when enabled).
        if (dataMode === 'overrides' && derived) {
          onOptionsChange({ ...options, data: { ...dataOpts, overrides: overridesFromMove(dataOpts.overrides, derived, next) } });
        }
        return;
      }
      commitManual(next);
    },
    [commitManual, isData, dataMode, derived, onOptionsChange, options, dataOpts]
  );

  const doUndo = useCallback(() => {
    const res = isData ? undefined : undo(history, manualDiagram);
    if (res) {
      setHistory(res.state);
      emit(res.value);
    }
  }, [history, emit, manualDiagram, isData]);

  const doRedo = useCallback(() => {
    const res = isData ? undefined : redo(history, manualDiagram);
    if (res) {
      setHistory(res.state);
      emit(res.value);
    }
  }, [history, emit, manualDiagram, isData]);

  // Selection is shared with the Inspector option editor through panel instance state.
  const setSelection = useCallback(
    (sel?: FlowSelection) => {
      setSelectionState(sel);
      panelContext.onInstanceStateChange?.({ selection: sel, dataDiagram: derived });
    },
    [panelContext, derived]
  );
  // Let the option editors see the data diagram (the overrides editor lists its nodes).
  const publishedRef = useRef<FlowDiagram | undefined>(undefined);
  useEffect(() => {
    if (isData && derived && publishedRef.current !== derived) {
      publishedRef.current = derived;
      panelContext.onInstanceStateChange?.({ selection: rawSelection, dataDiagram: derived });
    }
  }, [isData, derived, panelContext, rawSelection]);
  const [prevEditing, setPrevEditing] = useState(editing);
  if (prevEditing !== editing) {
    setPrevEditing(editing);
    setSelectionState(undefined);
    setTool('select');
    setUserViewport(false);
  }
  // Ignore a selection whose element has disappeared.
  const selection = useMemo(() => {
    if (!rawSelection) {
      return undefined;
    }
    const list = rawSelection.kind === 'node' ? diagram.nodes : diagram.edges;
    return list.some((x) => x.id === rawSelection.id) ? rawSelection : undefined;
  }, [rawSelection, diagram]);

  // Viewport: editing uses the stored viewport (persisted, debounced); viewing auto-fits unless disabled.
  const autoFit = options.layout?.autoFit !== false;
  // Editing uses the live viewport; view mode fits (or, manual without Fit to panel, uses the saved viewport)
  // until the user zooms or pans, which is kept for the session only.
  const effectiveViewport = useMemo<Viewport>(() => {
    if (userViewport || (editing && !isData) || (!editing && !isData && !autoFit)) {
      return viewport;
    }
    return editing ? fitBelowChrome(diagram.nodes, width, height) : fitViewport(diagram.nodes, width, height);
  }, [isData, userViewport, editing, autoFit, viewport, diagram.nodes, width, height]);

  const viewportTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const setViewport = useCallback((vp: Viewport) => {
    setViewportState(vp);
    setUserViewport(true);
  }, []);
  useEffect(() => {
    if (!editing || isData) {
      return;
    }
    if (viewportTimer.current) {
      clearTimeout(viewportTimer.current);
    }
    viewportTimer.current = setTimeout(() => {
      if (manualDiagram.viewport.x !== viewport.x || manualDiagram.viewport.y !== viewport.y || manualDiagram.viewport.zoom !== viewport.zoom) {
        emit({ ...manualDiagram, viewport });
      }
    }, 400);
    return () => {
      if (viewportTimer.current) {
        clearTimeout(viewportTimer.current);
      }
    };
  }, [viewport, editing, emit, manualDiagram, isData]);

  const dataFields = useMemo(() => indexFields(frames, theme), [frames, theme]);
  const fields = useMemo(() => {
    if (!built) {
      return dataFields;
    }
    const merged = new Map(dataFields);
    for (const [k, v] of built.fields) {
      merged.set(k, v);
    }
    return merged;
  }, [dataFields, built]);

  const shown = draft ?? diagram;
  // Interpolate dashboard variables in labels for display only.
  const displayDiagram = useMemo<FlowDiagram>(
    () => ({
      ...shown,
      nodes: shown.nodes.map((n) => ({
        ...n,
        label: replaceVariables(n.label),
        sublabel: n.sublabel ? replaceVariables(n.sublabel) : n.sublabel,
      })),
    }),
    [shown, replaceVariables]
  );

  const deleteSelection = useCallback(() => {
    if (!selection || isData) {
      return;
    }
    const d = diagram;
    if (selection.kind === 'node') {
      commit({
        ...d,
        nodes: d.nodes.filter((n) => n.id !== selection.id),
        edges: d.edges.filter((e) => e.from !== selection.id && e.to !== selection.id),
      });
    } else {
      commit({ ...d, edges: d.edges.filter((e) => e.id !== selection.id) });
    }
    setSelection(undefined);
  }, [selection, commit, setSelection, diagram, isData]);

  const fit = useCallback(() => {
    if (editing) {
      setViewport(fitBelowChrome(diagram.nodes, width, height));
    } else {
      // Back to the reactive fitted view (follows resizes and data changes again).
      setUserViewport(false);
      setViewportState(fitViewport(diagram.nodes, width, height));
    }
  }, [editing, diagram.nodes, width, height, setViewport]);
  const zoomBy = useCallback((factor: number) => setViewport(zoomAt(effectiveViewport, width / 2, height / 2, factor)), [effectiveViewport, width, height, setViewport]);
  // Zoom onto a node or a group: fit its bounds with generous padding, never past 2× (a node) or MAX_ZOOM.
  const zoomTo = useCallback(
    (target: { node?: string; group?: string }) => {
      const nodes = target.node ? diagram.nodes.filter((n) => n.id === target.node) : diagram.nodes.filter((n) => n.group === target.group);
      if (!nodes.length) {
        return;
      }
      setViewport(fitViewport(nodes, width, height, target.node ? Math.min(width, height) / 4 : 48, target.node ? 2 : MAX_ZOOM));
    },
    [diagram.nodes, width, height, setViewport]
  );
  const zoomEnabled = (options.interaction ?? DEFAULT_INTERACTION).zoom !== false;

  // Particles: mode (animated / static / hidden) and the global cap, resolved to per-edge counts.
  const particleMode = options.animation?.particles ?? 'animated';
  const particleLimit = options.animation?.particleLimit ?? DEFAULT_PARTICLE_LIMIT;
  const particleBudget = useMemo(
    () => (particlesVisible(particleMode, animate) ? budgetParticles(shown.edges, particleLimit) : { counts: new Map<string, number>(), total: 0, limited: false }),
    [particleMode, animate, shown.edges, particleLimit]
  );

  // Node links (view mode only).
  const links = useMemo(() => ({ ...DEFAULT_LINKS, ...(options.links ?? {}) }), [options.links]);
  const linkFor = useCallback(
    (node: FlowNode) => resolveNodeLink(node, links, formatValue(node.valueField ? fields.get(node.valueField) : undefined, node.valueFormat), replaceVariables, isData),
    [links, fields, replaceVariables, isData]
  );
  const onOpenLink = useCallback((href: string) => openLink(href, links.target, (path) => locationService.push(path)), [links.target]);
  // Node click sets a dashboard variable (action `variable`): every query on the page that uses it follows.
  const onNodeAction = useCallback(
    (node: FlowNode) => {
      if (links.action === 'focus') {
        focusOn(node.id);
        return true;
      }
      const v = resolveNodeVariable(node, links, formatValue(node.valueField ? fields.get(node.valueField) : undefined, node.valueFormat), replaceVariables);
      if (!v) {
        return false;
      }
      locationService.partial(variableQuery(v.name, v.value));
      return true;
    },
    [links, fields, replaceVariables, focusOn]
  );
  // Context menu: the variable a node would set, whatever the trigger, and a direct setter.
  const variableFor = useCallback(
    (node: FlowNode) =>
      links.action === 'variable'
        ? resolveNodeVariable(node, { ...links, trigger: 'click' }, formatValue(node.valueField ? fields.get(node.valueField) : undefined, node.valueFormat), replaceVariables)
        : undefined,
    [links, fields, replaceVariables]
  );
  const onSetVariable = useCallback((v: { name: string; value: string }) => locationService.partial(variableQuery(v.name, v.value)), []);
  const varName = links.action === 'variable' ? variableName(links) : '';
  const varValue = varName ? currentVariable(varName, replaceVariables) : undefined;
  const clearVariable = useCallback(() => locationService.partial(variableQuery(varName, links.variableClear ?? '')), [varName, links.variableClear]);
  // Right-click menu: hide a node or a group (deduplicated), or toggle the Collapse groups rule.
  const onPrune = useCallback(
    (change: PruneChange) => {
      const add = (list: string[], id: string | undefined) => (id && !list.includes(id) ? [...list, id] : list);
      const next: DataOptions = {
        ...dataOpts,
        hidden: { nodes: add(hidden.nodes, change.hideNode), groups: add(hidden.groups, change.hideGroup) },
        prune: change.toggleCollapse ? { ...pruneRules, collapseGroups: !pruneRules.collapseGroups } : pruneRules,
      };
      onOptionsChange({ ...options, data: next });
    },
    [dataOpts, hidden, pruneRules, options, onOptionsChange]
  );
  const showHidden = useCallback(() => onOptionsChange({ ...options, data: { ...dataOpts, hidden: { nodes: [], groups: [] } } }), [options, dataOpts, onOptionsChange]);
  const toggleGrid = useCallback(() => {
    if (isData) {
      return;
    }
    commit({ ...diagram, grid: { ...diagram.grid, show: !diagram.grid.show } });
  }, [commit, diagram, isData]);
  const lock = useCallback(() => onOptionsChange({ ...options, layout: { ...options.layout, editMode: false } }), [options, onOptionsChange]);
  // Always writes the manual diagram, also while the generated graph stands in for an empty one.
  const loadExample = useCallback(() => commitManual(createExampleDiagram()), [commitManual]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }
    if (!editing) {
      if (e.key === 'Escape' && focusId) {
        focusClear();
        e.preventDefault();
      }
      return;
    }
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    let handled = true;
    if (mod && key === 'z') {
      if (e.shiftKey) {
        doRedo();
      } else {
        doUndo();
      }
    } else if (mod && key === 'y') {
      doRedo();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      deleteSelection();
    } else if (e.key === 'Escape') {
      setSelection(undefined);
      setTool('select');
    } else if (!mod && key === 'v') {
      setTool('select');
    } else if (!mod && key === 'n') {
      setTool('addNode');
    } else if (!mod && key === 'e') {
      setTool('addEdge');
    } else {
      handled = false;
    }
    if (handled) {
      // Keep dashboard-level shortcuts (e.g. "e" = edit, "v" = view) from firing while designing.
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const empty = diagram.nodes.length === 0;
  /** View mode with a session zoom or pan: offer a way back to the fitted view (top-left chip). */
  const zoomedIn = !editing && zoomEnabled && userViewport && !empty;
  /** The query had nodes but the rules / hidden list removed them all. */
  const prunedAway = empty && !!rawGraph && rawGraph.nodes.length > 0;
  const notices = graph?.notices ?? [];
  const overrideCount = dataMode === 'overrides' ? Object.keys(dataOpts.overrides ?? {}).length : 0;

  return (
    <div className={styles.wrap} style={{ width, height }} tabIndex={editing || focusId ? 0 : undefined} onKeyDown={onKeyDown} data-testid="flow-panel">
      <FlowCanvas
        diagram={displayDiagram}
        width={width}
        height={height}
        theme={theme}
        options={options}
        fields={fields}
        editing={editing}
        tool={tool}
        selection={selection}
        viewport={effectiveViewport}
        animate={animate && particleMode === 'animated'}
        particleCounts={particleBudget.counts}
        uid={uid}
        opacity={fadeOpacity}
        groupBoxes={isData && dataOpts.groupBoxes}
        groupHints={isData ? groupHints : undefined}
        zoomEnabled={zoomEnabled}
        linkFor={linkFor}
        linkTrigger={links.trigger}
        onOpenLink={onOpenLink}
        onNodeAction={onNodeAction}
        variableFor={variableFor}
        onSetVariable={onSetVariable}
        onPrune={isData ? onPrune : undefined}
        collapsed={isData && !!pruneRules.collapseGroups}
        onFit={fit}
        onZoomTo={zoomTo}
        onFocus={onFocusNode}
        onViewport={setViewport}
        onSelect={setSelection}
        onDraft={setDraft}
        onCommit={commit}
        onTool={setTool}
      />
      {editing && (
        <>
          <Toolbar
            tool={tool}
            onTool={setTool}
            canUndo={!isData && history.past.length > 0}
            canRedo={!isData && history.future.length > 0}
            canDelete={!isData && !!selection}
            gridOn={diagram.grid.show}
            onUndo={doUndo}
            onRedo={doRedo}
            onDelete={deleteSelection}
            onFit={fit}
            onToggleGrid={toggleGrid}
            onLock={lock}
          />
          <span className={styles.mode}>{isData ? (dataMode === 'overrides' ? 'Design mode · data + overrides' : 'Design mode · data') : 'Design mode'}</span>
          <span className={styles.chip}>
            {Math.round(effectiveViewport.zoom * 100)}% · {diagram.nodes.length} nodes · {diagram.edges.length} edges
            {particleBudget.limited ? ` · particles capped at ${particleBudget.total}` : ''}
            {isData
              ? dataMode === 'overrides'
                ? ` · drag nodes to override their position (${overrideCount} overridden)`
                : ' · positions are not kept; switch to "Data + manual overrides" to persist moves'
              : tool === 'addEdge'
                ? ' · click a source node, then a target'
                : tool === 'addNode'
                  ? ' · click to place a node'
                  : ''}
          </span>
        </>
      )}
      {(zoomEnabled || editing) && !empty && <ZoomControls zoom={effectiveViewport.zoom} onZoomIn={() => zoomBy(1.25)} onZoomOut={() => zoomBy(0.8)} onFit={fit} pinned={editing} hint={editing ? ZOOM_HINT_EDIT : ZOOM_HINT_VIEW} />}
      <ReducedMotionHint animationEnabled={animationEnabled} preference={options.animation?.reducedMotion} width={width} />
      {/* Below the design-mode toolbar and mode chip while editing. */}
      <div className={styles.badgeWrap} style={editing ? { top: 28 } : undefined}>
        <DemoBadge visible={isDemo} width={width} />
      </div>
      {!editing && (zoomedIn || focusId || (varName && varValue !== undefined) || (isData && hiddenCount > 0)) && (
        <ChipRow width={width}>
          {focusId && (
            <Chip
              testId="flow-focus-chip"
              tooltip={`Only this node and its chain are shown (Interaction → Focus). Back leaves the focus${focusStackLive.length > 1 ? ' one step' : ''}; Esc leaves it entirely`}
              action={{ label: 'Back from the focus', text: 'back', onClick: focusBack }}
            >
              focus <b>{diagram.nodes.find((n) => n.id === focusId)?.label || focusId}</b> · {diagram.nodes.length} of {focusCandidates?.length ?? diagram.nodes.length}
            </Chip>
          )}
          {zoomedIn && (
            <Chip testId="flow-zoom-chip" tooltip="The view is zoomed or panned for this session. Back returns to the full, fitted diagram" action={{ label: 'Back to the full view', text: 'back', onClick: fit }}>
              zoomed <b>{Math.round(effectiveViewport.zoom * 100)}%</b>
            </Chip>
          )}
          {varName && varValue !== undefined && <VariableChip name={varName} value={varValue} onClear={clearVariable} />}
          {isData && hiddenCount > 0 && (
            <Chip
              testId="flow-hidden-chip"
              tooltip="Nodes and groups hidden with the right-click menu (Data → Prune → Hidden items)"
              action={{ label: 'Show hidden items', text: 'show', onClick: showHidden }}
            >
              hidden <b>{hiddenCount}</b>
            </Chip>
          )}
        </ChipRow>
      )}
      {demoFallback && !empty && (
        <div className={styles.demoHint} data-testid="flow-demo-hint">
          <span>{FLOW_DEMO_HINT}</span>
          <Button size="sm" fill="text" variant="secondary" onClick={loadExample}>
            Load example diagram
          </Button>
        </div>
      )}
      {notices.length > 0 && !empty && (
        <span className={styles.notice} style={editing ? { bottom: 30 } : undefined} data-testid="flow-notice">
          {notices.join(' · ')}
        </span>
      )}
      {empty && !isData && (
        <div className={styles.empty}>
          <div>{editing ? 'Click "Add node" in the toolbar to start, or load the example diagram.' : 'No diagram yet. Turn on "Edit layout" in the Layout options to design one.'}</div>
          <div>{FLOW_NO_DATA_MESSAGE}</div>
          <Button size="sm" variant="secondary" onClick={loadExample}>
            Load example diagram
          </Button>
        </div>
      )}
      {empty && isData && prunedAway && (
        <div className={styles.empty} data-testid="flow-pruned-empty">
          <div>Everything is hidden by the prune rules or the hidden list (Data → Prune).</div>
          {hiddenCount > 0 && (
            <Button size="sm" variant="secondary" onClick={showHidden}>
              Show hidden items
            </Button>
          )}
        </div>
      )}
      {empty && isData && !prunedAway && (
        <div className={styles.empty} data-testid="flow-data-empty">
          <div>
            No edges found in the query results. Expected a frame with string fields{' '}
            <code>{dataOpts.sourceField || 'source'}</code> and <code>{dataOpts.targetField || 'target'}</code>, or series whose labels carry those names
            (see Data options).
          </div>
        </div>
      )}
    </div>
  );
};
