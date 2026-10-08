import React from 'react';
import { css, cx } from '@emotion/css';
import type { GrafanaTheme2 } from '@grafana/data';
import { IconButton, useStyles2 } from '@grafana/ui';

export interface ZoomControlsProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  /** Always visible (design mode) instead of only on hover */
  pinned?: boolean;
}

const getStyles = (theme: GrafanaTheme2) => ({
  box: css({
    position: 'absolute',
    right: 8,
    bottom: 8,
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    padding: 2,
    background: theme.colors.background.elevated,
    border: `1px solid ${theme.colors.border.medium}`,
    borderRadius: theme.shape.radius.default,
    opacity: 0,
    transition: 'opacity 150ms ease',
    zIndex: 2,
    '[data-testid=flow-panel]:hover &, &:focus-within': { opacity: 0.85 },
    '&:hover': { opacity: 1 },
  }),
  pinned: css({ opacity: 0.85 }),
  btn: css({ width: 24, height: 24, margin: 0, borderRadius: 3 }),
  zoom: css({ fontSize: 10, color: theme.colors.text.secondary, minWidth: 30, textAlign: 'center', userSelect: 'none' }),
});

/** Small floating zoom control (bottom-right): zoom in, zoom out, fit. Appears on hover of the panel. */
export const ZoomControls: React.FC<ZoomControlsProps> = ({ zoom, onZoomIn, onZoomOut, onFit, pinned }) => {
  const s = useStyles2(getStyles);
  return (
    <div className={cx(s.box, pinned && s.pinned)} data-testid="flow-zoom-controls" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <IconButton name="minus" tooltip="Zoom out" aria-label="Zoom out" className={s.btn} size="sm" onClick={onZoomOut} />
      <span className={s.zoom}>{Math.round(zoom * 100)}%</span>
      <IconButton name="plus" tooltip="Zoom in" aria-label="Zoom in" className={s.btn} size="sm" onClick={onZoomIn} />
      <IconButton name="expand-arrows-alt" tooltip="Fit to panel" aria-label="Fit to panel" className={s.btn} size="sm" onClick={onFit} />
    </div>
  );
};
