import { ThresholdsMode } from '@grafana/data';
import type { PresetCatalog } from '../../shared/presets';
import { createChannel, DEFAULT_OPTIONS, DEFAULT_PARTICLES, type RiverOptions, type Waypoint } from './types';

const line = (y: number): Waypoint[] => [
  { x: 0.03, y },
  { x: 0.35, y },
  { x: 0.65, y },
  { x: 0.97, y },
];

const S_CURVE: Waypoint[] = [
  { x: 0.03, y: 0.8 },
  { x: 0.18, y: 0.79 },
  { x: 0.34, y: 0.72 },
  { x: 0.48, y: 0.62 },
  { x: 0.58, y: 0.5 },
  { x: 0.66, y: 0.37 },
  { x: 0.76, y: 0.27 },
  { x: 0.88, y: 0.22 },
  { x: 0.99, y: 0.18 },
];

const NETWORK_FIELD_PATHS = [
  'sourceField',
  'targetField',
  'valueField',
  'value2Field',
  'labelField',
  'nodeIdField',
  'nodeLabelField',
  'nodeStatusField',
].map((f) => `network.${f}`);

/** Quick start presets for the Flow River. */
export const RIVER_PRESETS: PresetCatalog<RiverOptions> = {
  defaults: DEFAULT_OPTIONS,
  keep: ['demoData', 'backgroundUrl', 'network.layout', ...NETWORK_FIELD_PATHS],
  presets: [
    {
      id: 'single-stream',
      label: 'Single stream',
      description: 'One wide S-curve bound to the first series, turbo colours, labelled intake and outlet, big caption.',
      icon: 'chart-line',
      options: {
        channelSource: 'manual',
        channels: [
          createChannel({
            id: 'qs-current',
            name: 'Current',
            path: S_CURVE,
            widthPx: 150,
            particles: { ...DEFAULT_PARTICLES, count: 3200 },
            labels: [
              { text: 'INTAKE', at: 0.06, side: 'center' },
              { text: 'Narrows', at: 0.56, side: 'right' },
              { text: 'Outlet', at: 0.93, side: 'right' },
            ],
          }),
        ],
        title: 'The river, in motion',
        subtitle: 'Over the dashboard time range',
        caption: 'Narrows',
        captionBig: true,
        captionValue: true,
        legendPosition: 'top-left',
        particleCountMultiplier: 1.3,
      },
      fieldConfig: { decimals: 1 },
    },
    {
      id: 'three-pipes',
      label: 'Three channels',
      description: 'Three straight pipes, each bound to the next series (A, B, C); the third flows backwards when negative.',
      icon: 'list-ul',
      options: {
        channelSource: 'manual',
        channels: [
          createChannel({ id: 'qs-up', name: 'Uplink', path: line(0.25), widthPx: 48, colorScale: 'cool', particles: { ...DEFAULT_PARTICLES, count: 900 }, labels: [{ text: 'Uplink', at: 0.02, side: 'left' }] }),
          createChannel({ id: 'qs-queue', name: 'Queue', path: line(0.5), widthPx: 48, colorScale: 'warm', particles: { ...DEFAULT_PARTICLES, count: 900, color: 'byValue' }, labels: [{ text: 'Queue', at: 0.02, side: 'left' }] }),
          createChannel({ id: 'qs-balance', name: 'Balance', path: line(0.75), widthPx: 48, colorScale: 'viridis', particles: { ...DEFAULT_PARTICLES, count: 900, color: 'fixed', fixedColor: '#ffe08a' }, direction: 'bySign', labels: [{ text: 'Balance', at: 0.02, side: 'left' }] }),
        ],
        title: 'Three pipes',
        subtitle: 'Channel i binds to series i',
        captionValue: false,
        legendPosition: 'top-right',
      },
      fieldConfig: { decimals: 0 },
    },
    {
      id: 'lanes',
      label: 'Parallel lanes',
      description: 'Every series becomes a lane inside one diagonal river, each coloured by its own value.',
      icon: 'layer-group',
      options: {
        channelSource: 'manual',
        channels: [
          createChannel({
            id: 'qs-lanes',
            name: 'Lanes',
            path: [
              { x: 0.05, y: 0.9 },
              { x: 0.35, y: 0.65 },
              { x: 0.65, y: 0.35 },
              { x: 0.95, y: 0.1 },
            ],
            widthPx: 120,
            colorScale: 'inferno',
            particles: { ...DEFAULT_PARTICLES, count: 2400, speed: 0.8 },
            multiSeries: 'lanes',
          }),
        ],
        title: 'Lanes',
        subtitle: 'Each series is a lane coloured by its own value',
        captionValue: false,
        legendPosition: 'bottom-left',
      },
    },
    {
      id: 'thresholds',
      label: 'Thresholds, transparent',
      description: 'A gentle wave coloured by the standard thresholds, nothing opaque painted, value in the caption.',
      icon: 'eye',
      options: {
        channelSource: 'manual',
        channels: [
          createChannel({
            id: 'qs-load',
            name: 'Load',
            path: [
              { x: 0.03, y: 0.6 },
              { x: 0.3, y: 0.4 },
              { x: 0.6, y: 0.65 },
              { x: 0.97, y: 0.4 },
            ],
            widthPx: 70,
            colorScale: 'thresholds',
            particles: { ...DEFAULT_PARTICLES, count: 1200, speed: 1.2, color: 'byValue' },
          }),
        ],
        title: 'Load by threshold',
        subtitle: '',
        background: 'none',
        caption: '{value}',
        captionBig: true,
        captionValue: false,
        legendPosition: 'top-right',
        channelHalo: false,
      },
      fieldConfig: {
        unit: 'percent',
        min: 0,
        max: 100,
        thresholds: {
          mode: ThresholdsMode.Absolute,
          steps: [
            { value: -Infinity, color: 'blue' },
            { value: 40, color: 'green' },
            { value: 70, color: 'orange' },
            { value: 90, color: 'red' },
          ],
        },
      },
    },
    {
      id: 'network-auto',
      label: 'Network map, auto layout',
      description: 'One channel per source/target link in the data, nodes laid out left to right, value in the caption.',
      icon: 'sitemap',
      options: {
        channelSource: 'network',
        channels: [],
        network: { placement: 'auto', layoutDirection: 'lr', colorScale: 'turbo', direction: 'forward', widthPx: 28, curve: 0.12 },
        title: 'Links',
        subtitle: 'Throughput per link, auto layout',
        caption: 'All links',
        captionBig: false,
        captionValue: true,
        legendPosition: 'bottom-right',
      },
      fieldConfig: { decimals: 0 },
    },
    {
      id: 'network-placed',
      label: 'Network map, pinned nodes',
      description: 'Links from the data over typed node positions (edit them under Network map), a second value sets the width.',
      icon: 'map-marker',
      options: {
        channelSource: 'network',
        channels: [],
        network: { placement: 'positions', editNodes: false, colorScale: 'cool', direction: 'forward', widthPx: 44, curve: 0.08, showValueLabels: true },
        title: 'Site plan',
        subtitle: 'Nodes pinned to typed positions',
        captionBig: false,
        captionValue: true,
        legendPosition: 'top-right',
      },
      fieldConfig: { decimals: 0 },
    },
  ],
};
