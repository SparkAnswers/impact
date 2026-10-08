import React from 'react';
import { render, screen } from '@testing-library/react';
import { type DataFrame, FieldType, LoadingState, type PanelProps, getDefaultTimeRange, toDataFrame } from '@grafana/data';
import { RiverPanel } from '../RiverPanel';
import { DEFAULT_OPTIONS, type RiverOptions, createChannel } from '../types';
import { presetWaypoints } from '../lib/path';

jest.mock('@grafana/runtime', () => ({
  PanelDataErrorView: () => <div data-testid="error-view">No data</div>,
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
    render(<RiverPanel {...makeProps({}, [])} />);
    expect(screen.getByTestId('error-view')).toBeInTheDocument();
  });

  it('renders with default options and no channels configured', () => {
    render(<RiverPanel {...makeProps({ showLegend: false, captionValue: false }, series)} />);
    expect(screen.getByTestId('river-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('river-legend')).not.toBeInTheDocument();
  });
});
