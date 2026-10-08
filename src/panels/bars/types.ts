import { ReducerID } from '@grafana/data';

/** Visual style of the bar rendered in the "Progress" column of a row. */
export type BarStyle =
  'sweep' | 'percent' | 'segmented' | 'striped' | 'bidirectional' | 'stacked' | 'sparkline' | 'pill';

export const BAR_STYLES: BarStyle[] = [
  'sweep',
  'percent',
  'segmented',
  'striped',
  'bidirectional',
  'stacked',
  'sparkline',
  'pill',
];

/** How the fill colour of a determinate bar is chosen. */
export type ColorMode = 'fixed' | 'thresholds' | 'gradient' | 'field';

/** Where the value label of a determinate bar is placed. */
export type LabelPosition = 'left' | 'right' | 'inside' | 'hidden';

/** Row density. */
export type Density = 'compact' | 'comfortable';

/** Per-field custom config (available through field overrides). */
export interface BarsFieldConfig {
  /** Overrides the panel-level bar style for rows produced by this field ('default' = use panel option). */
  barStyle?: BarStyle | 'default';
}

export interface BarsOptions {
  // Columns
  nameField?: string;
  subtitleField?: string;
  valueField?: string;
  statusField?: string;
  timeField?: string;
  sparklineField?: string;
  styleField?: string;
  stackFields?: string[];
  extraFields?: string[];
  reducer: ReducerID;

  // Bar
  barStyle: BarStyle;
  colorMode: ColorMode;
  fixedColor: string;
  gradientFrom: string;
  gradientTo: string;
  negativeColor: string;
  positiveColor: string;
  fillGradient: boolean;
  trackHeight: number;
  trackWidth: number;
  radius: number;
  labelPosition: LabelPosition;
  segments: number;
  sweepWidth: number;
  animationSpeed: number;

  // Table
  showHeader: boolean;
  showCheckbox: boolean;
  showStatusDot: boolean;
  defaultSortField?: string;
  defaultSortDesc: boolean;
  density: Density;
  rowHeight: number;
  showFooter: boolean;

  // Animation
  animate: boolean;
}

export const DEFAULT_OPTIONS: BarsOptions = {
  reducer: ReducerID.lastNotNull,

  barStyle: 'percent',
  colorMode: 'thresholds',
  fixedColor: 'blue',
  gradientFrom: 'green',
  gradientTo: 'red',
  negativeColor: 'green',
  positiveColor: 'orange',
  fillGradient: true,
  trackHeight: 6,
  trackWidth: 150,
  radius: 3,
  labelPosition: 'right',
  segments: 10,
  sweepWidth: 38,
  animationSpeed: 1.6,

  showHeader: true,
  showCheckbox: false,
  showStatusDot: true,
  defaultSortDesc: false,
  density: 'comfortable',
  rowHeight: 0,
  showFooter: true,

  animate: true,
};

/** Row heights (px) per density when `rowHeight` is 0 (auto). */
export const DENSITY_ROW_HEIGHT: Record<Density, number> = { compact: 28, comfortable: 36 };

/** Rows above this count are windowed (only the visible slice is rendered). */
export const VIRTUALISE_THRESHOLD = 200;
