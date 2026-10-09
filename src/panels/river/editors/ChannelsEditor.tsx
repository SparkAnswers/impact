import React, { useMemo, useState } from 'react';
import { css } from '@emotion/css';
import { type GrafanaTheme2, type SelectableValue, type StandardEditorProps } from '@grafana/data';
import {
  Button,
  ColorPickerInput,
  Combobox,
  type ComboboxOption,
  IconButton,
  InlineField,
  InlineSwitch,
  Input,
  RadioButtonGroup,
  useStyles2,
} from '@grafana/ui';
import { COLOR_PRESET_OPTIONS } from '../lib/colors';
import { getNumericFields } from '../lib/data';
import { PATH_PRESETS, presetWaypoints } from '../lib/path';
import {
  type Channel,
  type ChannelLabel,
  type ColorStop,
  type Direction,
  type LabelSide,
  type MultiSeriesMode,
  type ParticleColorMode,
  type PathPreset,
  type RiverOptions,
  type ValueSource,
  type Waypoint,
  createChannel,
} from '../types';

const getStyles = (theme: GrafanaTheme2) => ({
  card: css({
    border: `1px solid ${theme.colors.border.weak}`,
    borderRadius: theme.shape.radius.default,
    padding: theme.spacing(1),
    marginBottom: theme.spacing(1),
    background: theme.colors.background.secondary,
  }),
  head: css({ display: 'flex', alignItems: 'center', gap: theme.spacing(0.5), marginBottom: theme.spacing(0.5) }),
  grow: css({ flex: 1 }),
  section: css({
    fontSize: theme.typography.bodySmall.fontSize,
    fontWeight: theme.typography.fontWeightMedium,
    color: theme.colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    margin: theme.spacing(1, 0, 0.5),
  }),
  row: css({ display: 'flex', gap: theme.spacing(0.5), alignItems: 'center', marginBottom: theme.spacing(0.5) }),
  mono: css({ fontFamily: theme.typography.fontFamilyMonospace, fontSize: theme.typography.bodySmall.fontSize }),
});

const LABEL_WIDTH = 12;

const num = (v: string, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

interface NumProps {
  label: string;
  tooltip?: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  width?: number;
}

const NumField: React.FC<NumProps> = ({ label, tooltip, value, onChange, min, max, step, width = 10 }) => (
  <InlineField label={label} labelWidth={LABEL_WIDTH} tooltip={tooltip}>
    <Input
      type="number"
      width={width}
      value={Number.isFinite(value) ? value : ''}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(num(e.currentTarget.value, value))}
    />
  </InlineField>
);

const MODE_OPTIONS: Array<SelectableValue<ValueSource['mode']>> = [
  { value: 'series', label: 'Series' },
  { value: 'field', label: 'Field' },
  { value: 'fixed', label: 'Fixed' },
];

interface SourceProps {
  label: string;
  value: ValueSource;
  onChange: (v: ValueSource) => void;
  seriesOptions: Array<ComboboxOption<string>>;
  fieldOptions: Array<ComboboxOption<string>>;
  allowSeries?: boolean;
}

const SourceEditor: React.FC<SourceProps> = ({ label, value, onChange, seriesOptions, fieldOptions }) => {
  const mode = value?.mode ?? 'series';
  return (
    <>
      <InlineField label={label} labelWidth={LABEL_WIDTH} tooltip="Series: a query refId / frame name (empty = auto-bind by channel order). Field: a field by display name. Fixed: a constant.">
        <RadioButtonGroup size="sm" options={MODE_OPTIONS} value={mode} onChange={(m) => onChange({ ...value, mode: m })} />
      </InlineField>
      {mode === 'series' ? (
        <InlineField label="Series" labelWidth={LABEL_WIDTH} tooltip="Query refId, frame name or 0-based index. Leave empty to auto-bind.">
          <Combobox
            width={22}
            options={seriesOptions}
            value={value.series ?? ''}
            createCustomValue
            isClearable
            placeholder="auto"
            onChange={(o) => onChange({ ...value, series: o?.value ?? '' })}
          />
        </InlineField>
      ) : null}
      {mode === 'field' ? (
        <InlineField label="Field" labelWidth={LABEL_WIDTH} tooltip="Field display name, searched across all frames.">
          <Combobox
            width={22}
            options={fieldOptions}
            value={value.field ?? ''}
            createCustomValue
            isClearable
            placeholder="auto"
            onChange={(o) => onChange({ ...value, field: o?.value ?? '' })}
          />
        </InlineField>
      ) : null}
      {mode === 'fixed' ? (
        <NumField label="Value" value={value.fixed ?? 0} onChange={(fixed) => onChange({ ...value, fixed })} />
      ) : null}
    </>
  );
};

