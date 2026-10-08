# Impact Flow Designer

A node-and-edge diagram panel for "where does it flow" views: power, water, traffic, pipelines,
money. Nodes are cards, pills, hubs or circles with an icon, a status accent and a live value.
Edges are soft-glowing curves with travelling particles whose speed, colour or width can follow a
field in your data. The diagram is designed directly inside the panel (drag, draw, reshape) and
stored in the panel options as JSON, so it travels with the dashboard.

## Data expectations

The panel does not need data to render a diagram, but it reads **numeric fields** to show live
values and to drive edges:

- **Node live value**: a node with `valueField` shows the *last non-null value* of the field whose
  display name matches (for example the `alias` of a test-data query, or the series name of a
  Prometheus query). Formatting (unit, decimals, display name) comes from the standard field
  options and overrides.
- **Edge binding**: an edge with `bind.field` reads the same way and maps the value to:
  - `speed` - particle speed, scaled between `min` and `max` (defaults: field min/max, then 0..100);
  - `width` - stroke width 1..6 px over the same range;
  - `color` - the colour from the field's **Thresholds** / **Color scheme** (standard options), so
    the usual green/amber/red bands just work.
  - `reverseBelowZero` makes the particles travel backwards for negative values (battery charging,
    grid export).

Several queries with aliases that match the node/edge field names is the simplest setup. See the
demo dashboard (`provisioning/dashboards/impact/flow.json`) which binds six random-walk series.

## Designing a diagram

1. Edit the panel and turn on **Layout → Edit layout**. A floating toolbar appears inside the panel
   and a "Design mode" badge is shown.
2. Toolbar: **Select/move**, **Add node** (click on the canvas), **Add edge** (click a source node
   then a target), **Delete**, **Undo / Redo** (50 steps), **Fit**, **Grid**, **Lock** (turns Edit
   layout off).
3. On the canvas:
   - drag nodes (they snap to the grid when snapping is on);
   - drag from one of a node's four **ports** to another node to create an edge from that side;
   - click an edge to select it; drag its white **control-point handles** to reshape a Bezier
     curve, or drag the square **endpoint anchors** onto another node to reconnect it;
   - double-click a node to rename it inline;
   - pan with **Space + drag**, **middle mouse** or **Alt + drag**; zoom with the mouse wheel;
   - keys: `V` select, `N` add node, `E` add edge, `Delete`, `Ctrl+Z`, `Ctrl+Shift+Z`, `Esc`.
4. The **Diagram → Inspector** option editor mirrors the selection and exposes every property
   (label, shape, icon, status, colour, value field, geometry; edge style, curvature, stroke,
   colour, dash, arrowhead, glow, particles, data binding). You can also pick an element from its
   drop-down without clicking in the panel.
5. **Diagram → Import / export JSON** shows the whole diagram as JSON. Edit and **Apply** (the JSON
   is validated: unknown shapes, dangling edges, duplicate ids and bad control points are
   reported), **Load example** inserts the site power flow sample, **Clear** empties the canvas.
6. Turn **Edit layout** off before saving so viewers cannot move anything. When editing is off the
   diagram is fitted to the panel (unless **Fit to panel** is disabled, in which case the saved
   viewport is used).

## Options

| Option | Description |
| --- | --- |
| Appearance → Background | `Panel` (plain), `Transparent`, `Dot grid` or `Line grid` behind the diagram. |
| Appearance → Node style | `Cards` (filled, shadowed, status accent) or `Minimal` (outlined). |
| Appearance → Font size | Base label size in pixels; sub-labels and hub labels scale from it. |
| Appearance → Default edge colour | Colour for edges without their own colour (named theme colour or hex). |
| Appearance → Particle speed | Global multiplier on every edge's particle speed. |
| Animation → Animation | Enables the particle animation. Automatically static when the system prefers reduced motion or the tab is hidden. |
| Animation → Speed | Animation speed multiplier (shown when animation is on). |
| Layout → Edit layout | Design mode toggle: toolbar, dragging, drawing, pan and zoom inside the panel. Off by default. |
| Layout → Grid size | Spacing of the background grid and of snapping, in canvas pixels. |
| Layout → Snap to grid | Snap node positions while dragging. |
| Layout → Fit to panel | When not editing, scale and centre the diagram to the panel size instead of using the saved viewport. |
| Diagram → Inspector | Properties of the selected node or edge (see above). |
| Diagram → Import / export JSON | Full diagram JSON with validation, example loader and clear. |
| Standard options / Overrides | Unit, decimals, min/max, thresholds, colour scheme and display name of the bound fields. |

## Diagram JSON

```json
{
  "nodes": [
    { "id": "src", "label": "Source", "x": 40, "y": 120, "w": 140, "h": 52, "shape": "card",
      "icon": "bolt", "status": "ok", "valueField": "source_kw", "valueFormat": "${value}" }
  ],
  "edges": [
    { "id": "e1", "from": "src", "to": "hub", "fromSide": "auto", "toSide": "auto",
      "style": "bezier", "curvature": 0.55, "controlPoints": [{ "dx": 60, "dy": 0 }, { "dx": -60, "dy": 0 }],
      "stroke": 2, "color": "#19D3F0", "dash": "solid", "arrow": true, "glow": true,
      "particles": { "enabled": true, "count": 3, "speed": 1.4, "size": 2 },
      "bind": { "field": "source_kw", "mapTo": "speed", "min": 0, "max": 20, "reverseBelowZero": false } }
  ],
  "viewport": { "x": 0, "y": 0, "zoom": 1 },
  "grid": { "show": true, "size": 20, "snap": true }
}
```

- `shape`: `card` | `pill` | `hub` | `circle`; `status`: `ok` | `warn` | `error` | `none`.
- `icon`: any name from the standard icon set (for example `bolt`, `plug`, `home`, `database`,
  `cloud`, `rocket`, `cog`, `sitemap`); the Inspector lists common ones.
- `style`: `bezier` | `orthogonal` | `straight` | `step`; `dash`: `solid` | `dash` | `dot`.
- `controlPoints` are relative to the start and end points and only used by `bezier`.
- Sides are `auto` (face the other node) or `left` | `right` | `top` | `bottom`.

## Tips

- Use a hub node in the middle and `auto` sides; edges spread automatically along a node side so
  ports never overlap.
- Edges that share a node side are ordered by where their other end is, so they do not cross at
  the port.
- Map `color` to a field and set thresholds in **Standard options** to get "goes red when
  overloaded" edges without any per-edge configuration.
- Dashboard variables are interpolated in node labels and sub-labels (`$site`).
- For 30+ edges keep particle counts around 2-3; the animation runs as one frame loop regardless
  of edge count.
