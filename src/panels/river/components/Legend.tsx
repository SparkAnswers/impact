import React from 'react';
import { css, cx } from '@emotion/css';
import { type GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import type { ColorMapper, LegendTick } from '../lib/colors';
import type { LegendPosition } from '../types';

interface Props {
  mapper: ColorMapper;
  format: (v: number) => string;
  unit?: string;
  position: LegendPosition;
  /** Shift down to make room for the title block. */
  offsetTop?: number;
  name?: string;
  panelWidth: number;
  panelHeight: number;
  /** Light text with shadow over a background image; theme text otherwise. */
  onImage?: boolean;
}

const LEGEND_W = 230;
const UNIT_W = 44;
/** Bottom legends move to the top when the panel is shorter than this. */
const SHORT_PANEL = 240;

const getStyles = (theme: GrafanaTheme2, onImage: boolean) => ({
  root: css({
    position: 'absolute',
    width: LEGEND_W,
    pointerEvents: 'none',
    fontSize: 10,
    color: onImage ? '#cfd2d6' : theme.colors.text.secondary,
    textShadow: onImage ? '0 1px 3px #000' : `0 0 2px ${theme.colors.background.primary}, 0 0 6px ${theme.colors.background.primary}`,
    fontFamily: theme.typography.fontFamily,
  }),
  name: css({ fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 3, opacity: 0.85 }),
  bar: css({ height: 5, borderRadius: 3, boxShadow: '0 0 0 1px rgba(0,0,0,.5)' }),
  ticks: css({ position: 'relative', height: 14, marginTop: 3 }),
  tick: css({ position: 'absolute', transform: 'translateX(-50%)', whiteSpace: 'nowrap' }),
  tickFirst: css({ transform: 'none' }),
  tickLast: css({ transform: 'translateX(-100%)' }),
  unit: css({ position: 'absolute', left: LEGEND_W + 6, top: -5, whiteSpace: 'nowrap' }),
});

/** Hides ticks whose label would overlap the previously shown one (approx. 5.5px per character). */
function visibleTicks(ticks: LegendTick[], w: number, format: (v: number) => string): Array<{ tick: LegendTick; i: number }> {
  const out: Array<{ tick: LegendTick; i: number }> = [];
  let lastRight = -Infinity;
  const last = ticks.length - 1;
  ticks.forEach((tick, i) => {
    const tw = format(tick.value).length * 5.5 + 6;
    const x = tick.t * w;
    const left = i === 0 ? x : i === last ? x - tw : x - tw / 2;
    const right = left + tw;
    if (i === last && out.length > 1 && left < lastRight) {
      out.pop();
    }
    if (left >= lastRight || i === last) {
      out.push({ tick, i });
      lastRight = right;
    }
  });
  return out;
}

export const Legend: React.FC<Props> = ({ mapper, format, unit, position, offsetTop = 0, name, panelWidth, panelHeight, onImage = false }) => {
  const styles = useStyles2(getStyles, onImage);
  const pos: React.CSSProperties = {};
  const top = position.startsWith('top') || panelHeight < SHORT_PANEL;
  if (top) {
    pos.top = Math.min(14 + offsetTop, Math.max(4, panelHeight - 44));
  } else {
    pos.bottom = 16;
  }
  const w = Math.max(80, Math.min(LEGEND_W, panelWidth - 40 - (unit ? UNIT_W : 0)));
  pos.width = w;
  if (position.endsWith('left')) {
    pos.left = 20;
  } else {
    pos.right = 20 + (unit ? UNIT_W : 0);
  }
  return (
    <div className={styles.root} style={pos} data-testid="river-legend">
      {name ? <div className={styles.name}>{name}</div> : null}
      <div style={{ position: 'relative' }}>
        <div className={styles.bar} style={{ background: mapper.gradient }} />
        {unit ? (
          <div className={styles.unit} style={{ left: w + 6 }}>
            {unit}
          </div>
        ) : null}
      </div>
      <div className={styles.ticks}>
        {visibleTicks(mapper.ticks, w, format).map(({ tick: t, i }) => (
          <span
            key={i}
            className={cx(styles.tick, i === 0 && styles.tickFirst, i === mapper.ticks.length - 1 && styles.tickLast)}
            style={{ left: `${t.t * 100}%` }}
          >
            {format(t.value)}
          </span>
        ))}
      </div>
    </div>
  );
};
