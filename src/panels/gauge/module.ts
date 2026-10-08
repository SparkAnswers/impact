import { FieldColorModeId, FieldConfigProperty, FieldType, PanelPlugin } from '@grafana/data';
import { GaugePanel } from './GaugePanel';
import { REDUCER_OPTIONS } from './lib/reducers';
import { DEFAULT_OPTIONS, type GaugeOptions } from './types';

const CAT_DATA = ['Data'];
const CAT_ARC = ['Arc'];
const CAT_SCALE = ['Scale'];
const CAT_COLORS = ['Colours'];
const CAT_HISTORY = ['History'];
const CAT_TEXT = ['Text'];
const CAT_ANIM = ['Animation'];

export const plugin = new PanelPlugin<GaugeOptions>(GaugePanel)
  .useFieldConfig({
    disableStandardOptions: [FieldConfigProperty.NoValue, FieldConfigProperty.Filterable],
    standardOptions: {
      [FieldConfigProperty.Min]: { defaultValue: -50 },
      [FieldConfigProperty.Max]: { defaultValue: 200 },
      [FieldConfigProperty.Decimals]: { defaultValue: 1 },
      [FieldConfigProperty.Color]: {
        settings: { byValueSupport: true, preferThresholdsMode: false },
        defaultValue: { mode: FieldColorModeId.Fixed, fixedColor: 'orange' },
      },
    },
  })
  .setPanelOptions((builder) => {
    builder
      .addFieldNamePicker({
        path: 'fieldName',
        name: 'Field',
        description: 'Numeric field to display. Defaults to the first numeric field of the first series.',
        category: CAT_DATA,
        settings: { filter: (f) => f.type === FieldType.number, noFieldsMessage: 'No numeric fields found' },
      })

      // Arc
      .addSliderInput({
        path: 'startAngle',
        name: 'Start angle',
        description: 'Degrees, clockwise from 3 o’clock, where the arc begins.',
        category: CAT_ARC,
        defaultValue: DEFAULT_OPTIONS.startAngle,
        settings: { min: 0, max: 360, step: 5 },
      })
      .addSliderInput({
        path: 'sweepAngle',
        name: 'Sweep angle',
        description: 'Angular length of the arc in degrees.',
        category: CAT_ARC,
        defaultValue: DEFAULT_OPTIONS.sweepAngle,
        settings: { min: 30, max: 360, step: 5 },
      })
      .addBooleanSwitch({
        path: 'clockwise',
        name: 'Clockwise',
        description: 'Values increase clockwise from the start angle. Off: the max end sits at the start angle.',
        category: CAT_ARC,
        defaultValue: DEFAULT_OPTIONS.clockwise,
      })
      .addSliderInput({
        path: 'ringWidth',
        name: 'Fill width',
        description: 'Stroke width of the live fill arc in pixels.',
        category: CAT_ARC,
        defaultValue: DEFAULT_OPTIONS.ringWidth,
        settings: { min: 1, max: 24, step: 1 },
      })
      .addColorPicker({
        path: 'ringColor',
        name: 'Ring colour',
        description: 'Colour of the thin background ring. Empty uses a theme colour.',
        category: CAT_ARC,
        defaultValue: DEFAULT_OPTIONS.ringColor,
        settings: { isClearable: true },
      })
      .addSliderInput({
        path: 'glow',
        name: 'Glow',
        description: 'Blur radius of the glow behind the fill arc. 0 disables it.',
        category: CAT_ARC,
        defaultValue: DEFAULT_OPTIONS.glow,
        settings: { min: 0, max: 40, step: 1 },
      })

      // Scale
      .addNumberInput({
        path: 'zeroValue',
        name: 'Zero mark',
        description: 'Value the fill starts from. Values above fill towards max, values below fill towards min. Min/max come from the standard field options.',
        category: CAT_SCALE,
        defaultValue: DEFAULT_OPTIONS.zeroValue,
      })
      .addNumberInput({
        path: 'zeroPosition',
        name: 'Zero position',
        description: 'Where the zero mark sits along the arc, 0 = min end, 1 = max end. Leave empty for proportional placement.',
        category: CAT_SCALE,
        settings: { placeholder: 'auto', min: 0, max: 1, step: 0.05 },
      })
      .addSelect({
        path: 'scale',
        name: 'Scale',
        description: 'How values map onto the arc. Square root and log compress the high end.',
        category: CAT_SCALE,
        defaultValue: DEFAULT_OPTIONS.scale,
        settings: {
          options: [
            { value: 'linear', label: 'Linear' },
            { value: 'sqrt', label: 'Square root' },
            { value: 'log', label: 'Log compression' },
          ],
        },
      })
      .addSelect({
        path: 'tickMode',
        name: 'Ticks',
        description: 'Auto generates nice ticks on each side of the zero mark; Custom uses the list below.',
        category: CAT_SCALE,
        defaultValue: DEFAULT_OPTIONS.tickMode,
        settings: {
          options: [
            { value: 'auto', label: 'Auto' },
            { value: 'custom', label: 'Custom list' },
            { value: 'none', label: 'Hidden' },
          ],
        },
      })
      .addTextInput({
        path: 'tickValues',
        name: 'Tick values',
        description: 'Comma separated tick values, e.g. "-50, 0, 50, 100, 200".',
        category: CAT_SCALE,
        defaultValue: DEFAULT_OPTIONS.tickValues,
        showIf: (o) => o.tickMode === 'custom',
      })
      .addBooleanSwitch({
        path: 'showTickLabels',
        name: 'Tick labels',
        description: 'Show the tick values, formatted with the field unit and decimals.',
        category: CAT_SCALE,
        defaultValue: DEFAULT_OPTIONS.showTickLabels,
        showIf: (o) => o.tickMode !== 'none',
      })
      .addBooleanSwitch({
        path: 'showUnitAtZero',
        name: 'Unit at zero mark',
        description: 'Replace the tick label at the zero mark with the unit.',
        category: CAT_SCALE,
        defaultValue: DEFAULT_OPTIONS.showUnitAtZero,
        showIf: (o) => o.tickMode !== 'none' && o.showTickLabels,
      })

      // Colours
      .addSelect({
        path: 'colorMode',
        name: 'Colour mode',
        description:
          'Fixed: positive/negative colours below. Thresholds: ring bands from the field thresholds and fill coloured by the current value. Field: the standard field colour.',
        category: CAT_COLORS,
        defaultValue: DEFAULT_OPTIONS.colorMode,
        settings: {
          options: [
            { value: 'fixed', label: 'Fixed' },
            { value: 'thresholds', label: 'Thresholds' },
            { value: 'field', label: 'Field colour' },
          ],
        },
      })
      .addColorPicker({
        path: 'positiveColor',
        name: 'Positive colour',
        description: 'Fill colour for values above the zero mark.',
        category: CAT_COLORS,
        defaultValue: DEFAULT_OPTIONS.positiveColor,
      })
      .addColorPicker({
        path: 'negativeColor',
        name: 'Negative colour',
        description: 'Fill colour for values below the zero mark.',
        category: CAT_COLORS,
        defaultValue: DEFAULT_OPTIONS.negativeColor,
      })
      .addColorPicker({
        path: 'markerColor',
        name: 'Marker colour',
        description: 'Colour of the live dot on the ring. Empty uses the theme text colour.',
        category: CAT_COLORS,
        defaultValue: DEFAULT_OPTIONS.markerColor,
        settings: { isClearable: true },
      })

      // History
      .addBooleanSwitch({
        path: 'showHistory',
        name: 'Show history',
        description: 'Draw the series as a small chart inside the ring.',
        category: CAT_HISTORY,
        defaultValue: DEFAULT_OPTIONS.showHistory,
      })
      .addRadio({
        path: 'historySource',
        name: 'Window',
        description: 'Time range: the panel time range. Last N: the most recent N samples.',
        category: CAT_HISTORY,
        defaultValue: DEFAULT_OPTIONS.historySource,
        settings: {
          options: [
            { value: 'timeRange', label: 'Time range' },
            { value: 'lastN', label: 'Last N' },
          ],
        },
        showIf: (o) => o.showHistory,
      })
      .addNumberInput({
        path: 'historyPoints',
        name: 'Samples',
        description: 'Number of most recent samples to show.',
        category: CAT_HISTORY,
        defaultValue: DEFAULT_OPTIONS.historyPoints,
        settings: { min: 2, integer: true },
        showIf: (o) => o.showHistory && o.historySource === 'lastN',
      })
      .addBooleanSwitch({
        path: 'fadeHistory',
        name: 'Fade older samples',
        description: 'Older samples fade out towards the left.',
        category: CAT_HISTORY,
        defaultValue: DEFAULT_OPTIONS.fadeHistory,
        showIf: (o) => o.showHistory,
      })
      .addSliderInput({
        path: 'historyLineWidth',
        name: 'Line width',
        description: 'Stroke width of the history line in pixels.',
        category: CAT_HISTORY,
        defaultValue: DEFAULT_OPTIONS.historyLineWidth,
        settings: { min: 0.5, max: 6, step: 0.1 },
        showIf: (o) => o.showHistory,
      })
      .addBooleanSwitch({
        path: 'historyArea',
        name: 'Area fill',
        description: 'Fill the area between the line and the zero baseline.',
        category: CAT_HISTORY,
        defaultValue: DEFAULT_OPTIONS.historyArea,
        showIf: (o) => o.showHistory,
      })
      .addRadio({
        path: 'historyColorMode',
        name: 'Line colour',
        description: 'By sign uses the positive/negative colours. By thresholds colours each segment by the field thresholds.',
        category: CAT_HISTORY,
        defaultValue: DEFAULT_OPTIONS.historyColorMode,
        settings: {
          options: [
            { value: 'sign', label: 'By sign' },
            { value: 'thresholds', label: 'By thresholds' },
          ],
        },
        showIf: (o) => o.showHistory,
      })

      // Text
      .addBooleanSwitch({
        path: 'showValue',
        name: 'Show value',
        description: 'Show the big current value, formatted with the field unit and decimals.',
        category: CAT_TEXT,
        defaultValue: DEFAULT_OPTIONS.showValue,
      })
      .addNumberInput({
        path: 'valueFontSize',
        name: 'Value font size',
        description: 'Font size in pixels for the big value. 0 or empty = automatic.',
        category: CAT_TEXT,
        defaultValue: DEFAULT_OPTIONS.valueFontSize,
        settings: { placeholder: 'auto', min: 0, integer: true },
        showIf: (o) => o.showValue,
      })
      .addTextInput({
        path: 'valueLabel',
        name: 'Value label',
        description: 'Small caption above the big value. Supports template variables. Empty hides it.',
        category: CAT_TEXT,
        defaultValue: DEFAULT_OPTIONS.valueLabel,
        showIf: (o) => o.showValue,
      })
      .addBooleanSwitch({
        path: 'showSecondary',
        name: 'Show secondary line',
        description: 'Show the secondary line under the value (e.g. an average).',
        category: CAT_TEXT,
        defaultValue: DEFAULT_OPTIONS.showSecondary,
      })
      .addRadio({
        path: 'secondaryMode',
        name: 'Secondary source',
        description: 'Computed: a reducer over the visible window is inserted at {value}. Text: free text.',
        category: CAT_TEXT,
        defaultValue: DEFAULT_OPTIONS.secondaryMode,
        settings: {
          options: [
            { value: 'reducer', label: 'Computed' },
            { value: 'text', label: 'Text' },
          ],
        },
        showIf: (o) => o.showSecondary,
      })
      .addTextInput({
        path: 'secondaryText',
        name: 'Secondary text',
        description: 'Text of the secondary line. Use {value} for the computed value. Supports template variables. The first number is drawn in bold.',
        category: CAT_TEXT,
        defaultValue: DEFAULT_OPTIONS.secondaryText,
        showIf: (o) => o.showSecondary,
      })
      .addSelect({
        path: 'secondaryReducer',
        name: 'Reducer',
        description: 'Calculation over the samples in the visible window.',
        category: CAT_TEXT,
        defaultValue: DEFAULT_OPTIONS.secondaryReducer,
        settings: { options: REDUCER_OPTIONS },
        showIf: (o) => o.showSecondary && o.secondaryMode === 'reducer',
      })
      .addUnitPicker({
        path: 'secondaryUnit',
        name: 'Secondary unit',
        description: 'Unit for the computed value. Empty uses the field unit.',
        category: CAT_TEXT,
        defaultValue: DEFAULT_OPTIONS.secondaryUnit,
        showIf: (o) => o.showSecondary && o.secondaryMode === 'reducer',
      })
      .addNumberInput({
        path: 'secondaryDecimals',
        name: 'Secondary decimals',
        description: 'Decimals for the computed value. Empty uses the field decimals.',
        category: CAT_TEXT,
        settings: { placeholder: 'auto', min: 0, max: 10, integer: true },
        showIf: (o) => o.showSecondary && o.secondaryMode === 'reducer',
      })
      .addTextInput({
        path: 'subtitleText',
        name: 'Subtitle',
        description: 'Small line under the secondary line. Supports template variables. Empty hides it.',
        category: CAT_TEXT,
        defaultValue: DEFAULT_OPTIONS.subtitleText,
        showIf: (o) => o.showSecondary,
      })
      .addTextInput({
        path: 'titleText',
        name: 'Title',
        description: 'Caption drawn inside the panel. Supports template variables. Empty hides it.',
        category: CAT_TEXT,
        defaultValue: DEFAULT_OPTIONS.titleText,
      })
      .addRadio({
        path: 'titlePosition',
        name: 'Title position',
        description: 'Where the caption is drawn.',
        category: CAT_TEXT,
        defaultValue: DEFAULT_OPTIONS.titlePosition,
        settings: {
          options: [
            { value: 'bottom', label: 'Bottom' },
            { value: 'top', label: 'Top' },
            { value: 'hidden', label: 'Hidden' },
          ],
        },
        showIf: (o) => !!o.titleText,
      })

      // Animation
      .addBooleanSwitch({
        path: 'animate',
        name: 'Animate',
        description: 'Ease the fill and marker to new values. Disabled automatically when the system prefers reduced motion.',
        category: CAT_ANIM,
        defaultValue: DEFAULT_OPTIONS.animate,
      })
      .addSliderInput({
        path: 'animationDuration',
        name: 'Duration',
        description: 'Easing duration in milliseconds.',
        category: CAT_ANIM,
        defaultValue: DEFAULT_OPTIONS.animationDuration,
        settings: { min: 50, max: 3000, step: 50 },
        showIf: (o) => o.animate,
      });
  });
