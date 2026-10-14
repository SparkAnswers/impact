import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FieldType, LoadingState, applyFieldOverrides, createTheme, getDefaultTimeRange, toDataFrame, type PanelProps } from '@grafana/data';
import { locationService } from '@grafana/runtime';
import { FLOW_DEMO_HINT, FLOW_NO_DATA_MESSAGE, FlowPanel } from '../FlowPanel';
import { createExampleDiagram } from '../lib/example';
import { DEFAULT_OPTIONS, type FlowOptions } from '../types';

const theme = createTheme();
const EMPTY = { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 }, grid: { show: true, size: 20, snap: true } };

// jsdom has no PointerEvent; React's onPointer* handlers need `button`/`pointerId` on the event.
if (typeof window.PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number;
    constructor(type: string, props: PointerEventInit = {}) {
      super(type, props);
      this.pointerId = props.pointerId ?? 0;
    }
  }
  Object.defineProperty(window, 'PointerEvent', { value: PointerEventPolyfill, writable: true });
}

function makeSeries() {
  const frame = toDataFrame({
    refId: 'A',
    fields: [
      { name: 'time', type: FieldType.time, values: [1, 2, 3] },
      { name: 'solar_kw', type: FieldType.number, values: [10, 11, 12.4], config: { unit: 'kwatt', decimals: 1 } },
      { name: 'house_kw', type: FieldType.number, values: [5, 6, 6.2], config: { unit: 'kwatt', decimals: 1 } },
    ],
  });
  return applyFieldOverrides({
    data: [frame],
    fieldConfig: { defaults: {}, overrides: [] },
    replaceVariables: (v) => v,
    theme,
  });
}

function renderPanel(partial: Partial<FlowOptions> = {}, onOptionsChange = jest.fn(), replaceVariables: (v: string) => string = (v) => v) {
  const options: FlowOptions = { ...DEFAULT_OPTIONS, ...partial, diagram: partial.diagram ?? createExampleDiagram() };
  const props = {
    id: 1,
    data: { series: makeSeries(), state: LoadingState.Done, timeRange: getDefaultTimeRange() },
    timeRange: getDefaultTimeRange(),
    timeZone: 'browser',
    options,
    onOptionsChange,
    fieldConfig: { defaults: {}, overrides: [] },
    onFieldConfigChange: jest.fn(),
    replaceVariables,
    width: 800,
    height: 500,
    transparent: false,
    renderCounter: 0,
    title: 'Flow',
    eventBus: { publish: jest.fn(), subscribe: jest.fn(), getStream: jest.fn(), removeAllListeners: jest.fn(), newScopedBus: jest.fn() },
    onChangeTimeRange: jest.fn(),
  } as unknown as PanelProps<FlowOptions>;
  const utils = render(<FlowPanel {...props} />);
  return { ...utils, options, onOptionsChange };
}

