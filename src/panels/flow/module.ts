import { DEMO_MODE_CHOICES } from '../../shared/demo';
import { MOTION_PREFERENCE_CHOICES, MOTION_PREFERENCE_DESCRIPTION } from '../../shared/motion';
import { PanelPlugin, type SelectableValue } from '@grafana/data';
import { FlowPanel } from './FlowPanel';
import { InspectorEditor } from './editors/InspectorEditor';
import { JsonEditor } from './editors/JsonEditor';
import { OverridesEditor } from './editors/OverridesEditor';
import { DEFAULT_OPTIONS, type FlowDiagram, type FlowOptions, type NodeOverride, type ValueMapTarget } from './types';

const APPEARANCE = ['Appearance'];
const ANIMATION = ['Animation'];
const LAYOUT = ['Layout'];
const DIAGRAM = ['Diagram'];
const DATA = ['Data'];
const DATA_FIELDS = ['Data', 'Edge and node fields'];

const D = DEFAULT_OPTIONS.data;
const isManual = (o: FlowOptions) => !o.data || o.data.source === 'manual' || !o.data.source;
const isData = (o: FlowOptions) => !isManual(o);
const VALUE_MAPS: Array<SelectableValue<ValueMapTarget>> = [
  { value: 'speed', label: 'Particle speed' },
  { value: 'color', label: 'Colour' },
  { value: 'width', label: 'Width' },
  { value: 'none', label: 'Nothing' },
];

