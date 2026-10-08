import { DEMO_MODE_CHOICES, DEMO_MODE_DESCRIPTION } from '../../shared/demo';
import { MOTION_PREFERENCE_CHOICES, MOTION_PREFERENCE_DESCRIPTION } from '../../shared/motion';
import { createQuickStartEditor, QUICK_START_CATEGORY, QUICK_START_DESCRIPTION } from '../../shared/presets';
import { FieldConfigProperty, PanelPlugin, ThresholdsMode } from '@grafana/data';
import { RiverPanel } from './RiverPanel';
import { ChannelsEditor } from './editors/ChannelsEditor';
import { PositionsEditor } from './editors/PositionsEditor';
import { COLOR_PRESET_OPTIONS } from './lib/colors';
import { RIVER_PRESETS } from './presets';
import { DEFAULT_NETWORK, DEFAULT_OPTIONS, type RiverOptions } from './types';

const NETWORK = ['Network map'];
const NETWORK_FIELDS = ['Network map fields'];
const isNetwork = (o: RiverOptions) => o.channelSource === 'network';
const isManual = (o: RiverOptions) => !isNetwork(o);
const N = DEFAULT_NETWORK;

export const plugin = new PanelPlugin<RiverOptions>(RiverPanel)
  .useFieldConfig({
    disableStandardOptions: [FieldConfigProperty.Links, FieldConfigProperty.Mappings, FieldConfigProperty.NoValue],
    standardOptions: {
      [FieldConfigProperty.Thresholds]: {
        defaultValue: {
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
  })
  .setPanelOptions((builder) => {
    builder
      .addCustomEditor({
        id: 'quickStart',
        path: 'quickStart',
        name: 'Presets',
        description: QUICK_START_DESCRIPTION,
        category: QUICK_START_CATEGORY,
        editor: createQuickStartEditor(RIVER_PRESETS),
      })
      .addRadio({
        path: 'demoData',
        name: 'Demo data',
        description: DEMO_MODE_DESCRIPTION,
        category: ['Data'],
        defaultValue: DEFAULT_OPTIONS.demoData,
        settings: { options: DEMO_MODE_CHOICES },
      })
      .addRadio({
        path: 'channelSource',
        name: 'Channel source',
        description:
          'Manual: the hand-placed channel list below. Network map: one channel per link in the data (source, target, value), flowing between node pucks laid out automatically or placed over a background.',
        category: ['Data'],
        defaultValue: DEFAULT_OPTIONS.channelSource,
        settings: {
          options: [
            { value: 'manual', label: 'Manual' },
            { value: 'network', label: 'Network map' },
          ],
        },
      })
      .addCustomEditor({
        id: 'channels',
        path: 'channels',
        name: 'Channels',
        description:
          'Data streams drawn as rivers. Each channel has a path, a data source, a colour scale and particles. Leave empty for a single S-curve bound to the first series.',
        category: ['Channels'],
        editor: ChannelsEditor,
        defaultValue: DEFAULT_OPTIONS.channels,
        showIf: isManual,
      })
      .addRadio({
        path: 'network.placement',
        name: 'Node placement',
        description: 'Auto layout: positions from the layered or radial layout. Positions: the list below (seed it from the auto layout, then edit). Dragged positions win in both modes.',
        category: NETWORK,
        defaultValue: N.placement,
        settings: {
          options: [
            { value: 'auto', label: 'Auto layout' },
            { value: 'positions', label: 'Positions' },
          ],
        },
        showIf: isNetwork,
      })
      .addRadio({
        path: 'network.layoutDirection',
        name: 'Layout direction',
        description: 'Direction of the auto layout: layered left to right, top to bottom, or radial around the most connected node.',
        category: NETWORK,
        defaultValue: N.layoutDirection,
        settings: {
          options: [
            { value: 'lr', label: 'Left to right' },
            { value: 'tb', label: 'Top to bottom' },
            { value: 'radial', label: 'Radial' },
          ],
        },
        showIf: isNetwork,
      })
      .addCustomEditor({
        id: 'network.layout',
        path: 'network.layout',
        name: 'Positions',
        description: 'Node id to x, y (0..1) so nodes can match a floor plan or map. Seed from the auto layout, then edit; Reset forgets dragged positions.',
        category: NETWORK,
        editor: PositionsEditor,
        defaultValue: N.layout,
        showIf: (o) => isNetwork(o) && o.network?.placement === 'positions',
      })
      .addBooleanSwitch({
        path: 'network.editNodes',
        name: 'Edit on canvas',
        description: 'Show drag handles on the nodes. Dragged positions are stored as overrides; switch off before saving.',
        category: NETWORK,
        defaultValue: N.editNodes,
        showIf: isNetwork,
      })
      .addSliderInput({
        path: 'network.nodeSize',
        name: 'Node size',
        description: 'Radius of the node pucks in pixels.',
        category: NETWORK,
        defaultValue: N.nodeSize,
        settings: { min: 4, max: 40, step: 1 },
        showIf: isNetwork,
      })
      .addSliderInput({
        path: 'network.widthPx',
        name: 'Channel width (px)',
        description: 'Width of every channel, or of the widest one when the width field is set.',
        category: NETWORK,
        defaultValue: N.widthPx,
        settings: { min: 4, max: 160, step: 1 },
        showIf: isNetwork,
      })
      .addSliderInput({
        path: 'network.curve',
        name: 'Curve',
        description: 'Bend of each channel as a fraction of its length. 0 draws straight links; reverse pairs are always offset so they do not overlap.',
        category: NETWORK,
        defaultValue: N.curve,
        settings: { min: 0, max: 0.5, step: 0.01 },
        showIf: isNetwork,
      })
      .addSelect({
        path: 'network.colorScale',
        name: 'Colour scale',
        description: 'Colour preset, thresholds or custom stops for the link values. One shared domain across all links.',
        category: NETWORK,
        defaultValue: N.colorScale,
        settings: { options: COLOR_PRESET_OPTIONS.filter((o) => o.value !== 'custom') },
        showIf: isNetwork,
      })
      .addRadio({
        path: 'network.scaleDomain.mode',
        name: 'Scale domain',
        description: 'Auto: field min/max if set, otherwise the range of the link values. Fixed: the limits below.',
        category: NETWORK,
        defaultValue: N.scaleDomain.mode,
        settings: {
          options: [
            { value: 'auto', label: 'Auto' },
            { value: 'fixed', label: 'Fixed' },
          ],
        },
        showIf: isNetwork,
      })
      .addNumberInput({
        path: 'network.scaleDomain.min',
        name: 'Domain min',
        description: 'Lower end of the fixed colour domain.',
        category: NETWORK,
        showIf: (o) => isNetwork(o) && o.network?.scaleDomain?.mode === 'fixed',
      })
      .addNumberInput({
        path: 'network.scaleDomain.max',
        name: 'Domain max',
        description: 'Upper end of the fixed colour domain.',
        category: NETWORK,
        showIf: (o) => isNetwork(o) && o.network?.scaleDomain?.mode === 'fixed',
      })
      .addRadio({
        path: 'network.direction',
        name: 'Direction',
        description: 'Forward flows from source to target; By sign reverses links with a negative value.',
        category: NETWORK,
        defaultValue: N.direction,
        settings: {
          options: [
            { value: 'forward', label: 'Forward' },
            { value: 'reverse', label: 'Reverse' },
            { value: 'bySign', label: 'By sign' },
          ],
        },
        showIf: isNetwork,
      })
      .addSliderInput({
        path: 'network.particleBudget',
        name: 'Particle budget',
        description: 'Particles shared by all links in proportion to their value (each link keeps at least a few; total capped at 20000).',
        category: NETWORK,
        defaultValue: N.particleBudget,
        settings: { min: 500, max: 20000, step: 100 },
        showIf: isNetwork,
      })
      .addSliderInput({
        path: 'network.particles.speed',
        name: 'Particle speed',
        description: 'Speed factor for the link particles (the value still drives the relative speed).',
        category: NETWORK,
        defaultValue: N.particles.speed,
        settings: { min: 0.1, max: 4, step: 0.1 },
        showIf: isNetwork,
      })
      .addRadio({
        path: 'network.particles.color',
        name: 'Particle colour',
        description: 'White streaks, streaks tinted by the link value, or a fixed colour.',
        category: NETWORK,
        defaultValue: N.particles.color,
        settings: {
          options: [
            { value: 'white', label: 'White' },
            { value: 'byValue', label: 'By value' },
            { value: 'fixed', label: 'Fixed' },
          ],
        },
        showIf: isNetwork,
      })
      .addColorPicker({
        path: 'network.particles.fixedColor',
        name: 'Fixed particle colour',
        description: 'Streak colour when Particle colour is Fixed.',
        category: NETWORK,
        defaultValue: N.particles.fixedColor,
        showIf: (o) => isNetwork(o) && o.network?.particles?.color === 'fixed',
      })
      .addBooleanSwitch({
        path: 'network.showNodeLabels',
        name: 'Node labels',
        description: 'Label under each node: the node label field, or the id.',
        category: NETWORK,
        defaultValue: N.showNodeLabels,
        showIf: isNetwork,
      })
      .addBooleanSwitch({
        path: 'network.showValueLabels',
        name: 'Value labels',
        description: 'Formatted link value at the midpoint of each channel.',
        category: NETWORK,
        defaultValue: N.showValueLabels,
        showIf: isNetwork,
      })
      .addTextInput({
        path: 'network.captionChannel',
        name: 'Caption channel',
        description: 'Link whose value feeds {value} and the caption line, as source>target. Empty: the sum of all link values.',
        category: NETWORK,
        defaultValue: N.captionChannel,
        settings: { placeholder: 'sum of all links' },
        showIf: isNetwork,
      })
      .addTextInput({
        path: 'network.sourceField',
        name: 'Source field',
        description: 'Field (or series label) holding the link source node id.',
        category: NETWORK_FIELDS,
        defaultValue: N.sourceField,
        showIf: isNetwork,
      })
      .addTextInput({
        path: 'network.targetField',
        name: 'Target field',
        description: 'Field (or series label) holding the link target node id.',
        category: NETWORK_FIELDS,
        defaultValue: N.targetField,
        showIf: isNetwork,
      })
      .addTextInput({
        path: 'network.valueField',
        name: 'Value field',
        description: 'Numeric field with the link value (colour, particle speed, caption). Empty: the first numeric field of the frame, or the series value.',
        category: NETWORK_FIELDS,
        defaultValue: N.valueField,
        settings: { placeholder: 'auto' },
        showIf: isNetwork,
      })
      .addTextInput({
        path: 'network.value2Field',
        name: 'Width field',
        description: 'Optional second numeric field (or series / metric name) that drives the channel width, normalised to its maximum.',
        category: NETWORK_FIELDS,
        defaultValue: N.value2Field,
        settings: { placeholder: 'none: fixed width' },
        showIf: isNetwork,
      })
      .addTextInput({
        path: 'network.labelField',
        name: 'Label field',
        description: 'Optional field (or series label) with a name for the link, used in the caption and legend.',
        category: NETWORK_FIELDS,
        defaultValue: N.labelField,
        showIf: isNetwork,
      })
      .addTextInput({
        path: 'network.nodeIdField',
        name: 'Node id field',
        description: 'Node frames (optional): field with the node id. A frame with this field and no source/target fields decorates the nodes.',
        category: NETWORK_FIELDS,
        defaultValue: N.nodeIdField,
        showIf: isNetwork,
      })
      .addTextInput({
        path: 'network.nodeLabelField',
        name: 'Node label field',
        description: 'Node frames: field with the label drawn under the puck.',
        category: NETWORK_FIELDS,
        defaultValue: N.nodeLabelField,
        showIf: isNetwork,
      })
      .addTextInput({
        path: 'network.nodeStatusField',
        name: 'Node status field',
        description: 'Node frames: field with a status (ok / warn / error, or 1 / 2 / 3) that colours the puck.',
        category: NETWORK_FIELDS,
        defaultValue: N.nodeStatusField,
        showIf: isNetwork,
      })
      .addSelect({
        path: 'defaultColorScale',
        name: 'Default colour scale',
        description: 'Colour scale used by the automatic channel when no channels are configured.',
        category: ['Colour'],
        defaultValue: DEFAULT_OPTIONS.defaultColorScale,
        settings: { options: COLOR_PRESET_OPTIONS },
        showIf: isManual,
      })
      .addBooleanSwitch({
        path: 'showLegend',
        name: 'Show legend',
        description: 'Gradient legend with ticks formatted using the field unit and decimals.',
        category: ['Colour'],
        defaultValue: DEFAULT_OPTIONS.showLegend,
      })
      .addSelect({
        path: 'legendPosition',
        name: 'Legend position',
        description: 'Corner of the panel where the legend is drawn.',
        category: ['Colour'],
        defaultValue: DEFAULT_OPTIONS.legendPosition,
        settings: {
          options: [
            { value: 'top-left', label: 'Top left' },
            { value: 'top-right', label: 'Top right' },
            { value: 'bottom-left', label: 'Bottom left' },
            { value: 'bottom-right', label: 'Bottom right' },
          ],
        },
        showIf: (o) => o.showLegend,
      })
      .addSliderInput({
        path: 'particleCountMultiplier',
        name: 'Particle count multiplier',
        description: 'Scales the particle count of every channel (total capped at 20000).',
        category: ['Particles'],
        defaultValue: DEFAULT_OPTIONS.particleCountMultiplier,
        settings: { min: 0, max: 4, step: 0.1 },
      })
      .addSliderInput({
        path: 'particleSpeedMultiplier',
        name: 'Particle speed multiplier',
        description: 'Scales the particle speed of every channel.',
        category: ['Particles'],
        defaultValue: DEFAULT_OPTIONS.particleSpeedMultiplier,
        settings: { min: 0, max: 5, step: 0.1 },
      })
      .addTextInput({
        path: 'title',
        name: 'Title',
        description: 'Large title drawn over the river. Supports variables and the {value} token (latest value of the first channel).',
        category: ['Text'],
        defaultValue: DEFAULT_OPTIONS.title,
      })
      .addTextInput({
        path: 'subtitle',
        name: 'Subtitle',
        description: 'Smaller line under the title. Supports variables and {value}.',
        category: ['Text'],
        defaultValue: DEFAULT_OPTIONS.subtitle,
      })
      .addTextInput({
        path: 'caption',
        name: 'Caption',
        description: 'Caption in the bottom-left corner. Supports variables and {value}.',
        category: ['Text'],
        defaultValue: DEFAULT_OPTIONS.caption,
      })
      .addBooleanSwitch({
        path: 'captionBig',
        name: 'Big caption',
        description: 'Draw the caption in a large display style.',
        category: ['Text'],
        defaultValue: DEFAULT_OPTIONS.captionBig,
      })
      .addBooleanSwitch({
        path: 'captionValue',
        name: 'Show latest value',
        description: 'Show the latest value of the first channel under the caption.',
        category: ['Text'],
        defaultValue: DEFAULT_OPTIONS.captionValue,
      })
      .addSelect({
        path: 'background',
        name: 'Background',
        description: 'Panel: inherits the panel background (works with the built-in "Transparent background" switch). Image: a picture behind the river. Transparent: paints nothing behind the channels.',
        category: ['Background'],
        defaultValue: DEFAULT_OPTIONS.background,
        settings: {
          options: [
            { value: 'panel', label: 'Panel' },
            { value: 'image', label: 'Image URL' },
            { value: 'none', label: 'Transparent' },
          ],
        },
      })
      .addTextInput({
        path: 'backgroundUrl',
        name: 'Image URL',
        description: 'http(s) or data:image URL of the background image.',
        category: ['Background'],
        defaultValue: DEFAULT_OPTIONS.backgroundUrl,
        showIf: (o) => o.background === 'image',
      })
      .addRadio({
        path: 'backgroundFit',
        name: 'Image fit',
        description: 'Cover fills the panel; contain shows the whole image.',
        category: ['Background'],
        defaultValue: DEFAULT_OPTIONS.backgroundFit,
        settings: {
          options: [
            { value: 'cover', label: 'Cover' },
            { value: 'contain', label: 'Contain' },
          ],
        },
        showIf: (o) => o.background === 'image',
      })
      .addSliderInput({
        path: 'backgroundDim',
        name: 'Image dim',
        description: 'Darkens the background image so the river stands out.',
        category: ['Background'],
        defaultValue: DEFAULT_OPTIONS.backgroundDim,
        settings: { min: 0, max: 1, step: 0.05 },
        showIf: (o) => o.background === 'image',
      })
      .addBooleanSwitch({
        path: 'channelHalo',
        name: 'Channel halo',
        description: 'Soft dark halo around each channel. Switch off for a flat look on light or transparent backgrounds.',
        category: ['Background'],
        defaultValue: DEFAULT_OPTIONS.channelHalo,
      })
      .addBooleanSwitch({
        path: 'animate',
        name: 'Animate',
        description: 'Animate particles. Off renders static streaks; see Reduced motion for the system preference.',
        category: ['Animation'],
        defaultValue: DEFAULT_OPTIONS.animate,
      })
      .addSliderInput({
        path: 'animationSpeed',
        name: 'Animation speed',
        description: 'Global speed factor for the particle animation.',
        category: ['Animation'],
        defaultValue: DEFAULT_OPTIONS.animationSpeed,
        settings: { min: 0.1, max: 4, step: 0.1 },
        showIf: (o) => o.animate,
      })
      .addSelect({
        path: 'reducedMotion',
        name: 'Reduced motion',
        description: MOTION_PREFERENCE_DESCRIPTION,
        category: ['Animation'],
        defaultValue: DEFAULT_OPTIONS.reducedMotion,
        settings: { options: MOTION_PREFERENCE_CHOICES },
        showIf: (o) => o.animate,
      });
  });
