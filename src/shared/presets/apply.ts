import type { DeepPartial, Preset, PresetCatalog, QuickStartOptions, QuickStartState } from './types';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function clone<T>(v: T): T {
  if (Array.isArray(v)) {
    return v.map(clone) as T;
  }
  if (isPlainObject(v)) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v)) {
      out[k] = clone(v[k]);
    }
    return out as T;
  }
  return v;
}

/** Recursive merge: plain objects merge key by key, everything else (arrays, primitives) is replaced. */
export function deepMerge<T>(base: T, patch: DeepPartial<T> | undefined): T {
  if (patch === undefined) {
    return clone(base);
  }
  if (isPlainObject(base) && isPlainObject(patch)) {
    const out: Record<string, unknown> = clone(base);
    for (const k of Object.keys(patch)) {
      const p = patch[k];
      if (p === undefined) {
        continue;
      }
      out[k] = k in out ? deepMerge(out[k], p as never) : clone(p);
    }
    return out as T;
  }
  return clone(patch) as T;
}

export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const key of path.split('.')) {
    if (!isPlainObject(cur) || !(key in cur)) {
      return undefined;
    }
    cur = cur[key];
  }
  return cur;
}

export function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (!isPlainObject(cur[k])) {
      cur[k] = {};
    }
    cur = cur[k] as Record<string, unknown>;
  }
  cur[keys[keys.length - 1]] = value;
}

export function findPreset<O extends QuickStartOptions>(catalog: PresetCatalog<O>, id: string | undefined): Preset<O> | undefined {
  return catalog.presets.find((p) => p.id === id);
}

/**
 * Builds the options that result from applying `preset`: defaults + preset values, with the catalog's `keep`
 * paths carried over from `current` unless the preset sets them. `quickStart` records the applied request.
 */
export function applyPreset<O extends QuickStartOptions>(
  catalog: PresetCatalog<O>,
  preset: Preset<O>,
  current: O,
  request: QuickStartState
): O {
  const next = deepMerge(catalog.defaults, preset.options) as Record<string, unknown>;
  for (const path of catalog.keep) {
    const fromCurrent = getPath(current, path);
    if (fromCurrent !== undefined && getPath(preset.options, path) === undefined) {
      setPath(next, path, clone(fromCurrent));
    }
  }
  next.quickStart = { preset: preset.id, token: request.token, applied: request.token };
  return next as O;
}

/** True while the editor has written a request the panel has not applied yet. */
export function isPending(state: QuickStartState | undefined): state is QuickStartState {
  return !!state && state.applied !== state.token;
}
