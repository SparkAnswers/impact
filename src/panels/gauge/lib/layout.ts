import { type ArcSpec, clamp, degToRad } from './scale';

export interface Layout {
  cx: number;
  cy: number;
  /** Ring radius in px. */
  r: number;
  /** Radius of the usable interior (inside the fill stroke minus padding); the history is clipped to it. */
  innerRadius: number;
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

/** Lowest point (px below the centre) of the ring ends and their tick labels, -Infinity when no end is in the lower half. */
function endsFloor(arc: ArcSpec, r: number, ringWidth: number, showTickLabels: boolean, tickFont: number): number {
  let floor = -Infinity;
  for (const deg of [arc.startAngle, arc.startAngle + clamp(arc.sweepAngle, 0, 360)]) {
    const s = Math.sin(degToRad(deg));
    if (s <= 0.05) {
      continue;
    }
    floor = Math.max(floor, s * (r + ringWidth / 2) + 4);
    if (showTickLabels) {
      floor = Math.max(floor, s * (r + Math.max(14, r * 0.13)) + tickFont * 0.6 + 2);
    }
  }
  return floor;
}

interface TextPlacement {
  historyBottom: number;
  valueLabelY: number;
  valueY: number;
  secondaryY: number;
  subtitleY: number;
  staleY: number;
  /** Bottom of the text block (px below the centre, descenders included). */
  bottom: number;
}

/**
 * Baselines of the text lines, in px below the centre. The big value sits under the history chart inside the
 * ring. The secondary line and the subtitle go below it, but never level with the ring's ends: when the arc opens
 * at the bottom they move under the ends and their tick labels, where the full panel width is free.
 */
function placeText(input: LayoutInput, r: number, f: Fonts, innerRadius: number, flags: { showValue: boolean; showSecondary: boolean; showSubtitle: boolean; showStale: boolean; hasValueLabel: boolean; showTickLabels: boolean }): TextPlacement {
  const hasText = flags.showValue || flags.showSecondary;
  const historyBottom = hasText ? r * 0.14 : innerRadius * 0.5;
  const valueLabelY = historyBottom + f.subtitleFont * 1.1;
  const valueY = historyBottom + f.valueFont * 0.95 + r * 0.04 + (flags.hasValueLabel ? f.subtitleFont * 1.4 : 0);
  let secondaryTop = flags.showValue ? valueY : historyBottom + r * 0.1;
  if (flags.showSecondary) {
    secondaryTop = Math.max(secondaryTop, endsFloor(input.arc, r, input.ringWidth, flags.showTickLabels, f.tickFont));
  }
  const secondaryY = secondaryTop + f.secondaryFont * 1.45;
  const subtitleY = secondaryY + f.subtitleFont * 1.3;
  const staleY = (flags.showSubtitle ? subtitleY : secondaryY) + f.subtitleFont * 1.25;
  let bottom = flags.showValue ? valueY + f.valueFont * 0.1 : historyBottom;
  if (flags.showSecondary) {
    const last = flags.showStale ? staleY : flags.showSubtitle ? subtitleY : secondaryY;
    bottom = Math.max(bottom, last + (flags.showSubtitle || flags.showStale ? f.subtitleFont : f.secondaryFont) * 0.3);
  }
  return { historyBottom, valueLabelY, valueY, secondaryY, subtitleY, staleY, bottom };
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
  const innerFor = (r: number) => Math.max(4, r - input.ringWidth / 2 - Math.max(4, r * 0.04));
  const flags = () => ({ showValue, showSecondary, showSubtitle, showStale, hasValueLabel, showTickLabels });

  // Fit, then make sure the text block really fits: font minimums and the lines pushed under the ring's ends
  // can make it taller than the nominal 0.9 r. Grow the box and refit, hiding lines when the panel is too short.
  let r = fitRadius();
  let fonts = fontsFor(r, input.valueFontPx);
  let text = placeText(input, r, fonts, innerFor(r), flags());
  for (let pass = 0; pass < 8 && hasText; pass++) {
    const needed = text.bottom / r + 0.02;
    if (needed <= box.maxY + 1e-6) {
      break;
    }
    box.maxY = needed;
    r = fitRadius();
    fonts = fontsFor(r, input.valueFontPx);
    // When the box has grown far beyond the ring, the panel is too short: drop lines instead of shrinking the ring.
    if (box.maxY > ringBottom + 0.55 || r < 40) {
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
    text = placeText(input, r, fonts, innerFor(r), flags());
  }

  const contentW = (box.maxX - box.minX) * r;
  const contentH = (box.maxY - box.minY) * r;
  const left = pad + (availW - contentW) / 2;
  const top = pad + (availH - contentH) / 2 + (input.titlePosition === 'top' && showTitle ? titleReserve : 0);
  const cx = left - box.minX * r;
  const cy = top - box.minY * r;

  const { valueFont, valueUnitFont, secondaryFont, subtitleFont, tickFont, titleFont } = fonts;

  // History box: as large as fits entirely inside the ring's inner edge. Its half width is the chord of
  // the inner circle at the box's top and bottom (whichever is narrower).
  const innerRadius = innerFor(r);
  const historyTop = cy - innerRadius * 0.74;
  const historyBottom = cy + text.historyBottom;
  const chord = (dy: number) => Math.sqrt(Math.max(0, innerRadius * innerRadius - dy * dy));
  const halfW = Math.max(2, Math.min(chord(historyTop - cy), chord(historyBottom - cy)));
  const history = {
    x: cx - halfW,
    y: historyTop,
    w: halfW * 2,
    h: Math.max(4, historyBottom - historyTop),
  };

  const valueLabelY = cy + text.valueLabelY;
  const valueY = cy + text.valueY;
  const secondaryY = cy + text.secondaryY;
  const subtitleY = cy + text.subtitleY;
  const staleY = cy + text.staleY;
  const titleY = input.titlePosition === 'top' ? pad + titleFont : height - pad - 4;

  return {
    cx,
    cy,
    r,
    innerRadius,
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
