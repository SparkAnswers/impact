import React from 'react';
import { isIconName, type GrafanaTheme2 } from '@grafana/data';
import { Icon } from '@grafana/ui';
import type { FlowNode, NodeStyle, ResolvedSide } from '../types';

export interface NodeViewProps {
  node: FlowNode;
  theme: GrafanaTheme2;
  uid: string;
  nodeStyle: NodeStyle;
  fontSize: number;
  /** Formatted live value (already run through the field display processor) */
  value?: string;
  accent: string;
  selected: boolean;
  editing: boolean;
  /** Ports to draw (editing only) */
  ports?: ResolvedSide[];
  /** Enter / leave tween (data-driven diagrams) */
  opacity?: number;
  onPointerDown?: (e: React.PointerEvent<SVGGElement>, node: FlowNode) => void;
  onDoubleClick?: (node: FlowNode) => void;
  onPortPointerDown?: (e: React.PointerEvent<SVGCircleElement>, node: FlowNode, side: ResolvedSide) => void;
}

const SIDES: ResolvedSide[] = ['left', 'right', 'top', 'bottom'];

const portPos = (n: FlowNode, side: ResolvedSide) => {
  switch (side) {
    case 'left':
      return { x: 0, y: n.h / 2 };
    case 'right':
      return { x: n.w, y: n.h / 2 };
    case 'top':
      return { x: n.w / 2, y: 0 };
    case 'bottom':
      return { x: n.w / 2, y: n.h };
  }
};

