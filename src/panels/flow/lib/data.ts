import {
  FieldType,
  formattedValueToString,
  getDisplayProcessor,
  getFieldDisplayName,
  type DataFrame,
  type DisplayValue,
  type Field,
  type GrafanaTheme2,
} from '@grafana/data';
import type { EdgeBinding } from '../types';

export interface FieldValue {
  name: string;
  field: Field;
  /** Last non-null numeric value (or undefined if none) */
  value?: number;
  display?: DisplayValue;
}

/** Last non-null value of a field. */
export function lastValue(field: Field): number | undefined {
  const values = field.values;
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i];
    if (v !== null && v !== undefined && !(typeof v === 'number' && Number.isNaN(v))) {
      return typeof v === 'number' ? v : Number(v);
    }
  }
  return undefined;
}

/**
 * Index every numeric field by display name with its last value and formatted display
 * (using the field's display processor so unit/decimals/thresholds from field config apply).
 */
export function indexFields(series: DataFrame[], theme: GrafanaTheme2): Map<string, FieldValue> {
  const out = new Map<string, FieldValue>();
  for (const frame of series) {
    for (const field of frame.fields) {
      if (field.type !== FieldType.number && field.type !== FieldType.boolean) {
        continue;
      }
      const name = getFieldDisplayName(field, frame, series);
      const value = lastValue(field);
      const processor = field.display ?? getDisplayProcessor({ field, theme });
      const display = value === undefined ? undefined : processor(value);
      out.set(name, { name, field, value, display });
    }
  }
  return out;
}

/** List of numeric field display names across all frames (for pickers). */
export function fieldNames(series: DataFrame[]): string[] {
  const names: string[] = [];
  for (const frame of series) {
    for (const field of frame.fields) {
      if (field.type === FieldType.number || field.type === FieldType.boolean) {
        names.push(getFieldDisplayName(field, frame, series));
      }
    }
  }
  return Array.from(new Set(names));
}

export function formatValue(fv: FieldValue | undefined, template?: string): string | undefined {
  if (!fv || fv.value === undefined || !fv.display) {
    return undefined;
  }
  const text = formattedValueToString(fv.display);
  return template ? template.replace(/\$\{value\}/g, text) : text;
}

/** Map a value into 0..1 using the binding's min/max (falls back to the field config min/max, then 0..100). */
export function normalise(value: number, bind: EdgeBinding, field?: Field): number {
  const min = bind.min ?? field?.config.min ?? 0;
  const max = bind.max ?? field?.config.max ?? 100;
  if (max === min) {
    return 0;
  }
  return Math.min(1, Math.max(0, (Math.abs(value) - Math.min(min, max)) / Math.abs(max - min)));
}

export interface EdgeBindingResult {
  /** Multiplier for particle speed (1 = unchanged) */
  speed?: number;
  /** Colour from the field's display processor (thresholds / colour mode) */
  color?: string;
  /** Absolute stroke width */
  width?: number;
  /** True when the value is negative and reverseBelowZero is set */
  reversed: boolean;
  value?: number;
  text?: string;
}

/** Resolve what a binding does to an edge for the current data. */
export function applyBinding(bind: EdgeBinding | undefined, fields: Map<string, FieldValue>): EdgeBindingResult {
  const none: EdgeBindingResult = { reversed: false };
  if (!bind) {
    return none;
  }
  const fv = fields.get(bind.field);
  if (!fv || fv.value === undefined) {
    return none;
  }
  const value = fv.value;
  const reversed = !!bind.reverseBelowZero && value < 0;
  const t = normalise(value, bind, fv.field);
  const res: EdgeBindingResult = { reversed, value, text: formatValue(fv) };
  switch (bind.mapTo) {
    case 'speed':
      // 0.15x .. 3x; never fully stop so the edge still reads as "live".
      res.speed = 0.15 + t * 2.85;
      break;
    case 'width':
      res.width = 1 + t * 5;
      break;
    case 'color':
      res.color = fv.display?.color;
      break;
  }
  return res;
}
