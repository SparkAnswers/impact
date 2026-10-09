import React from 'react';
import { css } from '@emotion/css';
import type { GrafanaTheme2 } from '@grafana/data';
import { IconButton, Tooltip, useStyles2 } from '@grafana/ui';

/** Panels narrower than this hide the chip (the variable still applies). */
const MIN_WIDTH = 220;

interface Props {
  name: string;
  value: string;
  onClear: () => void;
  width: number;
}

/** Small chip showing the dashboard variable this panel last set, with a clear button. */
export const VariableChip: React.FC<Props> = ({ name, value, onClear, width }) => {
  const styles = useStyles2(getStyles);
  if (width < MIN_WIDTH) {
    return null;
  }
  return (
    <div className={styles.chip} data-testid="flow-variable-chip">
      <Tooltip content={`Dashboard variable set from this panel: $${name}. Every query using it follows. Clear to reset.`}>
        <span className={styles.text}>
          {name} = <b>{value}</b>
        </span>
      </Tooltip>
      <IconButton name="times" size="sm" variant="secondary" aria-label={`Clear ${name}`} tooltip={`Clear ${name}`} onClick={onClear} className={styles.clear} />
    </div>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  chip: css({
    position: 'absolute',
    top: 6,
    left: 6,
    zIndex: 3,
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
    maxWidth: '60%',
    pointerEvents: 'auto',
  }),
  text: css({ overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'help', b: { fontWeight: theme.typography.fontWeightMedium } }),
  clear: css({ margin: 0 }),
});
