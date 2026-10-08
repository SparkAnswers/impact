import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { dateTime, FieldType, LoadingState, type PanelProps, toDataFrame } from '@grafana/data';
import { GAUGE_NO_DATA_MESSAGE, GaugePanel } from '../GaugePanel';
import { DEFAULT_OPTIONS, type GaugeOptions } from '../types';

jest.mock('@grafana/runtime', () => ({
  PanelDataErrorView: ({ message }: { message?: string }) => <div data-testid="error-view">{message ?? 'no data'}</div>,
  locationService: { getSearchObject: () => ({ refresh: '10s' }) },
}));

/** A canvas 2D context stub that records every call so the draw code can run under jsdom. */
function makeContext() {
  const calls: Record<string, number> = {};
  const gradient = { addColorStop: jest.fn() };
  const ctx = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'measureText') {
          return (txt: string) => ({ width: txt.length * 7 });
        }
        if (prop === 'createLinearGradient') {
          return () => gradient;
        }
        if (prop === 'canvas') {
          return {};
        }
        return (..._args: unknown[]) => {
          calls[prop] = (calls[prop] ?? 0) + 1;
        };
      },
      set() {
        return true;
      },
    }
  );
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

function randomWalkFrame(n = 120) {
  let v = 20;
  const values: number[] = [];
  const times: number[] = [];
  const t0 = Date.now() - (n - 1) * 1000;
  for (let i = 0; i < n; i++) {
    v += (Math.random() - 0.5) * 30;
    if (i === n - 1) {
      v = -12.5;
    }
    values.push(v);
    times.push(t0 + i * 1000);
  }
  return toDataFrame({
    fields: [
      { name: 'time', type: FieldType.time, values: times },
      { name: 'power', type: FieldType.number, values, config: { unit: 'kwatt', min: -50, max: 200, decimals: 1 } },
    ],
  });
}

function makeProps(options: Partial<GaugeOptions>, width = 400, height = 400): PanelProps<GaugeOptions> {
  const frame = randomWalkFrame();
  const timeRange = { from: dateTime(Date.now() - 120000), to: dateTime(Date.now()), raw: { from: 'now-2m', to: 'now' } };
  return {
    id: 1,
    width,
    height,
    options: { ...DEFAULT_OPTIONS, ...options },
    fieldConfig: { defaults: {}, overrides: [] },
    data: { series: [frame], state: LoadingState.Done, timeRange },
    timeRange,
    timeZone: 'utc',
    transparent: false,
    renderCounter: 0,
    title: 'Gauge',
    eventBus: { publish: jest.fn(), subscribe: jest.fn(), getStream: jest.fn(), removeAllListeners: jest.fn(), newScopedBus: jest.fn() } as never,
    replaceVariables: (s: string) => s.replace('$host', 'srv1'),
    onOptionsChange: jest.fn(),
    onFieldConfigChange: jest.fn(),
    onChangeTimeRange: jest.fn(),
  };
}

