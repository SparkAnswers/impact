import React from 'react';
import { css } from '@emotion/css';
import type { GrafanaTheme2 } from '@grafana/data';
import { Tooltip, useStyles2 } from '@grafana/ui';

export const DEMO_BADGE_TEXT = 'Showing generated demo data. Add a query or set Data → Demo data to Off.';

/** Panels narrower than this hide the badge. */
export const DEMO_BADGE_MIN_WIDTH = 160;

const getStyles = (theme: GrafanaTheme2) => ({
  badge: css({
    position: 'absolute',
    top: 6,
    right: 6,
    zIndex: 2,
    padding: '1px 7px',
    borderRadius: 999,
    fontSize: 11,
    lineHeight: '16px',
    fontWeight: theme.typography.fontWeightMedium,
    fontFamily: theme.typography.fontFamily,
    letterSpacing: 0.2,
    color: theme.colors.primary.contrastText,
    background: theme.colors.primary.main,
    opacity: 0.85,
    cursor: 'help',
    userSelect: 'none',
    whiteSpace: 'nowrap',
    pointerEvents: 'auto',
    '&:hover': { opacity: 1 },
  }),
});

export interface DemoBadgeProps {
  /** Whether generated data is currently showing. */
  visible: boolean;
  /** Panel width in px; the badge is hidden below `DEMO_BADGE_MIN_WIDTH`. */
  width: number;
}

/**
 * Small theme-coloured pill in the top-right corner shown while a panel renders generated demo data.
 * Place inside a positioned container.
 */
export const DemoBadge: React.FC<DemoBadgeProps> = ({ visible, width }) => {
  const styles = useStyles2(getStyles);
  if (!visible || width < DEMO_BADGE_MIN_WIDTH) {
    return null;
  }
  return (
    <Tooltip content={DEMO_BADGE_TEXT} placement="bottom-end">
      <span className={styles.badge} data-testid="impact-demo-badge" aria-label={DEMO_BADGE_TEXT}>
        Demo data
      </span>
    </Tooltip>
  );
};
