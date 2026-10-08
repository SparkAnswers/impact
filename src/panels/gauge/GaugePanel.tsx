import React, { useEffect, useMemo, useRef, useState } from 'react';
import { css } from '@emotion/css';
import {
  colorManipulator,
  type Field,
  FieldType,
  getActiveThreshold,
  getDisplayProcessor,
  getFieldSeriesColor,
  type GrafanaTheme2,
  type PanelProps,
  type Threshold,
  ThresholdsMode,
} from '@grafana/data';
import { locationService, PanelDataErrorView } from '@grafana/runtime';
import { useTheme2 } from '@grafana/ui';
import { extractSeries, type GaugeSeries } from './lib/data';
import { type BandModel, defaultLiveState, drawLiveLayer, drawStaticLayer, type GaugeModel, layoutFor, type TickModel } from './lib/draw';
import {
  breathing,
  canScroll,
  easeTowards,
  inferSampleInterval,
  isStale,
  liveWindow,
  parseRefreshInterval,
  sampleAge,
  staleThreshold,
  trailAlpha,
  tween,
} from './lib/live';
import { reduceValues } from './lib/reducers';
import { normalizeScale, valueToAngle } from './lib/scale';
import { subscribeFrames } from './lib/scheduler';
import { decimalsNeeded, generateTicks, parseTickList } from './lib/ticks';
import { DEFAULT_OPTIONS, type GaugeOptions } from './types';
import { useAnimatedValue } from './useAnimatedValue';

const styles = {
  wrap: css({ position: 'relative', overflow: 'hidden' }),
  canvas: css({ display: 'block', position: 'absolute', left: 0, top: 0 }),
};

/** Resolves a user colour (named theme colour, hex, rgb) to CSS; empty strings fall back. */
function resolveColor(theme: GrafanaTheme2, color: string | undefined, fallback: string): string {
  if (!color) {
    return fallback;
  }
  try {
    return theme.visualization.getColorByName(color);
  } catch {
    return fallback;
  }
}

