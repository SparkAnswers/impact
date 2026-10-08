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

With **no query at all** the panel still shows something: *Data > Demo data* defaults to *When no
data*. In the data-driven modes it feeds a generated 12-node service graph (edge rows `source`,
`target`, `value` in requests per second) through the same field pipeline whenever the query yields no
edges, marked with a "Demo data" pill. In *Manual* mode an **empty** diagram shows that same graph
(laid out as in Data mode) with a one-line hint until you load the example, draw nodes, or switch
*Diagram source* to *Data*; a drawn diagram never receives generated values, and design mode always
shows the real canvas. Set the option to *Off* to get the plain empty state instead.

## Data-driven diagrams

Set **Data → Diagram source** to `Data` and the diagram builds itself from the query results: edges
come from the frames, nodes from the edge endpoints (or from an optional node frame), and a layered
layout places everything. `Data + manual overrides` adds a layer of per-node tweaks (dragged
positions, icon, shape, colour, label, status) that win over the automatic layout.

### Frame shapes

Two shapes are recognised, and both can be mixed in one panel:

1. **Table-shaped edge frames**: a string `source` and `target` field (names configurable under
   **Data → Edge and node fields**) plus an optional numeric value field (default: the first numeric
   field), an optional `label` field, and `source_group` / `target_group` fields (for example a
   namespace). Every row is an edge. This is what a Prometheus **instant query in Table format**
   produces: one string column per label plus a `Value` column.
2. **Series-shaped edge frames**: time series whose **labels** carry the source and target names
   (`client`/`server` for service-graph metrics, `source_workload`/`destination_workload`,
   `node`/`pod`, `pod`/`persistentvolumeclaim` ...). One series is one edge and its last value is
   the edge value. Set **Source field** / **Target field** to the label names.

Rows with the same source and target are merged (values summed). A **node frame** is any frame
with the node id field (default `id`) and no source/target fields; it adds nodes (isolated ones
too) or decorates existing ones with `label`, `group`, `status` and a numeric value. The status
field goes through the standard **value mappings** first, then text such as `ok`, `running`,
`bound`, `warn`, `pending`, `error`, `failed` (or the numbers 1 / 2 / 3) becomes the node status.

A **secondary value field** (for example an error rate next to a request rate) is a second numeric
column in the same table frame, or a second series per edge whose field / metric name matches the
configured name.

### Layout

- **Layout direction**: `Left to right` or `Top to bottom` layered layout (rank = longest path
  from the sources, cycles are broken, nodes inside a layer are ordered by the barycenter of their
  neighbours over a few sweeps, groups stay adjacent) or `Radial` (the node with the most edges in
  the middle, the rest on rings by hop distance).
- **Layer gap** / **Node gap** control spacing. The layer gap stretches (up to 4x) so the diagram
  roughly matches the panel's aspect ratio, which keeps big fan-outs readable.
- Positions are only recomputed when the **set of node ids** (or a layout option) changes, so
  refreshes never reshuffle the diagram. Nodes that appear fade in, nodes that disappear fade out
  and edges re-route.
- Node cards are sized to their label; long names are shortened with an ellipsis and the full id is
  shown underneath.

### Mapping values

- **Value drives**: particle `speed` (default), `colour` (through the value field's standard
  **Thresholds** / **Color scheme**) or stroke `width`. The range is the field's min/max when set,
  otherwise 0..max over all edges. **Secondary value drives** does the same for the secondary field.
- **Show edge values** draws the formatted value (unit and decimals from the standard options) at
  the middle of each edge; a label field wins when present.
- Groups colour the node accent from the theme palette; **Group boxes** draws a faint rounded
  container with the group name around each group.
- **Top N edges by value** (default 200) keeps the busiest edges. Diagrams are always capped at
  400 nodes / 1500 edges; a notice in the panel corner says when something was cut.

### Overrides

With `Data + manual overrides` and **Layout → Edit layout** on, dragging a node stores its position
under **Data → Node overrides** keyed by node id (`{ "api": { "x": 320, "y": 40 } }`). The same
editor lets you pick any data node and set a label, shape, icon, status, accent colour or exact
position, clear one node, or **Reset overrides**. Overrides for ids that are no longer in the data
are kept (harmless) until you reset them.

### PromQL recipes

Prometheus datasource, **Instant** query, **Format: Table**. Everything is normalised into
`source` / `target` labels with `label_replace`, so several queries can be combined in one panel
and the panel's default field names apply. `$1` is the PromQL capture group, not a dashboard variable.

**Service graph (client → server request rate).** With span-metrics / service-graph metrics the labels
are already there; set **Source field** = `client`, **Target field** = `server`:

```promql
sum by (client, server) (rate(traces_service_graph_request_total[5m]))
```

Secondary value: add `sum by (client, server) (rate(traces_service_graph_request_failed_total[5m]))`
in **Time series** format, set **Secondary value field** = `traces_service_graph_request_failed_total`
and **Secondary value drives** = `Colour` with red thresholds.

**Ingress → proxy → services** from a reverse proxy's request counters (verified against a proxy
that exports `<proxy>_entrypoint_requests_total{entrypoint}` and `<proxy>_service_requests_total{service}`;
chained with a constant `proxy` node so the entrypoint and service series join up):

```promql
# A: entrypoint → proxy
sum by (source, target) (
  label_replace(label_replace(
    sum by (entrypoint) (rate(<proxy>_entrypoint_requests_total[5m])),
    "source", "$1", "entrypoint", "(.*)"), "target", "proxy", "", ""))

# B: proxy → service
sum by (source, target) (
  label_replace(label_replace(
    sum by (service) (rate(<proxy>_service_requests_total[5m])),
    "source", "proxy", "", ""), "target", "$1", "service", "(.*)"))
```

