import {
  dateTime,
  FieldColorModeId,
  FieldType,
  formattedValueToString,
  getDisplayProcessor,
  getFieldConfigWithMinMax,
  getFieldDisplayName,
  reduceField,
  type DataFrame,
  type DisplayProcessor,
  type Field,
  type GrafanaTheme2,
} from '@grafana/data';
import type { BarsOptions, BarStyle } from '../types';
import { colorByName, resolveBarColor, statusKeywordColor } from './color';
import { parseSparkline } from './sparkline';
import { resolveBarStyle } from './styleResolver';

export interface StatusInfo {
  /** Mapped display text (may be empty when only a colour is known). */
  text: string;
  color: string;
  /** Icon name from a value mapping, if any. */
  icon?: string;
}

export interface StackSegment {
  label: string;
  value: number;
  /** Fraction of the whole bar, 0..1. */
  fraction: number;
  color: string;
  text: string;
}

export interface ExtraCell {
  text: string;
  numeric?: number;
  color?: string;
}

export interface RowLink {
  href: string;
  title: string;
  target?: string;
}

export interface BarRow {
  id: string;
  name: string;
  subtitle?: string;
  link?: RowLink;
  value?: number;
  valueText: string;
  /** 0..1 position of the value between min and max (NaN when no value). */
  percent: number;
  min: number;
  max: number;
  /** Bar fill colour resolved from the colour mode. */
  color: string;
  status?: StatusInfo;
  style: BarStyle;
  sparkline?: number[];
  stack?: StackSegment[];
  /** Epoch ms of the row's time, if a time field is present. */
  time?: number;
  extras: ExtraCell[];
}

export interface ExtraColumn {
  title: string;
  numeric: boolean;
}

export interface BarsModel {
  rows: BarRow[];
  extraColumns: ExtraColumn[];
  hasValue: boolean;
  hasStatus: boolean;
  hasTime: boolean;
  /** Title for the value/progress column (display name of the value field). */
  valueTitle: string;
  /** True when input was reduced from time series. */
  fromTimeSeries: boolean;
}

/** A frame is "time series shaped" when it has a time field, a number field and no string fields. */
export function isTimeSeriesFrame(frame: DataFrame): boolean {
  let hasTime = false;
  let hasNumber = false;
  for (const f of frame.fields) {
    if (f.type === FieldType.time) {
      hasTime = true;
    } else if (f.type === FieldType.number) {
      hasNumber = true;
    } else if (f.type === FieldType.string) {
      return false;
    }
  }
  return hasTime && hasNumber && frame.length > 1;
}

/** Display processor for a field, falling back to a fresh one when the panel pipeline has not attached one. */
export function displayFor(field: Field, theme: GrafanaTheme2): DisplayProcessor {
  return field.display ?? getDisplayProcessor({ field, theme });
}

function findField(frame: DataFrame, frames: DataFrame[], name: string | undefined): Field | undefined {
  if (!name) {
    return undefined;
  }
  return (
    frame.fields.find((f) => getFieldDisplayName(f, frame, frames) === name) ??
    frame.fields.find((f) => f.name === name)
  );
}

function findByName(frame: DataFrame, re: RegExp, type?: FieldType): Field | undefined {
  return frame.fields.find((f) => (type ? f.type === type : true) && re.test(f.name));
}

