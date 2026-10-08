// Wiring between a panel and the demo generators: decides when demo data should replace the query
// result and pushes the generated frames through the same field-config pipeline Grafana applies to
// real data, so units, decimals, min/max, thresholds, colours and overrides all behave identically.
import { useMemo } from 'react';
import {
  applyFieldOverrides,
  FieldType,
  type DataFrame,
  type FieldConfigSource,
  type GrafanaTheme2,
  type InterpolateFunction,
  type PanelData,
  type TimeRange,
} from '@grafana/data';
import type { TimeZone } from '@grafana/schema';

/** The "Data > Demo data" option shared by the panels. */
export type DemoMode = 'off' | 'whenNoData' | 'always';

export const DEMO_MODE_CHOICES: Array<{ value: DemoMode; label: string }> = [
  { value: 'off', label: 'Off' },
  { value: 'whenNoData', label: 'When no data' },
  { value: 'always', label: 'Always' },
];

export const DEMO_MODE_DESCRIPTION =
  'Built-in generated data so the panel looks right with no query. When no data: used only when the query returns nothing usable. Always: ignores the query. Off: never.';

/** Normalises a stored option value (missing on panels saved before the option existed). */
export function isDemoMode(value: unknown): value is DemoMode {
  return value === 'off' || value === 'whenNoData' || value === 'always';
}

/** Rolling window the generator should fill: ends at `now`, `durationMs` long, `stepMs` cadence. */
export interface DemoWindow {
  /** Epoch ms of the newest sample (the end of the panel time range, or the wall clock). */
  now: number;
  /** Epoch ms of the oldest sample. */
  from: number;
  durationMs: number;
  /** Suggested cadence: 1 s for ranges up to about 3 hours, then coarser so the window stays near 10k points. */
  stepMs: number;
}

export type DemoGenerator = (window: DemoWindow) => DataFrame[];

export interface DemoDeps {
  fieldConfig: FieldConfigSource;
  replaceVariables: InterpolateFunction;
  theme: GrafanaTheme2;
  timeZone?: TimeZone;
  /**
   * The panel's time range. Preferred over `data.timeRange` as the anchor because it is re-evaluated on
   * every dashboard refresh even for a panel without queries.
   */
  timeRange?: TimeRange;
  /** Decides whether the real series are usable; default: any frame with rows and a numeric or string field. */
  isUsable?: (series: DataFrame[]) => boolean;
}

/** Minimum window so stream / live-motion modes have something to play. */
export const DEMO_MIN_DURATION_MS = 15 * 60_000;
/** Points the window aims for before the cadence gets coarser than 1 s. */
const DEMO_TARGET_POINTS = 10_000;

/** Default usability test: at least one frame with rows and a numeric or string field. */
export function hasUsableData(series: DataFrame[] | undefined): boolean {
  if (!series || series.length === 0) {
    return false;
  }
  return series.some(
    (f) => f.length > 0 && f.fields.some((fld) => fld.type === FieldType.number || fld.type === FieldType.string)
  );
}

/** Builds the rolling window from a time range (ms); either bound may be missing. */
export function demoWindow(fromMs: number | undefined, toMs: number | undefined, wallClock = Date.now()): DemoWindow {
  const now = toMs !== undefined && Number.isFinite(toMs) ? toMs : wallClock;
  const span = fromMs !== undefined && Number.isFinite(fromMs) && fromMs < now ? now - fromMs : 0;
  const durationMs = Math.max(DEMO_MIN_DURATION_MS, span);
  const stepMs = Math.max(1000, Math.ceil(durationMs / DEMO_TARGET_POINTS / 1000) * 1000);
  return { now, from: now - durationMs, durationMs, stepMs };
}

/** Field config, overrides and display processors applied exactly as Grafana does for query results. */
export function prepareDemoFrames(raw: DataFrame[], deps: DemoDeps): DataFrame[] {
  return applyFieldOverrides({
    data: raw,
    fieldConfig: deps.fieldConfig,
    replaceVariables: deps.replaceVariables,
    theme: deps.theme,
    timeZone: deps.timeZone,
  });
}

const toMillis = (range: TimeRange | undefined, key: 'from' | 'to'): number | undefined => {
  const v = range?.[key];
  if (v === undefined || v === null) {
    return undefined;
  }
  const ms = typeof v === 'number' ? v : v.valueOf();
  return Number.isFinite(ms) ? ms : undefined;
};

/**
 * Returns the frames the panel should render and whether they are generated. `generator` must be a
 * stable reference (module constant or `useCallback`) or the frames regenerate every render.
 * Memoised on `data.series`, the time range, the mode and the field config.
 */
export function useDemoFrames(
  data: PanelData,
  mode: DemoMode | undefined,
  generator: DemoGenerator,
  deps: DemoDeps
): { frames: DataFrame[]; isDemo: boolean } {
  const effectiveMode: DemoMode = isDemoMode(mode) ? mode : 'whenNoData';
  const { fieldConfig, replaceVariables, theme, timeZone, timeRange, isUsable } = deps;
  const usable = useMemo(
    () => (effectiveMode === 'whenNoData' ? (isUsable ?? hasUsableData)(data.series) : true),
    [effectiveMode, isUsable, data.series]
  );
  const isDemo = effectiveMode === 'always' || (effectiveMode === 'whenNoData' && !usable);
  const range = timeRange ?? data.timeRange;
  const fromMs = toMillis(range, 'from');
  const toMs = toMillis(range, 'to');

  const frames = useMemo(() => {
    if (!isDemo) {
      return data.series;
    }
    return prepareDemoFrames(generator(demoWindow(fromMs, toMs)), { fieldConfig, replaceVariables, theme, timeZone });
    // data.series is included so a refresh (new PanelData) regenerates the window even if the range did not move.
  }, [isDemo, data.series, fromMs, toMs, generator, fieldConfig, replaceVariables, theme, timeZone]);

  return { frames, isDemo };
}
