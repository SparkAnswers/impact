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

export interface RiverOptions {
  channels: Channel[];
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

export const DEFAULT_OPTIONS: RiverOptions = {
  channels: [],
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
};

/** Hard cap on particles across all channels and lanes. */
export const MAX_TOTAL_PARTICLES = 20000;