export const NodeView: React.FC<NodeViewProps> = ({
  node: n,
  theme,
  uid,
  nodeStyle,
  fontSize,
  value,
  accent,
  selected,
  editing,
  opacity,
  onPointerDown,
  onDoubleClick,
  onPortPointerDown,
}) => {
  const hub = n.shape === 'hub';
  const pill = n.shape === 'pill';
  const circle = n.shape === 'circle';
  const minimal = nodeStyle === 'minimal';
  const isDark = theme.isDark;

  const fill = minimal
    ? 'transparent'
    : hub
      ? isDark
        ? '#1c2330'
        : theme.colors.primary.transparent
      : theme.colors.background.secondary;
  const stroke = selected ? theme.colors.primary.border : hub ? theme.colors.primary.main : theme.colors.border.medium;
  const text = theme.colors.text.primary;
  const muted = theme.colors.text.secondary;
  const sub = value ?? n.sublabel;
  const subColor = n.status === 'error' ? accent : hub ? theme.colors.primary.text : muted;
  const iconSize = hub ? 22 : pill ? 14 : circle ? Math.round(Math.min(n.w, n.h) * 0.4) : 18;
  const iconName = n.icon && isIconName(n.icon) ? n.icon : undefined;
  const iconColor = hub ? theme.colors.primary.text : pill ? accent : text;
  const ix = pill ? 24 : 12;
  const iy = (n.h - iconSize) / 2;
  const tx = (iconName ? ix + iconSize : ix - 2) + (pill ? 7 : 10);
  const labelSize = hub ? fontSize + 1 : fontSize;
  const subSize = hub ? fontSize : fontSize - 1;
  const rx = pill ? n.h / 2 : 8;
  const clipId = `${uid}-clip-${n.id}`;
  const r = circle ? Math.min(n.w, n.h) / 2 : 0;

  return (
    <g
      transform={`translate(${n.x},${n.y})`}
      opacity={opacity !== undefined && opacity < 1 ? opacity : undefined}
      style={{ cursor: editing ? 'grab' : 'default' }}
      onPointerDown={onPointerDown ? (e) => onPointerDown(e, n) : undefined}
      onDoubleClick={onDoubleClick ? () => onDoubleClick(n) : undefined}
      data-testid={`flow-node-${n.id}`}
      aria-label={n.label}
    >
      {circle ? (
        <>
          <circle
            cx={n.w / 2}
            cy={n.h / 2}
            r={r}
            fill={fill}
            stroke={selected ? theme.colors.primary.border : accent}
            strokeWidth={selected ? 2 : 1.5}
            filter={minimal ? undefined : `url(#${uid}-shadow)`}
          />
          {!minimal && (
            <circle cx={n.w / 2} cy={n.h / 2} r={r - 0.5} fill="none" stroke={accent} opacity={0.35} filter={`url(#${uid}-glow)`} />
          )}
          {iconName && (
            <foreignObject x={n.w / 2 - iconSize / 2} y={n.h / 2 - iconSize / 2 - (sub ? 4 : 0)} width={iconSize} height={iconSize}>
              <div style={{ color: iconColor, display: 'flex', alignItems: 'center', justifyContent: 'center', width: iconSize, height: iconSize }}>
                <Icon name={iconName} width={iconSize} height={iconSize} />
              </div>
            </foreignObject>
          )}
          <text
            x={n.w / 2}
            y={n.h + fontSize + 2}
            textAnchor="middle"
            fill={text}
            fontSize={labelSize}
            fontWeight={500}
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            {n.label}
          </text>
          {sub && (
            <text
              x={n.w / 2}
              y={n.h / 2 + iconSize / 2 + (iconName ? 6 : 2)}
              textAnchor="middle"
              fill={subColor}
              fontSize={subSize}
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              {sub}
            </text>
          )}
        </>
      ) : (
        <>
          <clipPath id={clipId}>
            <rect width={n.w} height={n.h} rx={rx} />
          </clipPath>
          <rect
            width={n.w}
            height={n.h}
            rx={rx}
            fill={fill}
            stroke={stroke}
            strokeWidth={selected ? 1.5 : hub ? 1.2 : 1}
            filter={minimal ? undefined : `url(#${uid}-shadow)`}
          />
          {hub && !minimal && (
            <rect
              x={0.5}
              y={0.5}
              width={n.w - 1}
              height={n.h - 1}
              rx={rx}
              fill="none"
              stroke={theme.colors.primary.main}
              opacity={0.4}
              filter={`url(#${uid}-glow)`}
            />
          )}
          {pill ? (
            <circle cx={13} cy={n.h / 2} r={4} fill={accent} />
          ) : (
            n.status !== 'none' && <rect width={3} height={n.h} fill={accent} clipPath={`url(#${clipId})`} />
          )}
          {iconName && (
            <foreignObject x={ix} y={iy} width={iconSize} height={iconSize}>
              <div style={{ color: iconColor, display: 'flex', alignItems: 'center', justifyContent: 'center', width: iconSize, height: iconSize }}>
                <Icon name={iconName} width={iconSize} height={iconSize} />
              </div>
            </foreignObject>
          )}
          <text
            x={tx}
            y={pill || !sub ? n.h / 2 + labelSize * 0.35 : n.h / 2 - 3}
            fill={text}
            fontSize={labelSize}
            fontWeight={hub ? 600 : 500}
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            {n.label}
          </text>
          {sub && !pill && (
            <text
              x={tx}
              y={n.h / 2 + subSize + 2}
              fill={subColor}
              fontSize={subSize}
              fontWeight={hub ? 500 : 400}
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              {sub}
            </text>
          )}
          {hub && (
            <>
              <rect x={n.w - 40} y={10} width={30} height={14} rx={7} fill={theme.colors.primary.transparent} stroke={theme.colors.primary.border} />
              <text
                x={n.w - 25}
                y={20}
                textAnchor="middle"
                fill={theme.colors.primary.text}
                fontSize={9}
                fontWeight={600}
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                HUB
              </text>
            </>
          )}
        </>
      )}
      {editing &&
        SIDES.map((side) => {
          const p = portPos(n, side);
          return (
            <circle
              key={side}
              cx={p.x}
              cy={p.y}
              r={4}
              fill={theme.colors.background.primary}
              stroke={selected ? theme.colors.primary.border : theme.colors.border.strong}
              strokeWidth={1.2}
              style={{ cursor: 'crosshair' }}
              data-testid={`flow-port-${n.id}-${side}`}
              onPointerDown={(e) => {
                e.stopPropagation();
                onPortPointerDown?.(e, n, side);
              }}
            />
          );
        })}
    </g>
  );
};
