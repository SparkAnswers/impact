import { DEMO_MODE_CHOICES } from '../../shared/demo';
import { MOTION_PREFERENCE_CHOICES, MOTION_PREFERENCE_DESCRIPTION } from '../../shared/motion';
import { createQuickStartEditor, QUICK_START_CATEGORY, QUICK_START_DESCRIPTION } from '../../shared/presets';
import { PanelPlugin, type SelectableValue } from '@grafana/data';
import { FlowPanel } from './FlowPanel';
import { InspectorEditor } from './editors/InspectorEditor';
import { JsonEditor } from './editors/JsonEditor';
import { OverridesEditor } from './editors/OverridesEditor';
import { HiddenEditor } from './editors/HiddenEditor';
import { FLOW_PRESETS } from './presets';
import {
  DEFAULT_IMAGE_SIZE,
  DEFAULT_OPTIONS,
  MAX_IMAGE_SIZE,
  MIN_IMAGE_SIZE,
  type FlowDiagram,
  type FlowOptions,
  type HiddenItems,
  type NodeOverride,
  type ValueMapTarget,
} from './types';

const APPEARANCE = ['Appearance'];
const ANIMATION = ['Animation'];
const LAYOUT = ['Layout'];
const DIAGRAM = ['Diagram'];
const DATA = ['Data'];
const INTERACTION = ['Interaction'];
const LINKS = ['Links'];
const DATA_FIELDS = ['Data', 'Edge and node fields'];
const DATA_PRUNE = ['Data', 'Prune'];

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
      .addCustomEditor({
        id: 'quickStart',
        path: 'quickStart',
        name: 'Presets',
        description: QUICK_START_DESCRIPTION,
        category: QUICK_START_CATEGORY,
        editor: createQuickStartEditor(FLOW_PRESETS),
      })
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
      .addSliderInput({
        path: 'appearance.imageSize',
        name: 'Image size',
        description:
          'Size in pixels of a node image (Inspector → Image URL, or the node image field). It takes the icon’s place: left of the label on cards and pills, centred on hubs and circles, and is capped to fit the node',
        category: APPEARANCE,
        defaultValue: DEFAULT_IMAGE_SIZE,
        settings: { min: MIN_IMAGE_SIZE, max: MAX_IMAGE_SIZE, step: 1 },
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
      .addRadio({
        path: 'animation.particles',
        name: 'Particles',
        description:
          'Animated: particles travel along the edges and disappear while the animation is paused (Animation off, Reduced motion). Static: particles never move, they mark the edges as fixed dots. Hidden: no particles at all, the lightest option for big graphs',
        category: ANIMATION,
        defaultValue: DEFAULT_OPTIONS.animation.particles,
        settings: {
          options: [
            { value: 'animated', label: 'Animated' },
            { value: 'static', label: 'Static' },
            { value: 'hidden', label: 'Hidden' },
          ],
        },
      })
      .addNumberInput({
        path: 'animation.particleLimit',
        name: 'Particle limit',
        description:
          'Most particles drawn at once. Above it every edge’s count is scaled down (never below one; with more edges than the limit only the widest keep theirs). 0 = no limit. Above 150 particles the glow is dropped',
        category: ANIMATION,
        defaultValue: DEFAULT_OPTIONS.animation.particleLimit,
        settings: { min: 0, step: 50, placeholder: String(DEFAULT_OPTIONS.animation.particleLimit) },
        showIf: (o) => o.animation?.particles !== 'hidden',
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
        path: 'data.spread',
        name: 'Spread',
        description:
          'Layered layouts: how far the layers spread out to match the panel’s shape. 100 stretches the layer gap (up to 4×) so a tall fan-out uses the width; 0 keeps the Layer gap as set, so a thin chain feeding a fan-out stays compact and the whole diagram is scaled to fit instead',
        category: DATA,
        defaultValue: D.spread,
        settings: { min: 0, max: 100, step: 5 },
        showIf: (o) => isData(o) && o.data?.layout !== 'radial',
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
      .addSliderInput({
        path: 'data.wrap',
        name: 'Wrap layers after',
        description:
          'Layered layouts: a layer with more nodes than this is folded into several side-by-side bands so one big fan-out does not become a single very long column. 0 = automatic: a layer folds when it is much taller than the rest of the diagram, aiming at the panel’s shape. Set a high number to never fold',
        category: DATA,
        defaultValue: D.wrap,
        settings: { min: 0, max: 40, step: 1 },
        showIf: (o) => isData(o) && o.data?.layout !== 'radial',
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
      .addBooleanSwitch({
        path: 'data.prune.hideLeaves',
        name: 'Hide leaves',
        description: 'Drop nodes with a single edge (the long tail of volumes, pods or child processes). Applied once, never below two nodes',
        category: DATA_PRUNE,
        defaultValue: false,
        showIf: isData,
      })
      .addNumberInput({
        path: 'data.prune.minValue',
        name: 'Min value',
        description:
          'Drop edges whose value is below this number, in the unit of the value field (edges without a value stay). Nodes left without edges go too unless they come from a node frame. Blank = off',
        category: DATA_PRUNE,
        settings: { placeholder: 'off' },
        showIf: isData,
      })
      .addSliderInput({
        path: 'data.prune.maxDepth',
        name: 'Max depth',
        description: 'Keep only nodes within this many hops of the roots (nodes without incoming edges, or the most connected node when there are none). 0 = all',
        category: DATA_PRUNE,
        defaultValue: 0,
        settings: { min: 0, max: 12, step: 1 },
        showIf: isData,
      })
      .addBooleanSwitch({
        path: 'data.prune.collapseGroups',
        name: 'Collapse groups',
        description: 'One node per group (named after the group) with the edges between groups summed, so a namespace of 90 pods becomes one box. Ungrouped nodes stay as they are',
        category: DATA_PRUNE,
        defaultValue: false,
        showIf: isData,
      })
      .addCustomEditor<{}, HiddenItems>({
        id: 'flow-hidden',
        path: 'data.hidden',
        name: 'Hidden items',
        description: 'Nodes and groups hidden with the right-click menu in the panel; restore them one by one or all at once',
        category: DATA_PRUNE,
        editor: HiddenEditor,
        defaultValue: { nodes: [], groups: [] },
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
      .addTextInput({
        path: 'data.nodeImageField',
        name: 'Node image field',
        description: 'Node frames: optional text field (or label) with an image URL drawn instead of the icon. Only http(s) and data:image URLs are used; empty: never',
        category: DATA_FIELDS,
        defaultValue: D.nodeImageField,
        settings: { placeholder: 'none' },
        showIf: isData,
      })
      .addBooleanSwitch({
        path: 'interaction.zoom',
        name: 'Zoom and pan',
        description:
          'View mode: Ctrl/⌘ + wheel (or trackpad pinch) zooms around the pointer, plain wheel zooms when the panel is viewed on its own, drag pans, double-click a node or group label zooms onto it, double-click on empty canvas fits. Zoom is kept for the session only and reset by a large panel resize; a small +/−/fit control appears bottom-right on hover',
        category: INTERACTION,
        defaultValue: DEFAULT_OPTIONS.interaction?.zoom ?? true,
      })
      .addSelect({
        path: 'interaction.focusHops',
        name: 'Focus',
        description:
          'What a focus shows (Links → Node click = Focus, or Focus on chain in the right-click menu): the whole chain through the node (every ancestor and descendant, not siblings) or only the nodes within 1, 2 or 3 hops. Esc or the chip’s back button leaves it',
        category: INTERACTION,
        defaultValue: DEFAULT_OPTIONS.interaction?.focusHops ?? 0,
        settings: {
          options: [
            { value: 0, label: 'Whole chain' },
            { value: 1, label: '1 hop' },
            { value: 2, label: '2 hops' },
            { value: 3, label: '3 hops' },
          ],
        },
      })
      .addBooleanSwitch({
        path: 'interaction.clickSwitch',
        name: 'Click switch',
        description: 'Small switch in the bottom-left corner (view mode) that changes what a click on a card does for the session: Isolate, Zoom, Open (when a link is configured), Filter (when a variable is named). Shown when there are at least two choices. Ctrl / ⌘ + click always opens the link in a new tab, Shift + click in the same tab',
        category: INTERACTION,
        defaultValue: DEFAULT_OPTIONS.interaction?.clickSwitch ?? true,
      })
      .addRadio({
        path: 'interaction.focusDirection',
        name: 'Focus direction',
        description: 'Both ways (default), downstream only (what the node feeds) or upstream only (what feeds it)',
        category: INTERACTION,
        defaultValue: DEFAULT_OPTIONS.interaction?.focusDirection ?? 'both',
        settings: {
          options: [
            { value: 'both', label: 'Both' },
            { value: 'down', label: 'Downstream' },
            { value: 'up', label: 'Upstream' },
          ],
        },
      })
      .addRadio({
        path: 'links.action',
        name: 'Node click',
        description:
          'Open link: the URL template below. Set variable: write the node into a dashboard variable so every query on the page that uses it follows the click; a chip in the panel shows and clears it. Focus: show only the node and its chain (see Interaction → Focus), a chip in the panel leads back',
        category: LINKS,
        defaultValue: DEFAULT_OPTIONS.links?.action ?? 'link',
        settings: {
          options: [
            { value: 'link', label: 'Open link' },
            { value: 'variable', label: 'Set variable' },
            { value: 'focus', label: 'Focus' },
          ],
        },
      })
      .addTextInput({
        path: 'links.variable',
        name: 'Variable',
        description: 'Name of the dashboard variable to set (without $). A Text box or Custom variable works best; a Query variable needs the value to be one of its options',
        category: LINKS,
        defaultValue: DEFAULT_OPTIONS.links?.variable ?? '',
        settings: { placeholder: 'service' },
        showIf: (o) => o.links?.action === 'variable' || (o.links?.trigger === 'click' && o.links?.dblclick === 'variable'),
      })
      .addTextInput({
        path: 'links.variableValue',
        name: 'Value',
        description: 'Value written to the variable: ${node.id} (default), ${node.label}, ${node.group}, ${node.value}, ${node.status}, plus other dashboard variables',
        category: LINKS,
        defaultValue: DEFAULT_OPTIONS.links?.variableValue ?? '${node.id}',
        settings: { placeholder: '${node.id}' },
        showIf: (o) => o.links?.action === 'variable' || (o.links?.trigger === 'click' && o.links?.dblclick === 'variable'),
      })
      .addTextInput({
        path: 'links.variableClear',
        name: 'Clear value',
        description: 'What the chip’s clear button writes: empty for a Text box variable, $__all for a Query or Custom variable that includes All',
        category: LINKS,
        defaultValue: DEFAULT_OPTIONS.links?.variableClear ?? '',
        settings: { placeholder: '' },
        showIf: (o) => o.links?.action === 'variable' || (o.links?.trigger === 'click' && o.links?.dblclick === 'variable'),
      })
      .addTextInput({
        path: 'links.nodeUrl',
        name: 'Node link',
        description:
          'URL template opened from a node. Dashboard variables plus ${node.id}, ${node.label}, ${node.group}, ${node.value} and ${node.status} (URL-encoded). Beats data links on the node id field; a manual node’s own Link beats this. With Node click = Focus or Set variable the link stays reachable as Open link in the right-click menu',
        category: LINKS,
        defaultValue: DEFAULT_OPTIONS.links?.nodeUrl ?? '',
        settings: { placeholder: '/d/dashboard?var-node=${node.id}' },
      })
      .addRadio({
        path: 'links.target',
        name: 'Open in',
        description: 'Same tab keeps dashboard navigation in the app; New tab opens a new window',
        category: LINKS,
        defaultValue: DEFAULT_OPTIONS.links?.target ?? 'same',
        settings: {
          options: [
            { value: 'same', label: 'Same tab' },
            { value: 'new', label: 'New tab' },
          ],
        },
      })
      .addRadio({
        path: 'links.trigger',
        name: 'Trigger',
        description: 'Which gesture runs the Node click action. Click leaves the double-click free for the option below; nothing fires while Edit layout is on',
        category: LINKS,
        defaultValue: DEFAULT_OPTIONS.links?.trigger ?? 'dblclick',
        settings: {
          options: [
            { value: 'dblclick', label: 'Double-click' },
            { value: 'click', label: 'Click' },
            { value: 'off', label: 'Off' },
          ],
        },
      })
      .addSelect({
        path: 'links.dblclick',
        name: 'Node double-click',
        description: 'With Trigger = Click, what a double-click does: zoom onto the node (default), open the link, set the variable, focus on the chain, or nothing. So one panel can dive on click, focus on double-click and zoom with Ctrl + scroll',
        category: LINKS,
        defaultValue: DEFAULT_OPTIONS.links?.dblclick ?? 'zoom',
        settings: {
          options: [
            { value: 'zoom', label: 'Zoom to node' },
            { value: 'link', label: 'Open link' },
            { value: 'variable', label: 'Set variable' },
            { value: 'focus', label: 'Focus' },
            { value: 'off', label: 'Nothing' },
          ],
        },
        showIf: (o) => o.links?.trigger === 'click',
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
