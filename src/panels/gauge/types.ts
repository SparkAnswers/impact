import type { HistorySource } from './lib/data';
import type { SecondaryReducer } from './lib/reducers';
import type { ScaleKind } from './lib/scale';

export type { HistorySource, SecondaryReducer, ScaleKind };

export type ColorMode = 'fixed' | 'thresholds' | 'field';
export type HistoryColorMode = 'sign' | 'thresholds';
export type SecondaryMode = 'text' | 'reducer';
export type TickMode = 'auto' | 'custom' | 'none';
export type TitlePosition = 'hidden' | 'top' | 'bottom';
export type BackgroundMode = 'panel' | 'transparent' | 'solid';

export interface GaugeOptions {
  // Data
  fieldName?: string;

  // Appearance
  background: BackgroundMode;
  backgroundColor: string;

  // Arc
  startAngle: number;
  sweepAngle: number;
  clockwise: boolean;
  ringWidth: number;
  ringColor: string;
  glow: number;

  // Scale
  zeroValue: number;
  /** Fraction 0..1 from the min end; empty = proportional. */
  zeroPosition?: number;
  scale: ScaleKind;
  tickMode: TickMode;
  tickValues: string;
  showTickLabels: boolean;
  showUnitAtZero: boolean;

  // Colours
  colorMode: ColorMode;
  positiveColor: string;
  negativeColor: string;
  markerColor: string;

  // History
  showHistory: boolean;
  historySource: HistorySource;
  historyPoints: number;
  /** Seconds shown by the chart in stream mode. */
  streamDuration: number;
  fadeHistory: boolean;
  historyLineWidth: number;
  historyArea: boolean;
  historyColorMode: HistoryColorMode;

  // Text
  showValue: boolean;
  valueFontSize: number;
  valueLabel: string;
  showSecondary: boolean;
  secondaryMode: SecondaryMode;
  secondaryText: string;
  secondaryReducer: SecondaryReducer;
  secondaryUnit: string;
  secondaryDecimals?: number;
  subtitleText: string;
  titleText: string;
  titlePosition: TitlePosition;

  // Animation
  animate: boolean;
  animationDuration: number;

  // Live motion (between refreshes; all derived from samples already received)
  liveScroll: boolean;
  liveDrift: boolean;
  liveDriftDuration: number;
  liveBreathing: number;
  liveTrail: boolean;
  liveTrailSamples: number;
  liveStale: boolean;
}

export const DEFAULT_OPTIONS: GaugeOptions = {
  background: 'panel',
  backgroundColor: '',
  startAngle: 225,
  sweepAngle: 195,
  clockwise: false,
  ringWidth: 5,
  ringColor: '',
  glow: 14,

  zeroValue: 0,
  zeroPosition: undefined,
  scale: 'sqrt',
  tickMode: 'auto',
  tickValues: '',
  showTickLabels: true,
  showUnitAtZero: true,

  colorMode: 'fixed',
  positiveColor: 'orange',
  negativeColor: 'green',
  markerColor: '',

  showHistory: true,
  historySource: 'timeRange',
  historyPoints: 120,
  streamDuration: 60,
  fadeHistory: true,
  historyLineWidth: 1.6,
  historyArea: true,
  historyColorMode: 'sign',

  showValue: true,
  valueFontSize: 0,
  valueLabel: '',
  showSecondary: true,
  secondaryMode: 'reducer',
  secondaryText: 'Avg. {value}',
  secondaryReducer: 'mean',
  secondaryUnit: '',
  secondaryDecimals: undefined,
  subtitleText: 'Visible range',
  titleText: '',
  titlePosition: 'bottom',

  animate: true,
  animationDuration: 400,

  liveScroll: true,
  liveDrift: true,
  liveDriftDuration: 750,
  liveBreathing: 0.35,
  liveTrail: true,
  liveTrailSamples: 6,
  liveStale: true,
};
