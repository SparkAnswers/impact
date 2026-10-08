import React, { useMemo, useState } from 'react';
import type { StandardEditorProps } from '@grafana/data';
import { Button, Combobox, InlineField, Input, RadioButtonGroup, Stack, useStyles2, useTheme2, type ComboboxOption } from '@grafana/ui';
import { cleanOverrides } from '../lib/datadriven';
import type { FlowInstanceState, FlowOptions, FlowSelection, NodeOverride } from '../types';
import { ColorField, getInspectorStyles, ICONS, LW, num, SHAPES, STATUSES } from './InspectorEditor';

type Props = StandardEditorProps<Record<string, NodeOverride>, {}, FlowOptions, FlowInstanceState>;

/**
 * Inspector for data-driven nodes ("Data + manual overrides"): every change is stored as an override
 * keyed by node id, on top of the auto layout. Dragging a node in design mode writes the same overrides.
 */
export const OverridesEditor: React.FC<Props> = ({ value, onChange, context }) => {
  const s = useStyles2(getInspectorStyles);
  const theme = useTheme2();
  const overrides = useMemo(() => value ?? {}, [value]);
  const diagram = context.instanceState?.dataDiagram;
  const fromPanel = context.instanceState?.selection;
  const [local, setLocal] = useState<FlowSelection | undefined>(fromPanel);
  const [prevFromPanel, setPrevFromPanel] = useState(fromPanel);
  if (prevFromPanel !== fromPanel) {
    setPrevFromPanel(fromPanel);
    setLocal(fromPanel);
  }
  const selectedId = local?.kind === 'node' ? local.id : undefined;

  const items: Array<ComboboxOption<string>> = useMemo(
    () =>
      (diagram?.nodes ?? []).map((n) => ({
        label: overrides[n.id] ? `${n.label} *` : n.label,
        value: n.id,
        description: n.id !== n.label ? n.id : undefined,
      })),
    [diagram, overrides]
  );
  const node = selectedId ? diagram?.nodes.find((n) => n.id === selectedId) : undefined;
  const current: NodeOverride = (selectedId && overrides[selectedId]) || {};
  const count = Object.keys(overrides).length;

  const patch = (p: Partial<NodeOverride>) => {
    if (!selectedId) {
      return;
    }
    onChange(cleanOverrides({ ...overrides, [selectedId]: { ...current, ...p } }));
  };
  const clearNode = () => {
    if (!selectedId) {
      return;
    }
    const next = { ...overrides };
    delete next[selectedId];
    onChange(next);
  };

  return (
    <Stack direction="column" gap={0.5}>
      <Combobox
        options={items}
        value={selectedId ?? null}
        placeholder={items.length ? 'Select a data node…' : 'No data nodes yet'}
        onChange={(v) => setLocal(v?.value ? { kind: 'node', id: v.value } : undefined)}
        isClearable
        aria-label="Inspect data node"
      />
      {!node && (
        <div className={s.hint}>
          Turn on Edit layout and click or drag a node in the panel, or pick one above. Nodes marked with * have overrides.
        </div>
      )}
      {node && (
        <>
          <div className={s.section}>Node · {node.id}</div>
          <InlineField label="Label" labelWidth={LW} grow tooltip="Empty: the label from the data">
            <Input value={current.label ?? ''} placeholder={node.label} onChange={(e) => patch({ label: e.currentTarget.value || undefined })} />
          </InlineField>
          <InlineField label="Shape" labelWidth={LW} grow>
            <RadioButtonGroup options={SHAPES} value={current.shape ?? node.shape} onChange={(v) => patch({ shape: v })} size="sm" fullWidth />
          </InlineField>
          <InlineField label="Icon" labelWidth={LW} grow>
            <Combobox options={ICONS} value={current.icon ?? null} createCustomValue isClearable placeholder="None" onChange={(v) => patch({ icon: v?.value || undefined })} />
          </InlineField>
          <InlineField label="Status" labelWidth={LW} grow tooltip="Overrides the status from the data">
            <RadioButtonGroup options={STATUSES} value={current.status ?? node.status ?? 'none'} onChange={(v) => patch({ status: v })} size="sm" fullWidth />
          </InlineField>
          <ColorField label="Accent" value={current.color ?? ''} onChange={(c) => patch({ color: c })} theme={theme} placeholder={node.color || 'group / status colour'} />
          <div className={s.section}>Position</div>
          <Stack direction="row" gap={0.5}>
            {(['x', 'y'] as const).map((k) => (
              <InlineField key={k} label={k.toUpperCase()} labelWidth={3} tooltip="Empty: automatic layout">
                <Input
                  type="number"
                  width={9}
                  value={current[k] ?? ''}
                  placeholder={String(node[k])}
                  onChange={(e) => patch({ [k]: e.currentTarget.value === '' ? undefined : num(e.currentTarget.value, node[k]) })}
                />
              </InlineField>
            ))}
          </Stack>
          <div>
            <Button size="sm" variant="secondary" fill="outline" icon="sync" disabled={!overrides[node.id]} onClick={clearNode}>
              Clear this node’s overrides
            </Button>
          </div>
        </>
      )}
      <div>
        <Button size="sm" variant="destructive" fill="outline" icon="trash-alt" disabled={!count} onClick={() => onChange({})}>
          Reset overrides{count ? ` (${count})` : ''}
        </Button>
      </div>
    </Stack>
  );
};
