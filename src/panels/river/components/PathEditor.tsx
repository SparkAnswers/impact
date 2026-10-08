import React, { useCallback, useRef } from 'react';
import { css } from '@emotion/css';
import { useStyles2 } from '@grafana/ui';
import { clampWaypoint } from '../lib/path';
import type { Channel, Waypoint } from '../types';

interface Props {
  width: number;
  height: number;
  channels: Channel[];
  onChange: (channelId: string, path: Waypoint[]) => void;
}

const getStyles = () => ({
  svg: css({ position: 'absolute', left: 0, top: 0, cursor: 'default' }),
  line: css({ fill: 'none', stroke: 'rgba(255,255,255,0.55)', strokeDasharray: '4 4', strokeWidth: 1 }),
  handle: css({
    fill: '#ffffff',
    stroke: '#1f6feb',
    strokeWidth: 2,
    cursor: 'grab',
    '&:hover': { fill: '#cfe3ff' },
  }),
  hint: css({ fill: '#ffffff', fontSize: 11, paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.8)', strokeWidth: 3 }),
});

/** SVG overlay with draggable waypoint handles for channels in "edit path" mode. */
export const PathEditor: React.FC<Props> = ({ width, height, channels, onChange }) => {
  const styles = useStyles2(getStyles);
  const drag = useRef<{ channelId: string; index: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const toNorm = useCallback(
    (e: React.PointerEvent): Waypoint => {
      const rect = svgRef.current?.getBoundingClientRect();
      const x = rect ? (e.clientX - rect.left) / rect.width : 0;
      const y = rect ? (e.clientY - rect.top) / rect.height : 0;
      return clampWaypoint({ x, y });
    },
    []
  );

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) {
      return;
    }
    const ch = channels.find((c) => c.id === d.channelId);
    if (!ch) {
      return;
    }
    const p = toNorm(e);
    const path = ch.path.map((w, i) => (i === d.index ? p : w));
    onChange(ch.id, path);
  };

  const endDrag = (e: React.PointerEvent) => {
    if (drag.current) {
      (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
    }
    drag.current = null;
  };

  return (
    <svg
      ref={svgRef}
      className={styles.svg}
      width={width}
      height={height}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
      data-testid="river-path-editor"
    >
      {channels.map((ch) => (
        <g key={ch.id}>
          <polyline className={styles.line} points={ch.path.map((p) => `${p.x * width},${p.y * height}`).join(' ')} />
          {ch.path.map((p, i) => (
            <circle
              key={i}
              className={styles.handle}
              cx={p.x * width}
              cy={p.y * height}
              r={6}
              onPointerDown={(e) => {
                drag.current = { channelId: ch.id, index: i };
                (e.currentTarget.ownerSVGElement ?? e.currentTarget).setPointerCapture?.(e.pointerId);
                e.preventDefault();
              }}
            />
          ))}
          {ch.path[0] ? (
            <text className={styles.hint} x={ch.path[0].x * width + 10} y={ch.path[0].y * height - 10}>
              {`${ch.name}: drag handles to edit path`}
            </text>
          ) : null}
        </g>
      ))}
    </svg>
  );
};
