# Impact Flow River

A particle "river" that paints one or more channels on a canvas, coloured by value along their length and
animated with thousands of streak particles advected by the local speed. The channel's width can also follow
data, so a stream can narrow where it speeds up. Think of it as a sparkline you can feel moving: the panel's time
range *is* the river, flowing from the oldest sample at the start of the path to the newest at the end.

![Flow river](../src/img/river.png)

## Data

The panel reads **numeric fields** from the query result. Time fields are ignored (values are used in order).
With **no query at all** the panel still renders: *Data > Demo data* defaults to *When no data*, which feeds
generated series through the same field pipeline (unit, thresholds, overrides) and marks the panel with a
"Demo data" pill. Add a query (or set the option to *Off*) to switch to real data.

### One series (default)

With no channels configured the panel draws a single S-curve bound to the **first numeric field** of the first
frame. A TestData "Random Walk" query works out of the box: the oldest value sits at the start of the river, the
newest at the end, and the caption shows the latest value.

### Several channels

Add channels in **Channels** (each has its own path, data source, width, colour scale, particles and labels).
A channel's **Speed** source decides where its values come from:

| Mode   | Behaviour                                                                                     |
| ------ | --------------------------------------------------------------------------------------------- |
| Series | A query `refId` (`A`, `B`), a frame name, or a 0-based frame index. Uses the frame's first numeric field. |
| Field  | A field by display name, searched across all frames (handy for wide frames or renamed fields). |
| Fixed  | A constant, useful for a decorative channel or a baseline.                                    |

**Auto-binding:** if a channel's series/field selector is left empty, channel *i* binds to numeric field *i*
(fields are counted across frames in order). So three random-walk queries A/B/C and three channels with no
explicit sources map 1:1 without any configuration.

### Parallel lanes (several series in one river)

With a **single channel** and more than one series, set **Multi-series** to *Parallel lanes*. Every numeric field
becomes a sub-lane of the channel, drawn side by side inside the channel width and coloured by its own value. The
legend uses the first field for unit and formatting. *Ignore* (the default) uses only the first field.

### Width from data

**Width from** works like the speed source. The width field is normalised to its maximum, so **Width (px)** is the
width at the widest point and the channel shrinks proportionally elsewhere. With *Fixed* the width is constant.

### Direction by sign

**Direction** can be *Forward*, *Reverse* or *By sign*. With *By sign* a channel whose mean value is negative flows
backwards (particles travel from the end of the path to the start). Colours still use the signed values, so a
diverging custom scale can show the sign while the motion shows the direction.

### Colour scales and the legend

Each channel picks a preset (`Turbo`, `Viridis`, `Inferno`, `Cool`, `Warm`), **Thresholds** (the standard field
thresholds, stepped) or **Custom stops** (value/colour pairs with piecewise-linear interpolation, so legend ticks sit
on the stops like a hand-made map legend). The scale domain is *Auto* (field min/max if set, otherwise the data
range) or *Fixed*. Legend ticks are formatted by the field display processor (unit, decimals from
**Standard options**).

## Network map

**Data > Channel source = Network map** generates the channels from data instead of hand-placed waypoints: every
link (switch uplink, service call, pipeline stage) becomes a channel flowing between two node pucks. Links are
parsed exactly like the flow panel's data-driven mode:

| Shape          | What the panel reads                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| Edge table     | A string **Source field** and **Target field** per row (`source`, `target` by default), a numeric **Value field** (empty = first numeric field), an optional **Width field** (second numeric field) and **Label field**. A Prometheus instant query in *Table* format produces this. |
| Labelled series| One numeric series per link whose labels hold the source and target names; the last value is the link value. A second query whose metric / display name matches **Width field** supplies the width. |
| Node table     | Optional: a frame with the **Node id field** (`id`) and no source/target fields adds labels (**Node label field**) and a status (**Node status field**: `ok` / `warn` / `error`, or 1 / 2 / 3) that colours the puck. |

The value drives the colour scale (one shared domain across all links) and the particle speed; the width comes
from the width field (normalised to its maximum) or is fixed (**Channel width**). **Direction** = *By sign* sends
links with a negative value backwards. Links in both directions between the same two nodes are offset to opposite
sides so they never overlap; every other link bends gently (**Curve**).

