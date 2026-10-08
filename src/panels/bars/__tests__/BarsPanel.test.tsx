import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FieldType, LoadingState, getDefaultTimeRange, toDataFrame, type PanelProps } from '@grafana/data';
import { BARS_NO_DATA_MESSAGE, BarsPanel } from '../BarsPanel';
import { DEFAULT_OPTIONS, type BarsOptions } from '../types';

jest.mock('@grafana/runtime', () => ({
  PanelDataErrorView: ({ message }: { message?: string }) => <div data-testid="no-data">{message ?? 'No data'}</div>,
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

  it('shows the no-data view with a helpful message when there are no rows and demo data is off', () => {
    renderPanel({ demoData: 'off' }, []);
    expect(screen.getByTestId('no-data')).toHaveTextContent(BARS_NO_DATA_MESSAGE);
    expect(screen.queryByTestId('impact-demo-badge')).not.toBeInTheDocument();
  });

  it('renders a generated device table showing every bar style with the badge when the query is empty', () => {
    renderPanel({}, []);
    expect(screen.queryByTestId('no-data')).not.toBeInTheDocument();
    expect(screen.getByTestId('impact-demo-badge')).toBeInTheDocument();
    expect(screen.getAllByRole('row').length).toBeGreaterThanOrEqual(13);
    expect(screen.getByText('Gateway')).toBeInTheDocument();
    expect(screen.getByText('Firewall')).toBeInTheDocument();
    for (const style of ['sweep', 'percent', 'segmented', 'striped', 'bidirectional', 'stacked', 'sparkline', 'pill']) {
      expect(document.querySelector(`[data-style="${style}"]`)).not.toBeNull();
    }
  });

  it('uses real data without the badge in when-no-data mode, and demo data in always', () => {
    renderPanel({ demoData: 'whenNoData' });
    expect(screen.getByText('Edge Gateway')).toBeInTheDocument();
    expect(screen.queryByTestId('impact-demo-badge')).not.toBeInTheDocument();
    cleanup();
    renderPanel({ demoData: 'always' });
    expect(screen.queryByText('Edge Gateway')).not.toBeInTheDocument();
    expect(screen.getByTestId('impact-demo-badge')).toBeInTheDocument();
  });
});

describe('BarsPanel data links', () => {
  /** A copy of the CSV frame whose name, progress and version fields carry data links (like the panel pipeline attaches). */
  function linkedFrame(nameOnClick?: jest.Mock) {
    const frame = toDataFrame({ ...csvFrame, fields: csvFrame.fields.map((f) => ({ ...f })) });
    const by = (name: string) => frame.fields.find((f) => f.name === name)!;
    by('name').getLinks = ({ valueRowIndex = 0 }) => [
      {
        href: `/d/device?row=${valueRowIndex}`,
        title: 'Open device',
        target: undefined,
        origin: by('name'),
        onClick: nameOnClick,
      },
      {
        href: `https://example.org/device/${valueRowIndex}`,
        title: 'Vendor page',
        target: '_blank',
        origin: by('name'),
      },
    ];
    by('progress').getLinks = ({ valueRowIndex = 0 }) =>
      valueRowIndex === 0
        ? [{ href: 'javascript:alert(1)', title: 'Nope', target: undefined, origin: by('progress') }]
        : [{ href: `/explore?row=${valueRowIndex}`, title: 'Explore', target: undefined, origin: by('progress') }];
    by('version').getLinks = ({ valueRowIndex = 0 }) => [
      { href: `/changelog/${valueRowIndex}`, title: 'Changelog', target: undefined, origin: by('version') },
    ];
    return frame;
  }
  const cellAnchor = (rowIdx: number, col: number) =>
    screen
      .getByTestId('impact-bars')
      .querySelector<HTMLAnchorElement>(`tbody tr:nth-child(${rowIdx + 1}) td:nth-child(${col}) a`);

  it('renders a link in every cell whose field has data links, ignoring unsafe schemes', () => {
    renderPanel({}, [linkedFrame()]);
    // columns: dot, name, bar, version, updated
    expect(cellAnchor(0, 2)).toHaveAttribute('href', '/d/device?row=0');
    expect(cellAnchor(0, 2)).toHaveAttribute('title', 'Open device');
    expect(cellAnchor(0, 2)).toHaveTextContent('Edge Gateway');
    // first row's value link uses an unsafe scheme: plain cell; second row links around the bar
    expect(cellAnchor(0, 3)).toBeNull();
    expect(cellAnchor(1, 3)).toHaveAttribute('href', '/explore?row=1');
    expect(cellAnchor(1, 3)?.querySelector('[data-style="segmented"]')).not.toBeNull();
    // extra column
    expect(cellAnchor(2, 4)).toHaveAttribute('href', '/changelog/2');
    expect(cellAnchor(2, 4)).toHaveTextContent('6.6.77');
    // time column has no links; status dot has none either
    expect(cellAnchor(0, 5)).toBeNull();
    expect(cellAnchor(0, 1)).toBeNull();
  });

  it('offers the further links of a field through a chevron menu', () => {
    renderPanel({}, [linkedFrame()]);
    const more = screen.getAllByRole('button', { name: 'More links for Edge Gateway' });
    expect(more).toHaveLength(1);
    fireEvent.click(more[0]);
    const items = screen.getAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual(['Open device', 'Vendor page']);
    expect(items[1].closest('a')).toHaveAttribute('href', 'https://example.org/device/0');
    expect(items[1].closest('a')).toHaveAttribute('target', '_blank');
  });

  it('links the whole row through the name link in the "name" row-click mode, own links and checkboxes win', () => {
    const onClick = jest.fn();
    renderPanel({ rowClick: 'name', showCheckbox: true, showStatusDot: false }, [linkedFrame(onClick)]);
    // columns: check, name, bar, version, updated
    const row = (i: number) => screen.getByTestId('impact-bars').querySelectorAll('tbody tr')[i];
    fireEvent.click(row(0).querySelector('td:nth-child(5)')!); // plain time cell -> name link
    expect(onClick).toHaveBeenCalledTimes(1);
    fireEvent.click(row(1).querySelector('td:nth-child(4) a')!); // extra column's own link
    expect(onClick).toHaveBeenCalledTimes(1);
    fireEvent.click(row(1).querySelector('input[type="checkbox"]')!);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/1 selected/)).toBeInTheDocument();
    // sorting still works with links in place
    fireEvent.click(screen.getByText('Name'));
    expect(cellAnchor(0, 2)).toHaveTextContent('Access Point 1');
  });

  it('keeps rows inert in the default row-click mode', () => {
    const onClick = jest.fn();
    renderPanel({}, [linkedFrame(onClick)]);
    const row = screen.getByTestId('impact-bars').querySelector('tbody tr')!;
    fireEvent.click(row.querySelector('td:nth-child(5)')!);
    expect(onClick).not.toHaveBeenCalled();
    fireEvent.click(cellAnchor(0, 2)!);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('links time-series rows from the series field', () => {
    const frame = toDataFrame({
      name: 'cpu',
      fields: [
        { name: 'time', type: FieldType.time, values: [1, 2, 3] },
        { name: 'Value', type: FieldType.number, values: [1, 2, 3] },
      ],
    });
    frame.fields[1].getLinks = () => [{ href: '/d/cpu', title: 'Series', target: undefined, origin: frame.fields[1] }];
    renderPanel({ barStyle: 'sparkline' }, [frame]);
    expect(cellAnchor(0, 2)).toHaveAttribute('href', '/d/cpu');
    expect(cellAnchor(0, 3)?.querySelector('[data-testid="impact-sparkline"]')).not.toBeNull();
    expect(cellAnchor(0, 4)).toHaveAttribute('href', '/d/cpu');
  });
});
