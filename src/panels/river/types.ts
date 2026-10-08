import type { DemoMode } from '../../shared/demo';
import type { LayoutDirection } from '../../shared/graph/layout';
import type { MotionPreference } from '../../shared/motion';

/** Normalised waypoint, 0..1 in panel coordinates (x to the right, y downwards). */
export interface Waypoint {
  x: number;
  y: number;
}

export type SourceMode = 'series' | 'field' | 'fixed';

/** Where a channel takes a numeric input from. */
export interface ValueSource {
  mode: SourceMode;
  /** Series selector: query refId, frame name or 0-based frame index. Empty = auto. */
  series?: string;
  /** Field display name (searched across all frames). */
  field?: string;
  /** Constant used in 'fixed' mode. */
  fixed?: number;
}

export type ColorPreset = 'turbo' | 'viridis' | 'inferno' | 'cool' | 'warm' | 'thresholds' | 'custom';

export interface ColorStop {
  value: number;
  color: string;
}

export interface ScaleDomain {
  mode: 'auto' | 'fixed';
  min?: number;
  max?: number;
}

export type ParticleColorMode = 'white' | 'byValue' | 'fixed';

export interface ParticleOptions {
  count: number;
  speed: number;
  trail: number;
  width: number;
  color: ParticleColorMode;
  fixedColor?: string;
}

export type Direction = 'forward' | 'reverse' | 'bySign';
export type LabelSide = 'left' | 'right' | 'center';
export type MultiSeriesMode = 'ignore' | 'lanes';
export type PathPreset = 'horizontal' | 'scurve' | 'diagonal' | 'u';

export interface ChannelLabel {
  text: string;
  /** Position along the path, 0..1. */
  at: number;
  side: LabelSide;
}

export interface Channel {
  id: string;
  name: string;
  path: Waypoint[];
  speedSource: ValueSource;
  widthSource: ValueSource;
  /** Base (maximum) channel width in CSS pixels. */
  widthPx: number;
  colorScale: ColorPreset;
  customStops: ColorStop[];
  scaleDomain: ScaleDomain;
  particles: ParticleOptions;
  direction: Direction;
  labels: ChannelLabel[];
  opacity: number;
  /** How extra series are handled when this is the only channel. */
  multiSeries: MultiSeriesMode;
  /** Smoothing window in samples applied to speed and width (0 = auto: 5% of the sample count, min 3). */
  smoothing: number;
  /** When true the panel shows draggable waypoint handles for this channel. */
  editPath?: boolean;
}

export type LegendPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export type BackgroundMode = 'panel' | 'image' | 'none';
export type BackgroundFit = 'cover' | 'contain';

/** Where the channels come from: the hand-placed list, or one channel per edge of a data-driven graph. */
export type ChannelSource = 'manual' | 'network';
export type NodePlacement = 'auto' | 'positions';

/** A node pinned to a normalised panel position (0..1). */
export interface NodePosition {
  id: string;
  x: number;
  y: number;
}

/** Hand-placed and dragged node positions (one object so the editor can reset both). */
export interface NetworkLayout {
  /** Positions typed into the editor (or seeded from the auto layout). */
  positions: NodePosition[];
  /** Positions dragged on the canvas; they win over `positions` and the auto layout. */
  overrides: Record<string, Waypoint>;
}

export interface NetworkOptions {
  /** Field (or series label) holding the edge source node id. */
  sourceField: string;
  /** Field (or series label) holding the edge target node id. */
  targetField: string;
  /** Numeric edge value: colour scale, particle speed, caption. Empty = first numeric field. */
  valueField: string;
  /** Optional second numeric field (or series / metric name): channel width. */
  value2Field: string;
  /** Optional edge label field. */
  labelField: string;
  /** Node frames: id, label and status fields. */
  nodeIdField: string;
  nodeLabelField: string;
  nodeStatusField: string;
  placement: NodePlacement;
  layoutDirection: LayoutDirection;
  layout: NetworkLayout;
  /** Draggable node handles on the panel. */
  editNodes: boolean;
  /** Node puck radius in CSS pixels. */
  nodeSize: number;
  /** Channel width in CSS pixels (the widest channel when a second value drives the width). */
  widthPx: number;
  /** Bend of each channel as a fraction of its length (0 = straight). */
  curve: number;
  colorScale: ColorPreset;
  scaleDomain: ScaleDomain;
  direction: Direction;
  /** Particle budget shared by all channels in proportion to their value (before the global multiplier). */
  particleBudget: number;
  particles: ParticleOptions;
  showNodeLabels: boolean;
  showValueLabels: boolean;
  /** Channel whose value feeds `{value}` and the caption line, as `source>target`. Empty = sum of all channels. */
  captionChannel: string;
}

