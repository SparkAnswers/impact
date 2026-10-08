# Impact Power Gauge

A ring gauge for signed quantities (power, flow, net import/export, load). The fill starts at a
configurable **zero mark** and grows one way for positive values and the other way for negative
values, with a glowing arc and a live marker dot on the ring. Inside the ring a small history chart
shows how the value evolved over the visible window; below it the current value, a secondary line
(for example an average over the window) and a subtitle are drawn.

Everything is drawn on a device-pixel-ratio aware canvas, scales with the panel size and hides tick
labels, secondary text and the big value progressively as the panel gets small.

## Data expectations

- The panel reads **one numeric field**: by default the first numeric field of the first frame. Pick a
  different one with *Data > Field*.
- **Current value** = the last non-null value of that field inside the visible window.
- If the frame has a time field, the history chart positions samples by time inside the panel time
  range (gaps stay visible). Without a time field, samples are spaced evenly.
- Units, decimals, min, max, thresholds, colour and display name all come from the **standard field
  options** (and overrides). The panel never hard-codes a unit: the big value, tick labels and the
  computed secondary value all go through the field display processor.
- Works out of the box with a TestData *Random Walk* query.

## Options

Standard field options used: Unit, Decimals, Min, Max, Thresholds, Color, Display name.

### Data

| Option | Description |
| --- | --- |
| Field | Numeric field to display. Empty = first numeric field of the first frame. |

### Arc

| Option | Description |
| --- | --- |
| Start angle | Degrees clockwise from 3 o'clock where the arc begins. |
| Sweep angle | Angular length of the arc (30..360 degrees). |
| Clockwise | Values increase clockwise from the start angle. Off puts the max end at the start angle (the default: max top-left, min bottom-right). |
| Fill width | Stroke width of the live fill arc. |
| Ring colour | Colour of the thin background ring. Empty = theme colour. |
| Glow | Blur radius of the glow behind the fill. 0 disables. |

### Scale

| Option | Description |
| --- | --- |
| Zero mark | Value the fill originates from. Values above fill towards max, values below towards min. |
| Zero position | Fraction 0..1 along the arc (0 = min end) where the zero mark sits. Empty = proportional to the min/max range. |
| Scale | Linear, Square root or Log compression. The non-linear scales compress the high end so small values stay readable. |
| Ticks | Auto (nice ticks on each side of the zero mark), Custom list or Hidden. |
| Tick values | Comma separated list for the custom mode, e.g. `-50, 0, 50, 100, 200`. |
| Tick labels | Show tick values, formatted with the field unit and decimals. |
| Unit at zero mark | Replace the tick label at the zero mark with the unit. |

### Colours

| Option | Description |
| --- | --- |
| Colour mode | Fixed: positive/negative colours. Thresholds: ring painted in bands from the field thresholds, fill coloured by the current value. Field colour: the standard field colour. |
| Positive colour | Fill colour above the zero mark. Theme colour names (orange, green, blue, ...) and hex values work. |
| Negative colour | Fill colour below the zero mark. |
| Marker colour | Colour of the live dot. Empty = theme text colour. |

### History

| Option | Description |
| --- | --- |
| Show history | Draw the series as a chart inside the ring. |
| Window | Time range (panel time range) or Last N samples. |
| Samples | Number of most recent samples for the Last N window. |
| Fade older samples | Older samples fade out towards the left. |
| Line width | Stroke width of the history line. |
| Area fill | Fill between the line and the zero baseline. |
| Line colour | By sign (positive/negative colours) or By thresholds (each segment coloured by the field thresholds). |

### Text

| Option | Description |
| --- | --- |
| Show value | Show the big current value with the field unit. |
| Value font size | Pixels; 0 or empty = automatic. |
| Value label | Small caption above the value. Supports template variables. |
| Show secondary line | Show the line under the value. |
| Secondary source | Computed (a reducer over the visible window, inserted at `{value}`) or Text. |
| Secondary text | Template for the line, e.g. `Avg. {value}`. The first number is drawn in bold. Supports template variables. |
| Reducer | Mean, Last, Min, Max, Sum or Range over the visible window. |
| Secondary unit | Unit for the computed value. Empty = field unit. |
| Secondary decimals | Decimals for the computed value. Empty = field decimals. |
| Subtitle | Small line under the secondary line. Supports template variables. |
| Title | Caption inside the panel. Supports template variables. |
| Title position | Bottom, Top or Hidden. |

### Animation

| Option | Description |
| --- | --- |
| Animate | Ease the fill and marker to new values. Automatically off when the system prefers reduced motion or the tab is hidden. |
| Duration | Easing duration in milliseconds. |

## Tips

- Set **Min/Max** in the standard options to fix the range; otherwise the panel uses the data range of
  the visible window, which makes the arc jump between refreshes.
- For a classic "regen" style power gauge use min -50, max 200, square-root scale and the default
  195 degree arc. The zero mark lands at 20% of the arc, so most of the ring is available for
  positive values.
- For a plain 0..100 % gauge use a 300 degree clockwise arc starting at 120 degrees, linear scale and
  the Thresholds colour mode: the ring shows the bands and the fill picks up the active colour.
- The secondary line accepts any free text, so `Net {value}` with the Sum reducer and a `kWh` unit
  override gives an energy total under a power reading.
- Tiny panels (below about 150 px) hide tick labels, then the secondary line, then the value.
