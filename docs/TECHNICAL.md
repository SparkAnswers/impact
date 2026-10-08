# Impact technical notes

## Packaging

Impact is a single Grafana **app plugin** (`sparkanswers-impact-app`) that bundles four **nested panel plugins**.
Grafana discovers nested plugins from `dist/panels/<id>/plugin.json`; the webpack config from
`@grafana/create-plugin` builds one entry per `module.ts` next to a `plugin.json`. `webpack.config.ts` at the
repo root extends it to copy each panel's `img/` folder.

Because the bundle is unsigned, **every plugin id has to be allow-listed**, not just the app:

```
sparkanswers-impact-app,sparkanswers-impact-flow-panel,sparkanswers-impact-gauge-panel,sparkanswers-impact-river-panel,sparkanswers-impact-bars-panel
```

Nested panels are enabled together with the app (Administration -> Plugins -> Impact -> Enable, or the
`provisioning/plugins/apps.yaml` file in this repo).

## Repository layout

```
src/
  module.tsx            app entry (Gallery page)
  plugin.json           app metadata, lists the nested panels under "includes"
  panels/<id>/          one nested panel plugin each: plugin.json, module.ts, <Id>Panel.tsx, lib/, editors/, __tests__/
  shared/               helpers reused by more than one panel
provisioning/           datasource (TestData), app enablement, demo dashboards
docs/                   per-panel option reference, CONVENTIONS.md for contributors
scripts/                package.sh (zip), screenshots.mjs (README images), validator.yaml
mockups/                the approved static HTML mockups each panel was built from
```

## Build pipeline

| Target | What runs |
| --- | --- |
| `make build` | `npm run build` in a `node:22-alpine` container -> `./dist` |
| `make check` | `tsc --noEmit`, `eslint`, `jest` |
| `make up` | builds, then starts `grafana/grafana:13.0.10` with `./dist` and `./provisioning` mounted |
| `make dev` | webpack watch with livereload on port 35729 |
| `make package` | `scripts/package.sh` -> `sparkanswers-impact-app-<version>.zip` |
| `make validate` | `grafana/plugin-validator` against the zip |
| `make image` | multi-stage `Dockerfile`, target `runtime`: Grafana with the plugin and dashboards baked in |

The `Dockerfile` `build` stage runs typecheck, lint and tests before bundling, so `make image` and
`make dist-export` are also a full CI run.

## Bundled demo dashboards and the Gallery installer

The Gallery page (`src/app/Gallery.tsx`) can install the demo dashboards on any Grafana, so users without the
`provisioning/` mount (Kubernetes, managed instances) still get working panels with data.

- `src/demo/dashboards/*.json` are generated copies of `provisioning/dashboards/impact/*.json` with the
  datasource uid `impact-testdata` rewritten to the placeholder `${DS_TESTDATA}` (type
  `grafana-testdata-datasource`) and no top-level `id`. Regenerate after editing a demo dashboard:

  ```bash
  node scripts/sync-demo-dashboards.mjs          # or --check to only report drift
  ```

  `src/shared/__tests__/demoDashboards.test.ts` fails when the two folders drift. The JSON is loaded lazily
  (`src/demo/index.ts`) so the Gallery chunk stays small; webpack also copies it to `dist/demo/dashboards/`.
- `src/app/installDemos.ts` holds the install logic as pure functions over a two-method `ApiClient`
  (`get`/`post`), unit-tested with an in-memory fake Grafana: find-or-create the TestData source
  (`GET/POST /api/datasources`), find-or-create the "Impact" folder (`GET/POST /api/folders`),
  `POST /api/dashboards/db` with `overwrite: true` and the placeholder bound to the real uid, and
  `GET /api/dashboards/uid/<uid>` (404 = not installed) for the card state. `401/403` responses are turned
  into an `InstallError` naming the permission (`datasources:create` needs Admin, `dashboards:create` and
  `folders:create` need Editor). The Gallery adapts `getBackendSrv().fetch` with `showErrorAlert: false`.
- `src/app/dataShapes.ts` is the "Data shape" guidance per panel (generic metric names only).
- `src/shared/demo/` has deterministic frame generators (seeded PRNG, `createDataFrame`) for a future
  per-panel "Demo data" option; see its README.

Note for the Docker stack: Grafana records a plugin's file list when it loads it, so a rebuild that adds new
chunk files (new lazy imports) returns 404 for them until the container restarts.

## Rendering approaches

| Panel | Technique |
| --- | --- |
| Flow Designer | SVG. Edges are paths with a blurred halo filter; particles are circles advanced along `getPointAtLength` in one `requestAnimationFrame` loop. Design mode uses pointer capture for dragging, a viewport transform for pan/zoom, and an immutable undo stack (50 steps). The diagram is stored in panel options as JSON. |
| Power Gauge | Canvas, devicePixelRatio aware. A single `drawGauge` pass paints threshold bands, the signed fill arc, ticks, the history chart, the marker and text. The marker value is eased with `requestAnimationFrame`. |
| Flow River | Canvas. The centreline is a Catmull-Rom spline resampled by arc length; each sample carries tangent, normal, width and value. The ribbon is painted once to an offscreen canvas; particles live in `Float32Array`s and are drawn as streaks onto a layer that is faded every frame with `destination-in`. |
| Status Bars | DOM. Bars are CSS (keyframes for sweep and stripes); sparklines are inline SVG; rows are windowed when there are more than 200. |

All animation loops stop on unmount, pause while `document.hidden`, and fall back to a static render when
`prefers-reduced-motion` is set or the panel's Animation option is off.

## Security notes

- No runtime dependencies beyond the Grafana SDK packages, React and rxjs.
- No `dangerouslySetInnerHTML`; all free text goes through React escaping. Labels support dashboard variables
  via `replaceVariables`.
- Image URLs (Flow River background) accept only `http(s):` and `data:image/` schemes.
- Diagram JSON import is validated and normalised before it is stored.

## Roadmap

- Catalog submission and plugin signing.
- Flow Designer: auto-layout, grouping, node images.
- Flow River: per-channel trail layers, map tile backgrounds.
- Status Bars: row click actions through data links on every column.
