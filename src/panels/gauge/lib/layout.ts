import { type ArcSpec, clamp, degToRad } from './scale';

export interface Layout {
  cx: number;
  cy: number;
  /** Ring radius in px. */
  r: number;
  /** Distance from centre to tick label anchor. */
  tickLabelRadius: number;
  showTicks: boolean;
  showTickLabels: boolean;
  showValue: boolean;
  showSecondary: boolean;
  showSubtitle: boolean;
  /** A stale caption may be drawn under the subtitle. */
  showStale: boolean;
  showTitle: boolean;
  /** Font sizes in px. */
  valueFont: number;
  valueUnitFont: number;
  secondaryFont: number;
  subtitleFont: number;
  tickFont: number;
  titleFont: number;
  /** History chart box. */
  history: { x: number; y: number; w: number; h: number };
  /** Baselines (px). */
  valueLabelY: number;
  valueY: number;
  secondaryY: number;
  subtitleY: number;
  staleY: number;
  titleY: number;
}

export interface LayoutInput {
  width: number;
  height: number;
  arc: ArcSpec;
  ringWidth: number;
  showTicks: boolean;
  showTickLabels: boolean;
  showValue: boolean;
  showSecondary: boolean;
  showSubtitle: boolean;
  /** A small caption is drawn above the big value. */
  hasValueLabel?: boolean;
  /** Reserve a line under the subtitle for the stale caption. */
  reserveStaleLine?: boolean;
  titlePosition: 'hidden' | 'top' | 'bottom';
  valueFontPx?: number;
}

