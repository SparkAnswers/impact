import React, { useMemo, useState } from 'react';
import { css } from '@emotion/css';
import type { GrafanaTheme2, SelectableValue, StandardEditorProps } from '@grafana/data';
import { Button, ColorPicker, Combobox, InlineField, InlineSwitch, Input, RadioButtonGroup, Slider, Stack, Text, useStyles2, useTheme2, type ComboboxOption } from '@grafana/ui';
import { isSafeImageUrl } from '../../../shared/imageUrl';
import { fieldNames } from '../lib/data';
import { normalizeDiagram } from '../lib/validate';
import type { EdgeDash, EdgeStyle, FlowDiagram, FlowEdge, FlowInstanceState, FlowNode, FlowOptions, FlowSelection, NodeShape, NodeStatus, PortSide, BindTarget } from '../types';

type Props = StandardEditorProps<FlowDiagram, {}, FlowOptions, FlowInstanceState>;

export const ICONS = [
  'bolt',
  'plug',
  'power',
  'cloud',
  'cloud-upload',
  'cloud-download',
  'database',
  'home',
  'building',
  'rocket',
  'cog',
  'crosshair',
  'arrow-right',
  'arrow-to-right',
  'arrow-from-right',
  'exchange-alt',
  'sitemap',
  'layer-group',
  'fire',
  'heart-rate',
  'monitor',
  'laptop-cloud',
  'globe',
  'shield',
  'bell',
  'user',
  'users-alt',
  'wrench',
  'process',
  'signal',
  'bug',
  'check-circle',
  'exclamation-triangle',
  'circle',
].map((v) => ({ label: v, value: v }));

export const SHAPES: Array<SelectableValue<NodeShape>> = [
  { label: 'Card', value: 'card' },
  { label: 'Pill', value: 'pill' },
  { label: 'Hub', value: 'hub' },
  { label: 'Circle', value: 'circle' },
];
export const STATUSES: Array<SelectableValue<NodeStatus>> = [
  { label: 'None', value: 'none' },
  { label: 'OK', value: 'ok' },
  { label: 'Warn', value: 'warn' },
  { label: 'Error', value: 'error' },
];
const SIDES: Array<SelectableValue<PortSide>> = [
  { label: 'Auto', value: 'auto' },
  { label: 'Left', value: 'left' },
  { label: 'Right', value: 'right' },
  { label: 'Top', value: 'top' },
  { label: 'Bottom', value: 'bottom' },
];
const STYLES: Array<ComboboxOption<EdgeStyle>> = [
  { label: 'Bezier', value: 'bezier' },
  { label: 'Orthogonal', value: 'orthogonal' },
  { label: 'Straight', value: 'straight' },
  { label: 'Step', value: 'step' },
];
const DASHES: Array<SelectableValue<EdgeDash>> = [
  { label: 'Solid', value: 'solid' },
  { label: 'Dash', value: 'dash' },
  { label: 'Dot', value: 'dot' },
];
const TARGETS: Array<SelectableValue<BindTarget>> = [
  { label: 'Speed', value: 'speed' },
  { label: 'Color', value: 'color' },
  { label: 'Width', value: 'width' },
];

export const LW = 11;

export const getInspectorStyles = (theme: GrafanaTheme2) => ({
  section: css({
    fontSize: 11,
    fontWeight: theme.typography.fontWeightMedium,
    color: theme.colors.text.secondary,
    margin: theme.spacing(1, 0, 0.5),
  }),
  swatch: css({
    display: 'inline-block',
    width: 14,
    height: 14,
    borderRadius: 3,
    border: `1px solid ${theme.colors.border.medium}`,
    cursor: 'pointer',
    verticalAlign: 'middle',
    marginRight: theme.spacing(1),
  }),
  colorRow: css({
    display: 'flex',
    alignItems: 'center',
    height: 32,
    padding: theme.spacing(0, 1),
    border: `1px solid ${theme.colors.border.medium}`,
    borderRadius: theme.shape.radius.default,
    background: theme.components.input.background,
    width: '100%',
    fontSize: 12,
  }),
  hint: css({ fontSize: 11, color: theme.colors.text.secondary, marginTop: theme.spacing(0.5) }),
});