describe('FlowPanel', () => {
  it('renders nodes, edges and live values from the data frame', () => {
    renderPanel();
    expect(screen.getByText('Solar array')).toBeInTheDocument();
    expect(screen.getByText('12.4 kW')).toBeInTheDocument();
    expect(screen.getByText('6.2 kW')).toBeInTheDocument();
    expect(screen.getByText('offline')).toBeInTheDocument(); // sublabel fallback
    expect(screen.getByText('HUB')).toBeInTheDocument();
    expect(screen.getAllByTestId(/^flow-edge-e\d$/)).toHaveLength(9);
    expect(screen.queryByTestId('flow-toolbar')).not.toBeInTheDocument();
  });

  it('renders an empty state with a load-example action', () => {
    const onOptionsChange = jest.fn();
    renderPanel({ diagram: EMPTY, demoData: 'off' }, onOptionsChange);
    expect(screen.getByText(FLOW_NO_DATA_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByTestId('impact-demo-badge')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Load example diagram'));
    expect(onOptionsChange).toHaveBeenCalledTimes(1);
    expect(onOptionsChange.mock.calls[0][0].diagram.nodes).toHaveLength(10);
  });

  it('shows the generated graph (data layout) for an empty manual diagram when demo data is on', () => {
    const onOptionsChange = jest.fn();
    renderPanel({ diagram: EMPTY }, onOptionsChange); // demoData defaults to "when no data"; the series carry no edges
    expect(screen.getByTestId('impact-demo-badge')).toBeInTheDocument();
    expect(screen.getByTestId('flow-demo-hint')).toHaveTextContent(FLOW_DEMO_HINT);
    expect(screen.getByTestId('flow-node-api-gateway')).toBeInTheDocument();
    expect(screen.getAllByTestId(/^flow-node-/).length).toBe(12);
    // Loading the example still writes the manual diagram.
    fireEvent.click(screen.getByText('Load example diagram'));
    expect(onOptionsChange).toHaveBeenCalledTimes(1);
    expect(onOptionsChange.mock.calls[0][0].diagram.nodes).toHaveLength(10);
  });

  it('never feeds generated values to a drawn diagram and not while designing an empty one', () => {
    renderPanel({ demoData: 'always' });
    expect(screen.queryByTestId('impact-demo-badge')).not.toBeInTheDocument();
    expect(screen.getByText('Solar array')).toBeInTheDocument();
    cleanup();
    renderPanel({ diagram: EMPTY, layout: { ...DEFAULT_OPTIONS.layout, editMode: true } });
    expect(screen.queryByTestId('impact-demo-badge')).not.toBeInTheDocument();
    expect(screen.getByText('Load example diagram')).toBeInTheDocument();
    expect(screen.queryAllByTestId(/^flow-node-/)).toHaveLength(0);
  });

  it('shows the toolbar in edit mode and persists a node drag with snapping', () => {
    const onOptionsChange = jest.fn();
    renderPanel({ layout: { ...DEFAULT_OPTIONS.layout, editMode: true, gridSize: 20, snap: true } }, onOptionsChange);
    expect(screen.getByTestId('flow-toolbar')).toBeInTheDocument();
    expect(screen.getByText('Design mode')).toBeInTheDocument();
    const node = screen.getByTestId('flow-node-solar');
    const canvas = screen.getByTestId('flow-canvas');
    act(() => {
      fireEvent.pointerDown(node, { button: 0, clientX: 100, clientY: 140, pointerId: 1 });
      fireEvent.pointerMove(canvas, { clientX: 153, clientY: 171, pointerId: 1 });
      fireEvent.pointerUp(canvas, { clientX: 153, clientY: 171, pointerId: 1 });
    });
    expect(onOptionsChange).toHaveBeenCalled();
    const last = onOptionsChange.mock.calls.at(-1)[0];
    const moved = last.diagram.nodes.find((n: { id: string }) => n.id === 'solar');
    // original (40,120) + (53,31) = (93,151) → snapped to (100,160)
    expect(moved.x).toBe(100);
    expect(moved.y).toBe(160);
  });

  it('deletes the selected edge with the Delete key', () => {
    const onOptionsChange = jest.fn();
    renderPanel({ layout: { ...DEFAULT_OPTIONS.layout, editMode: true } }, onOptionsChange);
    const hit = screen.getByTestId('flow-edge-e1').querySelectorAll('path');
    // last path inside the edge group is the fat hit-target
    fireEvent.pointerDown(hit[hit.length - 1], { button: 0, pointerId: 2 });
    expect(screen.getByTestId('flow-edge-handles')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByTestId('flow-panel'), { key: 'Delete' });
    const last = onOptionsChange.mock.calls.at(-1)[0];
    expect(last.diagram.edges.map((e: { id: string }) => e.id)).not.toContain('e1');
  });

  it('does not animate particles when animation is off but still renders them', () => {
    const raf = jest.spyOn(window, 'requestAnimationFrame');
    renderPanel({ animation: { enabled: false, speed: 1 } });
    expect(screen.getByTestId('flow-particles').querySelectorAll('circle').length).toBeGreaterThan(0);
    expect(raf).not.toHaveBeenCalled();
    raf.mockRestore();
  });
});

describe('FlowPanel data-driven mode', () => {
  const edgeFrame = () =>
    applyFieldOverrides({
      data: [
        toDataFrame({
          refId: 'A',
          fields: [
            { name: 'source', type: FieldType.string, values: ['web', 'api', 'api'] },
            { name: 'target', type: FieldType.string, values: ['api', 'db', 'cache'] },
            { name: 'Value', type: FieldType.number, values: [10, 4, 1], config: { unit: 'reqps' } },
            { name: 'target_group', type: FieldType.string, values: ['backend', 'data', 'data'] },
          ],
        }),
      ],
      fieldConfig: { defaults: {}, overrides: [] },
      replaceVariables: (v) => v,
      theme,
    });

  function renderData(partial: Partial<FlowOptions['data']> = {}, onOptionsChange = jest.fn(), layout = DEFAULT_OPTIONS.layout, diagram = DEFAULT_OPTIONS.diagram) {
    const options: FlowOptions = { ...DEFAULT_OPTIONS, layout, diagram, data: { ...DEFAULT_OPTIONS.data, source: 'data', ...partial } };
    const props = {
      id: 1,
      data: { series: edgeFrame(), state: LoadingState.Done, timeRange: getDefaultTimeRange() },
      timeRange: getDefaultTimeRange(),
      timeZone: 'browser',
      options,
      onOptionsChange,
      fieldConfig: { defaults: {}, overrides: [] },
      onFieldConfigChange: jest.fn(),
      replaceVariables: (v: string) => v,
      width: 800,
      height: 500,
      transparent: false,
      renderCounter: 0,
      title: 'Flow',
      eventBus: { publish: jest.fn(), subscribe: jest.fn(), getStream: jest.fn(), removeAllListeners: jest.fn(), newScopedBus: jest.fn() },
      onChangeTimeRange: jest.fn(),
    } as unknown as PanelProps<FlowOptions>;
    return { ...render(<FlowPanel {...props} />), onOptionsChange };
  }

  it('builds nodes, edges, group boxes and edge labels from a source/target frame', () => {
    renderData({ showEdgeValues: true });
    for (const id of ['web', 'api', 'db', 'cache']) {
      expect(screen.getByTestId(`flow-node-${id}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId('flow-edge-web→api')).toBeInTheDocument();
    expect(screen.getByTestId('flow-edge-label-web→api')).toHaveTextContent('10 req/s');
    expect(screen.getByTestId('flow-groups')).toHaveTextContent('backend');
    expect(screen.queryByText('Load example diagram')).not.toBeInTheDocument();
    // Layered left to right: targets are right of their sources.
    const x = (id: string) => Number(/translate\((-?[\d.]+),/.exec(screen.getByTestId(`flow-node-${id}`).getAttribute('transform') ?? '')?.[1]);
    expect(x('api')).toBeGreaterThan(x('web'));
    expect(x('db')).toBeGreaterThan(x('api'));
  });

  it('shows a hint when the frames carry no edges and demo data is off', () => {
    const options: FlowOptions = { ...DEFAULT_OPTIONS, demoData: 'off', data: { ...DEFAULT_OPTIONS.data, source: 'data', sourceField: 'nope' } };
    const { onOptionsChange } = renderPanel(options);
    expect(screen.getByTestId('flow-data-empty')).toHaveTextContent('nope');
    expect(screen.queryByTestId('impact-demo-badge')).not.toBeInTheDocument();
    expect(onOptionsChange).not.toHaveBeenCalled();
  });

  it('renders the generated service graph with a badge when the frames carry no edges (default demo mode)', () => {
    const options: FlowOptions = { ...DEFAULT_OPTIONS, data: { ...DEFAULT_OPTIONS.data, source: 'data', sourceField: 'nope', showEdgeValues: true } };
    renderPanel(options);
    expect(screen.queryByTestId('flow-data-empty')).not.toBeInTheDocument();
    expect(screen.getByTestId('impact-demo-badge')).toBeInTheDocument();
    expect(screen.queryByTestId('flow-demo-hint')).not.toBeInTheDocument();
    expect(screen.getAllByTestId(/^flow-node-/).length).toBe(12);
    // Values go through the field pipeline; the generator carries no unit, so edge labels are plain numbers.
    expect(screen.getAllByTestId(/^flow-edge-/).length).toBeGreaterThan(0);
  });

  it('prefers real edges over demo data in "when no data" mode and ignores them in "always"', () => {
    renderData({ sourceField: 'source' });
    expect(screen.queryByTestId('impact-demo-badge')).not.toBeInTheDocument();
    expect(screen.getAllByTestId(/^flow-node-/).length).toBe(4);
    cleanup();
    const options: FlowOptions = { ...DEFAULT_OPTIONS, demoData: 'always', data: { ...DEFAULT_OPTIONS.data, source: 'data' } };
    renderPanel(options);
    expect(screen.getByTestId('impact-demo-badge')).toBeInTheDocument();
    expect(screen.getAllByTestId(/^flow-node-/).length).toBe(12);
  });

  it('persists a drag as a node override in "Data + manual overrides" mode and applies it', () => {
    const onOptionsChange = jest.fn();
    renderData({ source: 'overrides' }, onOptionsChange, { ...DEFAULT_OPTIONS.layout, editMode: true, snap: false });
    const node = screen.getByTestId('flow-node-db');
    const canvas = screen.getByTestId('flow-canvas');
    act(() => {
      fireEvent.pointerDown(node, { button: 0, clientX: 100, clientY: 100, pointerId: 1 });
      fireEvent.pointerMove(canvas, { clientX: 130, clientY: 150, pointerId: 1 });
      fireEvent.pointerUp(canvas, { clientX: 130, clientY: 150, pointerId: 1 });
    });
    expect(onOptionsChange).toHaveBeenCalledTimes(1);
    const next = onOptionsChange.mock.calls[0][0];
    expect(next.diagram).toEqual(DEFAULT_OPTIONS.diagram); // the manual diagram is untouched
    expect(Object.keys(next.data.overrides)).toEqual(['db']);
    expect(typeof next.data.overrides.db.x).toBe('number');

    // Re-render with the override: the node sits at the overridden spot.
    renderData({ source: 'overrides', overrides: { db: { x: 999, y: 7, color: 'red' } } });
    const moved = screen.getAllByTestId('flow-node-db').at(-1)!;
    expect(moved.getAttribute('transform')).toBe('translate(999,7)');
  });

  it('ignores the saved manual viewport in data modes and fits the diagram', () => {
    renderData({ source: 'overrides' }, jest.fn(), { ...DEFAULT_OPTIONS.layout, editMode: true }, { ...DEFAULT_OPTIONS.diagram, viewport: { x: 500, y: 500, zoom: 0.3 } });
    const chip = screen.getByText(/nodes · 4 edges|3 edges/);
    expect(chip).not.toHaveTextContent('30%');
    expect(screen.getAllByTestId(/^flow-node-/).length).toBe(4);
  });

  it('does not persist drags in plain "Data" mode', () => {
    const onOptionsChange = jest.fn();
    renderData({}, onOptionsChange, { ...DEFAULT_OPTIONS.layout, editMode: true });
    const node = screen.getByTestId('flow-node-db');
    const canvas = screen.getByTestId('flow-canvas');
    act(() => {
      fireEvent.pointerDown(node, { button: 0, clientX: 100, clientY: 100, pointerId: 1 });
      fireEvent.pointerMove(canvas, { clientX: 160, clientY: 150, pointerId: 1 });
      fireEvent.pointerUp(canvas, { clientX: 160, clientY: 150, pointerId: 1 });
    });
    expect(onOptionsChange).not.toHaveBeenCalled();
  });
});

describe('FlowPanel links and view-mode zoom', () => {
  const diagramWithLink = () => {
    const d = createExampleDiagram();
    d.nodes[0].link = '/own?id=${node.id}';
    return d;
  };

  it('opens the node link template on double-click in a new tab, URL-encoding tokens', () => {
    const open = jest.spyOn(window, 'open').mockImplementation(() => null);
    renderPanel({ links: { nodeUrl: '/d/impact-gauge?var-node=${node.id}&l=${node.label}', target: 'new', trigger: 'dblclick' } });
    fireEvent.doubleClick(screen.getByTestId('flow-node-grid'));
    expect(open).toHaveBeenCalledWith('/d/impact-gauge?var-node=grid&l=Grid%20import', '_blank', 'noopener,noreferrer');
    open.mockRestore();
  });

  it('prefers a manual node link, honours the click trigger and never fires in design mode', () => {
    const open = jest.spyOn(window, 'open').mockImplementation(() => null);
    renderPanel({ diagram: diagramWithLink(), links: { nodeUrl: '/d/t?n=${node.id}', target: 'new', trigger: 'click' } });
    fireEvent.click(screen.getByTestId('flow-node-solar'));
    expect(open).toHaveBeenLastCalledWith('/own?id=solar', '_blank', 'noopener,noreferrer');
    fireEvent.doubleClick(screen.getByTestId('flow-node-grid'));
    expect(open).toHaveBeenCalledTimes(1); // dblclick is not the trigger
    open.mockClear();
    renderPanel({ diagram: diagramWithLink(), layout: { ...DEFAULT_OPTIONS.layout, editMode: true }, links: { nodeUrl: '/d/t?n=${node.id}', target: 'new', trigger: 'click' } });
    fireEvent.click(screen.getAllByTestId('flow-node-solar').at(-1)!);
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it('zooms around the panel centre with the floating controls and fits again on double-click', () => {
    renderPanel();
    const chip = () => screen.getByTestId('flow-zoom-controls').textContent;
    const before = chip();
    fireEvent.click(screen.getByLabelText('Zoom in'));
    expect(chip()).not.toBe(before);
    const g = screen.getByTestId('flow-canvas').querySelector(':scope > g[transform]')!;
    const zoomed = g.getAttribute('transform');
    fireEvent.doubleClick(screen.getByTestId('flow-canvas'));
    expect(g.getAttribute('transform')).not.toBe(zoomed);
    expect(chip()).toBe(before);
  });

  it('hides the controls and ignores wheel/drag when Zoom and pan is off', () => {
    renderPanel({ interaction: { zoom: false } });
    expect(screen.queryByTestId('flow-zoom-controls')).not.toBeInTheDocument();
  });
});

describe('variable action', () => {
  it('shows the chip for the current value, clears it, and sets the variable on node double-click', () => {
    const partial = jest.spyOn(locationService, 'partial').mockImplementation(() => undefined);
    const vars = (s: string) => s.replace('${service}', 'battery');
    const { container } = renderPanel({ links: { nodeUrl: '', target: 'same', trigger: 'dblclick', action: 'variable', variable: 'service', variableValue: '${node.id}', variableClear: '' } }, jest.fn(), vars);
    expect(screen.getByTestId('flow-variable-chip')).toHaveTextContent('service = battery');
    fireEvent.click(screen.getByRole('button', { name: 'Clear service' }));
    expect(partial).toHaveBeenLastCalledWith({ 'var-service': '' });
    const solar = container.querySelector('[aria-label="Solar array"]');
    expect(solar).not.toBeNull();
    fireEvent.doubleClick(solar!);
    expect(partial).toHaveBeenLastCalledWith({ 'var-service': 'solar' });
    partial.mockRestore();
  });
});

describe('FlowPanel pruning and context menu', () => {
  const edgeFrame = () =>
    applyFieldOverrides({
      data: [
        toDataFrame({
          refId: 'A',
          fields: [
            { name: 'source', type: FieldType.string, values: ['web', 'api', 'api'] },
            { name: 'target', type: FieldType.string, values: ['api', 'db', 'cache'] },
            { name: 'Value', type: FieldType.number, values: [10, 4, 1], config: { unit: 'reqps' } },
            { name: 'target_group', type: FieldType.string, values: ['backend', 'data', 'data'] },
          ],
        }),
      ],
      fieldConfig: { defaults: {}, overrides: [] },
      replaceVariables: (v) => v,
      theme,
    });

  function renderData(
    partial: Partial<FlowOptions['data']> = {},
    extra: Partial<FlowOptions> = {},
    onOptionsChange = jest.fn()
  ) {
    const options: FlowOptions = {
      ...DEFAULT_OPTIONS,
      ...extra,
      data: { ...DEFAULT_OPTIONS.data, source: 'data', ...partial },
    };
    const props = {
      id: 1,
      data: { series: edgeFrame(), state: LoadingState.Done, timeRange: getDefaultTimeRange() },
      timeRange: getDefaultTimeRange(),
      timeZone: 'browser',
      options,
      onOptionsChange,
      fieldConfig: { defaults: {}, overrides: [] },
      onFieldConfigChange: jest.fn(),
      replaceVariables: (v: string) => v,
      width: 800,
      height: 500,
      transparent: false,
      renderCounter: 0,
      title: 'Flow',
      eventBus: {
        publish: jest.fn(),
        subscribe: jest.fn(),
        getStream: jest.fn(),
        removeAllListeners: jest.fn(),
        newScopedBus: jest.fn(),
      },
      onChangeTimeRange: jest.fn(),
    } as unknown as PanelProps<FlowOptions>;
    return { ...render(<FlowPanel {...props} />), onOptionsChange, options };
  }

  const nodeIds = () =>
    screen.getAllByTestId(/^flow-node-/).map((el) => el.getAttribute('data-testid')!.replace('flow-node-', ''));

  it('hides listed nodes and groups, shows the chip and clears both lists with "show"', () => {
    const { onOptionsChange } = renderData({ hidden: { nodes: ['db'], groups: [] } });
    expect(nodeIds().sort()).toEqual(['api', 'cache', 'web']);
    expect(screen.queryByTestId('flow-edge-api→db')).not.toBeInTheDocument();
    const chip = screen.getByTestId('flow-hidden-chip');
    expect(chip).toHaveTextContent('hidden 1');
    expect(screen.getByTestId('flow-notice')).toHaveTextContent('1 node hidden');
    fireEvent.click(screen.getByRole('button', { name: 'Show hidden items' }));
    expect(onOptionsChange).toHaveBeenCalledTimes(1);
    expect(onOptionsChange.mock.calls[0][0].data.hidden).toEqual({ nodes: [], groups: [] });
    cleanup();
    renderData({ hidden: { nodes: ['db'], groups: ['data'] } });
    expect(nodeIds().sort()).toEqual(['api', 'web']);
    expect(screen.getByTestId('flow-hidden-chip')).toHaveTextContent('hidden 2');
    cleanup();
    renderData();
    expect(screen.queryByTestId('flow-hidden-chip')).not.toBeInTheDocument();
  });

  it('applies the prune rules and reports what went in the notice', () => {
    renderData({ prune: { minValue: 2 } });
    expect(screen.queryByTestId('flow-node-cache')).not.toBeInTheDocument();
    expect(screen.getByTestId('flow-notice')).toHaveTextContent('1 edge below 2');
    cleanup();
    renderData({ prune: { collapseGroups: true } });
    expect(nodeIds().sort()).toEqual(['backend', 'data', 'web']);
    expect(screen.getByTestId('flow-edge-backend→data')).toBeInTheDocument();
    cleanup();
    renderData({ hidden: { nodes: ['web', 'api', 'db', 'cache'], groups: [] } });
    expect(screen.getByTestId('flow-pruned-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('flow-data-empty')).not.toBeInTheDocument();
  });

  it('opens a context menu on right-click with hide, collapse, variable and link items', () => {
    const partial = jest.spyOn(locationService, 'partial').mockImplementation(() => undefined);
    const { onOptionsChange } = renderData(
      {},
      {
        links: {
          nodeUrl: '',
          target: 'new',
          trigger: 'dblclick',
          action: 'variable',
          variable: 'service',
          variableValue: '${node.id}',
        },
      }
    );
    fireEvent.contextMenu(screen.getByTestId('flow-node-api'), { clientX: 120, clientY: 80 });
    expect(screen.getByText('Hide node')).toBeInTheDocument();
    expect(screen.getByText('Hide group backend')).toBeInTheDocument();
    expect(screen.getByText('Collapse groups')).toBeInTheDocument();
    expect(screen.getByText('Set service = api')).toBeInTheDocument();
    expect(screen.queryByText('Open link')).not.toBeInTheDocument(); // variable action: no URL template
    fireEvent.click(screen.getByText('Set service = api'));
    expect(partial).toHaveBeenLastCalledWith({ 'var-service': 'api' });
    expect(screen.queryByText('Hide node')).not.toBeInTheDocument(); // closed after a click

    fireEvent.contextMenu(screen.getByTestId('flow-node-api'), { clientX: 120, clientY: 80 });
    fireEvent.click(screen.getByText('Hide node'));
    expect(onOptionsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ hidden: { nodes: ['api'], groups: [] } }) })
    );

    fireEvent.contextMenu(screen.getByTestId('flow-node-db'), { clientX: 120, clientY: 80 });
    fireEvent.click(screen.getByText('Hide group data'));
    expect(onOptionsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ hidden: { nodes: [], groups: ['data'] } }) })
    );

    fireEvent.contextMenu(screen.getByTestId('flow-node-web'), { clientX: 120, clientY: 80 });
    expect(screen.queryByText(/Hide group/)).not.toBeInTheDocument(); // web has no group
    fireEvent.click(screen.getByText('Collapse groups'));
    expect(onOptionsChange.mock.calls.at(-1)[0].data.prune.collapseGroups).toBe(true);
    partial.mockRestore();
  });

  it('offers "Open link" with a URL template, hides groups from a group label, and closes on Escape or outside click', () => {
    const open = jest.spyOn(window, 'open').mockImplementation(() => null);
    const { onOptionsChange } = renderData(
      {},
      { links: { nodeUrl: '/d/x?n=${node.id}', target: 'new', trigger: 'dblclick' } }
    );
    fireEvent.contextMenu(screen.getByTestId('flow-node-db'), { clientX: 10, clientY: 10 });
    fireEvent.click(screen.getByText('Open link'));
    expect(open).toHaveBeenCalledWith('/d/x?n=db', '_blank', 'noopener,noreferrer');

    fireEvent.contextMenu(screen.getByTestId('flow-group-label-data'), { clientX: 10, clientY: 10 });
    expect(screen.queryByText('Hide node')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Hide group data'));
    expect(onOptionsChange.mock.calls.at(-1)[0].data.hidden.groups).toEqual(['data']);

    fireEvent.contextMenu(screen.getByTestId('flow-node-db'), { clientX: 10, clientY: 10 });
    fireEvent.keyDown(screen.getByText('Hide node'), { key: 'Escape' });
    expect(screen.queryByText('Hide node')).not.toBeInTheDocument();
    fireEvent.contextMenu(screen.getByTestId('flow-node-db'), { clientX: 10, clientY: 10 });
    expect(screen.getByText('Hide node')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText('Hide node')).not.toBeInTheDocument();
    open.mockRestore();
  });

  it('shows no menu in design mode or on manual diagrams', () => {
    renderData({}, { layout: { ...DEFAULT_OPTIONS.layout, editMode: true } });
    fireEvent.contextMenu(screen.getByTestId('flow-node-db'), { clientX: 10, clientY: 10 });
    expect(screen.queryByText('Hide node')).not.toBeInTheDocument();
    cleanup();
    renderPanel();
    fireEvent.contextMenu(screen.getByTestId('flow-node-solar'), { clientX: 10, clientY: 10 });
    expect(screen.queryByText('Hide node')).not.toBeInTheDocument();
    expect(screen.queryByTestId('flow-hidden-chip')).not.toBeInTheDocument();
  });
});
