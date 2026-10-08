# Impact Power Gauge

A ring gauge for signed quantities (power, flow, net import/export, load). The fill starts at a
configurable **zero mark** and grows one way for positive values and the other way for negative
values, with a glowing arc and a live marker dot on the ring. Inside the ring a small history chart
shows how the value evolved over the visible window; below it the current value, a secondary line
(for example an average over the window) and a subtitle are drawn.

Everything is drawn on a device-pixel-ratio aware canvas, scales with the panel size and hides tick
labels, secondary text and the big value progressively as the panel gets small. The in-ring chart is
sized to fit inside the ring (its width is the chord of the ring interior at its top and bottom) and
clipped to a circle just inside the fill, so it never crosses the ring on any arc geometry.

## Live motion

Most data sources behind a dashboard are polled every 5 to 30 seconds, so a gauge would normally sit
frozen between refreshes. The *Live motion* options keep it visibly alive **without inventing data**:
every bit of motion is derived from samples that were already received.

- **Continuous scroll**: the history chart's x axis is wall-clock time. Between refreshes the window
  keeps sliding at real speed, so the newest sample drifts away from the right edge; when the refresh
  brings new samples the window eases (no jump) back to the new end. With the *Time range* window
  the movement is proportional to the range (10 s on a 15 minute range is under a pixel), so for a
  visible stream use *History > Window = Stream*: the chart then shows only the last *Stream duration*
  and scrolls at a constant width / duration pixels per second with fractional positions (no pixel
  snapping); newly arrived samples slide in from the right edge with a short easing. With no
  timestamps, or with an absolute time range that does not end "now", nothing scrolls.
- **Playback delay** (stream mode): to play smoothly the gauge shows data a little behind real time.
  The playhead (the right edge of the chart) runs `delay` behind the wall clock, where *Auto* adapts the
  delay to the observed refresh cadence (1.25 x the interval plus a latency margin, clamped to 2 s .. 5
  min; 15 s or the dashboard refresh interval until two refreshes were seen) and *Fixed* uses the
  configured seconds. If data arrives later than the buffer covers, the playhead slows smoothly towards
  the newest sample and never passes it or jumps; in Auto mode the delay then grows so it does not recur.
  The scroll speed stays width / duration px per second.
- **Value follows playback** (stream mode, on by default): the marker, fill, glow and big number show
  the sample under the playhead, interpolated linearly between the two neighbouring samples, so the
  arc sweeps continuously in step with the chart. The secondary line keeps using the time-range reducer
  and the stale caption keeps using real arrival times. Off: ease to the newest sample as below.
- **Marker drift**: the fill and marker ease to the latest value over a slightly longer time and the
  glow breathes gently. The number itself never changes without data.
- **Trail**: a short fading trail along the ring shows where the marker came from, built from the
  last few samples and their timestamps; it fades out as those samples age.
- **Stale indicator**: when the newest sample is older than max(3 x sample interval, 2 x refresh
  interval, 60 s) the marker glow is dimmed and a small "stale · 42 s" caption appears under the subtitle.
  The value's colours never change.

All of this falls back to the plain static render when *Animation* is off, when the system prefers
reduced motion (unless *Reduced motion* is set to *Always animate*), when the tab is hidden or when the
panel is scrolled out of view. All gauges on a page
share one animation frame loop, frames are capped at 60 per second and skipped when nothing changed,
and only the moving layer (history, fill, marker) is redrawn; the ring, ticks and text are drawn once
per data update.

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
- With **no query at all** the panel still renders: *Data > Demo data* defaults to *When no data*, which
  feeds a generated series through the same field pipeline (unit, decimals, thresholds, overrides) and
  marks the panel with a "Demo data" pill. Add a query (or set the option to *Off*) to switch to real data.

## Options

Standard field options used: Unit, Decimals, Min, Max, Thresholds, Color, Display name.

### Data

| Option | Description |
| --- | --- |
| Field | Numeric field to display. Empty = first numeric field of the first frame. |
| Demo data | Built-in generated signed power series (1 s cadence, rolling window ending now). *When no data* (default): shown only when the query returns no frames or no numeric field. *Always*: ignores the query. *Off*: never; the empty state says "Needs one numeric time series". A small "Demo data" pill marks generated data. |

### Appearance

| Option | Description |
| --- | --- |
| Background | Panel (default): nothing is painted, so the panel background or Grafana's "Transparent background" shows through. Transparent: identical, listed for parity with the other panels. Solid colour: custom fill. |
| Background colour | Fill colour for the Solid colour mode. |

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
| Window | Time range (panel time range), Last N samples, or Stream: only the last *Stream duration* of samples, newest at the right edge, scrolling continuously at a constant speed. The value, reducers and ring always use the time range. |
| Stream duration | Seconds shown by the chart in stream mode (default 60; e.g. 30 to 600). The chart scrolls width / duration pixels per second. |
| Playback delay | Stream mode jitter buffer: Auto (adapts to the observed refresh cadence) or Fixed. |
| Delay seconds | Fixed playback delay in seconds. |
| Value follows playback | Stream mode: marker, fill, glow and big number show the (interpolated) sample under the playhead. |
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
| Animate | Ease the fill and marker to new values. Automatically off when the tab is hidden. |
| Reduced motion | `Follow system setting` (default) pauses easing and live motion when the operating system asks for reduced motion and shows a small pause icon in the panel corner; `Always animate` ignores that setting; `Never animate` keeps the gauge static. |
| Duration | Easing duration in milliseconds. |

### Live motion

| Option | Description |
| --- | --- |
| Continuous scroll | Keep scrolling the history left between refreshes at the inferred sample cadence (fallback: dashboard refresh interval). |
| Marker drift | Longer easing of the fill/marker to the latest value plus a breathing glow between refreshes. |
| Drift duration | Easing duration in ms for the marker drift (default 750). |
| Breathing | Amplitude 0..1 of the glow opacity/blur oscillation (period about 2.4 s). 0 disables. |
| Trail | Fading trail along the ring from the last samples to the marker. |
| Trail samples | Number of recent samples used for the trail. |
| Stale indicator | Dim the marker glow and show a "stale · age" caption when the newest sample is older than max(3 x sample interval, 2 x refresh interval, 60 s). |

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
- The canvas never paints an opaque background, so Grafana's panel option *Transparent background* works as expected.
- Tiny panels (below about 150 px) hide tick labels, then the stale caption, subtitle and secondary line, then the value.
- Live motion only animates samples you already have; to compare, put a copy of the panel next to it with the *Live motion* switches off (see the demo dashboard).
