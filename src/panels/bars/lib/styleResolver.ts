import { BAR_STYLES, type BarStyle } from '../types';

/** Normalises free text ("Bi-directional", " PERCENT ") into a known bar style, or undefined. */
export function parseBarStyle(value: unknown): BarStyle | undefined {
  if (value == null) {
    return undefined;
  }
  const key = String(value)
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  if (key === '' || key === 'default') {
    return undefined;
  }
  const match = BAR_STYLES.find((s) => s === key);
  if (match) {
    return match;
  }
  // Friendly aliases
  switch (key) {
    case 'indeterminate':
    case 'loop':
      return 'sweep';
    case 'bar':
    case 'determinate':
    case 'progress':
      return 'percent';
    case 'segments':
    case 'steps':
      return 'segmented';
    case 'stripes':
      return 'striped';
    case 'bidi':
    case 'diverging':
      return 'bidirectional';
    case 'stack':
      return 'stacked';
    case 'spark':
    case 'trend':
      return 'sparkline';
    case 'badge':
    case 'tag':
    case 'chip':
      return 'pill';
    default:
      return undefined;
  }
}

/**
 * Resolves the bar style for a row.
 * Priority: value from a "style" column > field override (custom.barStyle) > panel default.
 */
export function resolveBarStyle(panelDefault: BarStyle, fieldOverride: unknown, styleCellValue: unknown): BarStyle {
  return parseBarStyle(styleCellValue) ?? parseBarStyle(fieldOverride) ?? panelDefault;
}
