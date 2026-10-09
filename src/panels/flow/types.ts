import type { DemoMode } from '../../shared/demo';
import type { MotionPreference } from '../../shared/motion';
import type { QuickStartState } from '../../shared/presets';

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
  /** Image URL (http(s) or data:image) drawn in place of the icon; falls back to the icon when it fails to load */
  image?: string;
  /** Accent colour (hex or named theme colour). Falls back to the status colour. */
  color?: string;
  status?: NodeStatus;
  /** Field display name whose last value is rendered as the live value */
  valueField?: string;
  /** Optional printf-like template, `${value}` is replaced by the formatted value */
  valueFormat?: string;
  /** Group name (data-driven diagrams only; drives the group colour and group boxes) */
  group?: string;
  /** Per-node link (manual: beats the Links template; data: a data link from the node frame) */
  link?: string;
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
  /** Second binding (data-driven diagrams: the secondary value field) */
  bind2?: EdgeBinding;
  /** Small text drawn at the middle of the edge (data-driven diagrams) */
  label?: string;
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

/** Where the diagram comes from: drawn by hand, built from query results, or built from data with manual tweaks. */
export type DiagramSource = 'manual' | 'data' | 'overrides';
export type LayoutDirection = 'lr' | 'tb' | 'radial';
export type ValueMapTarget = BindTarget | 'none';

/** Per-node tweaks on top of a data-driven diagram, keyed by node id. */
export interface NodeOverride {
  x?: number;
  y?: number;
  label?: string;
  color?: string;
  icon?: string;
  /** Image URL (http(s) or data:image) drawn in place of the icon */
  image?: string;
  shape?: NodeShape;
  status?: NodeStatus;
}

export interface DataOptions {
  source: DiagramSource;
  /** Edge frames: field or label names */
  sourceField: string;
  targetField: string;
  valueField: string;
  value2Field: string;
  labelField: string;
  sourceGroupField: string;
  targetGroupField: string;
  /** Node frames: field or label names */
  nodeIdField: string;
  nodeLabelField: string;
  nodeGroupField: string;
  nodeStatusField: string;
  nodeValueField: string;
  /** Node frames: optional field (or label) with an image URL (http(s) or data:image) */
  nodeImageField: string;
  /** What the primary / secondary edge values drive */
  valueMap: ValueMapTarget;
  value2Map: ValueMapTarget;
  /** Draw the formatted primary value on each edge (when no label field is set) */
  showEdgeValues: boolean;
  /** Keep only the N edges with the highest value (0 = all, still capped) */
  topN: number;
  layout: LayoutDirection;
  layerGap: number;
  nodeGap: number;
  /** Layered layouts: fold a layer with more than this many nodes into side-by-side bands (0 = never) */
  wrap: number;
  groupBoxes: boolean;
  overrides: Record<string, NodeOverride>;
}

export type LinkTarget = 'same' | 'new';
export type LinkTrigger = 'dblclick' | 'click' | 'off';
/** What a node click does: open the URL template, or set a dashboard variable so every query on the page follows. */
export type LinkAction = 'link' | 'variable';

export interface LinkOptions {
  /** URL template; supports dashboard variables and ${node.id|label|group|value|status} tokens */
  nodeUrl: string;
  target: LinkTarget;
  trigger: LinkTrigger;
  action?: LinkAction;
  /** Dashboard variable name (without `$`) set by a node click when action is `variable` */
  variable?: string;
  /** Value template for the variable; supports the `${node.*}` tokens (not URL-encoded) */
  variableValue?: string;
  /** Value written by the chip's clear button (empty, or `$__all` for query variables with All) */
  variableClear?: string;
}

export interface InteractionOptions {
  /** View mode: Ctrl/⌘ + wheel (or plain wheel in view-panel mode) zooms, drag pans, double-click fits */
  zoom: boolean;
}

export interface FlowOptions {
  /** Last Quick start preset request (see src/shared/presets). */
  quickStart?: QuickStartState;
  interaction?: InteractionOptions;
  links?: LinkOptions;
  appearance: {
    background: BackgroundStyle;
    nodeStyle: NodeStyle;
    fontSize: number;
    edgeColor: string;
    particleSpeed: number;
    /** Size of a node image in pixels (it takes the icon's slot) */
    imageSize?: number;
  };
  animation: {
    enabled: boolean;
    speed: number;
    /** How the system reduce-motion preference is treated (default: follow it). */
    reducedMotion?: MotionPreference;
  };
  layout: {
    editMode: boolean;
    gridSize: number;
    snap: boolean;
    /** Ignore the stored viewport and fit all nodes into the panel when not editing */
    autoFit: boolean;
  };
  diagram: FlowDiagram;
  data: DataOptions;
  /**
   * Built-in generated service graph. Data modes: replaces the query result when it yields no edges (or
   * always). Manual mode: an empty diagram shows the generated graph (data layout) until one is drawn.
   */
  demoData?: DemoMode;
}

/** Selection shared between the panel and the inspector option editor via panel instance state. */
export interface FlowSelection {
  kind: 'node' | 'edge';
  id: string;
}

export interface FlowInstanceState {
  selection?: FlowSelection;
  /** The diagram currently built from data (so option editors can inspect data nodes) */
  dataDiagram?: FlowDiagram;
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

export const DEFAULT_DATA_OPTIONS: DataOptions = {
  source: 'manual',
  sourceField: 'source',
  targetField: 'target',
  valueField: '',
  value2Field: '',
  labelField: 'label',
  sourceGroupField: 'source_group',
  targetGroupField: 'target_group',
  nodeIdField: 'id',
  nodeLabelField: 'label',
  nodeGroupField: 'group',
  nodeStatusField: 'status',
  nodeValueField: '',
  nodeImageField: 'image',
  valueMap: 'speed',
  value2Map: 'color',
  showEdgeValues: false,
  topN: 200,
  layout: 'lr',
  layerGap: 120,
  nodeGap: 24,
  wrap: 0,
  groupBoxes: true,
  overrides: {},
};

/** Hard limits for data-driven diagrams; beyond these the panel truncates and shows a notice. */
export const MAX_DATA_NODES = 400;
export const MAX_DATA_EDGES = 1500;

/** Node image size (px): default and the slider bounds of Appearance → Image size. */
export const DEFAULT_IMAGE_SIZE = 24;
export const MIN_IMAGE_SIZE = 12;
export const MAX_IMAGE_SIZE = 64;

export const DEFAULT_LINKS: LinkOptions = { nodeUrl: '', target: 'same', trigger: 'dblclick', action: 'link', variable: '', variableValue: '${node.id}', variableClear: '' };
export const DEFAULT_INTERACTION: InteractionOptions = { zoom: true };

export const DEFAULT_OPTIONS: FlowOptions = {
  interaction: DEFAULT_INTERACTION,
  links: DEFAULT_LINKS,
  appearance: {
    background: 'dots',
    nodeStyle: 'cards',
    fontSize: 12,
    edgeColor: 'blue',
    particleSpeed: 1,
    imageSize: 24,
  },
  animation: { enabled: true, speed: 1, reducedMotion: 'system' },
  layout: { editMode: false, gridSize: 20, snap: true, autoFit: true },
  diagram: EMPTY_DIAGRAM,
  data: DEFAULT_DATA_OPTIONS,
  demoData: 'whenNoData',
};
