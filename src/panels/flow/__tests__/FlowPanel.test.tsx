import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { FieldType, LoadingState, applyFieldOverrides, createTheme, getDefaultTimeRange, toDataFrame, type PanelProps } from '@grafana/data';
import { FlowPanel } from '../FlowPanel';
import { createExampleDiagram } from '../lib/example';
import { DEFAULT_OPTIONS, type FlowOptions } from '../types';

const theme = createTheme();

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
    renderPanel({ diagram: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 }, grid: { show: true, size: 20, snap: true } } }, onOptionsChange);
    fireEvent.click(screen.getByText('Load example diagram'));
    expect(onOptionsChange).toHaveBeenCalledTimes(1);
    expect(onOptionsChange.mock.calls[0][0].diagram.nodes).toHaveLength(10);
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
