import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FieldType, LoadingState, getDefaultTimeRange, toDataFrame, type PanelProps } from '@grafana/data';
import { BarsPanel } from '../BarsPanel';
import { DEFAULT_OPTIONS, type BarsOptions } from '../types';

jest.mock('@grafana/runtime', () => ({
  PanelDataErrorView: () => <div data-testid="no-data">No data</div>,
}));

// Equivalent of the testdata "CSV content" scenario after parsing.
const csvFrame = toDataFrame({
  name: 'devices',
  fields: [
    { name: 'name', type: FieldType.string, values: ['Edge Gateway', 'Core Switch', 'Access Point 1', 'Backup Store'] },
    {
      name: 'progress',
      type: FieldType.number,
      values: [42, 78, 94, 61],
      config: { unit: 'percent', min: 0, max: 100 },
    },
    { name: 'status', type: FieldType.string, values: ['ok', 'warn', 'crit', 'updating'] },
    { name: 'style', type: FieldType.string, values: ['percent', 'segmented', 'pill', 'striped'] },
    { name: 'version', type: FieldType.string, values: ['5.2.0', '7.0.50', '6.6.77', '3.9.1'] },
    {
      name: 'updated',
      type: FieldType.time,
      values: [Date.now() - 60_000, Date.now(), Date.now() - 3_600_000, Date.now()],
    },
  ],
});

function renderPanel(options: Partial<BarsOptions> = {}, series = [csvFrame]) {
  const props = {
    id: 1,
    data: { series, state: LoadingState.Done, timeRange: getDefaultTimeRange() },
    timeRange: getDefaultTimeRange(),
    timeZone: 'browser',
    options: { ...DEFAULT_OPTIONS, ...options },
    fieldConfig: { defaults: {}, overrides: [] },
    width: 900,
    height: 400,
    transparent: false,
    renderCounter: 0,
    title: 'Bars',
    eventBus: {
      publish: jest.fn(),
      subscribe: jest.fn(),
      getStream: jest.fn(),
      removeAllListeners: jest.fn(),
      newScopedBus: jest.fn(),
    },
    onOptionsChange: jest.fn(),
    onFieldConfigChange: jest.fn(),
    replaceVariables: (s: string) => s,
    onChangeTimeRange: jest.fn(),
  } as unknown as PanelProps<BarsOptions>;
  return render(<BarsPanel {...props} />);
}

describe('BarsPanel', () => {
  it('renders a row per CSV row with the per-row style and extra columns', () => {
    renderPanel({ showCheckbox: true });
    expect(screen.getByText('Edge Gateway')).toBeInTheDocument();
    expect(screen.getByText('7.0.50')).toBeInTheDocument();
    const root = screen.getByTestId('impact-bars');
    expect(root.querySelectorAll('tbody tr')).toHaveLength(4);
    expect(root.querySelector('[data-style="percent"]')).not.toBeNull();
    expect(root.querySelector('[data-style="segmented"]')).not.toBeNull();
    expect(root.querySelector('[data-style="pill"]')).toHaveTextContent('crit');
    expect(root.querySelector('[data-style="striped"]')).not.toBeNull();
    // header + status dots + updated column + footer
    expect(screen.getByText('Updated')).toBeInTheDocument();
    expect(screen.getAllByTestId('impact-dot')).toHaveLength(4);
    expect(screen.getByText(/4 rows/)).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(5);
  });

  it('sorts when a header is clicked and reports it in the footer', () => {
    renderPanel();
    const names = () =>
      Array.from(screen.getByTestId('impact-bars').querySelectorAll('tbody tr td:nth-child(2)')).map(
        (td) => td.textContent
      );
    expect(names()[0]).toBe('Edge Gateway');
    fireEvent.click(screen.getByText('Name'));
    expect(names()).toEqual(['Access Point 1', 'Backup Store', 'Core Switch', 'Edge Gateway']);
    fireEvent.click(screen.getByText('Name'));
    expect(names()[0]).toBe('Edge Gateway');
    expect(screen.getByText(/sorted by Name/)).toBeInTheDocument();
  });

  it('applies a default sort from options', () => {
    renderPanel({ defaultSortField: 'progress', defaultSortDesc: true });
    const first = screen.getByTestId('impact-bars').querySelector('tbody tr td:nth-child(2)');
    expect(first).toHaveTextContent('Access Point 1');
  });

  it('renders rows with sparklines from time series input', () => {
    const ts = ['Edge Gateway', 'Core Switch'].map((name) =>
      toDataFrame({
        name,
        fields: [
          { name: 'time', type: FieldType.time, values: [1, 2, 3, 4] },
          { name: 'Value', type: FieldType.number, values: [1, 3, 2, 4] },
        ],
      })
    );
    renderPanel({ barStyle: 'sparkline' }, ts);
    expect(screen.getAllByTestId('impact-sparkline')).toHaveLength(2);
    expect(screen.getByText('Core Switch')).toBeInTheDocument();
  });

  it('paints no table fill unless the Solid colour background is chosen', () => {
    renderPanel();
    let root = screen.getByTestId('impact-bars');
    const panelRootClass = root.className;
    const panelTableClass = root.querySelector('table')?.className;
    expect(root.dataset.background).toBe('panel');
    expect(root.style.backgroundColor).toBe('');
    cleanup();

    renderPanel({ background: 'transparent' });
    root = screen.getByTestId('impact-bars');
    expect(root.dataset.background).toBe('transparent');
    expect(root.className).toBe(panelRootClass);
    expect(root.querySelector('table')?.className).not.toBe(panelTableClass);
    cleanup();

    renderPanel({ background: 'solid', backgroundColor: 'dark-blue' });
    root = screen.getByTestId('impact-bars');
    expect(root.className).not.toBe(panelRootClass);
    expect(root.querySelector('table')?.className).toBe(panelTableClass);
    expect(root.style.getPropertyValue('--pb-bg')).not.toBe('');
  });

  it('shows the no-data view when there are no rows', () => {
    renderPanel({}, []);
    expect(screen.getByTestId('no-data')).toBeInTheDocument();
  });
});
