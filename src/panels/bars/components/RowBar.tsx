import React from 'react';
import { cx } from '@emotion/css';
import { alpha, colorByName, darken } from '../lib/color';
import type { BarRow } from '../lib/rows';
import type { BarsOptions } from '../types';
import type { BarsStyles } from './styles';
import { Sparkline } from './Sparkline';
import { useTheme2 } from '@grafana/ui';

interface Props {
  row: BarRow;
  options: BarsOptions;
  animate: boolean;
  styles: BarsStyles;
}

/** Renders the "Progress" cell for a row according to its resolved bar style. */
export const RowBar: React.FC<Props> = ({ row, options, animate, styles }) => {
  const theme = useTheme2();
  const hasValue = row.value !== undefined && !Number.isNaN(row.percent);
  const pct = hasValue ? row.percent * 100 : 0;
  const fillBg = options.fillGradient ? `linear-gradient(90deg, ${darken(row.color, 0.25)}, ${row.color})` : row.color;
  const label = (text: string, dim = true) => <span className={cx(styles.val, dim && styles.dim)}>{text}</span>;

  const withLabel = (bar: React.ReactNode, text: string) => {
    switch (options.labelPosition) {
      case 'hidden':
        return bar;
      case 'left':
        return (
          <>
            {label(text)}
            {bar}
          </>
        );
      default:
        return (
          <>
            {bar}
            {label(text)}
          </>
        );
    }
  };

  switch (row.style) {
    case 'sweep': {
      const text = row.status?.text || row.valueText;
      return (
        <div className={styles.cell} data-style="sweep">
          <div className={cx(styles.track, styles.sweepTrack)}>
            <div
              className={styles.sweepSeg}
              style={{
                width: `${options.sweepWidth}%`,
                background: row.color,
                animationPlayState: animate ? 'running' : 'paused',
              }}
            />
          </div>
          {options.labelPosition !== 'hidden' && text ? label(text) : null}
        </div>
      );
    }

    case 'segmented': {
      const n = Math.max(2, Math.min(50, Math.round(options.segments)));
      const on = hasValue ? Math.round(row.percent * n) : 0;
      return (
        <div className={styles.cell} data-style="segmented">
          {withLabel(
            <div className={styles.segs} role="img" aria-label={row.valueText}>
              {Array.from({ length: n }, (_, i) => (
                <i key={i} style={i < on ? { background: row.color } : undefined} />
              ))}
            </div>,
            row.valueText
          )}
        </div>
      );
    }

    case 'striped': {
      const stripe = `repeating-linear-gradient(135deg, ${row.color} 0 6px, ${darken(row.color, 0.3)} 6px 12px)`;
      return (
        <div className={styles.cell} data-style="striped">
          {withLabel(
            <div className={styles.track}>
              <div
                className={cx(styles.fill, styles.stripes)}
                style={{
                  width: `${pct}%`,
                  backgroundImage: stripe,
                  animationPlayState: animate ? 'running' : 'paused',
                }}
              />
            </div>,
            row.valueText
          )}
        </div>
      );
    }

    case 'bidirectional': {
      const half = Math.max(Math.abs(row.min), Math.abs(row.max)) || 1;
      const frac = hasValue ? Math.max(-1, Math.min(1, (row.value ?? 0) / half)) : 0;
      const neg = colorByName(theme, options.negativeColor);
      const pos = colorByName(theme, options.positiveColor);
      return (
        <div className={styles.cell} data-style="bidirectional">
          {withLabel(
            <div className={cx(styles.track, styles.bidi)}>
              {frac < 0 && <div className={styles.bidiNeg} style={{ width: `${-frac * 50}%`, background: neg }} />}
              <div className={styles.bidiZero} />
              {frac > 0 && <div className={styles.bidiPos} style={{ width: `${frac * 50}%`, background: pos }} />}
            </div>,
            row.valueText
          )}
        </div>
      );
    }

    case 'stacked': {
      const segs = row.stack ?? [];
      return (
        <div className={styles.cell} data-style="stacked">
          <div className={cx(styles.track, styles.stack)}>
            {segs.map((s, i) => (
              <i
                key={i}
                style={{ width: `${s.fraction * 100}%`, background: s.color }}
                title={`${s.label}: ${s.text}`}
              />
            ))}
          </div>
          {options.labelPosition !== 'hidden' && (
            <div className={styles.legend}>
              {segs.map((s, i) => (
                <span key={i}>
                  <b style={{ background: s.color }} />
                  {s.text}
                </span>
              ))}
            </div>
          )}
        </div>
      );
    }

    case 'sparkline': {
      return (
        <div className={styles.cell} data-style="sparkline">
          {row.sparkline ? (
            <Sparkline values={row.sparkline} color={row.color} className={styles.spark} />
          ) : (
            <span className={styles.dim}>{'—'}</span>
          )}
          {hasValue &&
            withLabel(
              <div className={cx(styles.track, styles.trackHalf)}>
                <div className={styles.fill} style={{ width: `${pct}%`, background: fillBg }} />
              </div>,
              row.valueText
            )}
        </div>
      );
    }

    case 'pill': {
      const text = row.status?.text || row.valueText;
      const color = row.status?.color ?? row.color;
      const blink = animate && /updat|progress|pending|sync/i.test(text);
      return (
        <div className={styles.cell} data-style="pill">
          <span
            className={styles.pill}
            style={{ color, borderColor: alpha(color, 0.35), background: alpha(color, 0.1) }}
          >
            <i className={cx(styles.pillDot, blink && styles.blink)} style={{ background: color }} />
            {text}
          </span>
        </div>
      );
    }

    case 'percent':
    default: {
      if (options.labelPosition === 'inside') {
        return (
          <div className={styles.cell} data-style="percent">
            <div className={cx(styles.track, styles.trackInside)}>
              <div className={styles.fill} style={{ width: `${pct}%`, background: fillBg }} />
              <span className={styles.inside}>{row.valueText}</span>
            </div>
          </div>
        );
      }
      return (
        <div className={styles.cell} data-style="percent">
          {withLabel(
            <div className={styles.track}>
              <div className={styles.fill} style={{ width: `${pct}%`, background: fillBg }} />
            </div>,
            row.valueText
          )}
        </div>
      );
    }
  }
};
