import {
  type DisplayProcessor,
  type Field,
  type FieldConfigSource,
  type GrafanaTheme2,
  type Threshold,
  formattedValueToString,
  getDisplayProcessor,
} from '@grafana/data';
import type { BoundChannel } from './data';
import { type ColorMapper, createColorMapper } from './colors';

/** Picks the display processor for a channel (field's own, or one built from panel defaults). */
export function displayFor(
  field: Field | undefined,
  fieldConfig: FieldConfigSource,
  theme: GrafanaTheme2,
  timeZone?: string
): DisplayProcessor {
  if (field?.display) {
    return field.display;
  }
  return getDisplayProcessor({ field: field ?? { config: fieldConfig.defaults ?? {} }, theme, timeZone });
}

export function formatValue(display: DisplayProcessor, v: number | undefined): string {
  if (v === undefined || !Number.isFinite(v)) {
    return '-';
  }
  return formattedValueToString(display(v));
}

export function mapperFor(bound: BoundChannel, fieldConfig: FieldConfigSource, theme: GrafanaTheme2): ColorMapper {
  const { channel, field } = bound;
  const cfg = field?.config ?? fieldConfig.defaults ?? {};
  let domain: [number, number];
  if (channel.scaleDomain?.mode === 'fixed') {
    domain = [channel.scaleDomain.min ?? bound.range[0], channel.scaleDomain.max ?? bound.range[1]];
  } else {
    domain = [cfg.min ?? bound.range[0], cfg.max ?? bound.range[1]];
  }
  const thresholds: Threshold[] | undefined = cfg.thresholds?.steps ?? fieldConfig.defaults?.thresholds?.steps;
  return createColorMapper({
    preset: channel.colorScale ?? 'turbo',
    domain,
    customStops: channel.customStops,
    thresholds,
    resolveColor: (c) => theme.visualization.getColorByName(c),
  });
}

/** Only http(s) and data:image URLs are allowed for background images. */
export function isSafeImageUrl(url: string): boolean {
  const u = (url ?? '').trim();
  return /^https?:\/\//i.test(u) || /^data:image\/(png|jpe?g|gif|webp|svg\+xml|avif);/i.test(u);
}

/** Replaces the {value} token. */
export function applyValueToken(text: string, value: string): string {
  return text.replace(/\{value\}/g, value);
}

export interface LegendFormat {
  /** Tick text without the unit suffix. */
  format: (v: number) => string;
  /** Unit suffix shown once next to the bar (e.g. "mph"), if any. */
  unit?: string;
}

/**
 * Builds a tick formatter for the legend: uses the field's display processor so units scale
 * correctly, strips the suffix (shown once), and drops decimals when all ticks are whole numbers.
 */
export function legendFormatter(
  mapper: ColorMapper,
  field: Field | undefined,
  fieldConfig: FieldConfigSource,
  theme: GrafanaTheme2,
  timeZone?: string
): LegendFormat {
  const config = { ...(fieldConfig.defaults ?? {}), ...(field?.config ?? {}) };
  const whole = mapper.ticks.every((t) => Number.isInteger(Number(t.value.toFixed(6))));
  const decimals = whole ? 0 : config.decimals;
  const proc = getDisplayProcessor({
    field: { ...(field ?? {}), config: { ...config, decimals } },
    theme,
    timeZone,
  });
  const sample = proc(mapper.domain[1]);
  const unit = (sample.suffix ?? '').trim() || undefined;
  return {
    format: (v) => {
      const d = proc(v);
      return `${(d.prefix ?? '').trim()}${d.text}`;
    },
    unit,
  };
}
