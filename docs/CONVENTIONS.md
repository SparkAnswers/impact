# Impact panel conventions

Impact is ONE app plugin (`sparkanswers-impact-app`) that bundles four nested panel plugins. Each panel lives
in `src/panels/<id>/` and is bundled automatically because it has its own `plugin.json` + `module.ts`.

## Layout per panel (`src/panels/<id>/`)

- `plugin.json`       nested panel metadata (already created; keep id/name, update keywords/description as needed)
- `module.ts`         `new PanelPlugin<Options>(Panel).useFieldConfig(...).setPanelOptions(...)`
- `types.ts`          `Options` interface + defaults (`DEFAULT_OPTIONS`) + migration helpers if needed
- `<Id>Panel.tsx`     the React panel (`PanelProps<Options>`)
- `components/`       sub-components
- `lib/`              pure, framework-free logic (geometry, colour scales, data shaping). Unit test this.
- `editors/`          custom option editors (`StandardEditorProps`)
- `presets.ts`        Quick start catalog (`PresetCatalog` from `src/shared/presets`): complete option bundles, applied by the panel
- `__tests__/`        jest tests (`*.test.ts(x)`), use `@testing-library/react` for components
- `img/logo.svg`      icon for the panel picker (already present, replace with a panel-specific SVG)

## Rules

1. **No new runtime dependencies.** Use `@grafana/ui`, `@grafana/data`, `@grafana/runtime`, `@emotion/css`,
   React 19, rxjs only. Hand-roll SVG/canvas. (Security + bundle size + unsigned-plugin review.)
2. **No brand or company names anywhere** (code, UI strings, option descriptions, demo dashboards, docs).
   Describe the style instead ("ring gauge", "streamline flow", "indeterminate sweep").
3. **Use Grafana standards**: `useFieldConfig()` for unit, decimals, min/max, thresholds, color, display name,
   overrides; `getFieldDisplayValues`/`getDisplayProcessor` for formatting; `useTheme2()` for colours;
   `theme.visualization.getColorByName` for named colours; `PanelDataErrorView` when there is no data;
   `replaceVariables` for free-text labels; respect `width`/`height` props; `timeRange`/`timeZone` where relevant.
4. **Option editors**: builder API (`addTextInput`, `addSelect`, `addSliderInput`, `addBooleanSwitch`,
   `addColorPicker`, `addFieldNamePicker`, `addCustomEditor`). Group with `category: ['Group name']`.
   Every option needs a `description`. Provide sensible defaults so the panel looks great with a TestData
   "Random Walk" query and no configuration.
5. **Animation**: requestAnimationFrame loops must stop on unmount and when `document.hidden`; respect
   `prefers-reduced-motion` (fall back to static render). Expose an "Animation" toggle + speed.
6. **Performance**: canvas for particle-heavy work; memoise data shaping with `useMemo` on `data.series`.
7. **Security**: never `dangerouslySetInnerHTML`; sanitise/escape user text; URLs only for images and only
   `http(s):`/`data:image` schemes; no `eval`, no remote scripts.
8. **Quality gate** (must pass before you report done): `npm run typecheck && npm run lint && npm run test:ci && npm run build`.
   Run only your own tests while iterating: `npx jest src/panels/<id>`.
9. **Demo dashboard**: `provisioning/dashboards/impact/<id>.json`, uid `impact-<id>`, title `Impact <Name> demo`,
   datasource uid `impact-testdata` (type `grafana-testdata-datasource`), schemaVersion 41, several panels
   showing variants. Use testdata scenarios (`random_walk`, `csv_content`, `csv_metric_values`, `predictable_pulse`)
   so it works offline.
10. **Docs**: `docs/<id>.md`: what it does, data expectations (which fields/series it reads), options table
    (Option | Description), and tips. No brand names.
11. Do not edit files outside `src/panels/<id>/`, `provisioning/dashboards/impact/<id>.json`, `docs/<id>.md`,
    and `src/shared/` (shared only for genuinely reusable helpers; coordinate by keeping additions additive).
