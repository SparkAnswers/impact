import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { css } from '@emotion/css';
import type { GrafanaTheme2, PanelProps } from '@grafana/data';
import { Button, usePanelContext, useStyles2, useTheme2 } from '@grafana/ui';
import { useMotionAllowed } from '../../shared/motion';
import { ReducedMotionHint } from '../../shared/ReducedMotionHint';
import { FlowCanvas } from './components/FlowCanvas';
import { Toolbar, type Tool } from './components/Toolbar';
import { indexFields } from './lib/data';
import { createExampleDiagram } from './lib/example';
import { fitViewport } from './lib/geometry';
import { emptyUndo, pushUndo, redo, undo, type UndoState } from './lib/undo';
import { normalizeDiagram } from './lib/validate';
import type { FlowDiagram, FlowOptions, FlowSelection, Viewport } from './types';

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

  const stored = options.diagram;
  const diagram = useMemo(() => normalizeDiagram(stored), [stored]);
  const [draft, setDraft] = useState<FlowDiagram | undefined>();
  const [history, setHistory] = useState<UndoState<FlowDiagram>>(emptyUndo);
  const [tool, setTool] = useState<Tool>('select');
  const [rawSelection, setSelectionState] = useState<FlowSelection | undefined>();
  const [viewport, setViewportState] = useState<Viewport>(diagram.viewport);

  // Track the committed diagram so we can tell our own option changes (already in history) from external ones
  // (inspector, JSON editor, dashboard reload) which get an undo entry of their own.
  const json = useMemo(() => JSON.stringify(diagram), [diagram]);
  const [emitted, setEmitted] = useState(json);
  const [tracked, setTracked] = useState({ json, diagram });
  if (tracked.json !== json) {
    if (json !== emitted) {
      const prev = tracked.diagram;
      setHistory((h) => pushUndo(h, prev));
      setEmitted(json);
    }
    setTracked({ json, diagram });
    setDraft(undefined);
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
      setHistory((h) => pushUndo(h, diagram));
      setDraft(undefined);
      emit({ ...next, viewport });
    },
    [emit, viewport, diagram]
  );

  const doUndo = useCallback(() => {
    const res = undo(history, diagram);
    if (res) {
      setHistory(res.state);
      emit(res.value);
    }
  }, [history, emit, diagram]);

  const doRedo = useCallback(() => {
    const res = redo(history, diagram);
    if (res) {
      setHistory(res.state);
      emit(res.value);
    }
  }, [history, emit, diagram]);

  // Selection is shared with the Inspector option editor through panel instance state.
  const setSelection = useCallback(
    (sel?: FlowSelection) => {
      setSelectionState(sel);
      panelContext.onInstanceStateChange?.({ selection: sel });
    },
    [panelContext]
  );
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
    if (!editing) {
      return;
    }
    if (viewportTimer.current) {
      clearTimeout(viewportTimer.current);
    }
    viewportTimer.current = setTimeout(() => {
      if (diagram.viewport.x !== viewport.x || diagram.viewport.y !== viewport.y || diagram.viewport.zoom !== viewport.zoom) {
        emit({ ...diagram, viewport });
      }
    }, 400);
    return () => {
      if (viewportTimer.current) {
        clearTimeout(viewportTimer.current);
      }
    };
  }, [viewport, editing, emit, diagram]);

  const fields = useMemo(() => indexFields(data.series, theme), [data.series, theme]);

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
    if (!selection) {
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
  }, [selection, commit, setSelection, diagram]);

  const fit = useCallback(() => setViewport(fitViewport(diagram.nodes, width, height)), [diagram.nodes, width, height, setViewport]);
  const toggleGrid = useCallback(() => commit({ ...diagram, grid: { ...diagram.grid, show: !diagram.grid.show } }), [commit, diagram]);
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

  const animationEnabled = options.animation?.enabled !== false;
  const animate = useMotionAllowed(animationEnabled, options.animation?.reducedMotion);
  const empty = diagram.nodes.length === 0;

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
            canUndo={history.past.length > 0}
            canRedo={history.future.length > 0}
            canDelete={!!selection}
            gridOn={diagram.grid.show}
            onUndo={doUndo}
            onRedo={doRedo}
            onDelete={deleteSelection}
            onFit={fit}
            onToggleGrid={toggleGrid}
            onLock={lock}
          />
          <span className={styles.mode}>Design mode</span>
          <span className={styles.chip}>
            {Math.round(effectiveViewport.zoom * 100)}% · {diagram.nodes.length} nodes · {diagram.edges.length} edges
            {tool === 'addEdge' ? ' · click a source node, then a target' : tool === 'addNode' ? ' · click to place a node' : ''}
          </span>
        </>
      )}
      <ReducedMotionHint animationEnabled={animationEnabled} preference={options.animation?.reducedMotion} width={width} />
      {empty && (
        <div className={styles.empty}>
          <div>{editing ? 'Click "Add node" in the toolbar to start, or load the example diagram.' : 'No diagram yet. Turn on "Edit layout" in the Layout options to design one.'}</div>
          <Button size="sm" variant="secondary" onClick={loadExample}>
            Load example diagram
          </Button>
        </div>
      )}
    </div>
  );
};
