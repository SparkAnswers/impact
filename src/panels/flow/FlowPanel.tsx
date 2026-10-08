import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { css } from '@emotion/css';
import type { GrafanaTheme2, PanelProps } from '@grafana/data';
import { Button, usePanelContext, useStyles2, useTheme2 } from '@grafana/ui';
import { useMotionAllowed } from '../../shared/motion';
import { ReducedMotionHint } from '../../shared/ReducedMotionHint';
import { FlowCanvas } from './components/FlowCanvas';
import { Toolbar, type Tool } from './components/Toolbar';
import { indexFields } from './lib/data';
import { buildDataDiagram, mergeOverrides, nodeSize, overridesFromMove, shortLabel } from './lib/datadriven';
import { createExampleDiagram } from './lib/example';
import { extractGraph } from './lib/frames';
import { fitViewport } from './lib/geometry';
import { layoutGraph, nodeSetKey, type LayoutOptions } from './lib/layout';
import { diffFade, emptyFade, fadeFrame, type FadeState } from './lib/transitions';
import { emptyUndo, pushUndo, redo, undo, type UndoState } from './lib/undo';
import { normalizeDiagram } from './lib/validate';
import { DEFAULT_DATA_OPTIONS, type DataOptions, type FlowDiagram, type FlowOptions, type FlowSelection, type Point, type Viewport } from './types';

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
    right: 8,
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

export const FlowPanel: React.FC<PanelProps<FlowOptions>> = ({ options, onOptionsChange, data, width, height, replaceVariables }) => {
  const theme = useTheme2();
  const styles = useStyles2(getStyles);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const panelContext = usePanelContext();
  const editing = !!options.layout?.editMode;
  const dataOpts: DataOptions = useMemo(() => ({ ...DEFAULT_DATA_OPTIONS, ...(options.data ?? {}) }), [options.data]);
  const dataMode = dataOpts.source;
  const isData = dataMode !== 'manual';
  const fontSize = options.appearance?.fontSize || 12;
  const animationEnabled = options.animation?.enabled !== false;
  const animate = useMotionAllowed(animationEnabled, options.animation?.reducedMotion);

  const stored = options.diagram;
  const manualDiagram = useMemo(() => normalizeDiagram(stored), [stored]);
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
  const graph = useMemo(() => (isData ? extractGraph(data.series, { ...dataOpts, topN: dataOpts.topN }) : undefined), [isData, data.series, dataOpts]);
  // Aspect is quantised so small resizes do not trigger a re-layout.
  const aspect = width > 0 && height > 0 ? Math.round((width / height) * 4) / 4 : undefined;
  const layoutOpts = useMemo<LayoutOptions>(
    () => ({ direction: dataOpts.layout, layerGap: Math.max(20, dataOpts.layerGap), nodeGap: Math.max(4, dataOpts.nodeGap), aspect }),
    [dataOpts.layout, dataOpts.layerGap, dataOpts.nodeGap, aspect]
  );
  // Positions are only recomputed when the node set (or the layout options) change, so refreshes do not reshuffle.
  const layoutKey = graph ? nodeSetKey(graph.nodes, layoutOpts) : '';
  const fresh = useMemo(() => {
    if (!graph) {
      return new Map<string, Point>();
    }
    const sized = graph.nodes.map((n) => ({ id: n.id, group: n.group, ...nodeSize(shortLabel(n.label ?? n.id), fontSize, n.value !== undefined) }));
    return layoutGraph(sized, graph.edges, layoutOpts).positions;
  }, [graph, layoutOpts, fontSize]);
  const [layoutCache, setLayoutCache] = useState<{ key: string; positions: Map<string, Point> }>({ key: '', positions: new Map() });
  let positions = layoutCache.positions;
  if (layoutCache.key !== layoutKey) {
    positions = fresh;
    setLayoutCache({ key: layoutKey, positions: fresh });
  }
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

  const diagram = isData ? (frame?.diagram ?? derived ?? manualDiagram) : manualDiagram;
  const fadeOpacity = isData ? frame?.opacity : undefined;

  // Design mode on a data diagram: start from a fitted view (and re-fit when the node set changes).
  const [fittedKey, setFittedKey] = useState('');
  const wantFit = isData && editing && derived ? layoutKey : '';
  if (fittedKey !== wantFit) {
    setFittedKey(wantFit);
    if (wantFit && derived) {
      setViewportState(fitViewport(derived.nodes, width, height));
    }
  }

  const emit = useCallback(
    (next: FlowDiagram) => {
      setEmitted(JSON.stringify(next));
      onOptionsChange({ ...options, diagram: next });
    },
    [options, onOptionsChange]
  );

  const commit = useCallback(
    (next: FlowDiagram) => {
      setDraft(undefined);
      if (isData) {
        // Data-driven: only node moves are kept, and only as overrides (when enabled).
        if (dataMode === 'overrides' && derived) {
          onOptionsChange({ ...options, data: { ...dataOpts, overrides: overridesFromMove(dataOpts.overrides, derived, next) } });
        }
        return;
      }
      setHistory((h) => pushUndo(h, manualDiagram));
      emit({ ...next, viewport });
    },
    [emit, viewport, manualDiagram, isData, dataMode, derived, onOptionsChange, options, dataOpts]
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
  const effectiveViewport = useMemo<Viewport>(() => {
    if (editing || !autoFit) {
      return viewport;
    }
    return fitViewport(diagram.nodes, width, height);
  }, [editing, autoFit, viewport, diagram.nodes, width, height]);

  const viewportTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const setViewport = useCallback((vp: Viewport) => {
    setViewportState(vp);
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

  const dataFields = useMemo(() => indexFields(data.series, theme), [data.series, theme]);
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

  const fit = useCallback(() => setViewport(fitViewport(diagram.nodes, width, height)), [diagram.nodes, width, height, setViewport]);
  const toggleGrid = useCallback(() => {
    if (isData) {
      return;
    }
    commit({ ...diagram, grid: { ...diagram.grid, show: !diagram.grid.show } });
  }, [commit, diagram, isData]);
  const lock = useCallback(() => onOptionsChange({ ...options, layout: { ...options.layout, editMode: false } }), [options, onOptionsChange]);
  const loadExample = useCallback(() => commit(createExampleDiagram()), [commit]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!editing || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
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
  const notices = graph?.notices ?? [];
  const overrideCount = dataMode === 'overrides' ? Object.keys(dataOpts.overrides ?? {}).length : 0;

  return (
    <div className={styles.wrap} style={{ width, height }} tabIndex={editing ? 0 : undefined} onKeyDown={onKeyDown} data-testid="flow-panel">
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
        animate={animate}
        uid={uid}
        opacity={fadeOpacity}
        groupBoxes={isData && dataOpts.groupBoxes}
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
      <ReducedMotionHint animationEnabled={animationEnabled} preference={options.animation?.reducedMotion} width={width} />
      {notices.length > 0 && !empty && (
        <span className={styles.notice} data-testid="flow-notice">
          {notices.join(' · ')}
        </span>
      )}
      {empty && !isData && (
        <div className={styles.empty}>
          <div>{editing ? 'Click "Add node" in the toolbar to start, or load the example diagram.' : 'No diagram yet. Turn on "Edit layout" in the Layout options to design one.'}</div>
          <Button size="sm" variant="secondary" onClick={loadExample}>
            Load example diagram
          </Button>
        </div>
      )}
      {empty && isData && (
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
