# Impact Status Bars

A table of entities, one per row, each with an animated or determinate progress bar, a status dot, a
relative "Updated" time and any number of plain text/number columns. Think "device list with health bars":
indeterminate sweeps for things still updating, threshold-coloured percent bars, segmented and striped
variants, bidirectional bars centred on zero, stacked multi-value bars, inline sparklines and coloured
status pills. Headers are sortable, rows can be selected with checkboxes, and tables with more than 200
rows are windowed so only the visible slice is rendered.

## Data expectations

The panel works on either shape of data. With **no query at all** it still renders: *Data > Demo data*
defaults to *When no data*, which feeds a generated device table through the same field pipeline (unit,
thresholds, mappings, overrides) and marks the panel with a "Demo data" pill (in the footer's right
half when the footer is on, otherwise in a small band above the header so no column title is covered).
Add a query (or set the option to *Off*) to switch to real data.

**Table input (one row per entity)** - a single frame where each row is an entity, for example a CSV,
SQL or logs-to-table result. Column roles are auto-detected and can be fixed in the _Columns_ options:

| Role          | Auto-detection                                                                                                           | Used for                                                                                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name          | first string field                                                                                                       | row label; data links on this field make it clickable (so do links on any other field, see below)                                                                                   |
| Subtitle      | field named `subtitle`, `description`, `detail`, `model` or `note`                                                       | small text under the name                                                                                                                                                             |
| Value         | first number field                                                                                                       | the bar; formatted with the field's unit/decimals; min/max from field config or data                                                                                                  |
| Status        | field named `status`, `state`, `health` or `severity`                                                                    | status dot colour/icon, pill text, sweep label (via value mappings)                                                                                                                   |
| Time          | first time field, or a string field named `updated`, `time`, `timestamp`, `last_seen`                                    | "Updated" relative-time column                                                                                                                                                        |
| Sparkline     | field of arrays, a nested-frame field (the `Trend` column of the *Time series to table* transformation), or string field named like `trend`, `spark`, `history`, `series` (values `1;2;3`, `1,2,3` or `[1,2,3]`) | sparkline style                                                                                                                                                                       |
| Style         | string field named `style`, `bar_style` or `bar`                                                                         | bar style per row (`sweep`, `percent`, `segmented`, `striped`, `bidirectional`, `stacked`, `sparkline`, `pill`; aliases like `indeterminate`, `badge`, `bi-directional` are accepted) |
| Stack fields  | all number fields unless set                                                                                             | segments of the stacked style                                                                                                                                                         |
| Extra columns | every field not used by another role                                                                                     | plain text / number columns after the bar                                                                                                                                             |

**Time series input** - any number of frames with a time field and numeric fields and no string fields.
Each numeric series becomes one row: the name is the series display name, the value is the _Reducer_
(last non-null by default), the series itself is the sparkline, and the last timestamp feeds the
"Updated" column. The bar style can be changed per series with the _Bar style override_ field override.

Standard field config applies: unit, decimals, min, max, no-value text, display name, colour, thresholds,
value mappings (text, colour and icon for statuses) and data links.

**Data links** on any field make its cells clickable: name, subtitle, the bar (the value field; the status
field for pills, the sparkline field for sparklines), the status dot, the "Updated" time and every extra
column. For time series input the links of each series apply to its row. The first link is the click action;
when a field has several, a chevron next to the cell and a right-click open a menu with all of them. Links are
interpolated by Grafana (`${__data.fields...}`, `${__value...}`, dashboard variables); only `http(s)`, `mailto`
and relative URLs are followed. *Table > Row click* can additionally make the whole row follow the name link.

## Quick start

The first option group, **Quick start > Presets**, holds ready-made configurations. One click sets every
option of the panel, plus the unit, range, decimals or thresholds the preset defines in the standard field
options, to a complete look you can then tune. A preset starts from the panel defaults, not from the current options, so the
result is the same wherever you start from; what survives is every column choice (name, value, status, time, sparkline, style, stack and extra fields) and the Demo data choice.

| Preset | What you get |
| --- | --- |
| Device list | threshold-coloured percent bars, status dots, checkboxes, footer |
| Series with sparklines | one row per time series, last value on a sparkline, sorted by value |
| Stacked | every numeric column stacked in one bar |
| Bidirectional | bars centred on zero with their own colours |
| Compact gradient | dense rows, thin flat bars with a gradient, no animation |
| Status pills | a coloured pill per row from the value mappings, no bar |

## Options

