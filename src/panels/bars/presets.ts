import { ThresholdsMode } from '@grafana/data';
import type { PresetCatalog } from '../../shared/presets';
import { DEFAULT_OPTIONS, type BarsOptions } from './types';

const PERCENT_THRESHOLDS = {
  mode: ThresholdsMode.Absolute,
  steps: [
    { value: -Infinity, color: 'green' },
    { value: 70, color: '#EAB839' },
    { value: 90, color: 'red' },
  ],
};

/** Quick start presets for Status Bars. */
export const BARS_PRESETS: PresetCatalog<BarsOptions> = {
  defaults: DEFAULT_OPTIONS,
  keep: [
    'demoData',
    'nameField',
    'subtitleField',
    'valueField',
    'statusField',
    'timeField',
    'sparklineField',
    'styleField',
    'stackFields',
    'extraFields',
  ],
  presets: [
    {
      id: 'device-list',
      label: 'Device list',
      description: 'One row per table row: threshold-coloured percent bars, status dots, checkboxes and a footer.',
      icon: 'table',
      options: {
        barStyle: 'percent',
        colorMode: 'thresholds',
        showCheckbox: true,
        showStatusDot: true,
        labelPosition: 'right',
        density: 'comfortable',
        showFooter: true,
      },
      fieldConfig: { unit: 'percent', min: 0, max: 100, thresholds: PERCENT_THRESHOLDS, color: { mode: 'thresholds' } },
    },
    {
      id: 'series-sparklines',
      label: 'Series with sparklines',
      description: 'One row per time series, the last value on a sparkline, sorted by value.',
      icon: 'chart-line',
      options: {
        barStyle: 'sparkline',
        colorMode: 'thresholds',
        defaultSortField: 'value',
        defaultSortDesc: true,
        trackWidth: 120,
        showCheckbox: false,
      },
      fieldConfig: { unit: 'percent', min: 0, max: 100, decimals: 0, thresholds: PERCENT_THRESHOLDS, color: { mode: 'thresholds' } },
    },
    {
      id: 'stacked',
      label: 'Stacked',
      description: 'Every numeric column of a row stacked in one bar (used, cached, free...), no footer.',
      icon: 'layer-group',
      options: { barStyle: 'stacked', showStatusDot: true, trackWidth: 180, trackHeight: 8, showFooter: false },
      fieldConfig: { unit: 'percent', min: 0, max: 100 },
    },
    {
      id: 'bidirectional',
      label: 'Bidirectional',
      description: 'Bars centred on zero: import one way, export the other, with their own colours.',
      icon: 'arrows-h',
      options: {
        barStyle: 'bidirectional',
        negativeColor: 'green',
        positiveColor: 'orange',
        labelPosition: 'right',
        trackWidth: 160,
        showCheckbox: false,
        showFooter: false,
        fillGradient: false,
      },
      fieldConfig: { decimals: 1 },
    },
    {
      id: 'compact',
      label: 'Compact gradient',
      description: 'Dense rows, thin flat bars with a green-to-red gradient, no animation, sorted by name.',
      icon: 'minus',
      options: {
        barStyle: 'percent',
        colorMode: 'gradient',
        gradientFrom: 'green',
        gradientTo: 'red',
        fillGradient: false,
        density: 'compact',
        showFooter: false,
        showCheckbox: false,
        labelPosition: 'left',
        trackHeight: 4,
        radius: 2,
        trackWidth: 200,
        defaultSortField: 'name',
        animate: false,
      },
      fieldConfig: { unit: 'percent', min: 0, max: 100 },
    },
    {
      id: 'pills',
      label: 'Status pills',
      description: 'A coloured status pill per row from the value mappings, no bar: a plain health list.',
      icon: 'check-circle',
      options: { barStyle: 'pill', showStatusDot: false, showCheckbox: false, density: 'compact', showFooter: false },
    },
  ],
};
