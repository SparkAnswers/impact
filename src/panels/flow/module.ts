import { PanelPlugin } from '@grafana/data';
import { FlowPanel } from './FlowPanel';
import { InspectorEditor } from './editors/InspectorEditor';
import { JsonEditor } from './editors/JsonEditor';
import { DEFAULT_OPTIONS, type FlowDiagram, type FlowOptions } from './types';

const APPEARANCE = ['Appearance'];
const ANIMATION = ['Animation'];
const LAYOUT = ['Layout'];
const DIAGRAM = ['Diagram'];

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
        description: 'Animate particles along edges. Always off when the system prefers reduced motion',
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
      .addCustomEditor<{}, FlowDiagram>({
        id: 'flow-inspector',
        path: 'diagram',
        name: 'Inspector',
        description: 'Properties of the selected node or edge',
        category: DIAGRAM,
        editor: InspectorEditor,
        defaultValue: DEFAULT_OPTIONS.diagram,
      })
      .addCustomEditor<{}, FlowDiagram>({
        id: 'flow-json',
        path: 'diagram',
        name: 'Import / export JSON',
        description: 'The whole diagram as JSON. Edit and apply, or load the example',
        category: DIAGRAM,
        editor: JsonEditor,
        defaultValue: DEFAULT_OPTIONS.diagram,
      });
  });
