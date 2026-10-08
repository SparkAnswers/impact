import React, { useEffect, useMemo, useRef } from 'react';
import { css } from '@emotion/css';
import {
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
import { PanelDataErrorView } from '@grafana/runtime';
import { useTheme2 } from '@grafana/ui';
import { extractSeries } from './lib/data';
import { type BandModel, drawGauge, type GaugeModel, type TickModel } from './lib/draw';
import { reduceValues } from './lib/reducers';
import { normalizeScale } from './lib/scale';
import { decimalsNeeded, generateTicks, parseTickList } from './lib/ticks';
import { DEFAULT_OPTIONS, type GaugeOptions } from './types';
import { useAnimatedValue } from './useAnimatedValue';

const styles = {
  wrap: css({ position: 'relative', overflow: 'hidden' }),
  canvas: css({ display: 'block' }),
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
}) => {
  const theme = useTheme2();
  const options = useMemo(() => ({ ...DEFAULT_OPTIONS, ...rawOptions }), [rawOptions]);
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

  const displayed = useAnimatedValue(series?.current ?? null, options.animate, options.animationDuration);

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
    const current = displayed;

    let fillColor: string;
    let bands: BandModel[] | undefined;
    if (options.colorMode === 'thresholds' && steps.length) {
      fillColor = thresholdColor(current ?? scale.zero);
      bands = steps.map((s, i) => ({
        from: Math.max(scale.min, Number.isFinite(s.value) ? s.value : scale.min),
        to: i + 1 < steps.length ? Math.min(scale.max, steps[i + 1].value) : scale.max,
        color: resolveColor(theme, s.color, positive),
      }));
    } else if (options.colorMode === 'field') {
      fillColor = resolveColor(theme, getFieldSeriesColor(field, theme).color, positive);
    } else {
      fillColor = current !== null && current < scale.zero ? negative : positive;
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
    return {
      width,
      height,
      scale,
      arc: { startAngle: options.startAngle, sweepAngle: options.sweepAngle, clockwise: options.clockwise },
      ringWidth: options.ringWidth,
      ringColor: resolveColor(theme, options.ringColor, isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.25)'),
      glow: options.glow,
      value: current,
      fillColor,
      markerColor: resolveColor(theme, options.markerColor, theme.colors.text.maxContrast),
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
      fontFamily: theme.typography.fontFamily,
      colors: {
        text: theme.colors.text.maxContrast,
        textSecondary: theme.colors.text.secondary,
        textDisabled: theme.colors.text.disabled,
        tick: theme.colors.text.primary,
        baseline: isDark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.28)',
        background: theme.colors.background.primary,
      },
    };
  }, [series, displayed, options, theme, timeZone, width, height, replaceVariables]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !model) {
      return;
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
      return;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawGauge(ctx, model);
  }, [model, width, height]);

  if (!series) {
    return <PanelDataErrorView panelId={id} data={data} fieldConfig={fieldConfig} needsNumberField />;
  }

  const label = model?.valueText ? `${model.valueText.prefix ?? ''}${model.valueText.text}${model.valueText.suffix ?? ''}` : 'no data';
  return (
    <div className={styles.wrap} style={{ width, height }} data-testid="impact-gauge">
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        style={{ width, height }}
        role="img"
        aria-label={`Gauge ${label}`}
        data-testid="impact-gauge-canvas"
      />
    </div>
  );
};
