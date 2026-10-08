/**
 * Data model for the Flow Designer panel. Everything here is stored as JSON in panel options.
 */

export type NodeShape = 'card' | 'pill' | 'hub' | 'circle';
export type NodeStatus = 'ok' | 'warn' | 'error' | 'none';
export type PortSide = 'auto' | 'left' | 'right' | 'top' | 'bottom';
export type ResolvedSide = Exclude<PortSide, 'auto'>;
export type EdgeStyle = 'bezier' | 'orthogonal' | 'straight' | 'step';
export type EdgeDash = 'solid' | 'dash' | 'dot';
export type BindTarget = 'speed' | 'color' | 'width';

export interface Point {
  x: number;
  y: number;
}

export interface ControlPoint {
  dx: number;
  dy: number;
}

export interface FlowNode {
  id: string;
  label: string;
  sublabel?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  shape: NodeShape;
  /** Icon name from the standard icon set */
  icon?: string;
  /** Accent colour (hex or named theme colour). Falls back to the status colour. */
  color?: string;
  status?: NodeStatus;
  /** Field display name whose last value is rendered as the live value */
  valueField?: string;
  /** Optional printf-like template, `${value}` is replaced by the formatted value */
  valueFormat?: string;
}

export interface EdgeParticles {
  enabled: boolean;
  count: number;
  speed: number;
  size: number;
}

export interface EdgeBinding {
  field: string;
  mapTo: BindTarget;
  min?: number;
  max?: number;
  reverseBelowZero?: boolean;
}

export interface FlowEdge {
  id: string;
  from: string;
  to: string;
  fromSide?: PortSide;
  toSide?: PortSide;
  style: EdgeStyle;
  curvature: number;
  /** Relative to the start and end points respectively (bezier only) */
  controlPoints?: [ControlPoint, ControlPoint];
  stroke: number;
  color: string;
  dash: EdgeDash;
  arrow: boolean;
  glow: boolean;
  particles: EdgeParticles;
  bind?: EdgeBinding;
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface GridSettings {
  show: boolean;
  size: number;
  snap: boolean;
}

export interface FlowDiagram {
  nodes: FlowNode[];
  edges: FlowEdge[];
  viewport: Viewport;
  grid: GridSettings;
}

export type BackgroundStyle = 'panel' | 'transparent' | 'dots' | 'lines';
export type NodeStyle = 'cards' | 'minimal';

export interface FlowOptions {
  appearance: {
    background: BackgroundStyle;
    nodeStyle: NodeStyle;
    fontSize: number;
    edgeColor: string;
    particleSpeed: number;
  };
  animation: {
    enabled: boolean;
    speed: number;
  };
  layout: {
    editMode: boolean;
    gridSize: number;
    snap: boolean;
    /** Ignore the stored viewport and fit all nodes into the panel when not editing */
    autoFit: boolean;
  };
  diagram: FlowDiagram;
}

/** Selection shared between the panel and the inspector option editor via panel instance state. */
export interface FlowSelection {
  kind: 'node' | 'edge';
  id: string;
}

export interface FlowInstanceState {
  selection?: FlowSelection;
}

export const DEFAULT_PARTICLES: EdgeParticles = { enabled: true, count: 2, speed: 1, size: 2 };

export const DEFAULT_EDGE: Omit<FlowEdge, 'id' | 'from' | 'to'> = {
  fromSide: 'auto',
  toSide: 'auto',
  style: 'bezier',
  curvature: 0.5,
  stroke: 1.5,
  color: '',
  dash: 'solid',
  arrow: true,
  glow: true,
  particles: { ...DEFAULT_PARTICLES },
};

export const DEFAULT_NODE: Omit<FlowNode, 'id' | 'label' | 'x' | 'y'> = {
  w: 140,
  h: 52,
  shape: 'card',
  status: 'none',
};

export const EMPTY_DIAGRAM: FlowDiagram = {
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  grid: { show: true, size: 20, snap: true },
};

export const DEFAULT_OPTIONS: FlowOptions = {
  appearance: {
    background: 'dots',
    nodeStyle: 'cards',
    fontSize: 12,
    edgeColor: 'blue',
    particleSpeed: 1,
  },
  animation: { enabled: true, speed: 1 },
  layout: { editMode: false, gridSize: 20, snap: true, autoFit: true },
  diagram: EMPTY_DIAGRAM,
};
