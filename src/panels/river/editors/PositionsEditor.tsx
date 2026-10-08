import React, { useMemo } from 'react';
import { css } from '@emotion/css';
import { type GrafanaTheme2, type StandardEditorProps } from '@grafana/data';
import { Button, IconButton, Input, useStyles2 } from '@grafana/ui';
import { autoPositions, extractNetwork } from '../lib/network';
import { DEFAULT_NETWORK, type NetworkLayout, type NodePosition, type RiverOptions } from '../types';

const getStyles = (theme: GrafanaTheme2) => ({
  row: css({ display: 'flex', gap: theme.spacing(0.5), alignItems: 'center', marginBottom: theme.spacing(0.5) }),
  actions: css({ display: 'flex', gap: theme.spacing(0.5), flexWrap: 'wrap', margin: theme.spacing(0.5, 0) }),
  note: css({ fontSize: theme.typography.bodySmall.fontSize, color: theme.colors.text.secondary, margin: theme.spacing(0.5, 0) }),
  id: css({ flex: 1, minWidth: 0 }),
});

const round3 = (v: number) => Math.round(v * 1000) / 1000;
const num = (v: string, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
};

/**
 * Node id → x, y (0..1) list for the network map. "Seed from auto layout" fills it from the current query
 * so a floor plan or map can be matched by nudging the numbers; dragged positions (overrides) win and
 * can be cleared with "Reset dragged".
 */
export const PositionsEditor: React.FC<StandardEditorProps<NetworkLayout, unknown, RiverOptions>> = ({ value, onChange, context }) => {
  const styles = useStyles2(getStyles);
  const layout: NetworkLayout = { positions: value?.positions ?? [], overrides: value?.overrides ?? {} };
  const network = { ...DEFAULT_NETWORK, ...(context.options?.network ?? {}) };
  const overrideCount = Object.keys(layout.overrides).length;

  const auto = useMemo(() => {
    const graph = extractNetwork(context.data ?? [], network);
    return autoPositions(graph, network.layoutDirection, 1.8, network.nodeSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context.data, network.layoutDirection, network.nodeSize, network.sourceField, network.targetField, network.nodeIdField]);

  const setPositions = (positions: NodePosition[]) => onChange({ ...layout, positions });
  const update = (i: number, patch: Partial<NodePosition>) => setPositions(layout.positions.map((p, k) => (k === i ? { ...p, ...patch } : p)));

  const seed = () => {
    const known = new Map(layout.positions.map((p) => [p.id, p]));
    const seeded: NodePosition[] = [];
    for (const [id, p] of auto) {
      const prev = known.get(id);
      seeded.push(prev ?? { id, x: round3(p.x), y: round3(p.y) });
      known.delete(id);
    }
    for (const p of known.values()) {
      seeded.push(p);
    }
    setPositions(seeded);
  };

  return (
    <div data-testid="river-positions-editor">
      <div className={styles.actions}>
        <Button size="sm" variant="secondary" icon="sitemap" onClick={seed} disabled={auto.size === 0} tooltip="Add every node of the current query with its auto-layout position (existing rows are kept)">
          Seed from auto layout
        </Button>
        <Button size="sm" variant="secondary" icon="plus" onClick={() => setPositions([...layout.positions, { id: '', x: 0.5, y: 0.5 }])}>
          Add
        </Button>
        <Button
          size="sm"
          variant="destructive"
          fill="outline"
          icon="history"
          disabled={overrideCount === 0}
          onClick={() => onChange({ ...layout, overrides: {} })}
          tooltip="Forget the positions dragged on the canvas"
        >
          Reset dragged{overrideCount ? ` (${overrideCount})` : ''}
        </Button>
      </div>
      {layout.positions.map((p, i) => (
        <div key={i} className={styles.row}>
          <Input
            className={styles.id}
            placeholder="node id"
            value={p.id}
            onChange={(e) => update(i, { id: e.currentTarget.value })}
            aria-label={`Node ${i + 1} id`}
          />
          <Input type="number" width={8} step={0.01} min={0} max={1} value={p.x} onChange={(e) => update(i, { x: num(e.currentTarget.value, p.x) })} aria-label={`Node ${i + 1} x`} />
          <Input type="number" width={8} step={0.01} min={0} max={1} value={p.y} onChange={(e) => update(i, { y: num(e.currentTarget.value, p.y) })} aria-label={`Node ${i + 1} y`} />
          <IconButton name="trash-alt" aria-label="Remove" onClick={() => setPositions(layout.positions.filter((_, k) => k !== i))} />
        </div>
      ))}
      <div className={styles.note}>
        {layout.positions.length === 0 ? 'No typed positions: nodes follow the auto layout. ' : ''}
        x and y are fractions of the panel (0..1, y downwards). Dragged positions win over this list.
      </div>
    </div>
  );
};
