import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { type DataFrame, FieldType, LoadingState, type PanelProps, getDefaultTimeRange, toDataFrame } from '@grafana/data';
import { RIVER_NO_DATA_MESSAGE, RiverPanel } from '../RiverPanel';
import { DEFAULT_OPTIONS, type RiverOptions, createChannel } from '../types';
import { presetWaypoints } from '../lib/path';
import { demoNetworkFrames } from '../lib/network';

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

jest.mock('@grafana/runtime', () => ({
  PanelDataErrorView: ({ message }: { message?: string }) => <div data-testid="error-view">{message ?? 'No data'}</div>,
}));

const frame = (refId: string, name: string, values: number[]): DataFrame =>
  toDataFrame({
    refId,
    fields: [
      { name: 'time', type: FieldType.time, values: values.map((_, i) => i * 1000) },
      { name, type: FieldType.number, values, config: { unit: 'short' } },
    ],
  });

function makeProps(options: Partial<RiverOptions>, series: DataFrame[]): PanelProps<RiverOptions> {
  return {
    id: 1,
    data: { state: LoadingState.Done, series, timeRange: getDefaultTimeRange() },
    timeRange: getDefaultTimeRange(),
    timeZone: 'utc',
    options: { ...DEFAULT_OPTIONS, ...options },
    fieldConfig: { defaults: {}, overrides: [] },
    transparent: false,
    width: 600,
    height: 300,
    replaceVariables: (s: string) => s.replace('$name', 'Narrows'),
    onOptionsChange: jest.fn(),
    onFieldConfigChange: jest.fn(),
    onChangeTimeRange: jest.fn(),
    renderCounter: 0,
    title: 'Impact river',
    eventBus: { publish: jest.fn(), subscribe: jest.fn(), getStream: jest.fn(), removeAllListeners: jest.fn(), newScopedBus: jest.fn() } as any,
  } as unknown as PanelProps<RiverOptions>;
}

