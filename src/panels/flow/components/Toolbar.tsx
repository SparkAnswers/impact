import React from 'react';
import { css, cx } from '@emotion/css';
import type { GrafanaTheme2 } from '@grafana/data';
import { IconButton, useStyles2 } from '@grafana/ui';

export type Tool = 'select' | 'addNode' | 'addEdge';

export interface ToolbarProps {
  tool: Tool;
  onTool: (t: Tool) => void;
  canUndo: boolean;
  canRedo: boolean;
  canDelete: boolean;
  gridOn: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onDelete: () => void;
  onFit: () => void;
  onToggleGrid: () => void;
  onLock: () => void;
}

const getStyles = (theme: GrafanaTheme2) => ({
  bar: css({
    position: 'absolute',
    top: 8,
    left: 8,
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    padding: 3,
    background: theme.colors.background.elevated,
    border: `1px solid ${theme.colors.border.medium}`,
    borderRadius: theme.shape.radius.default,
    boxShadow: theme.shadows.z2,
    zIndex: 2,
  }),
  btn: css({
    borderRadius: 3,
    width: 24,
    height: 24,
    margin: 0,
  }),
  on: css({
    background: theme.colors.primary.transparent,
    color: theme.colors.primary.text,
    boxShadow: `inset 0 0 0 1px ${theme.colors.primary.border}`,
  }),
  sep: css({
    width: 1,
    alignSelf: 'stretch',
    margin: '3px 3px',
    background: theme.colors.border.medium,
  }),
});

export const Toolbar: React.FC<ToolbarProps> = (p) => {
  const s = useStyles2(getStyles);
  const toolBtn = (t: Tool, icon: 'hand-pointer' | 'plus-square' | 'draggabledots' | 'arrow-random', tip: string) => (
    <IconButton
      name={icon}
      tooltip={tip}
      aria-pressed={p.tool === t}
      className={cx(s.btn, p.tool === t && s.on)}
      onClick={() => p.onTool(t)}
      size="md"
    />
  );
  return (
    <div className={s.bar} data-testid="flow-toolbar" onPointerDown={(e) => e.stopPropagation()}>
      {toolBtn('select', 'hand-pointer', 'Select / move (V)')}
      {toolBtn('addNode', 'plus-square', 'Add node: click on the canvas (N)')}
      {toolBtn('addEdge', 'arrow-random', 'Add edge: click a source node then a target node (E)')}
      <span className={s.sep} />
      <IconButton name="trash-alt" tooltip="Delete selection (Del)" className={s.btn} disabled={!p.canDelete} onClick={p.onDelete} size="md" />
      <IconButton name="corner-up-left" tooltip="Undo (Ctrl+Z)" className={s.btn} disabled={!p.canUndo} onClick={p.onUndo} size="md" />
      <IconButton name="corner-up-right" tooltip="Redo (Ctrl+Shift+Z)" className={s.btn} disabled={!p.canRedo} onClick={p.onRedo} size="md" />
      <span className={s.sep} />
      <IconButton name="expand-arrows-alt" tooltip="Fit diagram to panel" className={s.btn} onClick={p.onFit} size="md" />
      <IconButton
        name="gf-grid"
        tooltip={p.gridOn ? 'Hide grid' : 'Show grid'}
        aria-pressed={p.gridOn}
        className={cx(s.btn, p.gridOn && s.on)}
        onClick={p.onToggleGrid}
        size="md"
      />
      <IconButton name="lock" tooltip="Lock layout (turn off Edit layout)" className={s.btn} onClick={p.onLock} size="md" />
    </div>
  );
};