const PRESET_OPTIONS: Array<ComboboxOption<PathPreset>> = (Object.keys(PATH_PRESETS) as PathPreset[]).map((k) => ({
  value: k,
  label: { horizontal: 'Horizontal', scurve: 'S-curve', diagonal: 'Diagonal', u: 'U shape' }[k],
}));

const WaypointsEditor: React.FC<{ path: Waypoint[]; onChange: (p: Waypoint[]) => void }> = ({ path, onChange }) => {
  const styles = useStyles2(getStyles);
  const set = (i: number, p: Partial<Waypoint>) => onChange(path.map((w, j) => (j === i ? { ...w, ...p } : w)));
  return (
    <>
      {path.map((p, i) => (
        <div className={styles.row} key={i}>
          <span className={styles.mono}>{i + 1}</span>
          <Input
            type="number"
            width={9}
            step={0.01}
            min={0}
            max={1}
            value={p.x}
            aria-label={`Waypoint ${i + 1} x`}
            onChange={(e) => set(i, { x: num(e.currentTarget.value, p.x) })}
          />
          <Input
            type="number"
            width={9}
            step={0.01}
            min={0}
            max={1}
            value={p.y}
            aria-label={`Waypoint ${i + 1} y`}
            onChange={(e) => set(i, { y: num(e.currentTarget.value, p.y) })}
          />
          <IconButton
            name="trash-alt"
            tooltip="Remove waypoint"
            disabled={path.length <= 2}
            onClick={() => onChange(path.filter((_, j) => j !== i))}
          />
        </div>
      ))}
      <Button
        size="sm"
        variant="secondary"
        icon="plus"
        onClick={() => {
          const last = path[path.length - 1] ?? { x: 0.5, y: 0.5 };
          onChange([...path, { x: Math.min(1, last.x + 0.1), y: last.y }]);
        }}
      >
        Add waypoint
      </Button>
    </>
  );
};

const StopsEditor: React.FC<{ stops: ColorStop[]; onChange: (s: ColorStop[]) => void }> = ({ stops, onChange }) => {
  const styles = useStyles2(getStyles);
  const set = (i: number, p: Partial<ColorStop>) => onChange(stops.map((s, j) => (j === i ? { ...s, ...p } : s)));
  return (
    <>
      {stops.map((s, i) => (
        <div className={styles.row} key={i}>
          <Input
            type="number"
            width={10}
            value={s.value}
            aria-label={`Stop ${i + 1} value`}
            onChange={(e) => set(i, { value: num(e.currentTarget.value, s.value) })}
          />
          <ColorPickerInput value={s.color} returnColorAs="hex" onChange={(color) => set(i, { color })} />
          <IconButton
            name="trash-alt"
            tooltip="Remove stop"
            disabled={stops.length <= 2}
            onClick={() => onChange(stops.filter((_, j) => j !== i))}
          />
        </div>
      ))}
      <Button
        size="sm"
        variant="secondary"
        icon="plus"
        onClick={() => {
          const last = stops[stops.length - 1];
          onChange([...stops, { value: (last?.value ?? 0) + 10, color: '#ffffff' }]);
        }}
      >
        Add stop
      </Button>
    </>
  );
};

const LabelsEditor: React.FC<{ labels: ChannelLabel[]; onChange: (l: ChannelLabel[]) => void }> = ({ labels, onChange }) => {
  const styles = useStyles2(getStyles);
  const set = (i: number, p: Partial<ChannelLabel>) => onChange(labels.map((l, j) => (j === i ? { ...l, ...p } : l)));
  return (
    <>
      {labels.map((l, i) => (
        <div className={styles.row} key={i}>
          <Input width={14} value={l.text} placeholder="Text" aria-label={`Label ${i + 1} text`} onChange={(e) => set(i, { text: e.currentTarget.value })} />
          <Input
            type="number"
            width={8}
            step={0.01}
            min={0}
            max={1}
            value={l.at}
            aria-label={`Label ${i + 1} position`}
            onChange={(e) => set(i, { at: num(e.currentTarget.value, l.at) })}
          />
          <RadioButtonGroup
            size="sm"
            options={[
              { value: 'left', label: 'L' },
              { value: 'center', label: 'C' },
              { value: 'right', label: 'R' },
            ]}
            value={l.side}
            onChange={(side: LabelSide) => set(i, { side })}
          />
          <IconButton name="trash-alt" tooltip="Remove label" onClick={() => onChange(labels.filter((_, j) => j !== i))} />
        </div>
      ))}
      <Button size="sm" variant="secondary" icon="plus" onClick={() => onChange([...labels, { text: 'Label', at: 0.5, side: 'left' }])}>
        Add label
      </Button>
    </>
  );
};

