import type { FieldConfig } from '@grafana/data';
import type { IconName } from '@grafana/ui';

/**
 * Quick start presets: a named bundle of panel options (and optionally field defaults) that a user applies
 * from the panel editor with one click to get a complete, good-looking configuration to start from.
 *
 * A preset is applied on top of the panel's default options, not on top of the current ones, so the result
 * is the same wherever you start from. The catalog's `keep` paths (query-specific choices such as field
 * names, a drawn diagram, dragged positions) survive unless the preset sets them itself.
 */

export type DeepPartial<T> = T extends Array<infer U>
  ? Array<DeepPartial<U>>
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

/** Stored under `options.quickStart`: the editor writes a request, the panel marks it applied. */
export interface QuickStartState {
  /** Preset id (last requested / applied). */
  preset: string;
  /** Request token written by the editor on every click. */
  token: number;
  /** Token of the last request the panel applied; a request is pending while it differs from `token`. */
  applied?: number;
}

export interface QuickStartOptions {
  quickStart?: QuickStartState;
}

export interface Preset<O> {
  id: string;
  label: string;
  description: string;
  icon?: IconName;
  /** Option values, merged over the panel defaults. Arrays replace, objects merge. */
  options: DeepPartial<O>;
  /** Standard field defaults (unit, min, max, decimals, thresholds, color...) merged into `fieldConfig.defaults`. */
  fieldConfig?: Partial<FieldConfig>;
}

export interface PresetCatalog<O extends QuickStartOptions> {
  presets: Array<Preset<O>>;
  defaults: O;
  /** Dot paths copied from the current options when the preset does not set them. */
  keep: string[];
}