function toNumber(v: unknown): number | undefined {
  if (v == null) {
    return undefined;
  }
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function toEpoch(v: unknown): number | undefined {
  if (v == null) {
    return undefined;
  }
  if (typeof v === 'number') {
    return Number.isFinite(v) ? v : undefined;
  }
  const d = dateTime(v as string);
  return d.isValid() ? d.valueOf() : undefined;
}

interface Range {
  min: number;
  max: number;
}

/** Normalises a (possibly partial) min/max pair: floors at 0 for all-positive data, avoids zero-width ranges. */
export function normaliseRange(min: number | undefined, max: number | undefined, configured: Range): Range {
  let lo = Number.isFinite(configured.min) ? configured.min : (min ?? 0);
  let hi = Number.isFinite(configured.max) ? configured.max : (max ?? 100);
  if (!Number.isFinite(configured.min) && lo > 0) {
    lo = 0;
  }
  if (!Number.isFinite(configured.max) && hi < 0) {
    hi = 0;
  }
  if (hi <= lo) {
    hi = lo === 0 ? 1 : lo + Math.abs(lo);
  }
  return { min: lo, max: hi };
}

function percentOf(value: number | undefined, range: Range): number {
  if (value === undefined) {
    return NaN;
  }
  return Math.max(0, Math.min(1, (value - range.min) / (range.max - range.min)));
}

const MAPPING_SENTINEL = '#010203';
const probeCache = new WeakMap<Field, DisplayProcessor>();

function mappingProbe(field: Field, theme: GrafanaTheme2): DisplayProcessor {
  let p = probeCache.get(field);
  if (!p) {
    p = getDisplayProcessor({
      field: {
        ...field,
        state: undefined,
        config: { ...field.config, color: { mode: FieldColorModeId.Fixed, fixedColor: MAPPING_SENTINEL } },
      },
      theme,
    });
    probeCache.set(field, p);
  }
  return p;
}

function statusFromMapping(
  field: Field,
  raw: unknown,
  theme: GrafanaTheme2,
  fallbackColor: string
): StatusInfo | undefined {
  if (raw == null || raw === '') {
    return undefined;
  }
  if (field.type === FieldType.number) {
    // Thresholds / colour scheme / mappings all come through the field's own display processor.
    const d = displayFor(field, theme)(raw);
    return { text: formattedValueToString(d), color: d.color ?? fallbackColor, icon: d.icon };
  }
  // For text states, run a probe processor whose base colour is a sentinel: any other colour came from a value mapping.
  const d = mappingProbe(field, theme)(raw);
  const text = formattedValueToString(d);
  if (d.color && d.color !== MAPPING_SENTINEL) {
    return { text, color: colorByName(theme, d.color), icon: d.icon };
  }
  return { text, color: statusKeywordColor(theme, text), icon: d.icon };
}

/** Builds the table model from arbitrary data frames. */
export function buildModel(frames: DataFrame[], options: BarsOptions, theme: GrafanaTheme2): BarsModel {
  const valid = frames.filter((f) => f.fields.length > 0 && f.length > 0);
  if (valid.length === 0) {
    return emptyModel();
  }
  if (valid.every(isTimeSeriesFrame)) {
    return buildFromTimeSeries(valid, options, theme);
  }
  const table = valid.find((f) => !isTimeSeriesFrame(f)) ?? valid[0];
  return buildFromTable(table, valid, options, theme);
}

function emptyModel(): BarsModel {
  return {
    rows: [],
    extraColumns: [],
    hasValue: false,
    hasStatus: false,
    hasTime: false,
    valueTitle: 'Value',
    fromTimeSeries: false,
  };
}

function buildFromTimeSeries(frames: DataFrame[], options: BarsOptions, theme: GrafanaTheme2): BarsModel {
  interface Pending {
    field: Field;
    frame: DataFrame;
    name: string;
    value: number | undefined;
    time: number | undefined;
    id: string;
  }
  const pending: Pending[] = [];
  frames.forEach((frame, fi) => {
    const timeField = frame.fields.find((f) => f.type === FieldType.time);
    frame.fields.forEach((field, idx) => {
      if (field.type !== FieldType.number) {
        return;
      }
      const calcs = reduceField({ field, reducers: [options.reducer] });
      const value = toNumber(calcs[options.reducer]);
      let time: number | undefined;
      if (timeField) {
        for (let i = field.values.length - 1; i >= 0; i--) {
          if (field.values[i] != null) {
            time = toEpoch(timeField.values[i]);
            break;
          }
        }
      }
      pending.push({ field, frame, name: getFieldDisplayName(field, frame, frames), value, time, id: `${fi}-${idx}` });
    });
  });

  let gMin: number | undefined;
  let gMax: number | undefined;
  for (const p of pending) {
    if (p.value !== undefined) {
      gMin = gMin === undefined ? p.value : Math.min(gMin, p.value);
      gMax = gMax === undefined ? p.value : Math.max(gMax, p.value);
    }
  }

  const rows: BarRow[] = pending.map((p) => {
    const cfg = p.field.config;
    const range = normaliseRange(gMin, gMax, { min: cfg.min ?? NaN, max: cfg.max ?? NaN });
    const percent = percentOf(p.value, range);
    const display = displayFor(p.field, theme);
    const dv = display(p.value);
    const color = resolveBarColor({
      mode: options.colorMode,
      theme,
      field: p.field,
      value: p.value ?? NaN,
      percent: Number.isNaN(percent) ? 0 : percent,
      fixedColor: options.fixedColor,
      gradientFrom: options.gradientFrom,
      gradientTo: options.gradientTo,
      fieldColor: dv.color,
    });
    const status =
      p.value === undefined ? undefined : (statusFromMapping(p.field, p.value, theme, color) ?? { text: '', color });
    const spark = p.field.values.map((v) => (v == null ? NaN : Number(v)));
    const customStyle = (cfg.custom as { barStyle?: unknown } | undefined)?.barStyle;
    return {
      id: p.id,
      name: p.name,
      value: p.value,
      valueText: formattedValueToString(dv),
      percent,
      min: range.min,
      max: range.max,
      color,
      status,
      style: resolveBarStyle(options.barStyle, customStyle, undefined),
      sparkline: spark.length > 1 ? spark : undefined,
      time: p.time,
      extras: [],
    };
  });

  return {
    rows,
    extraColumns: [],
    hasValue: rows.some((r) => r.value !== undefined),
    hasStatus: rows.some((r) => r.status?.text),
    hasTime: rows.some((r) => r.time !== undefined),
    valueTitle: 'Value',
    fromTimeSeries: true,
  };
}

function buildFromTable(frame: DataFrame, frames: DataFrame[], options: BarsOptions, theme: GrafanaTheme2): BarsModel {
  const fields = frame.fields;
  const byName = (n: string | undefined) => findField(frame, frames, n);

  const styleField = byName(options.styleField) ?? findByName(frame, /^(style|bar[_ -]?style|bar)$/i, FieldType.string);
  const nameField = byName(options.nameField) ?? fields.find((f) => f.type === FieldType.string && f !== styleField);
  const valueField = byName(options.valueField) ?? fields.find((f) => f.type === FieldType.number);
  const statusField = byName(options.statusField) ?? findByName(frame, /^(status|state|health|severity)$/i);
  const timeField =
    byName(options.timeField) ??
    fields.find((f) => f.type === FieldType.time) ??
    findByName(frame, /^(time|timestamp|updated|last[_ ]?seen|last[_ ]?updated)$/i, FieldType.string);
  const sparkField =
    byName(options.sparklineField) ??
    fields.find((f) => f.type === FieldType.other && parseSparkline(f.values[0]) !== undefined) ??
    findByName(frame, /(spark|trend|history|series)/i, FieldType.string);
  const subtitleField =
    byName(options.subtitleField) ??
    findByName(frame, /^(subtitle|description|detail|details|model|note)$/i, FieldType.string);
  const stackFields = (options.stackFields ?? []).map(byName).filter((f): f is Field => !!f);
  const autoStack = stackFields.length === 0 ? fields.filter((f) => f.type === FieldType.number) : stackFields;

  const used = new Set<Field | undefined>([
    styleField,
    nameField,
    valueField,
    statusField,
    timeField,
    sparkField,
    subtitleField,
  ]);
  const extraFields = options.extraFields
    ? options.extraFields.map(byName).filter((f): f is Field => !!f)
    : fields.filter(
        (f) =>
          !used.has(f) &&
          (f.type === FieldType.string ||
            f.type === FieldType.number ||
            f.type === FieldType.time ||
            f.type === FieldType.boolean)
      );

  const extraDisplays = extraFields.map((f) => displayFor(f, theme));
  const nameDisplay = nameField ? displayFor(nameField, theme) : undefined;
  const valueDisplay = valueField ? displayFor(valueField, theme) : undefined;
  const stackDisplays = autoStack.map((f) => displayFor(f, theme));
  const stackNames = autoStack.map((f) => getFieldDisplayName(f, frame, frames));
  const palette = theme.visualization.palette;

  const configured = valueField ? getFieldConfigWithMinMax(valueField, false) : {};
  const range = valueField
    ? normaliseRange(configured.min ?? undefined, configured.max ?? undefined, {
        min: valueField.config.min ?? NaN,
        max: valueField.config.max ?? NaN,
      })
    : { min: 0, max: 100 };

  const rows: BarRow[] = [];
  for (let i = 0; i < frame.length; i++) {
    const rawName = nameField?.values[i];
    const name = nameDisplay && rawName != null ? formattedValueToString(nameDisplay(rawName)) : `Row ${i + 1}`;
    const value = toNumber(valueField?.values[i]);
    const dv = valueDisplay ? valueDisplay(value) : undefined;
    const percent = percentOf(value, range);
    const color = resolveBarColor({
      mode: options.colorMode,
      theme,
      field: valueField,
      value: value ?? NaN,
      percent: Number.isNaN(percent) ? 0 : percent,
      fixedColor: options.fixedColor,
      gradientFrom: options.gradientFrom,
      gradientTo: options.gradientTo,
      fieldColor: dv?.color,
    });

    let status: StatusInfo | undefined;
    if (statusField) {
      status = statusFromMapping(statusField, statusField.values[i], theme, color);
    } else if (value !== undefined) {
      status = { text: '', color };
    }

    let link: RowLink | undefined;
    if (nameField?.getLinks) {
      const links = nameField.getLinks({ valueRowIndex: i });
      if (links.length > 0) {
        const l = links[0];
        link = { href: l.href, title: l.title, target: l.target };
      }
    }

    let stack: StackSegment[] | undefined;
    if (autoStack.length > 0) {
      const vals = autoStack.map((f) => toNumber(f.values[i]) ?? 0);
      const total = vals.reduce((a, b) => a + Math.max(0, b), 0);
      stack = vals.map((v, k) => {
        const d = stackDisplays[k](v);
        return {
          label: stackNames[k],
          value: v,
          fraction: total > 0 ? Math.max(0, v) / total : 0,
          color: d.color ?? colorByName(theme, palette[k % palette.length]),
          text: formattedValueToString(d),
        };
      });
    }

    const extras: ExtraCell[] = extraFields.map((f, k) => {
      const raw = f.values[i];
      const d = extraDisplays[k](raw);
      return {
        text: formattedValueToString(d),
        numeric: f.type === FieldType.number ? toNumber(raw) : undefined,
        color: f.type === FieldType.number ? d.color : undefined,
      };
    });

    rows.push({
      id: `${i}`,
      name,
      subtitle: subtitleField?.values[i] == null ? undefined : String(subtitleField.values[i]),
      link,
      value,
      valueText: dv ? formattedValueToString(dv) : '',
      percent,
      min: range.min,
      max: range.max,
      color,
      status,
      style: resolveBarStyle(
        options.barStyle,
        (valueField?.config.custom as { barStyle?: unknown } | undefined)?.barStyle,
        styleField?.values[i]
      ),
      sparkline: sparkField ? parseSparkline(sparkField.values[i]) : undefined,
      stack,
      time: toEpoch(timeField?.values[i]),
      extras,
    });
  }

  return {
    rows,
    extraColumns: extraFields.map((f) => ({
      title: getFieldDisplayName(f, frame, frames),
      numeric: f.type === FieldType.number,
    })),
    hasValue: !!valueField,
    hasStatus: !!statusField,
    hasTime: !!timeField,
    valueTitle: valueField ? getFieldDisplayName(valueField, frame, frames) : 'Value',
    fromTimeSeries: false,
  };
}
