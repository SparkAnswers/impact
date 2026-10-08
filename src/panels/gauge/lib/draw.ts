import { colorManipulator } from '@grafana/data';
import { computeLayout, type Layout, type LayoutInput } from './layout';
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
  points: Array<{ x: number; value: number }>;
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
  /** Displayed (eased) value; null draws an empty gauge. */
  value: number | null;
  fillColor: string;
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
    titlePosition: model.titleText ? model.titlePosition : 'hidden',
    valueFontPx: model.valueFontPx,
  };
  return computeLayout(input);
}

/** Draws the whole gauge. `ctx` must already be scaled for device pixel ratio. */
export function drawGauge(ctx: CanvasRenderingContext2D, model: GaugeModel): Layout {
  const L = layoutFor(model);
  const { cx, cy, r } = L;
  const font = model.fontFamily;
  ctx.clearRect(0, 0, model.width, model.height);

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

  // Fill arc from the zero mark to the value.
  let markerAngle = fractionToAngle(valueToFraction(model.scale.zero, model.scale), model.arc);
  if (model.value !== null) {
    const a = signedArc(model.value, model.scale, model.arc);
    markerAngle = a.to;
    if (a.size > 1e-4) {
      if (model.glow > 0) {
        strokeArc(ctx, cx, cy, r, a.from, a.to, model.ringWidth, model.fillColor, model.glow);
      }
      strokeArc(ctx, cx, cy, r, a.from, a.to, model.ringWidth, model.fillColor, 0);
    }
  }

  // Ticks.
  if (L.showTicks) {
    ctx.save();
    ctx.font = `500 ${L.tickFont}px ${font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = alpha(model.colors.tick, 0.55);
    ctx.fillStyle = alpha(model.colors.tick, 0.8);
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
      if (L.showTickLabels && t.label) {
        const isZero = t.value === model.scale.zero && !!model.zeroLabel;
        if (!isZero) {
          const [tx, ty] = polar(cx, cy, a, L.tickLabelRadius);
          ctx.fillText(t.label, tx, ty);
        }
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

  // History chart inside the ring.
  if (model.history && model.history.points.length > 1 && L.history.h > 8) {
    drawHistory(ctx, model, L);
  }

  // Live marker on the ring.
  {
    const [dx, dy] = polar(cx, cy, markerAngle, r);
    const dotR = clamp(model.ringWidth * 0.9, 3, 7);
    ctx.save();
    ctx.shadowBlur = 10;
    ctx.shadowColor = alpha(model.markerColor, 0.9);
    ctx.fillStyle = model.markerColor;
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
  return L;
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

function drawHistory(ctx: CanvasRenderingContext2D, model: GaugeModel, L: Layout) {
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
  const xOf = (x: number) => hx + clamp(x, 0, 1) * hw;
  const pts = h.points;

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
    pts.forEach((p, i) => {
      const x = xOf(p.x);
      const y = yOf(p.value);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
  };
  const pathArea = () => {
    pathLine();
    ctx.lineTo(xOf(pts[pts.length - 1].x), base);
    ctx.lineTo(xOf(pts[0].x), base);
    ctx.closePath();
  };

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
        ctx.moveTo(xOf(pts[i - 1].x), yOf(pts[i - 1].value));
        ctx.lineTo(xOf(pts[i].x), yOf(pts[i].value));
        ctx.stroke();
      }
    } else {
      pathLine();
      ctx.strokeStyle = fade(color, 1);
      ctx.stroke();
    }
    ctx.restore();
  }
}
