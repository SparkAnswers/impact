import React from 'react';
import { css, cx } from '@emotion/css';
import type { GrafanaTheme2 } from '@grafana/data';
import { IconButton, Tooltip, useStyles2, type IconName } from '@grafana/ui';

/** Panels narrower than this hide the chips (what they describe still applies). */
export const CHIP_MIN_WIDTH = 220;

export interface ChipAction {
  /** Accessible name (and tooltip) of the action */
  label: string;
  onClick: () => void;
  /** Icon button when set, otherwise a small text button showing `text` (or the label) */
  icon?: IconName;
  text?: string;
}

interface Props {
  children: React.ReactNode;
  /** Tooltip over the text part */
  tooltip?: string;
  action?: ChipAction;
  testId?: string;
}

/** Small pill in the panel corner (dashboard variable set from here, hidden items, ...), with an optional action. */
export const Chip: React.FC<Props> = ({ children, tooltip, action, testId }) => {
  const styles = useStyles2(getStyles);
  const text = <span className={cx(styles.text, tooltip && styles.help)}>{children}</span>;
  return (
    <div className={styles.chip} data-testid={testId}>
      {tooltip ? <Tooltip content={tooltip}>{text}</Tooltip> : text}
      {action &&
        (action.icon ? (
          <IconButton
            name={action.icon}
            size="sm"
            variant="secondary"
            aria-label={action.label}
            tooltip={action.label}
            onClick={action.onClick}
            className={styles.iconAction}
          />
        ) : (
          <button
            type="button"
            className={styles.textAction}
            aria-label={action.label}
            title={action.label}
            onClick={action.onClick}
          >
            {action.text ?? action.label}
          </button>
        ))}
    </div>
  );
};

/** Flex row holding the chips in the panel's top-left corner. */
export const ChipRow: React.FC<{ children: React.ReactNode; width: number; /** Distance from the panel top (default 6) */ top?: number }> = ({ children, width, top }) => {
  const styles = useStyles2(getStyles);
  if (width < CHIP_MIN_WIDTH) {
    return null;
  }
  return (
    <div className={styles.row} style={top !== undefined ? { top } : undefined}>
      {children}
    </div>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  row: css({
    position: 'absolute',
    top: 6,
    left: 6,
    zIndex: 3,
    display: 'flex',
    flexWrap: 'wrap',
    gap: 4,
    maxWidth: '70%',
    pointerEvents: 'none',
    '& > *': { pointerEvents: 'auto' },
  }),
  chip: css({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 2,
    padding: '1px 2px 1px 8px',
    borderRadius: 999,
    fontSize: 11,
    lineHeight: '16px',
    fontFamily: theme.typography.fontFamily,
    color: theme.colors.text.primary,
    background: theme.colors.background.secondary,
    border: `1px solid ${theme.colors.border.medium}`,
    whiteSpace: 'nowrap',
    maxWidth: '100%',
    b: { fontWeight: theme.typography.fontWeightMedium },
  }),
  text: css({ overflow: 'hidden', textOverflow: 'ellipsis' }),
  help: css({ cursor: 'help' }),
  iconAction: css({ margin: 0 }),
  textAction: css({
    border: 0,
    background: 'none',
    padding: '0 6px',
    margin: 0,
    font: 'inherit',
    color: theme.colors.text.link,
    cursor: 'pointer',
    borderRadius: 999,
    '&:hover': { background: theme.colors.action.hover },
    '&:focus-visible': { outline: `2px solid ${theme.colors.primary.border}`, outlineOffset: -2 },
  }),
});
