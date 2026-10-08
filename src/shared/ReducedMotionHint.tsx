import React from 'react';
import { css } from '@emotion/css';
import type { GrafanaTheme2 } from '@grafana/data';
import { Icon, Tooltip, useStyles2 } from '@grafana/ui';
import { type MotionPreference, useMotionState } from './motion';

export const REDUCED_MOTION_HINT_TEXT =
  "Animation paused by your system's reduce-motion setting. Change Animation → Reduced motion to 'Always animate' to override.";

/** Panels narrower than this hide the hint. */
export const HINT_MIN_WIDTH = 160;

const getStyles = (theme: GrafanaTheme2) => ({
  hint: css({
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 12,
    height: 12,
    lineHeight: 0,
    color: theme.colors.text.secondary,
    opacity: 0.8,
    cursor: 'help',
    zIndex: 1,
    '& svg': { width: 12, height: 12 },
  }),
});

export interface ReducedMotionHintProps {
  /** The panel's Animation switch. */
  animationEnabled: boolean;
  /** The panel's Reduced motion option. */
  preference: MotionPreference | undefined;
  /** Panel width in px; the hint is hidden below `HINT_MIN_WIDTH`. */
  width: number;
}

/**
 * Tiny pause icon shown in the panel corner when motion is blocked only by the system's
 * reduce-motion preference. Place inside a positioned container.
 */
export const ReducedMotionHint: React.FC<ReducedMotionHintProps> = ({ animationEnabled, preference, width }) => {
  const styles = useStyles2(getStyles);
  const { pausedBySystem } = useMotionState(animationEnabled, preference);
  if (!pausedBySystem || width < HINT_MIN_WIDTH) {
    return null;
  }
  return (
    <Tooltip content={REDUCED_MOTION_HINT_TEXT} placement="top-end">
      <span className={styles.hint} data-testid="impact-reduced-motion-hint" aria-label={REDUCED_MOTION_HINT_TEXT}>
        <Icon name="pause" size="xs" />
      </span>
    </Tooltip>
  );
};
