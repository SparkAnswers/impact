import React, { useMemo } from 'react';
import { alpha } from '../lib/color';
import { sparklineGeometry } from '../lib/sparkline';

interface Props {
  values: number[];
  color: string;
  width?: number;
  height?: number;
  className?: string;
}

/** Inline SVG mini line chart with a soft area fill and a dot on the last point. */
export const Sparkline: React.FC<Props> = ({ values, color, width = 70, height = 20, className }) => {
  const geo = useMemo(() => sparklineGeometry(values, width, height, 2), [values, width, height]);
  if (!geo) {
    return null;
  }
  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      data-testid="impact-sparkline"
    >
      <polygon points={geo.area} fill={alpha(color, 0.15)} stroke="none" />
      <polyline
        points={geo.line}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={geo.last.x} cy={geo.last.y} r={2} fill={color} />
    </svg>
  );
};
