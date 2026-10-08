import React, { useCallback, useRef } from 'react';
import { css } from '@emotion/css';
import { useStyles2 } from '@grafana/ui';
import { clampWaypoint } from '../lib/path';
import type { NetworkNode } from '../lib/network';
import type { Waypoint } from '../types';

interface Props {
  width: number;
  height: number;
  nodes: NetworkNode[];
  onChange: (id: string, position: Waypoint) => void;
}

const getStyles = () => ({
  svg: css({ position: 'absolute', left: 0, top: 0, cursor: 'default' }),
  handle: css({
    fill: 'rgba(255,255,255,0.15)',
    stroke: '#1f6feb',
    strokeWidth: 2,
    strokeDasharray: '3 3',
    cursor: 'grab',
    '&:hover': { fill: 'rgba(207,227,255,0.35)' },
  }),
  hint: css({ fill: '#ffffff', fontSize: 11, paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.8)', strokeWidth: 3 }),
});

/** SVG overlay with draggable handles on the network nodes ("Edit on canvas" for the network map). */
export const NodeEditor: React.FC<Props> = ({ width, height, nodes, onChange }) => {
  const styles = useStyles2(getStyles);
  const drag = useRef<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const toNorm = useCallback((e: React.PointerEvent): Waypoint => {
    const rect = svgRef.current?.getBoundingClientRect();
    const x = rect ? (e.clientX - rect.left) / rect.width : 0;
    const y = rect ? (e.clientY - rect.top) / rect.height : 0;
    return clampWaypoint({ x, y });
  }, []);

  const onPointerMove = (e: React.PointerEvent) => {
    if (drag.current) {
      onChange(drag.current, toNorm(e));
    }
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
      data-testid="river-node-editor"
    >
      {nodes.map((n) => (
        <circle
          key={n.id}
          className={styles.handle}
          cx={n.x}
          cy={n.y}
          r={n.r + 6}
          data-testid={`river-node-handle-${n.id}`}
          onPointerDown={(e) => {
            drag.current = n.id;
            (e.currentTarget.ownerSVGElement ?? e.currentTarget).setPointerCapture?.(e.pointerId);
            e.preventDefault();
          }}
        />
      ))}
      {nodes[0] ? (
        <text className={styles.hint} x={12} y={height - 12}>
          Drag nodes to place them; positions are kept in Data › Positions
        </text>
      ) : null}
    </svg>
  );
};