export const num = (v: string, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export const ColorField: React.FC<{ label: string; value: string; onChange: (c: string) => void; theme: GrafanaTheme2; placeholder?: string }> = ({
  label,
  value,
  onChange,
  theme,
  placeholder,
}) => {
  const s = useStyles2(getInspectorStyles);
  const shown = value || placeholder || 'blue';
  return (
    <InlineField label={label} labelWidth={LW} grow>
      <ColorPicker color={shown} onChange={onChange} enableNamedColors>
        {({ ref, showColorPicker, hideColorPicker }) => (
          <div className={s.colorRow} ref={ref} onClick={showColorPicker} onMouseLeave={hideColorPicker} role="button" tabIndex={0} aria-label={label}>
            <span className={s.swatch} style={{ background: theme.visualization.getColorByName(shown) }} />
            <span>{value || `Default (${placeholder ?? 'blue'})`}</span>
          </div>
        )}
      </ColorPicker>
    </InlineField>
  );
};

export const IMAGE_URL_HINT = 'Only http(s) and data:image URLs are shown; anything else is ignored.';

/** Image URL input shared by the node inspector and the data-node overrides editor. */
export const ImageUrlField: React.FC<{ value: string | undefined; onChange: (v: string | undefined) => void; placeholder?: string }> = ({
  value,
  onChange,
  placeholder,
}) => {
  const s = useStyles2(getInspectorStyles);
  const invalid = !!value && !isSafeImageUrl(value);
  return (
    <>
      <InlineField label="Image URL" labelWidth={LW} grow invalid={invalid} tooltip="Image drawn in place of the icon (http(s) or data:image URL). Falls back to the icon when it cannot be loaded; size under Appearance → Image size">
        <Input value={value ?? ''} placeholder={placeholder ?? 'https://… or data:image/svg+xml;base64,…'} aria-label="Image URL" onChange={(e) => onChange(e.currentTarget.value || undefined)} />
      </InlineField>
      {invalid && <div className={s.hint}>{IMAGE_URL_HINT}</div>}
    </>
  );
};

/**
 * Inspector for the selected node or edge. Selection comes from the panel (click in design mode) via
 * instance state, or from the drop-down at the top of the editor.
 */
export const InspectorEditor: React.FC<Props> = ({ value, onChange, context }) => {
  const s = useStyles2(getInspectorStyles);
  const diagram = useMemo(() => normalizeDiagram(value), [value]);
  const fromPanel = context.instanceState?.selection;
  const [local, setLocal] = useState<FlowSelection | undefined>(fromPanel);
  const [prevFromPanel, setPrevFromPanel] = useState(fromPanel);
  if (prevFromPanel !== fromPanel) {
    setPrevFromPanel(fromPanel);
    setLocal(fromPanel);
  }
  const sel = local;

  const t = useTheme2();

  const items: Array<ComboboxOption<string>> = useMemo(
    () => [
      ...diagram.nodes.map((n) => ({ label: `Node · ${n.label}`, value: `node:${n.id}`, description: n.id })),
      ...diagram.edges.map((e) => ({ label: `Edge · ${e.from} → ${e.to}`, value: `edge:${e.id}`, description: e.id })),
    ],
    [diagram]
  );
  const fields = useMemo(() => fieldNames(context.data ?? []).map((f) => ({ label: f, value: f })), [context.data]);
  const nodeOptions = useMemo(() => diagram.nodes.map((n) => ({ label: n.label, value: n.id })), [diagram.nodes]);

  const node = sel?.kind === 'node' ? diagram.nodes.find((n) => n.id === sel.id) : undefined;
  const edge = sel?.kind === 'edge' ? diagram.edges.find((e) => e.id === sel.id) : undefined;

  const patchNode = (patch: Partial<FlowNode>) =>
    node && onChange({ ...diagram, nodes: diagram.nodes.map((n) => (n.id === node.id ? { ...n, ...patch } : n)) });
  const patchEdge = (patch: Partial<FlowEdge>) =>
    edge && onChange({ ...diagram, edges: diagram.edges.map((e) => (e.id === edge.id ? { ...e, ...patch } : e)) });
  const remove = () => {
    if (node) {
      onChange({
        ...diagram,
        nodes: diagram.nodes.filter((n) => n.id !== node.id),
        edges: diagram.edges.filter((e) => e.from !== node.id && e.to !== node.id),
      });
    } else if (edge) {
      onChange({ ...diagram, edges: diagram.edges.filter((e) => e.id !== edge.id) });
    }
    setLocal(undefined);
  };

  return (
    <Stack direction="column" gap={0.5}>
      <Combobox
        options={items}
        value={sel ? `${sel.kind}:${sel.id}` : null}
        placeholder={items.length ? 'Select a node or edge…' : 'No elements yet'}
        onChange={(v) => {
          if (v?.value) {
            const [kind, ...rest] = v.value.split(':');
            setLocal({ kind: kind as FlowSelection['kind'], id: rest.join(':') });
          } else {
            setLocal(undefined);
          }
        }}
        isClearable
        aria-label="Inspect element"
      />
      {!node && !edge && <div className={s.hint}>Turn on Edit layout and click a node or edge in the panel, or pick one above.</div>}

      {node && (
        <>
          <div className={s.section}>Node</div>
          <InlineField label="Label" labelWidth={LW} grow>
            <Input value={node.label} onChange={(e) => patchNode({ label: e.currentTarget.value })} />
          </InlineField>
          <InlineField label="Sub-label" labelWidth={LW} grow tooltip="Shown under the label when no live value is bound">
            <Input value={node.sublabel ?? ''} onChange={(e) => patchNode({ sublabel: e.currentTarget.value || undefined })} />
          </InlineField>
          <InlineField label="Shape" labelWidth={LW} grow>
            <RadioButtonGroup options={SHAPES} value={node.shape} onChange={(v) => patchNode({ shape: v })} size="sm" fullWidth />
          </InlineField>
          <InlineField label="Icon" labelWidth={LW} grow>
            <Combobox options={ICONS} value={node.icon ?? null} createCustomValue isClearable placeholder="None" onChange={(v) => patchNode({ icon: v?.value || undefined })} />
          </InlineField>
          <ImageUrlField value={node.image} onChange={(image) => patchNode({ image })} />
          <InlineField label="Status" labelWidth={LW} grow>
            <RadioButtonGroup options={STATUSES} value={node.status ?? 'none'} onChange={(v) => patchNode({ status: v })} size="sm" fullWidth />
          </InlineField>
          <ColorField label="Accent" value={node.color ?? ''} onChange={(c) => patchNode({ color: c })} theme={t} placeholder="status colour" />
          <div className={s.section}>Data</div>
          <InlineField label="Value field" labelWidth={LW} grow tooltip="Field display name; the last value is shown using the field's unit and decimals">
            <Combobox options={fields} value={node.valueField ?? null} isClearable createCustomValue placeholder="None" onChange={(v) => patchNode({ valueField: v?.value || undefined })} />
          </InlineField>
          <InlineField label="Template" labelWidth={LW} grow tooltip="Optional text with ${value} placeholder, e.g. 'Load ${value}'">
            <Input value={node.valueFormat ?? ''} placeholder="${value}" onChange={(e) => patchNode({ valueFormat: e.currentTarget.value || undefined })} />
          </InlineField>
          <InlineField label="Link" labelWidth={LW} grow tooltip="URL opened on this node (see Links options for trigger and tab). Overrides the Links template; supports ${node.id} tokens and dashboard variables">
            <Input value={node.link ?? ''} placeholder="/d/dashboard?var-x=${node.id}" onChange={(e) => patchNode({ link: e.currentTarget.value || undefined })} />
          </InlineField>
          <div className={s.section}>Geometry</div>
          <Stack direction="row" gap={0.5}>
            {(['x', 'y', 'w', 'h'] as const).map((k) => (
              <InlineField key={k} label={k.toUpperCase()} labelWidth={3}>
                <Input type="number" width={7} value={node[k]} onChange={(e) => patchNode({ [k]: Math.max(k === 'w' || k === 'h' ? 16 : -1e5, num(e.currentTarget.value, node[k])) })} />
              </InlineField>
            ))}
          </Stack>
        </>
      )}

      {edge && (
        <>
          <div className={s.section}>Path</div>
          <InlineField label="From" labelWidth={LW} grow>
            <Combobox options={nodeOptions} value={edge.from} onChange={(v) => patchEdge({ from: v.value, controlPoints: undefined })} />
          </InlineField>
          <InlineField label="From side" labelWidth={LW} grow>
            <RadioButtonGroup options={SIDES} value={edge.fromSide ?? 'auto'} onChange={(v) => patchEdge({ fromSide: v })} size="sm" fullWidth />
          </InlineField>
          <InlineField label="To" labelWidth={LW} grow>
            <Combobox options={nodeOptions} value={edge.to} onChange={(v) => patchEdge({ to: v.value, controlPoints: undefined })} />
          </InlineField>
          <InlineField label="To side" labelWidth={LW} grow>
            <RadioButtonGroup options={SIDES} value={edge.toSide ?? 'auto'} onChange={(v) => patchEdge({ toSide: v })} size="sm" fullWidth />
          </InlineField>
          <InlineField label="Style" labelWidth={LW} grow>
            <Combobox options={STYLES} value={edge.style} onChange={(v) => patchEdge({ style: v.value })} />
          </InlineField>
          {edge.style === 'bezier' && (
            <>
              <InlineField label="Curvature" labelWidth={LW} grow>
                <Slider min={0} max={1} step={0.05} value={edge.curvature} onChange={(v) => patchEdge({ curvature: v })} />
              </InlineField>
              {edge.controlPoints && (
                <Button size="sm" variant="secondary" fill="text" icon="sync" onClick={() => patchEdge({ controlPoints: undefined })}>
                  Reset dragged control points
                </Button>
              )}
            </>
          )}
          <InlineField label="Stroke width" labelWidth={LW} grow>
            <Input type="number" step={0.5} min={0.5} max={12} value={edge.stroke} suffix="px" onChange={(e) => patchEdge({ stroke: Math.min(12, Math.max(0.5, num(e.currentTarget.value, edge.stroke))) })} />
          </InlineField>
          <ColorField label="Color" value={edge.color} onChange={(c) => patchEdge({ color: c })} theme={t} placeholder="default edge colour" />
          <InlineField label="Dash" labelWidth={LW} grow>
            <RadioButtonGroup options={DASHES} value={edge.dash} onChange={(v) => patchEdge({ dash: v })} size="sm" fullWidth />
          </InlineField>
          <InlineField label="Arrowhead" labelWidth={LW}>
            <InlineSwitch value={edge.arrow} onChange={(e) => patchEdge({ arrow: e.currentTarget.checked })} />
          </InlineField>
          <InlineField label="Glow" labelWidth={LW}>
            <InlineSwitch value={edge.glow} onChange={(e) => patchEdge({ glow: e.currentTarget.checked })} />
          </InlineField>
          <div className={s.section}>Particles</div>
          <InlineField label="Enabled" labelWidth={LW}>
            <InlineSwitch value={edge.particles.enabled} onChange={(e) => patchEdge({ particles: { ...edge.particles, enabled: e.currentTarget.checked } })} />
          </InlineField>
          <InlineField label="Speed" labelWidth={LW} grow>
            <Slider min={0} max={5} step={0.1} value={edge.particles.speed} onChange={(v) => patchEdge({ particles: { ...edge.particles, speed: v } })} />
          </InlineField>
          <InlineField label="Count" labelWidth={LW} grow>
            <Slider min={0} max={12} step={1} value={edge.particles.count} onChange={(v) => patchEdge({ particles: { ...edge.particles, count: v } })} />
          </InlineField>
          <InlineField label="Size" labelWidth={LW} grow>
            <Slider min={0.5} max={8} step={0.5} value={edge.particles.size} onChange={(v) => patchEdge({ particles: { ...edge.particles, size: v } })} />
          </InlineField>
          <div className={s.section}>Data</div>
          <InlineField label="Bind to field" labelWidth={LW} grow tooltip="Last value of this field drives the edge">
            <Combobox
              options={fields}
              value={edge.bind?.field ?? null}
              isClearable
              createCustomValue
              placeholder="None"
              onChange={(v) => patchEdge({ bind: v?.value ? { mapTo: 'speed', ...edge.bind, field: v.value } : undefined })}
            />
          </InlineField>
          {edge.bind && (
            <>
              <InlineField label="Map value to" labelWidth={LW} grow>
                <RadioButtonGroup options={TARGETS} value={edge.bind.mapTo} onChange={(v) => patchEdge({ bind: { ...edge.bind!, mapTo: v } })} size="sm" fullWidth />
              </InlineField>
              {edge.bind.mapTo !== 'color' && (
                <Stack direction="row" gap={0.5}>
                  <InlineField label="Min" labelWidth={5} tooltip="Value mapped to the slowest / thinnest edge (defaults to the field's min or 0)">
                    <Input type="number" width={9} value={edge.bind.min ?? ''} placeholder="auto" onChange={(e) => patchEdge({ bind: { ...edge.bind!, min: e.currentTarget.value === '' ? undefined : num(e.currentTarget.value, 0) } })} />
                  </InlineField>
                  <InlineField label="Max" labelWidth={5} tooltip="Value mapped to the fastest / widest edge (defaults to the field's max or 100)">
                    <Input type="number" width={9} value={edge.bind.max ?? ''} placeholder="auto" onChange={(e) => patchEdge({ bind: { ...edge.bind!, max: e.currentTarget.value === '' ? undefined : num(e.currentTarget.value, 100) } })} />
                  </InlineField>
                </Stack>
              )}
              <InlineField label="Reverse < 0" labelWidth={LW} tooltip="Particles travel backwards when the value is negative">
                <InlineSwitch value={!!edge.bind.reverseBelowZero} onChange={(e) => patchEdge({ bind: { ...edge.bind!, reverseBelowZero: e.currentTarget.checked } })} />
              </InlineField>
              {edge.bind.mapTo === 'color' && (
                <div className={s.hint}>
                  Colour comes from the standard <Text weight="medium">Thresholds</Text> and <Text weight="medium">Color scheme</Text> of the bound field (Standard options / Overrides).
                </div>
              )}
            </>
          )}
        </>
      )}

      {(node || edge) && (
        <div>
          <Button size="sm" variant="destructive" fill="outline" icon="trash-alt" onClick={remove}>
            Delete {node ? 'node' : 'edge'}
          </Button>
        </div>
      )}
    </Stack>
  );
};