interface CardProps {
  channel: Channel;
  index: number;
  total: number;
  seriesOptions: Array<ComboboxOption<string>>;
  fieldOptions: Array<ComboboxOption<string>>;
  onChange: (c: Channel) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}

const ChannelCard: React.FC<CardProps> = ({ channel, index, total, seriesOptions, fieldOptions, onChange, onRemove, onMove }) => {
  const styles = useStyles2(getStyles);
  const [open, setOpen] = useState(index === 0);
  const patch = (p: Partial<Channel>) => onChange({ ...channel, ...p });
  const particles = channel.particles;
  return (
    <div className={styles.card} data-testid={`river-channel-${index}`}>
      <div className={styles.head}>
        <IconButton name={open ? 'angle-down' : 'angle-right'} tooltip={open ? 'Collapse' : 'Expand'} onClick={() => setOpen(!open)} />
        <Input className={styles.grow} value={channel.name} aria-label="Channel name" onChange={(e) => patch({ name: e.currentTarget.value })} />
        <IconButton name="arrow-up" tooltip="Move up" disabled={index === 0} onClick={() => onMove(-1)} />
        <IconButton name="arrow-down" tooltip="Move down" disabled={index === total - 1} onClick={() => onMove(1)} />
        <IconButton name="trash-alt" tooltip="Remove channel" variant="destructive" onClick={onRemove} />
      </div>
      {open ? (
        <>
          <div className={styles.section}>Path</div>
          <InlineField label="Preset" labelWidth={LABEL_WIDTH} tooltip="Replace the waypoints with a preset shape.">
            <Combobox
              width={22}
              options={PRESET_OPTIONS}
              value={null}
              placeholder="Apply preset..."
              onChange={(o) => {
                if (o) {
                  patch({ path: presetWaypoints(o.value) });
                }
              }}
            />
          </InlineField>
          <InlineField label="Edit on canvas" labelWidth={LABEL_WIDTH} tooltip="Show draggable waypoint handles on the panel.">
            <InlineSwitch value={Boolean(channel.editPath)} onChange={(e) => patch({ editPath: e.currentTarget.checked })} />
          </InlineField>
          <WaypointsEditor path={channel.path} onChange={(path) => patch({ path })} />

          <div className={styles.section}>Data</div>
          <SourceEditor label="Speed" value={channel.speedSource} onChange={(speedSource) => patch({ speedSource })} seriesOptions={seriesOptions} fieldOptions={fieldOptions} />
          <InlineField label="Multi-series" labelWidth={LABEL_WIDTH} tooltip="With a single channel and several series: ignore extras, or draw each series as a parallel lane.">
            <RadioButtonGroup
              size="sm"
              options={[
                { value: 'ignore', label: 'Ignore' },
                { value: 'lanes', label: 'Parallel lanes' },
              ]}
              value={channel.multiSeries}
              onChange={(multiSeries: MultiSeriesMode) => patch({ multiSeries })}
            />
          </InlineField>
          <InlineField label="Direction" labelWidth={LABEL_WIDTH} tooltip="By sign: negative values flow backwards.">
            <RadioButtonGroup
              size="sm"
              options={[
                { value: 'forward', label: 'Forward' },
                { value: 'reverse', label: 'Reverse' },
                { value: 'bySign', label: 'By sign' },
              ]}
              value={channel.direction}
              onChange={(direction: Direction) => patch({ direction })}
            />
          </InlineField>

          <div className={styles.section}>Width</div>
          <NumField label="Width (px)" tooltip="Base (maximum) channel width in pixels." value={channel.widthPx} min={2} max={600} onChange={(widthPx) => patch({ widthPx })} />
          <SourceEditor label="Width from" value={channel.widthSource} onChange={(widthSource) => patch({ widthSource })} seriesOptions={seriesOptions} fieldOptions={fieldOptions} />
          <NumField
            label="Smoothing"
            tooltip="Gaussian window (samples) applied to speed and width before drawing. 0 = auto (5% of the samples, min 3)."
            value={channel.smoothing}
            min={0}
            max={500}
            onChange={(smoothing) => patch({ smoothing })}
          />
          <NumField label="Opacity" value={channel.opacity} min={0} max={1} step={0.05} onChange={(opacity) => patch({ opacity })} />

          <div className={styles.section}>Colour</div>
          <InlineField label="Scale" labelWidth={LABEL_WIDTH} tooltip="Colour scale. 'Thresholds' uses the standard field thresholds.">
            <Combobox width={22} options={COLOR_PRESET_OPTIONS} value={channel.colorScale} onChange={(o) => patch({ colorScale: o.value })} />
          </InlineField>
          {channel.colorScale === 'custom' ? <StopsEditor stops={channel.customStops} onChange={(customStops) => patch({ customStops })} /> : null}
          <InlineField label="Domain" labelWidth={LABEL_WIDTH} tooltip="Auto uses the field min/max (or data range); fixed uses the values below.">
            <RadioButtonGroup
              size="sm"
              options={[
                { value: 'auto', label: 'Auto' },
                { value: 'fixed', label: 'Fixed' },
              ]}
              value={channel.scaleDomain.mode}
              onChange={(mode: 'auto' | 'fixed') => patch({ scaleDomain: { ...channel.scaleDomain, mode } })}
            />
          </InlineField>
          {channel.scaleDomain.mode === 'fixed' ? (
            <div className={styles.row}>
              <NumField label="Min" value={channel.scaleDomain.min ?? 0} onChange={(min) => patch({ scaleDomain: { ...channel.scaleDomain, min } })} />
              <NumField label="Max" value={channel.scaleDomain.max ?? 100} onChange={(max) => patch({ scaleDomain: { ...channel.scaleDomain, max } })} />
            </div>
          ) : null}

          <div className={styles.section}>Particles</div>
          <NumField label="Count" value={particles.count} min={0} max={20000} onChange={(count) => patch({ particles: { ...particles, count } })} />
          <NumField label="Speed" value={particles.speed} min={0} max={10} step={0.1} onChange={(speed) => patch({ particles: { ...particles, speed } })} />
          <NumField label="Trail" tooltip="Trail persistence per frame for this channel (0.5 short, 0.95 long). Each distinct trail value gets its own particle layer, so channels never share a fade." value={particles.trail} min={0} max={0.99} step={0.01} onChange={(trail) => patch({ particles: { ...particles, trail } })} />
          <NumField label="Streak width" value={particles.width} min={0.2} max={6} step={0.1} onChange={(width) => patch({ particles: { ...particles, width } })} />
          <InlineField label="Streak colour" labelWidth={LABEL_WIDTH}>
            <RadioButtonGroup
              size="sm"
              options={[
                { value: 'white', label: 'White' },
                { value: 'byValue', label: 'By value' },
                { value: 'fixed', label: 'Fixed' },
              ]}
              value={particles.color}
              onChange={(color: ParticleColorMode) => patch({ particles: { ...particles, color } })}
            />
          </InlineField>
          {particles.color === 'fixed' ? (
            <InlineField label="Colour" labelWidth={LABEL_WIDTH}>
              <ColorPickerInput value={particles.fixedColor ?? '#ffffff'} returnColorAs="hex" onChange={(fixedColor) => patch({ particles: { ...particles, fixedColor } })} />
            </InlineField>
          ) : null}

          <div className={styles.section}>Labels</div>
          <LabelsEditor labels={channel.labels} onChange={(labels) => patch({ labels })} />
        </>
      ) : null}
    </div>
  );
};

