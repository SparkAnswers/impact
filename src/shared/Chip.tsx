import React from 'react';
import { css, cx } from '@emotion/css';
import type { GrafanaTheme2 } from '@grafana/data';
import { Icon, IconButton, Tooltip, useStyles2, type IconName } from '@grafana/ui';

/** Panels narrower than this hide the chips (what they describe still applies). */
export const CHIP_MIN_WIDTH = 220;

export interface ChipAction {
  /** Accessible name (and tooltip) of the action */
  label: string;
  onClick: () => void;
  /** With `text`: icon drawn before the text; alone: a small icon button */
  icon?: IconName;
  /** Text of the button; a filled, easy-to-hit button (the "back" of a focus or zoom) */
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
        (action.icon && !action.text ? (
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
            {action.icon ? <Icon name={action.icon} size="sm" /> : null}
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
    gap: 6,
    padding: '2px 3px 2px 10px',
    borderRadius: 999,
    fontSize: 12,
    lineHeight: '18px',
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
  // A real button, not a link: filled, 24 px tall, so "back" is easy to see and hit.
  textAction: css({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    border: 0,
    background: theme.colors.primary.main,
    color: theme.colors.primary.contrastText,
    padding: '0 10px',
    height: 24,
    margin: 0,
    font: 'inherit',
    fontSize: 12,
    fontWeight: theme.typography.fontWeightMedium,
    cursor: 'pointer',
    borderRadius: 999,
    '&:hover': { background: theme.colors.primary.shade },
    '&:focus-visible': { outline: `2px solid ${theme.colors.primary.border}`, outlineOffset: 1 },
  }),
});
