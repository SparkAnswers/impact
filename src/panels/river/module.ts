import { MOTION_PREFERENCE_CHOICES, MOTION_PREFERENCE_DESCRIPTION } from '../../shared/motion';
import { FieldConfigProperty, PanelPlugin, ThresholdsMode } from '@grafana/data';
import { RiverPanel } from './RiverPanel';
import { ChannelsEditor } from './editors/ChannelsEditor';
import { COLOR_PRESET_OPTIONS } from './lib/colors';
import { DEFAULT_OPTIONS, type RiverOptions } from './types';

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
        id: 'channels',
        path: 'channels',
        name: 'Channels',
        description:
          'Data streams drawn as rivers. Each channel has a path, a data source, a colour scale and particles. Leave empty for a single S-curve bound to the first series.',
        category: ['Channels'],
        editor: ChannelsEditor,
        defaultValue: DEFAULT_OPTIONS.channels,
      })
      .addSelect({
        path: 'defaultColorScale',
        name: 'Default colour scale',
        description: 'Colour scale used by the automatic channel when no channels are configured.',
        category: ['Colour'],
        defaultValue: DEFAULT_OPTIONS.defaultColorScale,
        settings: { options: COLOR_PRESET_OPTIONS },
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