describe('RiverPanel', () => {
  const series = [frame('A', 'intake', [1, 4, 9, 12]), frame('B', 'outlet', [5, 3, 2, 1])];

  it('renders two auto-bound channels with legend, title and labels', () => {
    const props = makeProps(
      {
        title: 'Flow at $name: {value}',
        subtitle: 'two streams',
        caption: 'Narrows',
        channels: [
          createChannel({ id: 'a', name: 'Intake', path: presetWaypoints('horizontal'), labels: [{ text: 'Mouth', at: 0.1, side: 'left' }] }),
          createChannel({ id: 'b', name: 'Outlet', path: presetWaypoints('diagonal') }),
        ],
      },
      series
    );
    render(<RiverPanel {...props} />);
    expect(screen.getByTestId('river-panel')).toBeInTheDocument();
    expect(screen.getByText('Flow at Narrows: 12')).toBeInTheDocument();
    expect(screen.getByText('two streams')).toBeInTheDocument();
    expect(screen.getByText('Mouth')).toBeInTheDocument();
    expect(screen.getByTestId('river-legend')).toBeInTheDocument();
    expect(screen.getByText('Intake')).toBeInTheDocument();
    expect(screen.queryByTestId('river-path-editor')).not.toBeInTheDocument();
  });

  it('shows the path editor for channels in edit mode and the error view without data', () => {
    const props = makeProps({ channels: [createChannel({ id: 'a', path: presetWaypoints('u'), editPath: true })] }, series);
    render(<RiverPanel {...props} />);
    expect(screen.getByTestId('river-path-editor')).toBeInTheDocument();
    render(<RiverPanel {...makeProps({ demoData: 'off' }, [])} />);
    expect(screen.getByTestId('error-view')).toHaveTextContent(RIVER_NO_DATA_MESSAGE);
    expect(screen.queryByTestId('impact-demo-badge')).not.toBeInTheDocument();
  });

  it('renders generated demo data with the badge when the query is empty (default: when no data)', () => {
    render(<RiverPanel {...makeProps({ caption: 'Now', captionValue: true }, [])} />);
    expect(screen.queryByTestId('error-view')).not.toBeInTheDocument();
    expect(screen.getByTestId('river-panel')).toBeInTheDocument();
    expect(screen.getByTestId('impact-demo-badge')).toBeInTheDocument();
    // Demo series carry no unit of their own; the caption shows a plain number from the field pipeline.
    expect(screen.getAllByText(/\d/).length).toBeGreaterThan(0);
  });

  it('shows real data without the badge in when-no-data mode and demo data in always', () => {
    const { unmount } = render(<RiverPanel {...makeProps({ captionValue: true, caption: 'x' }, series)} />);
    expect(screen.queryByTestId('impact-demo-badge')).not.toBeInTheDocument();
    unmount();
    render(<RiverPanel {...makeProps({ demoData: 'always' }, series)} />);
    expect(screen.getByTestId('impact-demo-badge')).toBeInTheDocument();
  });

  it('renders with default options and no channels configured', () => {
    render(<RiverPanel {...makeProps({ showLegend: false, captionValue: false }, series)} />);
    expect(screen.getByTestId('river-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('river-legend')).not.toBeInTheDocument();
  });
});

describe('RiverPanel network focus', () => {
  it('a node click isolates its chain, the chip leads back, Esc clears, Edit on canvas disables the clicks', () => {
    const props = makeProps({ channelSource: 'network', title: 'Net' }, demoNetworkFrames(0));
    const { rerender } = render(<RiverPanel {...props} />);
    expect(screen.getAllByTestId(/^river-focus-node-/)).toHaveLength(10);
    expect(screen.queryByTestId('river-focus-chip')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('river-focus-node-storage'));
    // The chain through storage reaches 9 of the 10 nodes (reverse pairs lead back up); access-1 is the one left out.
    expect(screen.getAllByTestId(/^river-focus-node-/)).toHaveLength(9);
    expect(screen.queryByTestId('river-focus-node-access-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('river-focus-chip').textContent).toContain('9 of 10');
    // A second focus stacks; back pops one level.
    fireEvent.click(screen.getByTestId('river-focus-node-dist-3'));
    expect(screen.getByTestId('river-focus-chip').textContent).toContain('DIST 3');
    fireEvent.click(screen.getByLabelText('Back from the focus'));
    expect(screen.getByTestId('river-focus-chip').textContent).toContain('STORAGE');
    fireEvent.keyDown(screen.getByTestId('river-panel'), { key: 'Escape' });
    expect(screen.queryByTestId('river-focus-chip')).not.toBeInTheDocument();
    expect(screen.getAllByTestId(/^river-focus-node-/)).toHaveLength(10);
    rerender(<RiverPanel {...makeProps({ channelSource: 'network', network: { editNodes: true } as any }, demoNetworkFrames(0))} />);
    expect(screen.queryAllByTestId(/^river-focus-node-/)).toHaveLength(0);
    rerender(<RiverPanel {...makeProps({ channelSource: 'network', network: { clickFocus: false } as any }, demoNetworkFrames(0))} />);
    expect(screen.queryAllByTestId(/^river-focus-node-/)).toHaveLength(0);
  });
});

describe('RiverPanel zoom and pan', () => {
  it('Ctrl + wheel zooms at the pointer, the overlays follow, Back and double-click reset, Zoom and pan off disables it', () => {
    const props = makeProps({ channelSource: 'network', title: 'Net' }, demoNetworkFrames(0));
    const { rerender } = render(<RiverPanel {...props} />);
    const panel = screen.getByTestId('river-panel');
    const world = () => screen.getByTestId('river-world').style.transform;
    expect(world()).toBe('translate(0px, 0px) scale(1)');
    expect(screen.queryByTestId('river-zoom-chip')).not.toBeInTheDocument();
    // A plain wheel scrolls the dashboard: nothing happens.
    fireEvent.wheel(panel, { deltaY: -100, clientX: 100, clientY: 100 });
    expect(world()).toBe('translate(0px, 0px) scale(1)');
    fireEvent.wheel(panel, { deltaY: -100, clientX: 100, clientY: 100, ctrlKey: true });
    expect(world()).toContain('scale(1.25)');
    expect(screen.getByTestId('river-zoom-chip').textContent).toContain('125%');
    fireEvent.click(screen.getByLabelText('Back to the full view'));
    expect(world()).toBe('translate(0px, 0px) scale(1)');
    // The +/- control and a double-click on empty space.
    fireEvent.click(screen.getByLabelText('Zoom in'));
    expect(world()).toContain('scale(1.25)');
    fireEvent.doubleClick(panel);
    expect(world()).toBe('translate(0px, 0px) scale(1)');
    // Dragging pans (after a few pixels).
    fireEvent.pointerDown(panel, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(panel, { pointerId: 1, clientX: 140, clientY: 110 });
    fireEvent.pointerUp(panel, { pointerId: 1, clientX: 140, clientY: 110 });
    expect(world()).toBe('translate(40px, 10px) scale(1)');
    // Option off: no zoom, no controls, view reset.
    rerender(<RiverPanel {...makeProps({ channelSource: 'network', interaction: { zoom: false } }, demoNetworkFrames(0))} />);
    expect(world()).toBe('translate(0px, 0px) scale(1)');
    fireEvent.wheel(panel, { deltaY: -100, clientX: 100, clientY: 100, ctrlKey: true });
    expect(world()).toBe('translate(0px, 0px) scale(1)');
    expect(screen.queryByLabelText('Zoom in')).not.toBeInTheDocument();
  });
});
