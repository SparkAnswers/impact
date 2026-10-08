import React from 'react';

export interface DefsProps {
  uid: string;
  markers: Array<{ id: string; color: string }>;
}

/** SVG filters (glows, shadow) and one arrow marker per edge colour. */
export const Defs: React.FC<DefsProps> = ({ uid, markers }) => (
  <defs>
    <filter id={`${uid}-glow`} x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="2.2" result="b" />
      <feMerge>
        <feMergeNode in="b" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
    <filter id={`${uid}-pglow`} x="-200%" y="-200%" width="500%" height="500%">
      <feGaussianBlur stdDeviation="2.5" result="b" />
      <feMerge>
        <feMergeNode in="b" />
        <feMergeNode in="b" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
    <filter id={`${uid}-shadow`} x="-20%" y="-20%" width="140%" height="160%">
      <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#000" floodOpacity="0.5" />
    </filter>
    {markers.map((m) => (
      <marker
        key={m.id}
        id={m.id}
        viewBox="0 0 10 10"
        refX="8"
        refY="5"
        markerWidth="6"
        markerHeight="6"
        markerUnits="strokeWidth"
        orient="auto-start-reverse"
      >
        <path d="M1 1.5 L8.5 5 L1 8.5 z" fill={m.color} />
      </marker>
    ))}
  </defs>
);
