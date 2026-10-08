// "Use with your data" guidance shown on the Gallery: what each panel reads and copy-ready example queries.
// Metric names are generic (no vendor, host or site names) so they are safe to paste and adapt.

export interface DataShape {
  /** One or two sentences on the query shape the panel wants. */
  summary: string;
  /** Bullet points: which fields/series are read and how. */
  reads: string[];
  /** Prometheus-style query (PromQL), with format hints where the panel needs a table. */
  prometheus: { query: string; note?: string };
  /** TestData query as JSON (the `targets[0]` object of a panel). */
  testdata: { query: Record<string, unknown>; note?: string };
}

export const DATA_SHAPES: Record<'flow' | 'gauge' | 'river' | 'bars', DataShape> = {
  gauge: {
    summary: 'Any numeric time series. The last value fills the ring, the whole series draws the in-ring history.',
    reads: [
      'First numeric field of the first frame (override with the Value field option).',
      'Unit, decimals, min, max and thresholds come from Standard options.',
      'Signed values are fine: the fill grows one way for positive and the other way for negative.',
    ],
    prometheus: {
      query: 'sum(site_net_power_watts) / 1000',
      note: 'Format: Time series. Set unit "kW", min -20, max 20 under Standard options.',
    },
    testdata: {
      query: { scenarioId: 'random_walk', alias: 'power', min: -20, max: 20, spread: 2, noise: 0.3 },
      note: 'Or scenario "CSV wave" for a repeatable curve.',
    },
  },
  river: {
    summary:
      'One or more time series. Each series becomes a channel: oldest sample at the start of the river, newest at the end.',
    reads: [
      'With no channels configured: first numeric field of the first frame.',
      'With channels: bind each one to a refId, frame name or field display name.',
      'Colour scale follows the field thresholds or colour scheme.',
    ],
    prometheus: {
      query: 'sum(rate(http_requests_total[5m]))',
      note: 'Add a second query (e.g. sum(rate(http_requests_total{status=~"5.."}[5m]))) for a second channel.',
    },
    testdata: {
      query: { scenarioId: 'random_walk', seriesCount: 2, min: 0, max: 16, spread: 1.3, alias: 'current' },
    },
  },
  bars: {
    summary:
      'Either a table (one row per entity: name, value, status, ...) or several time series (one row per series with a sparkline).',
    reads: [
      'Table mode: first string field = name, first number field = bar, fields named status/style/updated/trend are picked up automatically.',
      'Time series mode: each numeric series is a row; the reducer (last by default) gives the bar value.',
      'Value mappings colour the status dot and pill text.',
    ],
    prometheus: {
      query: 'max by (device) (device_battery_percent)',
      note: 'Format: Table, Type: Instant. Add "label_replace" or a Rename-by-regex transformation to tidy names.',
    },
    testdata: {
      query: {
        scenarioId: 'csv_content',
        csvContent:
          'name,progress,status,style,updated\nGateway,,warn,sweep,2026-10-07T09:58:00Z\nRouter,42,ok,percent,2026-10-07T09:56:00Z\nSwitch,78,warn,segmented,2026-10-07T09:49:00Z\nStore,61,updating,striped,2026-10-07T10:00:00Z\nCharger,1.6,ok,bidirectional,2026-10-07T09:59:55Z\n',
      },
      note: 'Or scenario "Random Walk" with Series count 6 for time-series mode.',
    },
  },
  flow: {
    summary:
      'No data is required to draw a diagram. Live values come from numeric fields whose display name matches a node or edge binding. Edge frames with source/target/value are the shape to use when the diagram follows the data.',
    reads: [
      'Nodes: last non-null value of the field named in "Value field" (an alias or series name).',
      'Edges: the bound field drives particle speed, width or colour; negative values can reverse the flow.',
      'Edge frames: string fields "source" and "target" plus a numeric "value" (one row per edge).',
    ],
    prometheus: {
      query: 'sum(rate(service_requests_total[5m])) by (source, target)',
      note: 'Format: Table, Type: Instant for edge frames. For node values use one query per node with a legend alias (e.g. {{service}}).',
    },
    testdata: {
      query: { scenarioId: 'random_walk', alias: 'solar_kw', min: 0, max: 20, startValue: 12, spread: 1.5 },
      note: 'Repeat with aliases battery_kw, grid_kw, load_kw and bind nodes/edges to those names.',
    },
  },
};

/** Pretty-printed TestData target JSON, ready to paste into a panel's query inspector. */
export function testdataExample(shape: DataShape): string {
  return JSON.stringify(
    { refId: 'A', datasource: { type: 'grafana-testdata-datasource' }, ...shape.testdata.query },
    null,
    2
  );
}
