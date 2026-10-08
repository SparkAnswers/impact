import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FieldType, LoadingState, applyFieldOverrides, createTheme, getDefaultTimeRange, toDataFrame, type PanelProps } from '@grafana/data';
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

function renderPanel(partial: Partial<FlowOptions> = {}, onOptionsChange = jest.fn()) {
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
    replaceVariables: (v: string) => v,
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
