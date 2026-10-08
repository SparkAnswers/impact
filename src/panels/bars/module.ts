import { FieldConfigProperty, FieldType, PanelPlugin, ReducerID, ThresholdsMode } from '@grafana/data';
import { BarsPanel } from './BarsPanel';
import { ListEditor } from './editors/ListEditor';
import { BAR_STYLES, DEFAULT_OPTIONS, type BarsFieldConfig, type BarsOptions } from './types';

const STYLE_LABELS: Record<string, string> = {
  sweep: 'Sweep (indeterminate)',
  percent: 'Percent',
  segmented: 'Segmented',
  striped: 'Striped',
  bidirectional: 'Bidirectional',
  stacked: 'Stacked',
  sparkline: 'Sparkline',
  pill: 'Pill',
};
const styleOptions = BAR_STYLES.map((s) => ({ value: s, label: STYLE_LABELS[s] }));

const COLUMNS = ['Columns'];
const BAR = ['Bar'];
const TABLE = ['Table'];
const ANIM = ['Animation'];

export const plugin = new PanelPlugin<BarsOptions, BarsFieldConfig>(BarsPanel)
  .useFieldConfig({
    standardOptions: {
      [FieldConfigProperty.DisplayName]: {},
      [FieldConfigProperty.Unit]: {},
      [FieldConfigProperty.Decimals]: {},
      [FieldConfigProperty.Min]: {},
      [FieldConfigProperty.Max]: {},
      [FieldConfigProperty.NoValue]: {},
      [FieldConfigProperty.Color]: {},
      [FieldConfigProperty.Thresholds]: {
        defaultValue: {
          mode: ThresholdsMode.Absolute,
          steps: [
            { value: -Infinity, color: 'green' },
            { value: 70, color: '#EAB839' },
            { value: 90, color: 'red' },
          ],
        },
      },
      [FieldConfigProperty.Mappings]: {},
      [FieldConfigProperty.Links]: {},
    },
    useCustomConfig: (builder) => {
      builder.addSelect({
        path: 'barStyle',
        name: 'Bar style override',
        description: 'Overrides the panel bar style for rows produced by this field (series or value column).',
        defaultValue: 'default',
        settings: { options: [{ value: 'default', label: 'Panel default' }, ...styleOptions] },
      });
    },
  })
  .setPanelOptions((builder) => {
    builder
      // Columns
      .addFieldNamePicker({
        path: 'nameField',
        name: 'Name field',
        description: 'Column holding the row name. Default: first string field.',
        category: COLUMNS,
        settings: { filter: (f) => f.type === FieldType.string, placeholderText: 'Auto' },
      })
      .addFieldNamePicker({
        path: 'subtitleField',
        name: 'Subtitle field',
        description: 'Optional column shown in small text under the name.',
        category: COLUMNS,
        settings: { filter: (f) => f.type === FieldType.string, placeholderText: 'Auto (subtitle / description)' },
      })
      .addFieldNamePicker({
        path: 'valueField',
        name: 'Value field',
        description: 'Numeric column driving the bar. Default: first number field.',
        category: COLUMNS,
        settings: { filter: (f) => f.type === FieldType.number, placeholderText: 'Auto' },
      })
      .addFieldNamePicker({
        path: 'statusField',
        name: 'Status field',
        description:
          'Column mapped to a state through value mappings (text, colour, icon). Default: a field named status/state.',
        category: COLUMNS,
        settings: { placeholderText: 'Auto (status / state)' },
      })
      .addFieldNamePicker({
        path: 'timeField',
        name: 'Time field',
        description: 'Time column shown as a relative "Updated" time. Default: first time field.',
        category: COLUMNS,
        settings: { filter: (f) => f.type === FieldType.time, placeholderText: 'Auto' },
      })
      .addFieldNamePicker({
        path: 'sparklineField',
        name: 'Sparkline field',
        description:
          'Column with an array or "1;2;3" string of numbers for the sparkline style. Time series input uses the series itself.',
        category: COLUMNS,
        settings: { placeholderText: 'Auto' },
      })
      .addFieldNamePicker({
        path: 'styleField',
        name: 'Style field',
        description:
          'Column whose value names the bar style per row (sweep, percent, segmented, striped, bidirectional, stacked, sparkline, pill).',
        category: COLUMNS,
        settings: { filter: (f) => f.type === FieldType.string, placeholderText: 'Auto (style)' },
      })
      .addCustomEditor({
        id: 'stackFields',
        path: 'stackFields',
        name: 'Stack fields',
        description:
          'Numeric columns combined in one bar by the stacked style (comma-separated names). Default: all number fields.',
        category: COLUMNS,
        editor: ListEditor,
      })
      .addCustomEditor({
        id: 'extraFields',
        path: 'extraFields',
        name: 'Extra columns',
        description:
          'Columns shown as plain text after the bar (comma-separated names). Default: every field not used by another role.',
        category: COLUMNS,
        editor: ListEditor,
      })
      .addSelect({
        path: 'reducer',
        name: 'Reducer',
        description: 'How each time series is reduced to one value when the input is time series.',
        category: COLUMNS,
        defaultValue: DEFAULT_OPTIONS.reducer,
        settings: {
          options: [
            { value: ReducerID.lastNotNull, label: 'Last (not null)' },
            { value: ReducerID.last, label: 'Last' },
            { value: ReducerID.first, label: 'First' },
            { value: ReducerID.mean, label: 'Mean' },
            { value: ReducerID.min, label: 'Min' },
            { value: ReducerID.max, label: 'Max' },
            { value: ReducerID.sum, label: 'Total' },
            { value: ReducerID.diff, label: 'Difference' },
          ],
        },
      })

      // Bar
      .addSelect({
        path: 'barStyle',
        name: 'Bar style',
        description: 'Default style of the bar in every row; a style field or field override can change it per row.',
        category: BAR,
        defaultValue: DEFAULT_OPTIONS.barStyle,
        settings: { options: styleOptions },
      })
      .addRadio({
        path: 'colorMode',
        name: 'Colour mode',
        description:
          'Fixed colour, standard thresholds, a two-stop gradient from min to max, or the field colour setting.',
        category: BAR,
        defaultValue: DEFAULT_OPTIONS.colorMode,
        settings: {
          options: [
            { value: 'fixed', label: 'Fixed' },
            { value: 'thresholds', label: 'Thresholds' },
            { value: 'gradient', label: 'Gradient' },
            { value: 'field', label: 'Field' },
          ],
        },
      })
      .addColorPicker({
        path: 'fixedColor',
        name: 'Fixed colour',
        description: 'Bar colour in Fixed mode (and fallback when no threshold applies).',
        category: BAR,
        defaultValue: DEFAULT_OPTIONS.fixedColor,
        showIf: (o) => o.colorMode === 'fixed' || o.colorMode === 'thresholds',
      })
      .addColorPicker({
        path: 'gradientFrom',
        name: 'Gradient start',
        description: 'Colour at the minimum value in Gradient mode.',
        category: BAR,
        defaultValue: DEFAULT_OPTIONS.gradientFrom,
        showIf: (o) => o.colorMode === 'gradient',
      })
      .addColorPicker({
        path: 'gradientTo',
        name: 'Gradient end',
        description: 'Colour at the maximum value in Gradient mode.',
        category: BAR,
        defaultValue: DEFAULT_OPTIONS.gradientTo,
        showIf: (o) => o.colorMode === 'gradient',
      })
      .addBooleanSwitch({
        path: 'fillGradient',
        name: 'Gradient fill',
        description: 'Shade the determinate fill from a darker tone to the bar colour instead of a flat fill.',
        category: BAR,
        defaultValue: DEFAULT_OPTIONS.fillGradient,
      })
      .addColorPicker({
        path: 'negativeColor',
        name: 'Negative colour',
        description: 'Colour of the left half in the bidirectional style.',
        category: BAR,
        defaultValue: DEFAULT_OPTIONS.negativeColor,
      })
      .addColorPicker({
        path: 'positiveColor',
        name: 'Positive colour',
        description: 'Colour of the right half in the bidirectional style.',
        category: BAR,
        defaultValue: DEFAULT_OPTIONS.positiveColor,
      })
      .addSliderInput({
        path: 'trackHeight',
        name: 'Track height',
        description: 'Height of the bar track in pixels.',
        category: BAR,
        defaultValue: DEFAULT_OPTIONS.trackHeight,
        settings: { min: 2, max: 24, step: 1 },
      })
      .addSliderInput({
        path: 'trackWidth',
        name: 'Track width',
        description: 'Preferred width of the bar track in pixels (shrinks on narrow panels).',
        category: BAR,
        defaultValue: DEFAULT_OPTIONS.trackWidth,
        settings: { min: 40, max: 600, step: 10 },
      })
      .addSliderInput({
        path: 'radius',
        name: 'Corner radius',
        description: 'Border radius of the track and fill in pixels.',
        category: BAR,
        defaultValue: DEFAULT_OPTIONS.radius,
        settings: { min: 0, max: 12, step: 1 },
      })
      .addRadio({
        path: 'labelPosition',
        name: 'Value label',
        description: 'Where the formatted value is shown relative to the bar.',
        category: BAR,
        defaultValue: DEFAULT_OPTIONS.labelPosition,
        settings: {
          options: [
            { value: 'left', label: 'Left' },
            { value: 'right', label: 'Right' },
            { value: 'inside', label: 'Inside' },
            { value: 'hidden', label: 'Hidden' },
          ],
        },
      })
      .addSliderInput({
        path: 'segments',
        name: 'Segments',
        description: 'Number of blocks in the segmented style.',
        category: BAR,
        defaultValue: DEFAULT_OPTIONS.segments,
        settings: { min: 2, max: 40, step: 1 },
      })
      .addSliderInput({
        path: 'sweepWidth',
        name: 'Sweep width',
        description: 'Width of the moving segment in the sweep style, as a percentage of the track.',
        category: BAR,
        defaultValue: DEFAULT_OPTIONS.sweepWidth,
        settings: { min: 5, max: 90, step: 1 },
      })

      // Table
      .addBooleanSwitch({
        path: 'showHeader',
        name: 'Header',
        description: 'Show the column header row (click a header to sort).',
        category: TABLE,
        defaultValue: DEFAULT_OPTIONS.showHeader,
      })
      .addBooleanSwitch({
        path: 'showCheckbox',
        name: 'Checkbox column',
        description: 'Show a selection checkbox per row (selection is kept in the panel only).',
        category: TABLE,
        defaultValue: DEFAULT_OPTIONS.showCheckbox,
      })
      .addBooleanSwitch({
        path: 'showStatusDot',
        name: 'Status dot column',
        description: 'Show a coloured dot (and mapped icon) from the status field or the bar colour.',
        category: TABLE,
        defaultValue: DEFAULT_OPTIONS.showStatusDot,
      })
      .addTextInput({
        path: 'defaultSortField',
        name: 'Default sort',
        description:
          'Column to sort by initially: name, value, status, updated, or an extra column title. Empty keeps data order.',
        category: TABLE,
        defaultValue: '',
        settings: { placeholder: 'e.g. name' },
      })
      .addBooleanSwitch({
        path: 'defaultSortDesc',
        name: 'Sort descending',
        description: 'Direction of the default sort.',
        category: TABLE,
        defaultValue: DEFAULT_OPTIONS.defaultSortDesc,
      })
      .addRadio({
        path: 'density',
        name: 'Density',
        description: 'Row height preset used when Row height is 0.',
        category: TABLE,
        defaultValue: DEFAULT_OPTIONS.density,
        settings: {
          options: [
            { value: 'compact', label: 'Compact' },
            { value: 'comfortable', label: 'Comfortable' },
          ],
        },
      })
      .addSliderInput({
        path: 'rowHeight',
        name: 'Row height',
        description:
          'Explicit row height in pixels; 0 uses the density preset. Rows with subtitles are at least 44 px.',
        category: TABLE,
        defaultValue: DEFAULT_OPTIONS.rowHeight,
        settings: { min: 0, max: 80, step: 2 },
      })
      .addBooleanSwitch({
        path: 'showFooter',
        name: 'Footer',
        description: 'Show the footer with row count, sort state and selection.',
        category: TABLE,
        defaultValue: DEFAULT_OPTIONS.showFooter,
      })

      // Animation
      .addBooleanSwitch({
        path: 'animate',
        name: 'Animation',
        description:
          'Animate sweep, stripes and blinking pills. Automatically off for reduced-motion users and hidden tabs.',
        category: ANIM,
        defaultValue: DEFAULT_OPTIONS.animate,
      })
      .addSliderInput({
        path: 'animationSpeed',
        name: 'Animation speed',
        description: 'Seconds per sweep cycle (stripes run twice as fast).',
        category: ANIM,
        defaultValue: DEFAULT_OPTIONS.animationSpeed,
        settings: { min: 0.4, max: 6, step: 0.1 },
      });
  });
