import { colorManipulator } from '@grafana/data';
import { computeLayout, type Layout, type LayoutInput } from './layout';
import { type LiveWindow, scrollX } from './live';
import { type ArcSpec, clamp, fractionToAngle, polar, type ScaleSpec, signedArc, valueToFraction } from './scale';

export interface TickModel {
  value: number;
  label: string;
}

export interface BandModel {
  from: number;
  to: number;
  color: string;
}

export interface HistoryModel {
  points: Array<{ x: number; value: number; t?: number }>;
  positiveColor: string;
  negativeColor: string;
  /** Optional per-value colour (threshold mode). */
  colorFor?: (value: number) => string;
  fade: boolean;
  lineWidth: number;
  area: boolean;
}

export interface TextPart {
  prefix?: string;
  text: string;
  suffix?: string;
}

export interface GaugeModel {
  width: number;
  height: number;
  scale: ScaleSpec;
  arc: ArcSpec;
  ringWidth: number;
  ringColor: string;
  glow: number;
  /** Displayed (eased) value for the fill/marker; null draws an empty gauge. */
  value: number | null;
  fillColor: string;
  /** Fill colour as a function of the displayed value (sign / thresholds). Falls back to `fillColor`. */
  fillColorFor?: (value: number) => string;
  markerColor: string;
  bands?: BandModel[];
  ticks: TickModel[];
  showTicks: boolean;
  showTickLabels: boolean;
  /** Text drawn next to the zero mark (usually the unit). */
  zeroLabel?: string;
  history?: HistoryModel;
  showValue: boolean;
  valueText?: TextPart;
  valueLabel?: string;
  showSecondary: boolean;
  secondaryText?: string;
  subtitleText?: string;
  titleText?: string;
  titlePosition: 'hidden' | 'top' | 'bottom';
  valueFontPx?: number;
  /** Reserve a line for the stale caption. */
  reserveStaleLine?: boolean;
  fontFamily: string;
  colors: {
    text: string;
    textSecondary: string;
    textDisabled: string;
    tick: string;
    baseline: string;
    background: string;
  };
}

/** Per-frame state of the live layer. Mutated in place by the frame loop (no per-frame allocations). */
export interface LiveState {
  /** Eased fill/marker value. */
  value: number | null;
  /** Wall-clock window for the history x axis; null = use the static point positions. */
  window: LiveWindow | null;
  /** Multiplier for the glow blur (breathing). */
  glowScale: number;
  /** Opacity 0..1 of the glow pass. */
  glowAlpha: number;
  /** Stale: marker glow dimmed. */
  dimmed: boolean;
  trailCount: number;
  trailAngles: Float64Array;
  trailAlphas: Float64Array;
  staleText: string | null;
}

export function defaultLiveState(value: number | null, trailCapacity = 0): LiveState {
  return {
    value,
    window: null,
    glowScale: 1,
    glowAlpha: 1,
    dimmed: false,
    trailCount: 0,
    trailAngles: new Float64Array(trailCapacity),
    trailAlphas: new Float64Array(trailCapacity),
    staleText: null,
  };
}

const alpha = (color: string, a: number): string => {
  try {
    return colorManipulator.alpha(color, clamp(a, 0, 1));
  } catch {
    return color;
  }
};

function strokeArc(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  a0: number,
  a1: number,
  width: number,
  color: string,
  blur = 0
) {
  let s = a0;
  let e = a1;
  if (s > e) {
    [s, e] = [e, s];
  }
  ctx.save();
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.lineCap = 'butt';
  if (blur > 0) {
    ctx.shadowBlur = blur;
    ctx.shadowColor = color;
  }
  ctx.beginPath();
  ctx.arc(cx, cy, r, s, e);
  ctx.stroke();
  ctx.restore();
}

export function layoutFor(model: GaugeModel): Layout {
  const input: LayoutInput = {
    width: model.width,
    height: model.height,
    arc: model.arc,
    ringWidth: model.ringWidth,
    showTicks: model.showTicks,
    showTickLabels: model.showTickLabels,
    showValue: model.showValue && !!model.valueText,
    showSecondary: model.showSecondary && !!model.secondaryText,
    showSubtitle: !!model.subtitleText,
    hasValueLabel: !!model.valueLabel,
    reserveStaleLine: !!model.reserveStaleLine,
    titlePosition: model.titleText ? model.titlePosition : 'hidden',
    valueFontPx: model.valueFontPx,
  };
  return computeLayout(input);
}

