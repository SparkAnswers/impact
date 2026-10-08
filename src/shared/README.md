Shared helpers used by more than one Impact panel. Keep this folder free of panel-specific code.

- `presets/`: Quick start presets. `createQuickStartEditor(catalog)` renders the preset grid as a custom option editor; `useQuickStart(catalog, props)` in the panel applies the pending request through `onOptionsChange` / `onFieldConfigChange`; `applyPreset` is the pure merge (defaults + preset, `keep` paths carried over).
