# Shared demo data

Deterministic, dependency-free generators that return `DataFrame`s (built with `createDataFrame` from
`@grafana/data`). They exist so every panel can offer a built-in **Demo data** option that looks good with
no query at all (fresh Grafana, Kubernetes without provisioning, screenshots, tests), and so the Gallery's
"Use with your data" examples match what the panels actually render.

| Generator                                           | Shape                                                                              | Meant for                                                       |
| --------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `signedPowerSeries(now, durationMs, stepMs, opts?)` | one frame: `time` + `power` (kW, -20..20, crosses zero)                            | Power Gauge (signed fill), Flow Designer node values            |
| `percentLoadSeries(now, durationMs, stepMs, opts?)` | one frame: `time` + `load` (0..100 %)                                              | Power Gauge, Flow River, Status Bars time-series mode           |
| `multiSeries(n, now, durationMs, stepMs, opts?)`    | `n` frames, shared timestamps, random walks in `min..max`                          | Flow River channels, Status Bars rows, Flow Designer bindings   |
| `deviceTable(n, opts?)`                             | one table frame: `name, progress, status, style, version, channel, updated, trend` | Status Bars table mode (same columns as the demo dashboard CSV) |
| `edgeTable(opts?)`                                  | one table frame: `source, target, value` for a 12-node service graph               | Flow Designer edge input / future auto-layout                   |

All generators take a `seed` (default differs per generator) and return the same values for the same
arguments, so tests can snapshot them and animations replay identically.

## Intended "Demo data" option

Each panel will add an option (`Data > Source: Query | Demo`) that, when set to _Demo_, ignores
`data.series` and feeds the matching generator (with `now = Date.now()` rounded to the step and the
panel's time range as `durationMs`) into the normal data-shaping path. The panels own that wiring; this
folder only provides the frames. Keep generators pure: no `Date.now()`, no `Math.random()`, no DOM.