/** Bounding box (in unit-circle coordinates) of the ring plus the interior content. */
function contentBox(arc: ArcSpec, labelMargin: number, hasText: boolean) {
  const sweep = clamp(arc.sweepAngle, 0, 360);
  let minX = -0.2;
  let maxX = 0.2;
  let minY = -0.2;
  let maxY = 0.2;
  const outer = 1 + labelMargin;
  const steps = Math.max(2, Math.ceil(sweep));
  for (let i = 0; i <= steps; i++) {
    const a = degToRad(arc.startAngle + (sweep * i) / steps);
    const x = Math.cos(a) * outer;
    const y = Math.sin(a) * outer;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  // Interior content (history chart + text) occupies roughly this box of the unit circle.
  minX = Math.min(minX, -0.8);
  maxX = Math.max(maxX, 0.8);
  minY = Math.min(minY, -0.82);
  maxY = Math.max(maxY, hasText ? 0.9 : 0.2);
  return { minX, maxX, minY, maxY };
}

/** Fits the ring into the panel, choosing radius and centre so the content box fills the area. */
interface Fonts {
  valueFont: number;
  valueUnitFont: number;
  secondaryFont: number;
  subtitleFont: number;
  tickFont: number;
  titleFont: number;
}

function fontsFor(r: number, valueFontPx: number | undefined): Fonts {
  const valueFont = clamp(valueFontPx && valueFontPx > 0 ? valueFontPx : r * 0.27, 10, 160);
  return {
    valueFont,
    valueUnitFont: clamp(valueFont * 0.36, 9, 40),
    secondaryFont: clamp(r * 0.095, 10, 28),
    subtitleFont: clamp(r * 0.07, 9, 20),
    tickFont: clamp(r * 0.075, 9, 18),
    titleFont: clamp(r * 0.07, 9, 16),
  };
}

/** Height in px of the text block under the history chart (value + secondary + subtitle, incl. descenders). */
function textBlockHeight(
  f: Fonts,
  r: number,
  showValue: boolean,
  showSecondary: boolean,
  showSubtitle: boolean,
  hasValueLabel: boolean,
  showStale: boolean
): number {
  let h = 0;
  if (showValue) {
    h += f.valueFont * 0.95 + r * 0.04 + (hasValueLabel ? f.subtitleFont * 1.4 : 0);
  }
  if (showSecondary) {
    h += (showValue ? 0 : r * 0.1) + f.secondaryFont * 1.45;
    if (showSubtitle) {
      h += f.subtitleFont * 1.3;
    }
    if (showStale) {
      h += f.subtitleFont * 1.25;
    }
    h += (showSubtitle || showStale ? f.subtitleFont : f.secondaryFont) * 0.3;
  } else if (showValue) {
    h += f.valueFont * 0.1;
  }
  return h;
}

export function computeLayout(input: LayoutInput): Layout {
  const { width, height, arc } = input;
  const small = Math.min(width, height);
  const showTicks = input.showTicks && small >= 110;
  const showTickLabels = showTicks && input.showTickLabels && small >= 150;
  const showValue = input.showValue && small >= 90;
  let showSecondary = input.showSecondary && small >= 170;
  let showSubtitle = showSecondary && input.showSubtitle;
  let showStale = showSecondary && !!input.reserveStaleLine;
  const showTitle = input.titlePosition !== 'hidden' && small >= 200;
  const hasValueLabel = showValue && !!input.hasValueLabel;
  const hasText = showValue || showSecondary;

  const labelMargin = showTickLabels ? 0.22 : showTicks ? 0.08 : 0.04;
  const box = contentBox(arc, labelMargin, hasText);
  const pad = 6;
  const titleReserve = showTitle ? 22 : 0;
  const availW = Math.max(10, width - pad * 2);
  const availH = Math.max(10, height - pad * 2 - titleReserve);
  const fitRadius = () => Math.max(8, Math.min(availW / (box.maxX - box.minX), availH / (box.maxY - box.minY)));
  const ringBottom = box.maxY; // bottom of ring/labels (and the nominal text area)

  // Fit, then make sure the text block really fits under the history chart; font minimums can make it
  // taller than the nominal 0.9 r at small sizes. Grow the box and refit, hiding lines when needed.
  let r = fitRadius();
  let fonts = fontsFor(r, input.valueFontPx);
  for (let pass = 0; pass < 3 && hasText; pass++) {
    const needed = (0.14 * r + textBlockHeight(fonts, r, showValue, showSecondary, showSubtitle, hasValueLabel, showStale)) / r;
    if (needed <= box.maxY + 1e-6) {
      break;
    }
    box.maxY = needed;
    r = fitRadius();
    fonts = fontsFor(r, input.valueFontPx);
    // When the box has grown far beyond the ring, the panel is too short: drop lines instead of shrinking the ring.
    if (box.maxY > ringBottom + 0.35 || r < 40) {
      if (showStale) {
        showStale = false;
      } else if (showSubtitle) {
        showSubtitle = false;
      } else if (showSecondary) {
        showSecondary = false;
      }
      box.maxY = ringBottom;
      r = fitRadius();
      fonts = fontsFor(r, input.valueFontPx);
    }
  }

  const contentW = (box.maxX - box.minX) * r;
  const contentH = (box.maxY - box.minY) * r;
  const left = pad + (availW - contentW) / 2;
  const top = pad + (availH - contentH) / 2 + (input.titlePosition === 'top' && showTitle ? titleReserve : 0);
  const cx = left - box.minX * r;
  const cy = top - box.minY * r;

  const { valueFont, valueUnitFont, secondaryFont, subtitleFont, tickFont, titleFont } = fonts;

  const historyTop = cy - r * 0.8;
  const historyBottom = cy + (hasText ? r * 0.14 : r * 0.55);
  const history = {
    x: cx - r * 0.78,
    y: historyTop,
    w: r * 1.56,
    h: Math.max(4, historyBottom - historyTop),
  };

  const valueLabelY = historyBottom + subtitleFont * 1.1;
  const valueY = historyBottom + valueFont * 0.95 + r * 0.04 + (hasValueLabel ? subtitleFont * 1.4 : 0);
  const secondaryY = (showValue ? valueY : historyBottom + r * 0.1) + secondaryFont * 1.45;
  const subtitleY = secondaryY + subtitleFont * 1.3;
  const staleY = (showSubtitle ? subtitleY : secondaryY) + subtitleFont * 1.25;
  const titleY = input.titlePosition === 'top' ? pad + titleFont : height - pad - 4;

  return {
    cx,
    cy,
    r,
    tickLabelRadius: r + Math.max(14, r * 0.13),
    showTicks,
    showTickLabels,
    showValue,
    showSecondary,
    showSubtitle,
    showStale,
    showTitle,
    valueFont,
    valueUnitFont,
    secondaryFont,
    subtitleFont,
    tickFont,
    titleFont,
    history,
    valueLabelY,
    valueY,
    secondaryY,
    subtitleY,
    staleY,
    titleY,
  };
}