### Node placement

- **Auto layout**: the layered (left to right / top to bottom) or radial layout. Positions are deterministic for a
  given set of node ids, so nodes stay put across refreshes.
- **Positions**: a list of node id → x, y (0..1, y downwards). *Seed from auto layout* fills the list from the
  current query; edit the numbers to match a floor plan or a map set as the **Background** image.
- **Edit on canvas** shows drag handles on the pucks in both modes. Dragged positions are stored as overrides and
  win over the list and the auto layout; *Reset dragged* in the Positions editor forgets them. Switch the handles
  off before saving.

Labels: each node shows its label (or id) under the puck; each channel shows its formatted value at its midpoint
(**Node labels** / **Value labels**). `{value}` in the title, subtitle and caption is the **sum** of all link
values, or the value of one link when **Caption channel** is set (`source>target`). Caps: 60 channels (the highest
values are kept) and 100 nodes (the most connected); a note in the corner says when the data was truncated.
The **Particle budget** is shared by all links in proportion to their value, with a small floor per link, and the
global 20000 cap still applies.

### Network map options

| Option                              | Description                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------ |
| Data > Channel source               | *Manual* (the Channels list) or *Network map* (channels from links in the data).     |
| Network map > Node placement        | *Auto layout* or *Positions*.                                                         |
| Network map > Layout direction      | Left to right, top to bottom, or radial around the most connected node.              |
| Network map > Positions             | Node id → x, y list with *Seed from auto layout*, *Add* and *Reset dragged*.          |
| Network map > Edit on canvas        | Drag handles on the nodes; dragged positions are stored as overrides.                |
| Network map > Node size             | Puck radius in pixels.                                                               |
| Network map > Channel width (px)    | Fixed width, or the widest channel when a width field is set.                        |
| Network map > Curve                 | Bend of each channel as a fraction of its length (0 = straight).                     |
| Network map > Colour scale / domain | Preset or thresholds; auto or fixed domain shared by all links.                      |
| Network map > Direction             | Forward, Reverse, By sign.                                                           |
| Network map > Particle budget / speed / colour | Particles shared by value share; speed factor; white, by value or fixed colour. |
| Network map > Node labels / Value labels | Toggle the two label layers.                                                    |
| Network map > Caption channel       | `source>target` whose value feeds `{value}`; empty = sum of all links.               |
| Network map fields > Source / Target / Value / Width / Label field | Edge field (or series label) names.                |
| Network map fields > Node id / label / status field | Node frame field names.                                          |

### PromQL recipe

Instant queries in *Table* format, one row per link. Rename the label columns with the field options or set the
field names to match:

```promql
# A: link throughput, bits per second (Source field = "src", Target field = "dst")
sum by (src, dst) (rate(link_rx_bytes_total[5m])) * 8

# B (optional, Width field = "link_capacity_bits"): link capacity for the channel width
max by (src, dst) (link_capacity_bits)

# N (optional node frame; Node id field = "device", Node status field = "status")
max by (device, status) (device_up)
```

With range queries (series shape) the panel uses the last value of each series and matches the width series by its
metric name, so `Width field = link_capacity_bits` works for both shapes.

## Quick start

The first option group, **Quick start > Presets**, holds ready-made configurations. One click sets every
option of the panel, plus the unit, range, decimals or thresholds the preset defines in the standard field
options, to a complete look you can then tune. A preset starts from the panel defaults, not from the current options, so the
result is the same wherever you start from; what survives is the background image URL, the network field names, typed and dragged node positions and the Demo data choice.

| Preset | What you get |
| --- | --- |
| Single stream | one wide S-curve on the first series with labelled intake and outlet |
| Three channels | three straight pipes bound to series A, B, C; the third flows backwards when negative |
| Parallel lanes | every series as a lane inside one diagonal river |
| Thresholds, transparent | a wave coloured by the standard thresholds over a see-through panel |
| Network map, auto layout | one channel per source/target link, nodes laid out left to right |
| Network map, pinned nodes | links over typed node positions, a second value sets the width |

