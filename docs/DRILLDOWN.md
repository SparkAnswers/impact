# Drill-down and pruning (design proposal)

Status: proposal, not built. Mock-up: `mockups/drilldown/index.html`.

Big data-driven graphs (100+ nodes) are only useful if the reader can cut them down to the part that matters.
This note proposes three mechanisms that stay data-shape agnostic (anything that produces source, target, value
rows keeps working) and build on things Grafana already has. They apply to the Flow Designer and, where it makes
sense, to the Flow River network map, since both share `src/shared/graph`.

## 1. Node click sets a dashboard variable (most portable)

The existing *Links* group gets a second action next to "open a URL":

| Option | Meaning |
| --- | --- |
| Links > Node click | `Open link` (today), `Set variable`, `Focus` (section 2), `Off` |
| Links > Variable | name of a dashboard variable, for example `service` |
| Links > Value | template with the node tokens already supported by links: `${node.id}` (default), `${node.label}`, `${node.group}` |

A click calls `locationService.partial({ 'var-<name>': value })`. Every query on the dashboard that references
`$service` re-runs with the subtree, so the Status Bars, gauges and rivers on the page follow the same selection.
The panel shows a small chip `service = local-path  x` in its corner while the variable is set; the `x` clears it
(sets the variable back to `All` / empty). Nothing is stored in the panel; it composes with any data source and with
Grafana's own URL sharing.

Why first: it is the only mechanism that also narrows the *query*, which matters above the 400 node cap, and it works
for people who drop the panel on data we never imagined.

## 2. Focus mode (zero configuration, client side)

Double-click (or the configured trigger) on a node shows only that node plus its neighbourhood:

| Option | Meaning |
| --- | --- |
| Interaction > Focus hops | 1 to 3 hops (default 1) |
| Interaction > Focus direction | `Both`, `Downstream`, `Upstream` |

A breadcrumb strip appears at the top of the canvas: `All  >  local-path  >  pvc-c016af1e`. Clicking a crumb goes
back up, `Esc` clears. Focus is kept in panel instance state (not saved with the dashboard) and the layout re-runs
on the visible subgraph, so the focused view is laid out at full size rather than zoomed. The "Data" notice shows
`12 of 130 nodes` while focused. Edge particles keep their bindings; group boxes only draw groups with visible
members.

## 3. Prune rules (saved with the panel)

A right-click (or long press) on a node or group label opens a small menu:

- Focus here
- Hide node / Hide group `ingester`
- Set `$service` = `local-path` (when section 1 is configured)
- Open link (when a URL is configured)

Hidden items go into `data.hidden: { nodes: string[]; groups: string[] }`, stored with the panel options, with a
`hidden: 12  show` chip to restore them. Alongside, rule-based pruning under **Data > Prune**:

| Option | Meaning |
| --- | --- |
| Hide leaves | drop nodes with a single edge (the long tail of PVCs, pods, child processes) |
| Min value | drop edges below a value (uses the primary value field's unit) |
| Max depth | keep N hops from the roots (sources without incoming edges) or from the radial hub |
| Collapse groups | one node per group with summed edges, so a 90-pod namespace becomes one box; double-click expands it (focus) |

Collapse groups is the most powerful of these for "machine > service > process" style data: the machine level is a
collapsed view, focus opens one machine.

## What is shared

All three operate on the `Graph` produced by `extractGraph` before layout, as pure functions in `src/shared/graph`
(`filterGraph(graph, { hidden, focus, rules })`, `collapseGroups(graph)`), unit-tested with the same fixtures as
layout. The Flow Designer owns the UI (chips, breadcrumbs, menu); the River network map can reuse the pure functions
and the variable action.

## Order of work

1. Variable action + chip (small, high value, no new UI concepts).
2. Prune rules + hidden list + context menu (pure functions first, then the menu).
3. Focus mode with breadcrumbs (builds on the same filter function).
