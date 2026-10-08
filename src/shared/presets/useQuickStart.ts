import { useEffect } from 'react';
import type { FieldConfigSource } from '@grafana/data';
import { applyPreset, findPreset, isPending } from './apply';
import type { PresetCatalog, QuickStartOptions } from './types';

export interface QuickStartDeps<O extends QuickStartOptions> {
  options: O;
  fieldConfig: FieldConfigSource;
  /** Scenes panels accept a second `replace` argument; legacy panels ignore it. */
  onOptionsChange: (options: O, replace?: boolean) => void;
  onFieldConfigChange: (config: FieldConfigSource) => void;
}

/**
 * Applies a pending Quick start request (written by the editor under `options.quickStart`) by rewriting the
 * panel options, and the field defaults when the preset has some. Option editors can only change their own
 * option, so the panel, which owns `onOptionsChange`, does the work. Nothing happens unless a request is pending.
 */
export function useQuickStart<O extends QuickStartOptions>(
  catalog: PresetCatalog<O>,
  { options, fieldConfig, onOptionsChange, onFieldConfigChange }: QuickStartDeps<O>
): void {
  const state = options.quickStart;
  useEffect(() => {
    if (!isPending(state)) {
      return;
    }
    const preset = findPreset(catalog, state.preset);
    if (!preset) {
      onOptionsChange({ ...options, quickStart: { ...state, applied: state.token } });
      return;
    }
    if (preset.fieldConfig) {
      onFieldConfigChange({ ...fieldConfig, defaults: { ...fieldConfig.defaults, ...preset.fieldConfig } });
    }
    // Scenes deep-merges updates by default, which would keep stray keys the preset wants gone: replace instead.
    onOptionsChange(applyPreset(catalog, preset, options, state), true);
    // Only the request should trigger this; the other values are read when it fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.token, state?.applied]);
}