## Options

| Option                       | Description                                                                               |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| Data > Channel source        | *Manual* (default) uses the Channels list; *Network map* generates one channel per link in the data (see above). |
| Data > Demo data             | Built-in generated data (three smooth 0..100 series). *When no data* (default): used only when the query returns no frames or no numeric field. *Always*: ignores the query. *Off*: never; the empty state says "Needs one or more numeric series". A "Demo data" pill marks generated data. |
| Channels                     | List editor: add, remove, reorder channels. Each card has path, data, width, colour, particles and labels. |
| Channel > Path               | Waypoints as normalised `x, y` pairs (0..1). Presets: Horizontal, S-curve, Diagonal, U. **Edit on canvas** shows draggable handles on the panel. |
| Channel > Speed              | Series / Field / Fixed source for the values along the path.                              |
| Channel > Multi-series       | Ignore extra series, or draw each series as a parallel lane.                              |
| Channel > Direction          | Forward, Reverse, By sign.                                                                |
| Channel > Width (px)         | Base (maximum) width in CSS pixels.                                                       |
| Channel > Width from         | Optional data source that modulates the width along the path.                             |
| Channel > Smoothing          | Gaussian window (in samples) applied to speed and width before drawing. 0 = auto (5% of the samples, min 3). |
| Channel > Opacity            | Channel fill opacity.                                                                     |
| Channel > Scale              | Colour preset, thresholds or custom stops; domain auto or fixed.                          |
| Channel > Particles          | Count, speed, trail persistence, streak width and colour (White, By value, Fixed).        |
| Channel > Labels             | Text anchored at a position along the path (0..1), left / centre / right of the channel. Supports variables. |
| Default colour scale         | Used by the automatic channel when the list is empty.                                     |
| Show legend / Legend position| Gradient legend with formatted ticks and unit; corner placement.                          |
| Particle count multiplier    | Global multiplier (total particles capped at 20000 across all channels and lanes).        |
| Particle speed multiplier    | Global speed multiplier.                                                                  |
| Title / Subtitle / Caption   | Free text overlays. Variables are interpolated and `{value}` is replaced by the latest value of the first channel. |
| Big caption                  | Render the caption in a large display style.                                              |
| Show latest value            | Show "Channel: value" under the caption.                                                  |
| Background                   | Panel (inherits the panel background, so Grafana's built-in *Transparent background* switch works), Image URL (`http(s)` or `data:image` only; cover/contain; dim slider), Transparent (paints nothing behind the channels). |
| Channel halo                 | Soft dark halo around each channel (default on). Switch off for a flat look on light or transparent backgrounds. |
| Animate / Animation speed    | Toggle the particle loop and scale its speed. The loop pauses while the tab is hidden and stops on unmount. |
| Reduced motion               | `Follow system setting` (default) renders static streaks when the operating system asks for reduced motion and shows a small pause icon in the panel corner; `Always animate` ignores that setting; `Never animate` keeps the river static. |

Standard field options (unit, decimals, min, max, thresholds, display name, overrides) apply to the bound fields.

## Tips

- Transparent panels: set Grafana's *Transparent background* on the panel (or Background = Transparent) and turn off
  **Channel halo**. Text overlays use the theme colours so they stay legible on the light theme.

- Reduced motion: when the OS asks for reduced motion the panel renders the channel with static streaks instead of
  animating.
- For a pipeline look use a horizontal preset, a narrow width (40-60 px), the `Cool` scale and the *By value*
  streak colour.
- Raise **Smoothing** for very noisy series (it only affects the drawing, not the caption value); lower it to see every sample.
- Keep each channel at a few thousand particles. Very wide panels look best with a higher count and a longer trail
  (0.9).
- The panel reads values in frame order. If your source returns newest-first, add a *Sort by* transformation on the
  time field.
- Use the "Edit on canvas" switch on a channel to drag its waypoints, then switch it off before saving so the
  handles disappear.
- Network map over a floor plan: set **Background** to the plan image, pick *Positions*, seed from the auto layout,
  then drag the pucks onto the rooms with **Edit on canvas**; the dragged positions persist with the panel.
