import { ThresholdsMode } from '@grafana/data';
import type { PresetCatalog } from '../../shared/presets';
import { createExampleDiagram } from './lib/example';
import { DEFAULT_OPTIONS, type FlowOptions } from './types';

const DATA_FIELD_PATHS = [
  'sourceField',
  'targetField',
  'valueField',
  'value2Field',
  'labelField',
  'sourceGroupField',
  'targetGroupField',
  'nodeIdField',
  'nodeLabelField',
  'nodeGroupField',
  'nodeStatusField',
  'nodeValueField',
].map((f) => `data.${f}`);

/** Data-driven settings that survive a look-only preset (data presets set theirs explicitly). */
const DATA_SETTING_PATHS = ['source', 'layout', 'valueMap', 'value2Map', 'showEdgeValues', 'topN', 'groupBoxes', 'layerGap', 'nodeGap'].map(
  (f) => `data.${f}`
);

/** Quick start presets for the Flow Designer. */
export const FLOW_PRESETS: PresetCatalog<FlowOptions> = {
  defaults: DEFAULT_OPTIONS,
  keep: ['diagram', 'data.overrides', 'links', 'demoData', ...DATA_FIELD_PATHS, ...DATA_SETTING_PATHS],
  presets: [
    {
      id: 'site-power',
      label: 'Site power flow',
      description: 'Hand-drawn example diagram: sources, a hub and loads with live kW values. Edit it or redraw.',
      icon: 'bolt',
      options: {
        data: { source: 'manual' },
        diagram: createExampleDiagram(),
        appearance: { background: 'dots', nodeStyle: 'cards' },
        layout: { editMode: false, autoFit: true },
      },
      fieldConfig: {
        unit: 'kwatt',
        decimals: 1,
        color: { mode: 'thresholds' },
        thresholds: {
          mode: ThresholdsMode.Absolute,
          steps: [
            { value: -Infinity, color: 'green' },
            { value: 10, color: 'orange' },
            { value: 14, color: 'red' },
          ],
        },
      },
    },
    {
      id: 'service-graph',
      label: 'Service graph from data',
      description: 'Built from source/target rows, layered left to right; request rate drives particle speed and is printed on edges.',
      icon: 'sitemap',
      options: {
        data: { source: 'data', layout: 'lr', valueMap: 'speed', value2Map: 'color', showEdgeValues: true, groupBoxes: true },
        appearance: { background: 'dots', nodeStyle: 'cards' },
        layout: { editMode: false, autoFit: true },
      },
      fieldConfig: { unit: 'reqps', decimals: 0 },
    },
    {
      id: 'radial-hub',
      label: 'Radial hub',
      description: 'Data-driven, the most connected node in the middle; edge value sets the colour through thresholds.',
      icon: 'circle',
      options: {
        data: { source: 'data', layout: 'radial', valueMap: 'color', showEdgeValues: true },
        appearance: { background: 'dots', nodeStyle: 'cards' },
        layout: { editMode: false, autoFit: true },
      },
      fieldConfig: {
        unit: 'reqps',
        decimals: 0,
        color: { mode: 'thresholds' },
        thresholds: {
          mode: ThresholdsMode.Absolute,
          steps: [
            { value: -Infinity, color: 'green' },
            { value: 150, color: 'orange' },
            { value: 300, color: 'red' },
          ],
        },
      },
    },
    {
      id: 'topology-width',
      label: 'Topology, width by value',
      description: 'Data-driven layers (host, pod, volume...) with group boxes; bytes drive the edge width.',
      icon: 'layer-group',
      options: {
        data: { source: 'data', layout: 'lr', valueMap: 'width', value2Map: 'color', showEdgeValues: false, groupBoxes: true },
        appearance: { background: 'dots', nodeStyle: 'cards' },
        layout: { editMode: false, autoFit: true },
      },
      fieldConfig: { unit: 'bytes', decimals: 1 },
    },
    {
      id: 'minimal',
      label: 'Minimal outline',
      description: 'Outlined nodes on a line grid with smaller labels; keeps your diagram and data settings.',
      icon: 'apps',
      options: {
        appearance: { background: 'lines', nodeStyle: 'minimal', fontSize: 11 },
        layout: { editMode: false, autoFit: true },
      },
    },
    {
      id: 'static',
      label: 'Static, no animation',
      description: 'Plain panel background and no particles: for reports, screenshots and dense dashboards.',
      icon: 'pause',
      options: {
        appearance: { background: 'panel', nodeStyle: 'cards' },
        animation: { enabled: false },
        layout: { editMode: false, autoFit: true },
      },
    },
  ],
};