| Option                                                                      | Description                                                                                                                                                          |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data > Demo data                                                            | Built-in generated device table (12 rows, one of every bar style). *When no data* (default): used only when the query returns no frames or no usable fields. *Always*: ignores the query. *Off*: never; the empty state says "Needs a table or several series". A "Demo data" pill marks generated data. |
| Columns > Name / Subtitle / Value / Status / Time / Sparkline / Style field | Pick the field for each role; empty means auto-detect.                                                                                                               |
| Columns > Stack fields                                                      | Comma-separated numeric fields combined in one bar by the stacked style.                                                                                             |
| Columns > Extra columns                                                     | Comma-separated fields shown as plain columns after the bar; empty (or an empty list in JSON) shows every unused field. A series-valued column (array, or a `Trend` cell from *Time series to table*) is drawn as a small sparkline with its last value, formatted with the column's unit. |
| Columns > Reducer                                                           | How a time series is reduced to one value (last, last not null, first, mean, min, max, total, difference).                                                           |
| Bar > Bar style                                                             | Default style for every row: sweep, percent, segmented, striped, bidirectional, stacked, sparkline or pill. A style field or field override wins per row.            |
| Bar > Colour mode                                                           | `Fixed` colour, standard `Thresholds`, a two-stop `Gradient` from min to max, or the `Field` colour setting (palettes, continuous schemes, per-field fixed colours). |
| Bar > Fixed colour                                                          | Colour used in Fixed mode and as fallback when no threshold applies.                                                                                                 |
| Bar > Gradient start / end                                                  | The two stops of Gradient mode.                                                                                                                                      |
| Bar > Gradient fill                                                         | Shade the determinate fill from a darker tone to the bar colour instead of a flat fill.                                                                              |
| Bar > Negative / Positive colour                                            | Left and right halves of the bidirectional style.                                                                                                                    |
| Bar > Track height / Track width / Corner radius                            | Geometry of the track in pixels; the track shrinks on narrow panels.                                                                                                 |
| Bar > Value label                                                           | Left, right, inside the track or hidden. Inside works best with a track height of 14 px or more.                                                                     |
| Bar > Segments                                                              | Number of blocks in the segmented style.                                                                                                                             |
| Bar > Sweep width                                                           | Width of the moving segment of the sweep style as a percentage of the track.                                                                                         |
| Table > Header                                                              | Show the header row; click a header to sort, click again to flip direction.                                                                                          |
| Table > Checkbox column                                                     | Per-row selection kept inside the panel (count shown in the footer).                                                                                                 |
| Table > Status dot column                                                   | Coloured dot plus mapped icon from the status field, or the bar colour when there is no status field.                                                                |
| Table > Default sort / Sort descending                                      | Initial sort: `name`, `value`, `status`, `updated` or an extra column title.                                                                                         |
| Table > Density / Row height                                                | Compact (28 px) or comfortable (36 px) rows, or an explicit height. Rows with subtitles are at least 44 px.                                                          |
| Table > Footer                                                              | Row count, sort state, selection count and "Refreshed ... ago".                                                                                                      |
| Table > Row click                                                           | `Off` (default): only cells whose field has data links are clickable. `Name link`: clicking anywhere in a row follows the first data link of the name field; cells with their own links and the checkbox still win. |
| Animation > Animation                                                       | Run the sweep, stripe and blinking-pill animations. Automatically paused in hidden tabs.                                                                              |
| Animation > Reduced motion                                                  | `Follow system setting` (default) pauses the animations when the operating system asks for reduced motion and shows a small pause icon in the panel corner; `Always animate` ignores that setting; `Never animate` keeps the bars static. |
| Animation > Animation speed                                                 | Seconds per sweep cycle; stripes run at twice the rate.                                                                                                              |
| Field override > Bar style override                                         | Custom field option that forces a style for rows produced by that field (series or value column).                                                                    |

## Tips

- **Sparkline plus extra columns from one data source**: query the history as a time series (refId `A`), the
  columns you want next to it as instant table queries (`B`, `C`...), then add the transformations *Time series to
  table* (turns `A` into one row per series with a `Trend #A` cell) and *Join by field* on the label that names the
  row (for example `process`). Pick `Trend #A` as the sparkline field, a `Value #B` as the value and list the rest
  under *Extra columns*; field overrides set each column's unit.

- With the testdata _CSV content_ scenario, a `style` column lets you mix every bar style in one table; the
  demo dashboard `Impact Status Bars demo` shows this with twelve generic devices.
- Status text, colour and icon all come from value mappings on the status field (for example `ok` ->
  "Healthy", green, `check-circle`). Unmapped words still get a sensible colour (`ok`, `warn`, `crit`,
  `down`, `updating`...).
- A CSV `updated` column of ISO timestamps is read as a time either by name or after a _Convert field
  type_ transformation; the "Updated" column refreshes its relative text every 30 seconds.
- For the bidirectional style set symmetric min/max (for example -8 and 8) so zero sits in the centre.
- Thresholds in _percentage_ mode are evaluated against the position between min and max, which is handy
  when rows have different ranges.
- To float the table over the dashboard, turn on the panel's "Transparent background" option and set
  _Table > Background_ to `Transparent`; rows scrolling under the header stay readable thanks to the blur.
- Light theme: tracks use the theme's secondary background and borders, so the panel reads well without
  any colour changes; flat fills (Gradient fill off) look cleanest there.