export const ChannelsEditor: React.FC<StandardEditorProps<Channel[], unknown, RiverOptions>> = ({ value, onChange, context }) => {
  const channels = useMemo(() => (value ?? []).map((c) => createChannel(c)), [value]);
  const frames = useMemo(() => context.data ?? [], [context.data]);
  const seriesOptions = useMemo<Array<ComboboxOption<string>>>(
    () =>
      frames.map((f, i) => ({
        value: f.refId ?? f.name ?? String(i),
        label: f.refId ?? f.name ?? `Frame ${i}`,
        description: f.name && f.refId ? f.name : undefined,
      })),
    [frames]
  );
  const fieldOptions = useMemo<Array<ComboboxOption<string>>>(
    () => getNumericFields(frames).map((f) => ({ value: f.displayName, label: f.displayName })),
    [frames]
  );

  const update = (list: Channel[]) => onChange(list);

  return (
    <div data-testid="river-channels-editor">
      {channels.map((c, i) => (
        <ChannelCard
          key={c.id}
          channel={c}
          index={i}
          total={channels.length}
          seriesOptions={seriesOptions}
          fieldOptions={fieldOptions}
          onChange={(nc) => update(channels.map((x, j) => (j === i ? nc : x)))}
          onRemove={() => update(channels.filter((_, j) => j !== i))}
          onMove={(dir) => {
            const j = i + dir;
            if (j < 0 || j >= channels.length) {
              return;
            }
            const next = channels.slice();
            [next[i], next[j]] = [next[j], next[i]];
            update(next);
          }}
        />
      ))}
      <Button
        size="sm"
        variant="primary"
        icon="plus"
        onClick={() => {
          const n = channels.length;
          const presets: PathPreset[] = ['scurve', 'horizontal', 'diagonal', 'u'];
          update([
            ...channels,
            createChannel({
              name: `Channel ${n + 1}`,
              path: n === 0 ? presetWaypoints('scurve') : presetWaypoints(presets[n % presets.length]),
            }),
          ]);
        }}
      >
        Add channel
      </Button>
    </div>
  );
};
