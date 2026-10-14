import React from 'react';
import { css, cx } from '@emotion/css';
import type { GrafanaTheme2 } from '@grafana/data';
import { Tooltip, useStyles2 } from '@grafana/ui';
import type { DoubleClickAction } from '../types';

export interface ClickModeSwitchProps {
  /** Choices in display order */
  modes: DoubleClickAction[];
  /** What a plain click does right now (may be none of the choices) */
  current: DoubleClickAction;
  onChange: (mode: DoubleClickAction) => void;
}

export const CLICK_MODE_LABEL: Record<DoubleClickAction, string> = { focus: 'Isolate', zoom: 'Zoom', link: 'Open', variable: 'Filter', off: 'Off' };
const CLICK_MODE_HINT: Record<DoubleClickAction, string> = {
  focus: 'Click a card to show only it and its chain',
  zoom: 'Click a card to zoom onto it',
  link: 'Click a card to open its link (Ctrl / ⌘ + click opens it in a new tab at any time)',
  variable: 'Click a card to write it into the dashboard variable',
  off: 'A click does nothing',
};

const getStyles = (theme: GrafanaTheme2) => ({
  box: css({
    position: 'absolute',
    left: 8,
    bottom: 8,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 2,
    padding: 2,
    background: theme.colors.background.elevated,
    border: `1px solid ${theme.colors.border.medium}`,
    borderRadius: 999,
    opacity: 0.85,
    zIndex: 2,
    fontSize: 11,
    fontFamily: theme.typography.fontFamily,
    '&:hover': { opacity: 1 },
  }),
  label: css({ color: theme.colors.text.secondary, padding: '0 4px 0 6px', userSelect: 'none' }),
  seg: css({
    border: 0,
    background: 'none',
    color: theme.colors.text.secondary,
    font: 'inherit',
    padding: '2px 8px',
    borderRadius: 999,
    cursor: 'pointer',
    lineHeight: '16px',
    '&:hover': { background: theme.colors.action.hover, color: theme.colors.text.primary },
    '&:focus-visible': { outline: `2px solid ${theme.colors.primary.border}` },
  }),
  on: css({
    background: theme.colors.primary.main,
    color: theme.colors.primary.contrastText,
    fontWeight: theme.typography.fontWeightMedium,
    '&:hover': { background: theme.colors.primary.shade, color: theme.colors.primary.contrastText },
  }),
});

/** Bottom-left pill: what a plain click on a card does, switchable for the session. */
export const ClickModeSwitch: React.FC<ClickModeSwitchProps> = ({ modes, current, onChange }) => {
  const s = useStyles2(getStyles);
  return (
    <div className={s.box} data-testid="flow-click-mode" role="radiogroup" aria-label="What a click does" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <span className={s.label}>Click</span>
      {modes.map((m) => (
        <Tooltip key={m} content={CLICK_MODE_HINT[m]}>
          <button type="button" role="radio" aria-checked={current === m} className={cx(s.seg, current === m && s.on)} onClick={() => onChange(m)}>
            {CLICK_MODE_LABEL[m]}
          </button>
        </Tooltip>
      ))}
    </div>
  );
};
