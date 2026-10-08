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

| `rollingSignedPowerSeries(now, durationMs, stepMs, opts?)` | like `signedPowerSeries`, but values are a function of absolute time (`signedPowerAt`) and timestamps snap to the step grid, so regenerating later just slides the window | Power Gauge demo data (stream / live motion) |
| `rollingMultiSeries(n, now, durationMs, stepMs, opts?)` | like `multiSeries`, time-anchored (`smoothNoise` + slow cycles) | Flow River demo data |
| `deviceTableWithStyles(n, opts?)` | `deviceTable` with the `style` column cycling through every bar style | Status Bars demo data |

## The "Demo data" option (`useDemoData.ts`, `DemoBadge.tsx`)

The gauge, river and bars panels expose `Data > Demo data: Off | When no data | Always` (default
_When no data_). `useDemoFrames(data, mode, generator, deps)` returns `{ frames, isDemo }`: the query
result when it is usable (or the mode is _Off_), otherwise the generator's frames pushed through
`applyFieldOverrides` with the panel's field config, `replaceVariables`, theme and time zone, so units,
decimals, thresholds, mappings and overrides behave exactly as for real data. The window ends at the
panel time range end (falling back to `Date.now()`), is at least 15 minutes long and has a 1 s cadence
for short ranges; it is regenerated on every `PanelData` / time range change. `DemoBadge` is the small
"Demo data" pill (hidden under 160 px). Keep generators pure: no `Date.now()`, no `Math.random()`, no DOM.
