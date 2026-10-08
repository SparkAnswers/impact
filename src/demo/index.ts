// Bundled demo dashboards. The JSON files are generated from provisioning/dashboards/impact by
// `node scripts/sync-demo-dashboards.mjs`; do not edit them by hand. They are loaded lazily so the
// Gallery chunk stays small until someone clicks "Install".
import type { DemoDashboardJson } from '../app/installDemos';

export type DemoId = 'showcase' | 'flow' | 'gauge' | 'river' | 'bars';

export interface DemoDashboardMeta {
  id: DemoId;
  /** Dashboard uid as stored in the JSON (`impact-<id>`). */
  uid: string;
  title: string;
}

export const DEMO_DASHBOARDS: DemoDashboardMeta[] = [
  { id: 'showcase', uid: 'impact-showcase', title: 'Impact showcase' },
  { id: 'flow', uid: 'impact-flow', title: 'Impact Flow Designer demo' },
  { id: 'gauge', uid: 'impact-gauge', title: 'Impact Gauge demo' },
  { id: 'river', uid: 'impact-river', title: 'Impact Flow River demo' },
  { id: 'bars', uid: 'impact-bars', title: 'Impact Status Bars demo' },
];

const loaders: Record<DemoId, () => Promise<{ default: DemoDashboardJson }>> = {
  showcase: () => import('./dashboards/showcase.json'),
  flow: () => import('./dashboards/flow.json'),
  gauge: () => import('./dashboards/gauge.json'),
  river: () => import('./dashboards/river.json'),
  bars: () => import('./dashboards/bars.json'),
};

/** Loads the bundled dashboard JSON (with the `${DS_TESTDATA}` datasource placeholder still in place). */
export async function loadDemoDashboard(id: DemoId): Promise<DemoDashboardJson> {
  const mod = await loaders[id]();
  return mod.default;
}