/** Draws the whole gauge in one pass (static + live layer). `ctx` must already be scaled for DPR. */
export function drawGauge(ctx: CanvasRenderingContext2D, model: GaugeModel, live?: LiveState): Layout {
  const L = layoutFor(model);
  ctx.clearRect(0, 0, model.width, model.height);
  drawStaticLayer(ctx, model, L, false);
  drawLiveLayer(ctx, model, L, live ?? defaultLiveState(model.value), false);
  return L;
}

/** Ring/bands, tick labels and all text that only changes with new data or options. */
export function drawStaticLayer(ctx: CanvasRenderingContext2D, model: GaugeModel, L: Layout, clear = true) {
  const { cx, cy, r } = L;
  const font = model.fontFamily;
  if (clear) {
    ctx.clearRect(0, 0, model.width, model.height);
  }

  // Base ring (or threshold bands).
  if (model.bands && model.bands.length) {
    for (const b of model.bands) {
      const f0 = valueToFraction(b.from, model.scale);
      const f1 = valueToFraction(b.to, model.scale);
      if (Math.abs(f1 - f0) < 1e-4) {
        continue;
      }
      strokeArc(
        ctx,
        cx,
        cy,
        r,
        fractionToAngle(f0, model.arc),
        fractionToAngle(f1, model.arc),
        Math.max(1.5, model.ringWidth * 0.4),
        alpha(b.color, 0.6)
      );
    }
  } else {
    strokeArc(ctx, cx, cy, r, fractionToAngle(0, model.arc), fractionToAngle(1, model.arc), 1.5, model.ringColor);
  }

  // Tick labels.
  if (L.showTicks && L.showTickLabels) {
    ctx.save();
    ctx.font = `500 ${L.tickFont}px ${font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = alpha(model.colors.tick, 0.8);
    for (const t of model.ticks) {
      if (t.value < model.scale.min || t.value > model.scale.max || !t.label) {
        continue;
      }
      const isZero = t.value === model.scale.zero && !!model.zeroLabel;
      if (!isZero) {
        const a = fractionToAngle(valueToFraction(t.value, model.scale), model.arc);
        const [tx, ty] = polar(cx, cy, a, L.tickLabelRadius);
        ctx.fillText(t.label, tx, ty);
      }
    }
    ctx.restore();
  }

  // Unit (or custom) label at the zero mark.
  if (model.zeroLabel && L.showTickLabels) {
    ctx.save();
    const a = fractionToAngle(valueToFraction(model.scale.zero, model.scale), model.arc);
    const [ux, uy] = polar(cx, cy, a, L.tickLabelRadius + 2);
    ctx.font = `500 ${L.tickFont}px ${font}`;
    ctx.fillStyle = alpha(model.colors.text, 0.85);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(model.zeroLabel, ux, uy);
    ctx.restore();
  }

  // Centre text.
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  if (L.showValue && model.valueText) {
    const v = model.valueText;
    const main = `${v.prefix ?? ''}${v.text}`;
    const suffix = v.suffix ? ` ${v.suffix.trim()}` : '';
    ctx.font = `300 ${L.valueFont}px ${font}`;
    const tw = ctx.measureText(main).width;
    ctx.font = `400 ${L.valueUnitFont}px ${font}`;
    const uw = suffix ? ctx.measureText(suffix).width : 0;
    const x0 = cx - (tw + uw) / 2;
    ctx.textAlign = 'left';
    ctx.fillStyle = model.colors.text;
    ctx.font = `300 ${L.valueFont}px ${font}`;
    ctx.fillText(main, x0, L.valueY);
    if (suffix) {
      ctx.font = `400 ${L.valueUnitFont}px ${font}`;
      ctx.fillStyle = model.colors.textSecondary;
      ctx.fillText(suffix, x0 + tw, L.valueY);
    }
    ctx.textAlign = 'center';
    if (model.valueLabel) {
      ctx.font = `500 ${L.subtitleFont}px ${font}`;
      ctx.fillStyle = model.colors.textSecondary;
      ctx.fillText(model.valueLabel, cx, L.valueLabelY);
    }
  }
  if (L.showSecondary && model.secondaryText) {
    drawEmphasisedLine(ctx, model.secondaryText, cx, L.secondaryY, L.secondaryFont, font, model.colors.text);
    if (model.subtitleText && L.showSubtitle) {
      ctx.font = `400 ${L.subtitleFont}px ${font}`;
      ctx.fillStyle = model.colors.textSecondary;
      ctx.textAlign = 'center';
      ctx.fillText(model.subtitleText, cx, L.subtitleY);
    }
  }
  if (L.showTitle && model.titleText) {
    ctx.font = `500 ${L.titleFont}px ${font}`;
    ctx.fillStyle = model.colors.textSecondary;
    ctx.textAlign = 'center';
    ctx.letterSpacing = '0.08em';
    ctx.fillText(model.titleText.toUpperCase(), cx, L.titleY);
  }
  ctx.restore();
}

/** History chart, fill arc, trail, tick marks, marker and stale caption: everything that moves. */
export function drawLiveLayer(ctx: CanvasRenderingContext2D, model: GaugeModel, L: Layout, live: LiveState, clear = true) {
  const { cx, cy, r } = L;
  const font = model.fontFamily;
  if (clear) {
    ctx.clearRect(0, 0, model.width, model.height);
  }
  const value = live.value;
  const fillColor = value !== null && model.fillColorFor ? model.fillColorFor(value) : model.fillColor;

  // History chart inside the ring.
  if (model.history && model.history.points.length > 1 && L.history.h > 8) {
    drawHistory(ctx, model, L, live.window);
  }

  // Trail along the ring (older samples -> marker).
  if (live.trailCount > 1) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1.5, model.ringWidth * 0.55);
    const n = live.trailCount;
    for (let i = 0; i < n - 1; i++) {
      const a = Math.min(live.trailAlphas[i], live.trailAlphas[i + 1]);
      if (a <= 0.01) {
        continue;
      }
      let s = live.trailAngles[i];
      let e = live.trailAngles[i + 1];
      if (Math.abs(e - s) < 1e-4) {
        continue;
      }
      if (s > e) {
        [s, e] = [e, s];
      }
      ctx.strokeStyle = alpha(fillColor, 0.55 * a);
      ctx.beginPath();
      ctx.arc(cx, cy, r + model.ringWidth * 0.9, s, e);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Fill arc from the zero mark to the value.
  let markerAngle = fractionToAngle(valueToFraction(model.scale.zero, model.scale), model.arc);
  if (value !== null) {
    const a = signedArc(value, model.scale, model.arc);
    markerAngle = a.to;
    if (a.size > 1e-4) {
      if (model.glow > 0 && live.glowAlpha > 0.01) {
        const blur = model.glow * live.glowScale;
        strokeArc(ctx, cx, cy, r, a.from, a.to, model.ringWidth, alpha(fillColor, live.glowAlpha), blur);
      }
      strokeArc(ctx, cx, cy, r, a.from, a.to, model.ringWidth, fillColor, 0);
    }
  }

  // Tick marks (over the fill, like the mockup).
  if (L.showTicks) {
    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = alpha(model.colors.tick, 0.55);
    const tickLen = Math.max(3, Math.min(6, r * 0.04));
    for (const t of model.ticks) {
      if (t.value < model.scale.min || t.value > model.scale.max) {
        continue;
      }
      const a = fractionToAngle(valueToFraction(t.value, model.scale), model.arc);
      const [x1, y1] = polar(cx, cy, a, r - tickLen);
      const [x2, y2] = polar(cx, cy, a, r + tickLen);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Live marker on the ring.
  {
    const [dx, dy] = polar(cx, cy, markerAngle, r);
    const dotR = clamp(model.ringWidth * 0.9, 3, 7);
    ctx.save();
    if (!live.dimmed) {
      ctx.shadowBlur = 10 * live.glowScale;
      ctx.shadowColor = alpha(model.markerColor, 0.9);
    }
    ctx.fillStyle = live.dimmed ? alpha(model.markerColor, 0.6) : model.markerColor;
    ctx.beginPath();
    ctx.arc(dx, dy, dotR, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = model.colors.background;
    ctx.beginPath();
    ctx.arc(dx, dy, dotR * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Stale caption.
  if (live.staleText && L.showStale) {
    ctx.save();
    ctx.font = `400 ${L.subtitleFont}px ${font}`;
    ctx.fillStyle = model.colors.textDisabled;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(live.staleText, cx, L.staleY);
    ctx.restore();
  }
}

/** Draws "Avg. 378 Wh/mi" with the first number in bold. */
function drawEmphasisedLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  size: number,
  font: string,
  color: string
) {
  ctx.fillStyle = color;
  const m = /^(.*?)(-?\d[\d.,]*)(.*)$/.exec(text);
  const regular = `400 ${size}px ${font}`;
  const bold = `600 ${size}px ${font}`;
  if (!m) {
    ctx.font = regular;
    ctx.textAlign = 'center';
    ctx.fillText(text, cx, y);
    return;
  }
  ctx.font = regular;
  const w1 = ctx.measureText(m[1]).width;
  const w3 = ctx.measureText(m[3]).width;
  ctx.font = bold;
  const w2 = ctx.measureText(m[2]).width;
  let x = cx - (w1 + w2 + w3) / 2;
  ctx.textAlign = 'left';
  ctx.font = regular;
  ctx.fillText(m[1], x, y);
  x += w1;
  ctx.font = bold;
  ctx.fillText(m[2], x, y);
  x += w2;
  ctx.font = regular;
  ctx.fillText(m[3], x, y);
  ctx.textAlign = 'center';
}

function drawHistory(ctx: CanvasRenderingContext2D, model: GaugeModel, L: Layout, window: LiveWindow | null) {
  const h = model.history!;
  const { x: hx, y: hyTop, w: hw, h: hh } = L.history;
  const { min, max, zero } = model.scale;
  const posSpan = Math.max(1e-9, max - zero);
  const negSpan = Math.max(1e-9, zero - min);
  const hasNeg = zero > min;
  const hasPos = max > zero;
  // Baseline so positive/negative areas are proportional to their ranges.
  const base = hasNeg && hasPos ? hyTop + hh * (posSpan / (posSpan + negSpan)) : hasPos ? hyTop + hh : hyTop;
  const yOf = (val: number) => {
    const v = clamp(val, min, max);
    return v >= zero
      ? base - ((v - zero) / posSpan) * (base - hyTop)
      : base + ((zero - v) / negSpan) * (hyTop + hh - base);
  };
  const pts = h.points;
  const xOf = (i: number) => {
    const p = pts[i];
    if (window && p.t !== undefined) {
      return hx + scrollX(p.t, window) * hw;
    }
    return hx + clamp(p.x, 0, 1) * hw;
  };

  // Baseline.
  ctx.save();
  ctx.strokeStyle = model.colors.baseline;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(hx, base);
  ctx.lineTo(hx + hw, base);
  ctx.stroke();
  ctx.restore();

  const fade = (color: string, alphaMax: number): string | CanvasGradient => {
    if (!h.fade) {
      return alpha(color, alphaMax);
    }
    const g = ctx.createLinearGradient(hx, 0, hx + hw, 0);
    g.addColorStop(0, alpha(color, 0));
    g.addColorStop(0.3, alpha(color, alphaMax * 0.2));
    g.addColorStop(0.75, alpha(color, alphaMax * 0.7));
    g.addColorStop(1, alpha(color, alphaMax));
    return g;
  };
  const pathLine = () => {
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const x = xOf(i);
      const y = yOf(pts[i].value);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
  };
  const pathArea = () => {
    pathLine();
    ctx.lineTo(xOf(pts.length - 1), base);
    ctx.lineTo(xOf(0), base);
    ctx.closePath();
  };

  // Clip to the chart box so scrolled-out samples disappear at the edges.
  ctx.save();
  ctx.beginPath();
  ctx.rect(hx - 1, hyTop - 2, hw + 2, hh + 4);
  ctx.clip();

  const halves: Array<[number, number, string, boolean]> = [];
  if (hasPos) {
    halves.push([hyTop - 2, base, h.positiveColor, true]);
  }
  if (hasNeg) {
    halves.push([base, hyTop + hh + 2, h.negativeColor, false]);
  }
  for (const [y0, y1, color, positive] of halves) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(hx - 2, y0, hw + 4, Math.max(0, y1 - y0));
    ctx.clip();
    if (h.area) {
      pathArea();
      ctx.fillStyle = fade(color, 0.28);
      ctx.fill();
    }
    ctx.lineJoin = 'round';
    ctx.lineWidth = h.lineWidth;
    if (h.colorFor && positive) {
      // Colour each segment by its value.
      for (let i = 1; i < pts.length; i++) {
        const c = h.colorFor(Math.max(pts[i].value, pts[i - 1].value));
        const a = h.fade ? Math.pow(i / pts.length, 1.3) : 1;
        ctx.strokeStyle = alpha(c, 0.15 + 0.85 * a);
        ctx.beginPath();
        ctx.moveTo(xOf(i - 1), yOf(pts[i - 1].value));
        ctx.lineTo(xOf(i), yOf(pts[i].value));
        ctx.stroke();
      }
    } else {
      pathLine();
      ctx.strokeStyle = fade(color, 1);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
}