/** Threshold steps in absolute value units, sorted ascending, first step at -Infinity. */
function absoluteSteps(field: Field, min: number, max: number): Threshold[] {
  const t = field.config.thresholds;
  if (!t || !t.steps || t.steps.length === 0) {
    return [];
  }
  const steps = t.steps.map((s) => {
    const raw = s.value === null || s.value === undefined ? -Infinity : s.value;
    const value = t.mode === ThresholdsMode.Percentage && Number.isFinite(raw) ? min + ((max - min) * raw) / 100 : raw;
    return { value, color: s.color };
  });
  return steps.sort((a, b) => a.value - b.value);
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Dashboard refresh from the URL (e.g. "10s"); null when not set. */
function urlRefreshInterval(): number | null {
  try {
    const raw = locationService.getSearchObject().refresh;
    return parseRefreshInterval(typeof raw === 'string' ? raw : null);
  } catch {
    return null;
  }
}

/** Sizes a canvas for the device pixel ratio and returns a context scaled to CSS pixels. */
function prepareCanvas(canvas: HTMLCanvasElement | null, width: number, height: number): CanvasRenderingContext2D | null {
  if (!canvas) {
    return null;
  }
  const dpr = typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1;
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

/** Mutable per-panel state of the live loop; survives re-renders so easing continues across refreshes. */
interface LiveRuntime {
  value: number | null;
  tweenFrom: number;
  tweenTarget: number | null;
  tweenStart: number;
  tweenActive: boolean;
  winEnd: number | null;
  lastWall: number;
  trailVisible: boolean;
}

export const GaugePanel: React.FC<PanelProps<GaugeOptions>> = ({
  id,
  data,
  options: rawOptions,
  fieldConfig,
  width,
  height,
  timeRange,
  timeZone,
  replaceVariables,
  transparent,
}) => {
  const theme = useTheme2();
  const options = useMemo(() => ({ ...DEFAULT_OPTIONS, ...rawOptions }), [rawOptions]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const staticRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(true);

  const series = useMemo(
    () =>
      extractSeries(data.series, {
        fieldName: options.fieldName,
        source: options.historySource,
        points: options.historyPoints,
        timeRange,
      }),
    [data.series, options.fieldName, options.historySource, options.historyPoints, timeRange]
  );

  // Arrival bookkeeping: when did this data land, and how long since the previous one (observed refresh).
  // Runs as an effect (before the live loop effect below) so render stays pure.
  const arrival = useRef<{ at: number; prevAt: number | null; seen: boolean }>({ at: 0, prevAt: null, seen: false });
  useEffect(() => {
    const prev = arrival.current;
    arrival.current = { at: Date.now(), prevAt: prev.seen ? prev.at : null, seen: true };
  }, [data.series]);

  const liveWanted =
    options.animate && (options.liveScroll || options.liveDrift || options.liveTrail || options.liveStale);
  const liveEnabled = liveWanted && visible && !!series && !prefersReducedMotion();

  // Static fallback easing (used when live motion is off).
  const displayed = useAnimatedValue(series?.latest ?? null, options.animate && !liveEnabled, options.animationDuration);

  const model = useMemo<GaugeModel | null>(() => {
    if (!series) {
      return null;
    }
    const { field } = series;
    const display =
      field.display ?? getDisplayProcessor({ field: { ...field, type: FieldType.number }, theme, timeZone });
    const cfg = field.config;
    const dataMin = series.dataMin ?? 0;
    const dataMax = series.dataMax ?? 1;
    const scale = normalizeScale({
      min: typeof cfg.min === 'number' ? cfg.min : Math.min(dataMin, 0),
      max: typeof cfg.max === 'number' ? cfg.max : Math.max(dataMax, 0),
      zero: options.zeroValue,
      zeroPosition: typeof options.zeroPosition === 'number' ? options.zeroPosition : undefined,
      kind: options.scale,
    });

    const positive = resolveColor(theme, options.positiveColor, theme.visualization.getColorByName('orange'));
    const negative = resolveColor(theme, options.negativeColor, theme.visualization.getColorByName('green'));
    const steps = absoluteSteps(field, scale.min, scale.max);
    const thresholdColor = (v: number) => resolveColor(theme, getActiveThreshold(v, steps).color, positive);
    const current = series.latest;
    const shown = liveEnabled ? current : displayed;

    let fillColor: string;
    let fillColorFor: ((v: number) => string) | undefined;
    let bands: BandModel[] | undefined;
    if (options.colorMode === 'thresholds' && steps.length) {
      fillColorFor = thresholdColor;
      fillColor = thresholdColor(current ?? scale.zero);
      bands = steps.map((s, i) => ({
        from: Math.max(scale.min, Number.isFinite(s.value) ? s.value : scale.min),
        to: i + 1 < steps.length ? Math.min(scale.max, steps[i + 1].value) : scale.max,
        color: resolveColor(theme, s.color, positive),
      }));
    } else if (options.colorMode === 'field') {
      fillColor = resolveColor(theme, getFieldSeriesColor(field, theme).color, positive);
    } else {
      fillColorFor = (v) => (v < scale.zero ? negative : positive);
      fillColor = fillColorFor(current ?? scale.zero);
    }

    // Unit suffix of the field (taken from the max end so scaled units are consistent).
    const unitSuffix = (display(scale.max).suffix ?? '').trim();
    let ticks: TickModel[] = [];
    if (options.tickMode !== 'none') {
      const values = options.tickMode === 'custom' ? parseTickList(options.tickValues) : generateTicks(scale, 4);
      // Ticks use only as many decimals as the tick values themselves need, independent of the field decimals.
      const tickDisplay = getDisplayProcessor({
        field: { type: FieldType.number, config: { unit: cfg.unit, decimals: decimalsNeeded(values) } },
        theme,
        timeZone,
      });
      const tickLabel = (v: number): string => {
        const d = tickDisplay(v);
        const suffix = (d.suffix ?? '').trim();
        return `${d.prefix ?? ''}${d.text}${suffix && suffix !== unitSuffix ? ` ${suffix}` : ''}`;
      };
      ticks = values.map((value) => ({ value, label: tickLabel(value) }));
    }

    // The number always shows the real latest sample, never an eased value.
    const valueDisplay = current !== null ? display(current) : undefined;

    // Secondary line.
    let secondaryText: string | undefined;
    if (options.showSecondary) {
      const template = replaceVariables(options.secondaryText ?? '');
      if (options.secondaryMode === 'reducer') {
        const reduced = reduceValues(series.windowValues, options.secondaryReducer);
        const proc = getDisplayProcessor({
          field: {
            type: FieldType.number,
            config: {
              unit: options.secondaryUnit || cfg.unit,
              decimals: typeof options.secondaryDecimals === 'number' ? options.secondaryDecimals : cfg.decimals,
            },
          },
          theme,
          timeZone,
        });
        let text = '';
        if (reduced !== null) {
          const d = proc(reduced);
          text = `${d.prefix ?? ''}${d.text}${d.suffix ?? ''}`;
        }
        secondaryText = template.includes('{value}') ? template.replace(/\{value\}/g, text) : `${template} ${text}`.trim();
      } else {
        secondaryText = template;
      }
      secondaryText = secondaryText.trim() || undefined;
    }

    const isDark = theme.isDark;
    const solidBackground =
      options.background === 'solid' && options.backgroundColor
        ? resolveColor(theme, options.backgroundColor, theme.colors.background.primary)
        : undefined;
    // The canvases only ever clear to transparent; this colour is used for the marker's inner dot so it
    // matches whatever is behind the panel (custom fill, the page when transparent, else the panel).
    const behind = solidBackground ?? (transparent ? theme.colors.background.canvas : theme.colors.background.primary);
    // Over a custom fill the theme text colours may not contrast; pick a light or dark set from its luminance.
    let onDark = isDark;
    if (solidBackground) {
      try {
        onDark = colorManipulator.getLuminance(solidBackground) < 0.4;
      } catch {
        onDark = isDark;
      }
    }
    const palette = solidBackground
      ? onDark
        ? { text: '#ffffff', secondary: 'rgba(255,255,255,0.72)', disabled: 'rgba(255,255,255,0.5)', tick: 'rgba(255,255,255,0.85)' }
        : { text: '#111111', secondary: 'rgba(0,0,0,0.7)', disabled: 'rgba(0,0,0,0.5)', tick: 'rgba(0,0,0,0.8)' }
      : {
          text: theme.colors.text.maxContrast,
          secondary: theme.colors.text.secondary,
          disabled: theme.colors.text.disabled,
          tick: theme.colors.text.primary,
        };
    return {
      width,
      height,
      scale,
      arc: { startAngle: options.startAngle, sweepAngle: options.sweepAngle, clockwise: options.clockwise },
      ringWidth: options.ringWidth,
      ringColor: resolveColor(theme, options.ringColor, onDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.25)'),
      glow: options.glow,
      value: shown,
      fillColor,
      fillColorFor,
      markerColor: resolveColor(theme, options.markerColor, palette.text),
      bands,
      ticks,
      showTicks: options.tickMode !== 'none',
      showTickLabels: options.showTickLabels,
      zeroLabel: options.showUnitAtZero && unitSuffix ? unitSuffix : undefined,
      history: options.showHistory
        ? {
            points: series.history,
            positiveColor: options.colorMode === 'field' ? fillColor : positive,
            negativeColor: options.colorMode === 'field' ? fillColor : negative,
            colorFor: options.historyColorMode === 'thresholds' && steps.length ? thresholdColor : undefined,
            fade: options.fadeHistory,
            lineWidth: options.historyLineWidth,
            area: options.historyArea,
          }
        : undefined,
      showValue: options.showValue,
      valueText: valueDisplay ? { prefix: valueDisplay.prefix, text: valueDisplay.text, suffix: valueDisplay.suffix } : undefined,
      valueLabel: options.valueLabel ? replaceVariables(options.valueLabel).trim() || undefined : undefined,
      showSecondary: options.showSecondary,
      secondaryText,
      subtitleText: options.subtitleText ? replaceVariables(options.subtitleText).trim() || undefined : undefined,
      titleText: options.titleText ? replaceVariables(options.titleText).trim() || undefined : undefined,
      titlePosition: options.titlePosition,
      valueFontPx: options.valueFontSize > 0 ? options.valueFontSize : undefined,
      reserveStaleLine: liveWanted && options.liveStale,
      fontFamily: theme.typography.fontFamily,
      colors: {
        text: palette.text,
        textSecondary: palette.secondary,
        textDisabled: palette.disabled,
        tick: palette.tick,
        baseline: onDark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.28)',
        background: behind,
      },
    };
  }, [series, displayed, liveEnabled, liveWanted, options, theme, timeZone, width, height, replaceVariables, transparent]);

  // Visibility gating for the live loop.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      return;
    }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        setVisible(e.isIntersecting);
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Static layer: redrawn only when data/options/size/theme change.
  useEffect(() => {
    if (!model) {
      return;
    }
    const ctx = prepareCanvas(staticRef.current, width, height);
    if (ctx) {
      drawStaticLayer(ctx, model, layoutFor(model));
    }
  }, [model, width, height]);

  // Live layer when live motion is off: one draw per change, using the React-eased value.
  useEffect(() => {
    if (!model || liveEnabled) {
      return;
    }
    const ctx = prepareCanvas(liveRef.current, width, height);
    if (ctx) {
      drawLiveLayer(ctx, model, layoutFor(model), defaultLiveState(model.value));
    }
  }, [model, liveEnabled, width, height]);

  // Live loop runtime (persists across data updates so easing continues).
  const runtime = useRef<LiveRuntime>({
    value: null,
    tweenFrom: 0,
    tweenTarget: null,
    tweenStart: -1,
    tweenActive: false,
    winEnd: null,
    lastWall: 0,
    trailVisible: false,
  });

  const staleFormat = useMemo(
    () => getDisplayProcessor({ field: { type: FieldType.number, config: { unit: 's', decimals: 0 } }, theme, timeZone }),
    [theme, timeZone]
  );

  useEffect(() => {
    if (!model || !series || !liveEnabled) {
      return;
    }
    const ctx = prepareCanvas(liveRef.current, width, height);
    if (!ctx) {
      return;
    }
    const L = layoutFor(model);
    const rt = runtime.current;
    const s: GaugeSeries = series;
    const arrivedAt = arrival.current.at || Date.now();
    const observedRefresh = arrival.current.prevAt !== null ? arrivedAt - arrival.current.prevAt : null;
    const refreshInterval =
      observedRefresh !== null && observedRefresh > 500 && observedRefresh < 3_600_000 ? observedRefresh : urlRefreshInterval();
    const sampleInterval = inferSampleInterval(s.windowTimes);
    const cadence = sampleInterval ?? refreshInterval;
    const threshold = staleThreshold(sampleInterval, refreshInterval);

    // Scroll: wall-clock window anchored to the data end; requires a cadence and a "now"-ending range.
    const span = s.span ?? (cadence !== null ? Math.max(1, s.windowValues.length - 1) * cadence : null);
    const dataTo = s.dataTo;
    const scrolling =
      options.liveScroll && cadence !== null && span !== null && span > 0 && dataTo !== null && canScroll(dataTo, arrivedAt, refreshInterval);
    if (!scrolling) {
      rt.winEnd = null;
    }

    // Marker tween towards the real latest value.
    const target = s.latest;
    if (target !== null && rt.tweenTarget !== target) {
      rt.tweenFrom = rt.value ?? target;
      rt.tweenTarget = target;
      rt.tweenStart = -1;
      rt.tweenActive = rt.value !== null && rt.tweenFrom !== target;
      if (!rt.tweenActive) {
        rt.value = target;
      }
    }
    const tweenDuration = options.liveDrift ? options.liveDriftDuration : options.animationDuration;

    // Trail: angles of the last K samples (allocated once per data update, not per frame).
    const K = options.liveTrail ? Math.max(2, Math.min(50, Math.floor(options.liveTrailSamples) || 2)) : 0;
    const state = defaultLiveState(rt.value, K);
    const trailT = new Float64Array(K);
    let trailCount = 0;
    if (K > 0) {
      const n = s.windowValues.length;
      for (let i = Math.max(0, n - K); i < n; i++) {
        const t = s.windowTimes[i];
        if (t === null) {
          continue;
        }
        trailT[trailCount] = t;
        state.trailAngles[trailCount] = valueToAngle(s.windowValues[i], model.scale, model.arc);
        trailCount++;
      }
    }
    const trailWindow = Math.max(4000, (cadence ?? 0) * K);
    const breathingAmp = options.liveDrift ? options.liveBreathing : 0;
    const win = { from: 0, to: 0 };
    rt.lastWall = Date.now();
    let lastStale: string | null = state.staleText;
    let first = true;

    const unsubscribe = subscribeFrames((frame, wall) => {
      const dt = wall - rt.lastWall;
      rt.lastWall = wall;
      let changed = first;
      first = false;

      // Eased marker value.
      if (rt.tweenActive && rt.tweenTarget !== null) {
        if (rt.tweenStart < 0) {
          rt.tweenStart = frame;
        }
        const v = tween(rt.tweenFrom, rt.tweenTarget, frame - rt.tweenStart, tweenDuration);
        rt.value = v;
        if (v === rt.tweenTarget) {
          rt.tweenActive = false;
        }
        changed = true;
      }
      state.value = rt.value;

      // Sliding window.
      if (scrolling) {
        const targetEnd = liveWindow(dataTo!, span!, arrivedAt, wall).to;
        const next = rt.winEnd === null ? targetEnd : easeTowards(rt.winEnd, targetEnd, dt, 250);
        if (next !== rt.winEnd) {
          changed = true;
        }
        rt.winEnd = next;
        win.to = next;
        win.from = next - span!;
        state.window = win;
      } else {
        state.window = null;
      }

      // Stale detection (wall clock vs newest sample).
      const stale = options.liveStale && isStale(wall, s.newestTime, threshold);
      let staleText: string | null = null;
      if (stale && s.newestTime !== null) {
        const d = staleFormat(Math.round(sampleAge(wall, s.newestTime) / 1000));
        staleText = `stale · ${d.text}${d.suffix ?? ''}`;
      }
      if (staleText !== lastStale) {
        lastStale = staleText;
        changed = true;
      }
      state.staleText = staleText;
      state.dimmed = stale;

      // Breathing glow (not while stale).
      if (breathingAmp > 0 && !stale) {
        const b = breathing(wall, 2400, breathingAmp);
        state.glowScale = b;
        state.glowAlpha = 0.55 + 0.45 * (b - 1 + breathingAmp / 2) / Math.max(breathingAmp, 1e-6);
        changed = true;
      } else {
        state.glowScale = stale ? 0.3 : 1;
        state.glowAlpha = stale ? 0.35 : 1;
      }

      // Trail opacities.
      if (trailCount > 1) {
        let any = false;
        for (let i = 0; i < trailCount; i++) {
          const a = trailAlpha(wall - trailT[i], trailWindow);
          state.trailAlphas[i] = a;
          if (a > 0.01) {
            any = true;
          }
        }
        if (any || rt.trailVisible) {
          changed = true;
        }
        rt.trailVisible = any;
        state.trailCount = any ? trailCount : 0;
      }

      if (!changed) {
        return;
      }
      drawLiveLayer(ctx, model, L, state);
    });
    return unsubscribe;
  }, [model, series, liveEnabled, options, width, height, staleFormat]);

  if (!series) {
    return <PanelDataErrorView panelId={id} data={data} fieldConfig={fieldConfig} needsNumberField />;
  }

  const label = model?.valueText ? `${model.valueText.prefix ?? ''}${model.valueText.text}${model.valueText.suffix ?? ''}` : 'no data';
  const wrapStyle: React.CSSProperties = { width, height };
  if (options.background === 'solid' && options.backgroundColor) {
    wrapStyle.background = resolveColor(theme, options.backgroundColor, theme.colors.background.primary);
  }
  return (
    <div ref={wrapRef} className={styles.wrap} style={wrapStyle} data-testid="impact-gauge">
      <canvas ref={staticRef} className={styles.canvas} style={{ width, height }} aria-hidden="true" />
      <canvas
        ref={liveRef}
        className={styles.canvas}
        style={{ width, height }}
        role="img"
        aria-label={`Gauge ${label}`}
        data-testid="impact-gauge-canvas"
      />
    </div>
  );
};
