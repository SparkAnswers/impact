import React, { useEffect, useMemo, useRef, useState } from 'react';
import { css } from '@emotion/css';
import {
  colorManipulator,
  type DisplayProcessor,
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
import { DemoBadge, rollingSignedPowerSeries, useDemoFrames, type DemoGenerator } from '../../shared/demo';
import { useMotionAllowed } from '../../shared/motion';
import { ReducedMotionHint } from '../../shared/ReducedMotionHint';
import { extractSeries, pickField } from './lib/data';
import {
  type BandModel,
  defaultLiveState,
  drawLiveLayer,
  drawStaticLayer,
  type GaugeModel,
  layoutFor,
  type LiveState,
  type TickModel,
} from './lib/draw';
import type { Layout } from './lib/layout';
import {
  adaptiveDelay,
  advancePlayhead,
  breathing,
  canScroll,
  easeTowards,
  inferSampleInterval,
  interpolateAt,
  isStale,
  liveWindow,
  parseRefreshInterval,
  sampleAge,
  staleThreshold,
  trailAlpha,
  trailFreshness,
  tween,
  underrunDelay,
} from './lib/live';
import { reduceValues } from './lib/reducers';
import { normalizeScale, valueToAngle } from './lib/scale';
import { subscribeFrames } from './lib/scheduler';
import { autoRange, decimalsNeeded, generateTicks, parseTickList } from './lib/ticks';
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
  tweenDuration: number;
  /** Time-range scroll: displayed window end (ms). */
  winEnd: number | null;
  /** Stream playback: playhead time (ms), the right edge of the chart. */
  playhead: number | null;
  /** Current (eased) and target jitter-buffer delay (ms). */
  delay: number | null;
  delayTarget: number;
  /** Raised on underruns so they do not recur (auto mode). */
  delayFloor: number;
  /** Last value formatted for the live big number. */
  lastFormatted: number | null;
  lastWall: number;
  trailVisible: boolean;
  forceRedraw: boolean;
}

/** Everything the frame loop needs from the latest data arrival. Replaced per arrival, never per frame. */
interface LiveData {
  model: GaugeModel;
  layout: Layout;
  newestTime: number | null;
  arrivedAt: number;
  threshold: number | null;
  scrolling: boolean;
  stream: boolean;
  span: number;
  dataTo: number;
  trailT: Float64Array;
  trailCount: number;
  trailWindow: number;
  breathingAmp: number;
  staleEnabled: boolean;
  /** Stream playback. */
  follow: boolean;
  latency: number;
  fixedDelay: number | null;
  observedRefresh: number | null;
  fallbackRefresh: number | null;
  /** Compact ascending timestamps/values of the window for interpolation. */
  times: Float64Array;
  values: Float64Array;
  display: DisplayProcessor;
}

const MAX_TRAIL = 50;

/** Demo data: one signed power series at the window cadence (1 s over the last 15 min), anchored to now. */
const demoGenerator: DemoGenerator = (w) => [rollingSignedPowerSeries(w.now, w.durationMs, w.stepMs)];
/** Real data counts as usable when it has at least one numeric field. */
const hasNumericField = (series: Parameters<typeof pickField>[0]) => pickField(series) !== null;