export const plugin = new PanelPlugin<FlowOptions>(FlowPanel)
  .useFieldConfig({
    standardOptions: {},
  })
  .setPanelOptions((builder) => {
    builder
      .addSelect({
        path: 'appearance.background',
        name: 'Background',
        description: 'Canvas background: plain panel colour, transparent, or a dot/line grid',
        category: APPEARANCE,
        defaultValue: DEFAULT_OPTIONS.appearance.background,
        settings: {
          options: [
            { value: 'panel', label: 'Panel' },
            { value: 'transparent', label: 'Transparent' },
            { value: 'dots', label: 'Dot grid' },
            { value: 'lines', label: 'Line grid' },
          ],
        },
      })
      .addRadio({
        path: 'appearance.nodeStyle',
        name: 'Node style',
        description: 'Cards with shadow and fill, or minimal outlined nodes',
        category: APPEARANCE,
        defaultValue: DEFAULT_OPTIONS.appearance.nodeStyle,
        settings: {
          options: [
            { value: 'cards', label: 'Cards' },
            { value: 'minimal', label: 'Minimal' },
          ],
        },
      })
      .addSliderInput({
        path: 'appearance.fontSize',
        name: 'Font size',
        description: 'Base font size for node labels in pixels',
        category: APPEARANCE,
        defaultValue: DEFAULT_OPTIONS.appearance.fontSize,
        settings: { min: 8, max: 24, step: 1 },
      })
      .addColorPicker({
        path: 'appearance.edgeColor',
        name: 'Default edge colour',
        description: 'Used by edges that have no colour of their own',
        category: APPEARANCE,
        defaultValue: DEFAULT_OPTIONS.appearance.edgeColor,
        settings: { enableNamedColors: true },
      })
      .addSliderInput({
        path: 'appearance.particleSpeed',
        name: 'Particle speed',
        description: 'Global multiplier applied to every edge’s particle speed',
        category: APPEARANCE,
        defaultValue: DEFAULT_OPTIONS.appearance.particleSpeed,
        settings: { min: 0.1, max: 4, step: 0.1 },
      })
      .addBooleanSwitch({
        path: 'animation.enabled',
        name: 'Animation',
        description: 'Animate particles along edges. See Reduced motion for the system preference',
        category: ANIMATION,
        defaultValue: DEFAULT_OPTIONS.animation.enabled,
      })
      .addSliderInput({
        path: 'animation.speed',
        name: 'Speed',
        description: 'Animation speed multiplier',
        category: ANIMATION,
        defaultValue: DEFAULT_OPTIONS.animation.speed,
        settings: { min: 0.1, max: 4, step: 0.1 },
        showIf: (o) => o.animation?.enabled !== false,
      })
      .addSelect({
        path: 'animation.reducedMotion',
        name: 'Reduced motion',
        description: MOTION_PREFERENCE_DESCRIPTION,
        category: ANIMATION,
        defaultValue: DEFAULT_OPTIONS.animation.reducedMotion,
        settings: { options: MOTION_PREFERENCE_CHOICES },
        showIf: (o) => o.animation?.enabled !== false,
      })
      .addBooleanSwitch({
        path: 'layout.editMode',
        name: 'Edit layout',
        description: 'Design mode: drag nodes, draw edges, pan (space/middle mouse) and zoom (wheel) inside the panel. Turn off before saving so viewers cannot move things',
        category: LAYOUT,
        defaultValue: DEFAULT_OPTIONS.layout.editMode,
      })
      .addSliderInput({
        path: 'layout.gridSize',
        name: 'Grid size',
        description: 'Spacing of the background grid and snapping, in canvas pixels',
        category: LAYOUT,
        defaultValue: DEFAULT_OPTIONS.layout.gridSize,
        settings: { min: 4, max: 80, step: 2 },
      })
      .addBooleanSwitch({
        path: 'layout.snap',
        name: 'Snap to grid',
        description: 'Snap node positions to the grid while dragging',
        category: LAYOUT,
        defaultValue: DEFAULT_OPTIONS.layout.snap,
      })
      .addBooleanSwitch({
        path: 'layout.autoFit',
        name: 'Fit to panel',
        description: 'When not editing, scale and centre the diagram to fill the panel instead of using the saved viewport',
        category: LAYOUT,
        defaultValue: DEFAULT_OPTIONS.layout.autoFit,
      })
      .addSelect({
        path: 'data.source',
        name: 'Diagram source',
        description:
          'Manual: draw the diagram by hand. Data: build nodes and edges from the query results and lay them out automatically. Data + manual overrides: same, but nodes you drag (or tweak in the Node overrides editor) keep their position and look',
        category: DATA,
        defaultValue: D.source,
        settings: {
          options: [
            { value: 'manual', label: 'Manual' },
            { value: 'data', label: 'Data' },
            { value: 'overrides', label: 'Data + manual overrides' },
          ],
        },
      })
      .addRadio({
        path: 'demoData',
        name: 'Demo data',
        description:
          'Built-in generated service graph (12 nodes) so the panel looks right with no query. When no data: used when Diagram source is Data and the query yields no edges, or in Manual mode while the diagram is empty. Always: ignores the query in the data modes. Off: never.',
        category: DATA,
        defaultValue: DEFAULT_OPTIONS.demoData,
        settings: { options: DEMO_MODE_CHOICES },
      })
      .addRadio({
        path: 'data.layout',
        name: 'Layout direction',
        description: 'Layered layout from left to right or top to bottom, or a radial layout with the most connected node in the middle',
        category: DATA,
        defaultValue: D.layout,
        settings: {
          options: [
            { value: 'lr', label: 'Left to right' },
            { value: 'tb', label: 'Top to bottom' },
            { value: 'radial', label: 'Radial' },
          ],
        },
        showIf: isData,
      })
      .addSliderInput({
        path: 'data.layerGap',
        name: 'Layer gap',
        description: 'Distance between layers (edge length) in canvas pixels',
        category: DATA,
        defaultValue: D.layerGap,
        settings: { min: 40, max: 400, step: 10 },
        showIf: isData,
      })
      .addSliderInput({
        path: 'data.nodeGap',
        name: 'Node gap',
        description: 'Distance between neighbouring nodes in a layer in canvas pixels',
        category: DATA,
        defaultValue: D.nodeGap,
        settings: { min: 4, max: 120, step: 2 },
        showIf: isData,
      })
      .addSelect({
        path: 'data.valueMap',
        name: 'Value drives',
        description: 'What the edge value controls: particle speed, colour (via the value field’s thresholds / colour scheme) or stroke width',
        category: DATA,
        defaultValue: D.valueMap,
        settings: { options: VALUE_MAPS },
        showIf: isData,
      })
      .addSelect({
        path: 'data.value2Map',
        name: 'Secondary value drives',
        description: 'What the secondary value field controls (only when a secondary value field is set and present)',
        category: DATA,
        defaultValue: D.value2Map,
        settings: { options: VALUE_MAPS },
        showIf: (o) => isData(o) && !!o.data?.value2Field,
      })
      .addBooleanSwitch({
        path: 'data.showEdgeValues',
        name: 'Show edge values',
        description: 'Draw the formatted value on each edge (the label field wins when set)',
        category: DATA,
        defaultValue: D.showEdgeValues,
        showIf: isData,
      })
      .addBooleanSwitch({
        path: 'data.groupBoxes',
        name: 'Group boxes',
        description: 'Draw a faint rounded container around the nodes of each group (needs a group field)',
        category: DATA,
        defaultValue: D.groupBoxes,
        showIf: isData,
      })
      .addNumberInput({
        path: 'data.topN',
        name: 'Top N edges by value',
        description: 'Keep only the N edges with the highest value (0 = all). Diagrams are always capped at 400 nodes / 1500 edges',
        category: DATA,
        defaultValue: D.topN,
        settings: { min: 0, max: 1500, integer: true },
        showIf: isData,
      })
      .addTextInput({
        path: 'data.sourceField',
        name: 'Source field',
        description: 'Field (or series label) holding the edge source node id',
        category: DATA_FIELDS,
        defaultValue: D.sourceField,
        showIf: isData,
      })
      .addTextInput({
        path: 'data.targetField',
        name: 'Target field',
        description: 'Field (or series label) holding the edge target node id',
        category: DATA_FIELDS,
        defaultValue: D.targetField,
        showIf: isData,
      })
      .addTextInput({
        path: 'data.valueField',
        name: 'Value field',
        description: 'Numeric field with the edge value. Empty: the first numeric field of the frame (series: the series value). A name that matches nothing: no values',
        category: DATA_FIELDS,
        defaultValue: D.valueField,
        settings: { placeholder: 'auto' },
        showIf: isData,
      })
      .addTextInput({
        path: 'data.value2Field',
        name: 'Secondary value field',
        description: 'Optional second numeric field (or series / metric name) per edge, e.g. an error rate next to a request rate',
        category: DATA_FIELDS,
        defaultValue: D.value2Field,
        settings: { placeholder: 'none' },
        showIf: isData,
      })
      .addTextInput({
        path: 'data.labelField',
        name: 'Label field',
        description: 'Optional text field (or label) drawn on the edge',
        category: DATA_FIELDS,
        defaultValue: D.labelField,
        settings: { placeholder: 'none' },
        showIf: isData,
      })
      .addTextInput({
        path: 'data.sourceGroupField',
        name: 'Source group field',
        description: 'Optional field (or label) with the group of the source node, e.g. a namespace',
        category: DATA_FIELDS,
        defaultValue: D.sourceGroupField,
        settings: { placeholder: 'none' },
        showIf: isData,
      })
      .addTextInput({
        path: 'data.targetGroupField',
        name: 'Target group field',
        description: 'Optional field (or label) with the group of the target node',
        category: DATA_FIELDS,
        defaultValue: D.targetGroupField,
        settings: { placeholder: 'none' },
        showIf: isData,
      })
      .addTextInput({
        path: 'data.nodeIdField',
        name: 'Node id field',
        description: 'Node frames: field (or label) with the node id. A frame with this field and no source/target adds or decorates nodes',
        category: DATA_FIELDS,
        defaultValue: D.nodeIdField,
        showIf: isData,
      })
      .addTextInput({
        path: 'data.nodeLabelField',
        name: 'Node label field',
        description: 'Node frames: optional display label (defaults to the id)',
        category: DATA_FIELDS,
        defaultValue: D.nodeLabelField,
        showIf: isData,
      })
      .addTextInput({
        path: 'data.nodeGroupField',
        name: 'Node group field',
        description: 'Node frames: optional group (drives the node colour and group boxes)',
        category: DATA_FIELDS,
        defaultValue: D.nodeGroupField,
        showIf: isData,
      })
      .addTextInput({
        path: 'data.nodeStatusField',
        name: 'Node status field',
        description: 'Node frames: optional status. Text such as ok / running / warn / pending / error / failed (after value mappings) or 1 / 2 / 3 become the node status',
        category: DATA_FIELDS,
        defaultValue: D.nodeStatusField,
        showIf: isData,
      })
      .addTextInput({
        path: 'data.nodeValueField',
        name: 'Node value field',
        description: 'Node frames: optional numeric field shown as the node’s live value. Empty: first numeric field; a name that matches nothing (e.g. none): no value',
        category: DATA_FIELDS,
        defaultValue: D.nodeValueField,
        showIf: isData,
      })
      .addCustomEditor<{}, Record<string, NodeOverride>>({
        id: 'flow-overrides',
        path: 'data.overrides',
        name: 'Node overrides',
        description: 'Position and look of individual data nodes (also written when you drag nodes in design mode)',
        category: DATA,
        editor: OverridesEditor,
        defaultValue: {},
        showIf: (o) => o.data?.source === 'overrides',
      })
      .addCustomEditor<{}, FlowDiagram>({
        id: 'flow-inspector',
        path: 'diagram',
        name: 'Inspector',
        description: 'Properties of the selected node or edge',
        category: DIAGRAM,
        editor: InspectorEditor,
        defaultValue: DEFAULT_OPTIONS.diagram,
        showIf: isManual,
      })
      .addCustomEditor<{}, FlowDiagram>({
        id: 'flow-json',
        path: 'diagram',
        name: 'Import / export JSON',
        description: 'The whole diagram as JSON. Edit and apply, or load the example',
        category: DIAGRAM,
        editor: JsonEditor,
        defaultValue: DEFAULT_OPTIONS.diagram,
        showIf: isManual,
      });
  });
