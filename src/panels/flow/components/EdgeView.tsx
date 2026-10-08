import React from 'react';
import type { GrafanaTheme2 } from '@grafana/data';
import { midpoint, type EdgeGeometry } from '../lib/geometry';
import type { FlowEdge } from '../types';

export interface ResolvedEdge {
  edge: FlowEdge;
  geo: EdgeGeometry;
  color: string;
  width: number;
  /** Effective particle speed multiplier */
  speed: number;
  reversed: boolean;
  markerId?: string;
}

export interface EdgeViewProps {
  item: ResolvedEdge;
  theme: GrafanaTheme2;
  uid: string;
  selected: boolean;
  editing: boolean;
  /** Enter / leave tween (data-driven diagrams) */
  opacity?: number;
  /** Font size for the optional edge label */
  fontSize?: number;
  onPointerDown?: (e: React.PointerEvent<SVGPathElement>, edge: FlowEdge) => void;
}

const dashArray = (dash: FlowEdge['dash'], width: number) =>
  dash === 'dash' ? `${width * 4} ${width * 3}` : dash === 'dot' ? `${width} ${width * 2.5}` : undefined;

export const EdgeView: React.FC<EdgeViewProps> = ({ item, theme, uid, selected, editing, opacity, fontSize = 11, onPointerDown }) => {
  const { edge, geo, color, width, markerId } = item;
  const dash = dashArray(edge.dash, width);
  const mid = edge.label ? midpoint(geo) : undefined;
  const labelW = edge.label ? edge.label.length * fontSize * 0.58 + 10 : 0;
  return (
    <g data-testid={`flow-edge-${edge.id}`} opacity={opacity !== undefined && opacity < 1 ? opacity : undefined}>
      {edge.glow && (
        <path d={geo.d} fill="none" stroke={color} strokeWidth={width + 4} opacity={0.22} strokeLinecap="round" filter={`url(#${uid}-glow)`} />
      )}
      <path
        d={geo.d}
        fill="none"
        stroke={color}
        strokeWidth={width}
        strokeLinecap="round"
        strokeDasharray={dash}
        opacity={selected ? 1 : 0.9}
        markerEnd={edge.arrow && markerId ? `url(#${markerId})` : undefined}
        style={{ pointerEvents: 'none' }}
      />
      {mid && edge.label && (
        <g style={{ pointerEvents: 'none' }} data-testid={`flow-edge-label-${edge.id}`}>
          <rect x={mid.x - labelW / 2} y={mid.y - fontSize * 0.75} width={labelW} height={fontSize * 1.5} rx={3} fill={theme.colors.background.primary} opacity={0.85} />
          <text x={mid.x} y={mid.y + fontSize * 0.35} textAnchor="middle" fill={theme.colors.text.secondary} fontSize={fontSize} style={{ userSelect: 'none' }}>
            {edge.label}
          </text>
        </g>
      )}
      {editing && (
        // Fat invisible path to make the edge easy to click
        <path
          d={geo.d}
          fill="none"
          stroke="transparent"
          strokeWidth={Math.max(12, width + 10)}
          style={{ cursor: 'pointer' }}
          onPointerDown={onPointerDown ? (e) => onPointerDown(e, edge) : undefined}
        />
      )}
      {selected && (
        <>
          <path d={geo.d} fill="none" stroke={theme.colors.text.primary} strokeWidth={width + 6} opacity={0.08} style={{ pointerEvents: 'none' }} />
          <path d={geo.d} fill="none" stroke={theme.colors.text.primary} strokeWidth={1} strokeDasharray="3 3" opacity={0.4} style={{ pointerEvents: 'none' }} />
        </>
      )}
    </g>
  );
};
