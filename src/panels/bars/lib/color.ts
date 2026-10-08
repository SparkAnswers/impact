import { colorManipulator, getActiveThreshold, ThresholdsMode, type Field, type GrafanaTheme2 } from '@grafana/data';
import type { ColorMode } from '../types';

/** Resolves a Grafana colour name ("green", "semi-dark-blue", "#abc") to a CSS colour for the theme. */
export function colorByName(theme: GrafanaTheme2, name: string | undefined, fallback = 'blue'): string {
  const n = name && name.trim() !== '' ? name : fallback;
  try {
    return theme.visualization.getColorByName(n);
  } catch {
    return n;
  }
}

/** Linear interpolation between two CSS colours; t in [0, 1]. Falls back to `b` if a colour cannot be parsed. */
export function mixColors(a: string, b: string, t: number): string {
  const k = clamp01(t);
  try {
    const ca = colorManipulator.decomposeColor(a);
    const cb = colorManipulator.decomposeColor(b);
    if (ca.type !== cb.type || !ca.type.startsWith('rgb')) {
      return k < 0.5 ? a : b;
    }
    const values = ca.values.map((v: number, i: number) => {
      const w = cb.values[i] ?? v;
      // Alpha channel (index 3) is interpolated too; RGB channels are rounded.
      const mixed = v + (w - v) * k;
      return i < 3 ? Math.round(mixed) : mixed;
    });
    return colorManipulator.recomposeColor({ type: ca.type, values });
  } catch {
    return b;
  }
}

/** Colour of the active threshold step for a value, if the field defines thresholds. */
export function thresholdColor(
  theme: GrafanaTheme2,
  field: Field | undefined,
  value: number,
  percent: number
): string | undefined {
  const thresholds = field?.config.thresholds;
  const steps = thresholds?.steps;
  if (!field || !thresholds || !steps || steps.length === 0 || !Number.isFinite(value)) {
    return undefined;
  }
  const probe = thresholds.mode === ThresholdsMode.Percentage ? percent * 100 : value;
  const step = getActiveThreshold(probe, steps);
  return step ? colorByName(theme, step.color) : undefined;
}

export interface ResolveColorArgs {
  mode: ColorMode;
  theme: GrafanaTheme2;
  field?: Field;
  value: number;
  percent: number;
  fixedColor: string;
  gradientFrom: string;
  gradientTo: string;
  /** Colour already computed by the field display processor (honours the standard "Color" option). */
  fieldColor?: string;
}

/** Picks the bar fill colour for a row according to the colour mode. */
export function resolveBarColor(args: ResolveColorArgs): string {
  const { mode, theme, field, value, percent, fixedColor, gradientFrom, gradientTo, fieldColor } = args;
  const fixed = colorByName(theme, fixedColor);
  switch (mode) {
    case 'thresholds':
      return thresholdColor(theme, field, value, percent) ?? fixed;
    case 'gradient':
      return mixColors(colorByName(theme, gradientFrom), colorByName(theme, gradientTo), percent);
    case 'field':
      return fieldColor ?? thresholdColor(theme, field, value, percent) ?? fixed;
    case 'fixed':
    default:
      return fixed;
  }
}

/** Maps common status words to a semantic colour when no value mapping provides one. */
export function statusKeywordColor(theme: GrafanaTheme2, text: string): string {
  const t = text.toLowerCase();
  if (/\b(crit|critical|error|err|fail|failed|failing|down|offline|dead|bad|alert|fatal)\b/.test(t)) {
    return theme.colors.error.main;
  }
  if (/\b(warn|warning|degraded|slow|pending|updating|busy|partial|unknown)\b/.test(t)) {
    return theme.colors.warning.main;
  }
  if (/\b(ok|okay|healthy|up|online|good|pass|passed|success|ready|active|running|normal)\b/.test(t)) {
    return theme.colors.success.main;
  }
  if (/\b(info|in progress|progress|syncing|sync|installing)\b/.test(t)) {
    return theme.colors.info.main;
  }
  return theme.colors.text.disabled;
}

/** Translucent version of a colour (used for pill backgrounds / sparkline areas). */
export function alpha(color: string, a: number): string {
  try {
    return colorManipulator.alpha(color, a);
  } catch {
    return color;
  }
}

/** Darker variant for the start of a gradient fill. */
export function darken(color: string, k: number): string {
  try {
    return colorManipulator.darken(color, k);
  } catch {
    return color;
  }
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}