describe('GaugePanel', () => {
  let calls: Record<string, number>;
  beforeEach(() => {
    const made = makeContext();
    calls = made.calls;
    HTMLCanvasElement.prototype.getContext = jest.fn(() => made.ctx) as never;
  });

  it('renders a canvas and draws arcs, history and text for a random walk', () => {
    render(<GaugePanel {...makeProps({ animate: false, subtitleText: 'Host $host' })} />);
    const canvas = screen.getByTestId('impact-gauge-canvas');
    expect(canvas).toBeInTheDocument();
    expect(canvas.getAttribute('aria-label')).toMatch(/Gauge -12\.5\s*kW/);
    expect(calls.arc).toBeGreaterThan(2);
    expect(calls.fillText).toBeGreaterThan(3);
    expect(calls.createLinearGradient ?? 0).toBeGreaterThanOrEqual(0);
    // outer box clip + circular ring clip + one clip per sign half
    expect(calls.clip).toBe(4);
  });

  it('renders with thresholds, custom ticks and no animation', () => {
    const props = makeProps({ animate: false, colorMode: 'thresholds', historyColorMode: 'thresholds', tickMode: 'custom', tickValues: '-50,0,100,200' });
    props.data.series[0].fields[1].config.thresholds = {
      mode: 'absolute' as never,
      steps: [
        { value: -Infinity, color: 'green' },
        { value: 50, color: 'orange' },
        { value: 120, color: 'red' },
      ],
    };
    render(<GaugePanel {...props} />);
    expect(screen.getByTestId('impact-gauge-canvas')).toBeInTheDocument();
    expect(calls.arc).toBeGreaterThan(3);
  });

  it('hides text in tiny panels but still draws the ring', () => {
    render(<GaugePanel {...makeProps({ animate: false }, 80, 80)} />);
    expect(calls.arc).toBeGreaterThan(0);
    expect(calls.fillText ?? 0).toBe(0);
  });

  it('shows the error view with a helpful message without numeric data when demo data is off', () => {
    const props = makeProps({ demoData: 'off' });
    props.data.series = [toDataFrame({ fields: [{ name: 's', type: FieldType.string, values: ['a'] }] })];
    render(<GaugePanel {...props} />);
    expect(screen.getByTestId('error-view')).toHaveTextContent(GAUGE_NO_DATA_MESSAGE);
    expect(screen.queryByTestId('impact-demo-badge')).not.toBeInTheDocument();
  });

  it('renders generated demo data with the badge when the query is empty (default: when no data)', () => {
    const props = makeProps({});
    props.data.series = [];
    // Units come from the panel's standard options, also for generated data.
    props.fieldConfig = { defaults: { unit: 'kwatt', decimals: 1 }, overrides: [] };
    render(<GaugePanel {...props} />);
    expect(screen.queryByTestId('error-view')).not.toBeInTheDocument();
    expect(screen.getByTestId('impact-demo-badge')).toBeInTheDocument();
    expect(screen.getByTestId('impact-gauge-canvas').getAttribute('aria-label')).toMatch(/^Gauge -?\d/);
    expect(calls.arc).toBeGreaterThan(0);
  });

  it('ignores the query in always and hides the badge below 160 px', () => {
    render(<GaugePanel {...makeProps({ demoData: 'always' })} />);
    // The real frame's latest value is -12.5; demo data shows something else.
    expect(screen.getByTestId('impact-gauge-canvas').getAttribute('aria-label')).not.toContain('-12.5');
    expect(screen.getByTestId('impact-demo-badge')).toBeInTheDocument();
    cleanup();
    render(<GaugePanel {...makeProps({ demoData: 'always' }, 150, 150)} />);
    expect(screen.queryByTestId('impact-demo-badge')).not.toBeInTheDocument();
  });

  it('keeps real data and no badge when the query has data in when-no-data mode', () => {
    render(<GaugePanel {...makeProps({ demoData: 'whenNoData' })} />);
    expect(screen.getByTestId('impact-gauge-canvas').getAttribute('aria-label')).toContain('-12.5');
    expect(screen.queryByTestId('impact-demo-badge')).not.toBeInTheDocument();
  });

  it('runs the shared frame loop in live mode and redraws the live layer per frame', () => {
    let frameCb: ((t: number) => void) | null = null;
    const raf = jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frameCb = cb;
      return 1;
    });
    const caf = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    const { unmount } = render(<GaugePanel {...makeProps({ animate: true })} />);
    expect(raf).toHaveBeenCalled();
    const before = calls.arc ?? 0;
    expect(frameCb).not.toBeNull();
    frameCb!(16);
    frameCb!(32);
    expect(calls.arc).toBeGreaterThan(before);
    // The big number is drawn from the real sample, never eased.
    expect(screen.getByTestId('impact-gauge-canvas').getAttribute('aria-label')).toMatch(/-12\.5/);
    unmount();
    expect(caf).toHaveBeenCalled();
    raf.mockRestore();
    caf.mockRestore();
  });

  it('does not subscribe to frames when live motion is off', () => {
    const raf = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    render(<GaugePanel {...makeProps({ animate: true, liveScroll: false, liveDrift: false, liveTrail: false, liveStale: false })} />);
    expect(raf).not.toHaveBeenCalled();
    raf.mockRestore();
  });
});