export interface RiverOptions {
  /** Built-in generated data: never, only when the query has nothing usable, or always. */
  demoData: DemoMode;
  channelSource: ChannelSource;
  channels: Channel[];
  network: NetworkOptions;
  defaultColorScale: ColorPreset;
  showLegend: boolean;
  legendPosition: LegendPosition;
  particleCountMultiplier: number;
  particleSpeedMultiplier: number;
  title: string;
  subtitle: string;
  caption: string;
  captionBig: boolean;
  captionValue: boolean;
  background: BackgroundMode;
  backgroundUrl: string;
  backgroundFit: BackgroundFit;
  backgroundDim: number;
  /** Soft dark halo around each channel. */
  channelHalo: boolean;
  animate: boolean;
  animationSpeed: number;
  reducedMotion: MotionPreference;
}

export const DEFAULT_PARTICLES: ParticleOptions = {
  count: 1500,
  speed: 1,
  trail: 0.9,
  width: 1.5,
  color: 'white',
  fixedColor: '#ffffff',
};

export const DEFAULT_CUSTOM_STOPS: ColorStop[] = [
  { value: 0, color: '#1f3b8a' },
  { value: 50, color: '#2bb3c8' },
  { value: 80, color: '#f0f078' },
  { value: 100, color: '#ff3c28' },
];

export function createChannel(partial: Partial<Channel> = {}): Channel {
  return {
    id: partial.id ?? `ch-${Math.random().toString(36).slice(2, 8)}`,
    name: partial.name ?? 'Channel',
    path: partial.path ?? [],
    speedSource: partial.speedSource ?? { mode: 'series', series: '' },
    widthSource: partial.widthSource ?? { mode: 'fixed' },
    widthPx: partial.widthPx ?? 90,
    colorScale: partial.colorScale ?? 'turbo',
    customStops: partial.customStops ?? DEFAULT_CUSTOM_STOPS.map((s) => ({ ...s })),
    scaleDomain: partial.scaleDomain ?? { mode: 'auto' },
    particles: { ...DEFAULT_PARTICLES, ...(partial.particles ?? {}) },
    direction: partial.direction ?? 'forward',
    labels: partial.labels ?? [],
    opacity: partial.opacity ?? 0.86,
    multiSeries: partial.multiSeries ?? 'ignore',
    smoothing: partial.smoothing ?? 0,
    editPath: partial.editPath ?? false,
  };
}

export const DEFAULT_NETWORK: NetworkOptions = {
  sourceField: 'source',
  targetField: 'target',
  valueField: '',
  value2Field: '',
  labelField: 'label',
  nodeIdField: 'id',
  nodeLabelField: 'label',
  nodeStatusField: 'status',
  placement: 'auto',
  layoutDirection: 'lr',
  layout: { positions: [], overrides: {} },
  editNodes: false,
  nodeSize: 14,
  widthPx: 28,
  curve: 0.12,
  colorScale: 'turbo',
  scaleDomain: { mode: 'auto' },
  direction: 'bySign',
  particleBudget: 6000,
  particles: { ...DEFAULT_PARTICLES, count: 0, trail: 0.88, width: 1.2 },
  showNodeLabels: true,
  showValueLabels: true,
  captionChannel: '',
};

export const DEFAULT_OPTIONS: RiverOptions = {
  demoData: 'whenNoData',
  channelSource: 'manual',
  channels: [],
  network: DEFAULT_NETWORK,
  defaultColorScale: 'turbo',
  showLegend: true,
  legendPosition: 'top-left',
  particleCountMultiplier: 1,
  particleSpeedMultiplier: 1,
  title: '',
  subtitle: '',
  caption: '',
  captionBig: true,
  captionValue: true,
  background: 'panel',
  backgroundUrl: '',
  backgroundFit: 'cover',
  backgroundDim: 0.4,
  channelHalo: true,
  animate: true,
  animationSpeed: 1,
  reducedMotion: 'system',
};

/** Hard cap on particles across all channels and lanes. */
export const MAX_TOTAL_PARTICLES = 20000;
/** Network map caps: edges become channels, so keep the counts drawable. */
export const MAX_NETWORK_CHANNELS = 60;
export const MAX_NETWORK_NODES = 100;
/** Smallest particle count a network channel gets, so thin links still show motion. */
export const MIN_NETWORK_PARTICLES = 120;