**Node → pod → PVC → PV → storage class** from kube-state-metrics and the kubelet (verified), with
the namespace as group so pods and claims get **Group boxes**:

```promql
# A: node → pod
sum by (source, target, target_group) (
  label_replace(label_replace(label_replace(
    kube_pod_info{namespace=~"$namespace"},
    "source", "$1", "node", "(.*)"), "target", "$1", "pod", "(.*)"), "target_group", "$1", "namespace", "(.*)"))

# B: pod → persistent volume claim
sum by (source, target, source_group, target_group) (
  label_replace(label_replace(label_replace(label_replace(
    kube_pod_spec_volumes_persistentvolumeclaims_info{namespace=~"$namespace"},
    "source", "$1", "pod", "(.*)"), "target", "$1", "persistentvolumeclaim", "(.*)"),
    "source_group", "$1", "namespace", "(.*)"), "target_group", "$1", "namespace", "(.*)"))

# C: claim → persistent volume, valued with the bytes in use (joined by claim name)
sum by (source, target, source_group) (
  label_replace(label_replace(label_replace(
    kubelet_volume_stats_used_bytes{namespace=~"$namespace"}
      * on (namespace, persistentvolumeclaim) group_left (volumename) kube_persistentvolumeclaim_info,
    "source", "$1", "persistentvolumeclaim", "(.*)"), "target", "$1", "volumename", "(.*)"),
    "source_group", "$1", "namespace", "(.*)"))

# D: persistent volume → storage class
sum by (source, target) (
  label_replace(label_replace(
    kube_persistentvolumeclaim_info{namespace=~"$namespace"},
    "source", "$1", "volumename", "(.*)"), "target", "$1", "storageclass", "(.*)"))
```

Set **Value drives** to `Nothing` (the info metrics are all `1`) or to `Width` with unit `bytes`.

**Node → pod network traffic** in **Time series** format with custom label names (verified; set
**Source field** = `node`, **Target field** = `pod`, unit `Bps`, thresholds, **Value drives** =
`Colour`):

```promql
sum by (node, pod) (rate(container_network_receive_bytes_total{namespace="$namespace"}[5m]))
```

**Pod status node frame** (verified; adds `Running` / `Pending` / `Failed` as node status):

```promql
sum by (id, status) (
  label_replace(label_replace(
    kube_pod_status_phase{namespace=~"$namespace"} == 1,
    "id", "$1", "pod", "(.*)"), "status", "$1", "phase", "(.*)"))
```

Set **Node value field** to a name that does not exist (for example `none`) so the constant `1` is not
shown as a node value.

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
| Animation → Animation | Enables the particle animation. Automatically static when the tab is hidden. |
| Animation → Speed | Animation speed multiplier (shown when animation is on). |
| Animation → Reduced motion | `Follow system setting` (default) pauses the particles when the operating system asks for reduced motion and shows a small pause icon in the panel corner; `Always animate` ignores that setting; `Never animate` keeps the panel static. |
| Layout → Edit layout | Design mode toggle: toolbar, dragging, drawing, pan and zoom inside the panel. Off by default. |
| Layout → Grid size | Spacing of the background grid and of snapping, in canvas pixels. |
| Layout → Snap to grid | Snap node positions while dragging. |
| Layout → Fit to panel | When not editing, scale and centre the diagram to the panel size instead of using the saved viewport. |
| Diagram → Inspector | Properties of the selected node or edge (see above). Manual source only. |
| Diagram → Import / export JSON | Full diagram JSON with validation, example loader and clear. Manual source only. |
| Data → Diagram source | `Manual` (default), `Data` (built from the query results) or `Data + manual overrides` (built from data, dragged / tweaked nodes persist). |
| Data → Demo data | Built-in generated service graph (12 nodes, edge rows `source` / `target` / `value`). *When no data* (default): used in the data modes when the query yields no edges, and in Manual mode while the diagram is empty (and not being designed). *Always*: ignores the query in the data modes. *Off*: never; the empty state says "Needs edge rows with source, target and value, or draw a diagram". A "Demo data" pill marks generated data. |
| Data → Layout direction | `Left to right`, `Top to bottom` (layered) or `Radial`. |
| Data → Layer gap / Node gap | Spacing between layers and between nodes in a layer, in canvas pixels. |
| Data → Value drives | What the edge value controls: particle speed, colour (thresholds / colour scheme of the value field), width, or nothing. |
| Data → Secondary value drives | Same for the secondary value field (shown when one is configured). |
| Data → Show edge values | Draw the formatted value on every edge (a label field wins). |
| Data → Group boxes | Faint rounded container with the group name around each group. |
| Data → Top N edges by value | Keep only the busiest N edges (0 = all; hard cap 400 nodes / 1500 edges). |
| Data → Edge and node fields | Source, Target, Value, Secondary value, Label, Source group, Target group field / label names for edge frames; Node id, label, group, status, value field names for node frames. Empty value fields mean "first numeric field"; a name that matches nothing means "no value". |
| Data → Node overrides | Inspector for data nodes (overrides mode): label, shape, icon, status, colour, position; clear one node or reset all. |
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
- Data-driven: prefer **Instant + Table** queries; use `label_replace` to rename labels into
  `source` / `target` so one panel can stack several hops (host → pod → claim → volume). Use
  **Top N** and a namespace filter before pointing the panel at a whole cluster.
- Data-driven: with the "Join by labels" / "Merge" transformations you can put a second numeric
  column next to the value column and use it as the secondary value (for example error ratio →
  colour, request rate → speed).