export const GAUGE_NO_DATA_MESSAGE = 'Needs one numeric time series';

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

  // Generated data when the query has nothing usable (or always), through the same field-config pipeline.
  const { frames, isDemo } = useDemoFrames(data, options.demoData, demoGenerator, {
    fieldConfig,
    replaceVariables,
    theme,
    timeZone,
    timeRange,
    isUsable: hasNumericField,
  });

  const series = useMemo(
    () =>
      extractSeries(frames, {
        fieldName: options.fieldName,
        source: options.historySource,
        points: options.historyPoints,
        streamDuration: Math.max(1, options.streamDuration) * 1000,
        timeRange,
      }),
    [frames, options.fieldName, options.historySource, options.historyPoints, options.streamDuration, timeRange]
  );

  // Arrival bookkeeping: when did this data land, and how long since the previous one (observed refresh).
  // Runs as an effect (before the live loop effect below) so render stays pure.
  const arrival = useRef<{ at: number; prevAt: number | null; seen: boolean }>({ at: 0, prevAt: null, seen: false });
  useEffect(() => {
    const prev = arrival.current;
    arrival.current = { at: Date.now(), prevAt: prev.seen ? prev.at : null, seen: true };
  }, [frames]);

  // Animation switch combined with the Reduced motion preference (shared helper, follows the media query).
  const motionOn = useMotionAllowed(options.animate, options.reducedMotion);
  const liveWanted = motionOn && (options.liveScroll || options.liveDrift || options.liveTrail || options.liveStale);
  const liveEnabled = liveWanted && visible && !!series;

  // Static fallback easing (used when live motion is off).
  const displayed = useAnimatedValue(series?.latest ?? null, motionOn && !liveEnabled, options.animationDuration);

  const model = useMemo<GaugeModel | null>(() => {
    if (!series) {
      return null;
    }
    const { field } = series;
    const display =
      field.display ?? getDisplayProcessor({ field: { ...field, type: FieldType.number }, theme, timeZone });
    const cfg = field.config;
    // Range: the field's min/max after overrides (what the user set); otherwise a nice range of the data.
    const auto = autoRange(series.dataMin, series.dataMax, options.zeroValue);
    const scale = normalizeScale({
      min: typeof cfg.min === 'number' && Number.isFinite(cfg.min) ? cfg.min : auto.min,
      max: typeof cfg.max === 'number' && Number.isFinite(cfg.max) ? cfg.max : auto.max,
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
    const follow = liveEnabled && options.historySource === 'stream' && options.liveFollow && series.newestTime !== null;

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
      valueOnLiveLayer: follow,
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

  // ---- Live loop ------------------------------------------------------------------------------
  // Runtime easing state persists across data updates so motion continues through refreshes.
  const runtime = useRef<LiveRuntime>({
    value: null,
    tweenFrom: 0,
    tweenTarget: null,
    tweenStart: -1,
    tweenActive: false,
    tweenDuration: 0,
    winEnd: null,
    playhead: null,
    delay: null,
    delayTarget: 0,
    delayFloor: 0,
    lastFormatted: null,
    lastWall: 0,
    trailVisible: false,
    forceRedraw: true,
  });
  const liveData = useRef<LiveData | null>(null);
  const fieldDisplay = useMemo<DisplayProcessor | null>(() => {
    if (!series) {
      return null;
    }
    return series.field.display ?? getDisplayProcessor({ field: { ...series.field, type: FieldType.number }, theme, timeZone });
  }, [series, theme, timeZone]);
  const liveState = useRef<LiveState>(defaultLiveState(null, MAX_TRAIL));

  const staleFormat = useMemo(
    () => getDisplayProcessor({ field: { type: FieldType.number, config: { unit: 's', decimals: 0 } }, theme, timeZone }),
    [theme, timeZone]
  );

  // Retarget on every data arrival / option change: refresh the sample buffers and easing targets only.
  // The frame loop below is not re-subscribed and the static layer is on its own canvas.
  useEffect(() => {
    if (!model || !series || !liveEnabled) {
      liveData.current = null;
      return;
    }
    const rt = runtime.current;
    const st = liveState.current;
    const arrivedAt = arrival.current.at || Date.now();
    const observedRefresh = arrival.current.prevAt !== null ? arrivedAt - arrival.current.prevAt : null;
    const refreshInterval =
      observedRefresh !== null && observedRefresh > 500 && observedRefresh < 3_600_000 ? observedRefresh : urlRefreshInterval();
    const sampleInterval = inferSampleInterval(series.windowTimes);
    const cadence = sampleInterval ?? refreshInterval;
    const threshold = staleThreshold(sampleInterval, refreshInterval);

    const stream = options.historySource === 'stream' && series.newestTime !== null && series.span !== null;
    const span = series.span ?? (cadence !== null ? Math.max(1, series.windowValues.length - 1) * cadence : null);
    const dataTo = series.dataTo;
    const scrolling =
      options.liveScroll &&
      span !== null &&
      span > 0 &&
      dataTo !== null &&
      (stream || (cadence !== null && canScroll(dataTo, arrivedAt, refreshInterval)));
    if (!scrolling || stream) {
      rt.winEnd = null;
    }
    const latency = stream ? Math.min(60_000, Math.max(0, arrivedAt - series.newestTime!)) : 0;
    const fallbackRefresh = urlRefreshInterval();
    const observed = observedRefresh !== null && observedRefresh > 500 && observedRefresh < 3_600_000 ? observedRefresh : null;
    const fixedDelay = options.playbackDelay === 'fixed' ? Math.max(1, options.playbackDelaySeconds) * 1000 : null;
    if (stream && scrolling) {
      // Jitter buffer: the playhead runs `delay` behind the wall clock; underruns raise the floor (auto mode).
      rt.delayTarget = fixedDelay ?? Math.max(rt.delayFloor, adaptiveDelay(observed, fallbackRefresh, latency));
      if (rt.delay === null) {
        rt.delay = rt.delayTarget;
      }
    } else {
      rt.playhead = null;
      rt.delay = null;
    }
    // Compact ascending arrays for interpolation under the playhead.
    let count = 0;
    for (const t of series.windowTimes) {
      if (t !== null) {
        count++;
      }
    }
    const times = new Float64Array(count);
    const values = new Float64Array(count);
    for (let i = 0, j = 0; i < series.windowTimes.length; i++) {
      const t = series.windowTimes[i];
      if (t !== null) {
        times[j] = t;
        values[j] = series.windowValues[i];
        j++;
      }
    }

    // Marker tween towards the real latest value.
    const target = series.latest;
    if (target !== null && rt.tweenTarget !== target) {
      rt.tweenFrom = rt.value ?? target;
      rt.tweenTarget = target;
      rt.tweenStart = -1;
      rt.tweenActive = rt.value !== null && rt.tweenFrom !== target;
      if (!rt.tweenActive) {
        rt.value = target;
      }
    }
    rt.tweenDuration = options.liveDrift ? options.liveDriftDuration : options.animationDuration;

    // Trail: angles of the last K samples, written into the persistent state buffers.
    const K = options.liveTrail ? Math.max(2, Math.min(MAX_TRAIL, Math.floor(options.liveTrailSamples) || 2)) : 0;
    const trailT = new Float64Array(K);
    let trailCount = 0;
    const n = series.windowValues.length;
    for (let i = Math.max(0, n - K); i < n && K > 0; i++) {
      const t = series.windowTimes[i];
      if (t === null) {
        continue;
      }
      trailT[trailCount] = t;
      st.trailAngles[trailCount] = valueToAngle(series.windowValues[i], model.scale, model.arc);
      trailCount++;
    }

    liveData.current = {
      model,
      layout: layoutFor(model),
      newestTime: series.newestTime,
      arrivedAt,
      threshold,
      scrolling,
      stream,
      span: span ?? 0,
      dataTo: dataTo ?? 0,
      trailT,
      trailCount,
      trailWindow: Math.max(4000, (cadence ?? 0) * K),
      breathingAmp: options.liveDrift ? options.liveBreathing : 0,
      staleEnabled: options.liveStale,
      follow: stream && scrolling && options.liveFollow && !!fieldDisplay,
      latency,
      fixedDelay,
      observedRefresh: observed,
      fallbackRefresh,
      times,
      values,
      display: fieldDisplay ?? ((v) => ({ text: String(v), numeric: Number(v) })),
    };
    rt.forceRedraw = true;
  }, [model, series, liveEnabled, options, fieldDisplay]);

  // The frame loop: subscribed once while live motion is on (re-subscribed only on resize).
  useEffect(() => {
    if (!liveEnabled) {
      return;
    }
    const ctx = prepareCanvas(liveRef.current, width, height);
    if (!ctx) {
      return;
    }
    const rt = runtime.current;
    const st = liveState.current;
    const win = { from: 0, to: 0 };
    rt.lastWall = Date.now();
    rt.forceRedraw = true;
    let lastStale: string | null = null;

    return subscribeFrames((frame, wall) => {
      const ld = liveData.current;
      if (!ld) {
        return;
      }
      const dt = wall - rt.lastWall;
      rt.lastWall = wall;
      let changed = rt.forceRedraw;
      rt.forceRedraw = false;

      // Stream playback: advance the playhead (never past the newest sample, never backwards, never a jump).
      let playhead: number | null = null;
      if (ld.scrolling && ld.stream && ld.newestTime !== null) {
        rt.delay = easeTowards(rt.delay ?? rt.delayTarget, rt.delayTarget, dt, 3000);
        const prev = rt.playhead;
        if (prev !== null && ld.fixedDelay === null && prev + dt > ld.newestTime && wall - rt.delay > ld.newestTime) {
          // Underrun: data arrived later than the buffer covers. Grow the delay so it does not recur.
          const grown = underrunDelay(wall, ld.newestTime, ld.latency);
          if (grown > rt.delayFloor) {
            rt.delayFloor = grown;
            rt.delayTarget = Math.max(rt.delayTarget, grown);
          }
        }
        playhead = advancePlayhead(prev, wall, rt.delay, ld.newestTime, dt);
        rt.playhead = playhead;
      }

      // Eased marker value (or the interpolated sample under the playhead).
      if (ld.follow && playhead !== null) {
        const v = interpolateAt(ld.times, ld.values, playhead);
        if (v !== null && v !== rt.value) {
          rt.value = v;
          rt.tweenActive = false;
          rt.tweenTarget = v;
          changed = true;
        }
        if (v !== null && (rt.lastFormatted === null || Math.abs(v - rt.lastFormatted) > 1e-9)) {
          const d = ld.display(v);
          st.valueText = { prefix: d.prefix, text: d.text, suffix: d.suffix };
          rt.lastFormatted = v;
          changed = true;
        }
      } else {
        st.valueText = null;
        rt.lastFormatted = null;
      }
      if (!ld.follow && rt.tweenActive && rt.tweenTarget !== null) {
        if (rt.tweenStart < 0) {
          rt.tweenStart = frame;
        }
        const v = tween(rt.tweenFrom, rt.tweenTarget, frame - rt.tweenStart, rt.tweenDuration);
        rt.value = v;
        if (v === rt.tweenTarget) {
          rt.tweenActive = false;
        }
        changed = true;
      }
      st.value = rt.value;

      // Sliding window.
      if (ld.scrolling && ld.stream && playhead !== null) {
        // The right edge of the chart is the playhead: constant speed, no gap, eased when the buffer runs dry.
        if (playhead !== win.to) {
          changed = true;
        }
        win.to = playhead;
        win.from = playhead - ld.span;
        st.window = win;
      } else if (ld.scrolling) {
        const targetEnd = liveWindow(ld.dataTo, ld.span, ld.arrivedAt, wall).to;
        const next = rt.winEnd === null ? targetEnd : easeTowards(rt.winEnd, targetEnd, dt, 250);
        if (next !== rt.winEnd) {
          changed = true;
        }
        rt.winEnd = next;
        win.to = next;
        win.from = next - ld.span;
        st.window = win;
      } else {
        st.window = null;
      }

      // Stale detection (wall clock vs newest sample).
      const stale = ld.staleEnabled && isStale(wall, ld.newestTime, ld.threshold);
      let staleText: string | null = null;
      if (stale && ld.newestTime !== null) {
        const d = staleFormat(Math.round(sampleAge(wall, ld.newestTime) / 1000));
        staleText = `stale \u00b7 ${d.text}${d.suffix ?? ''}`;
      }
      if (staleText !== lastStale) {
        lastStale = staleText;
        changed = true;
      }
      st.staleText = staleText;
      st.dimmed = stale;

      // Breathing glow (not while stale).
      if (ld.breathingAmp > 0 && !stale) {
        const b = breathing(wall, 2400, ld.breathingAmp);
        st.glowScale = b;
        st.glowAlpha = 0.55 + (0.45 * (b - 1 + ld.breathingAmp / 2)) / Math.max(ld.breathingAmp, 1e-6);
        changed = true;
      } else {
        st.glowScale = stale ? 0.3 : 1;
        st.glowAlpha = stale ? 0.35 : 1;
      }

      // Trail opacities: per-sample age along the playback, times a wall-clock freshness that is gone
      // about 8 s after the last data arrival, and nothing at all while stale.
      const freshness = stale ? 0 : trailFreshness(wall, ld.arrivedAt);
      if (ld.trailCount > 1 && freshness > 0) {
        let any = false;
        for (let i = 0; i < ld.trailCount; i++) {
          const a = freshness * trailAlpha((playhead ?? wall) - ld.trailT[i], ld.trailWindow);
          st.trailAlphas[i] = a;
          if (a > 0.01) {
            any = true;
          }
        }
        if (any || rt.trailVisible) {
          changed = true;
        }
        rt.trailVisible = any;
        st.trailCount = any ? ld.trailCount : 0;
      } else {
        st.trailCount = 0;
      }

      if (!changed) {
        return;
      }
      drawLiveLayer(ctx, ld.model, ld.layout, st);
    });
  }, [liveEnabled, width, height, staleFormat]);

  if (!series) {
    return (
      <PanelDataErrorView panelId={id} data={data} fieldConfig={fieldConfig} needsNumberField message={GAUGE_NO_DATA_MESSAGE} />
    );
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
      <DemoBadge visible={isDemo} width={width} />
      <ReducedMotionHint animationEnabled={options.animate} preference={options.reducedMotion} width={width} />
    </div>
  );
};
