import React, { useCallback } from 'react';
import { css, cx } from '@emotion/css';
import type { GrafanaTheme2, StandardEditorProps } from '@grafana/data';
import { Icon, useStyles2 } from '@grafana/ui';
import type { PresetCatalog, QuickStartOptions, QuickStartState } from './types';

export const QUICK_START_CATEGORY = ['Quick start'];
export const QUICK_START_DESCRIPTION =
  'One click sets every option of this panel to a complete, ready-made configuration, plus the unit, range, decimals or thresholds the preset defines. Your query, field choices and drawn items are kept; other option changes are replaced. The last applied preset is outlined.';

/** Builds the custom option editor for a panel's preset catalog. */
export function createQuickStartEditor<O extends QuickStartOptions>(
  catalog: PresetCatalog<O>
): React.FC<StandardEditorProps<QuickStartState | undefined>> {
  const QuickStartEditor: React.FC<StandardEditorProps<QuickStartState | undefined>> = ({ value, onChange }) => {
    const styles = useStyles2(getStyles);
    const pick = useCallback((id: string) => onChange({ preset: id, token: (value?.token ?? 0) + 1 }), [onChange, value?.token]);
    return (
      <div className={styles.grid} role="group" aria-label="Quick start presets" data-testid="quick-start">
        {catalog.presets.map((p) => {
          const active = value?.preset === p.id;
          return (
            <button
              key={p.id}
              type="button"
              className={cx(styles.card, active && styles.active)}
              aria-current={active ? 'true' : undefined}
              onClick={() => pick(p.id)}
            >
              <span className={styles.head}>
                {p.icon && <Icon name={p.icon} size="sm" className={styles.icon} />}
                <span className={styles.label}>{p.label}</span>
              </span>
              <span className={styles.desc}>{p.description}</span>
            </button>
          );
        })}
      </div>
    );
  };
  QuickStartEditor.displayName = 'QuickStartEditor';
  return QuickStartEditor;
}

const getStyles = (theme: GrafanaTheme2) => ({
  grid: css({
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: theme.spacing(1),
  }),
  card: css({
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(0.5),
    textAlign: 'left',
    padding: theme.spacing(1),
    background: theme.colors.background.secondary,
    border: `1px solid ${theme.colors.border.weak}`,
    borderRadius: theme.shape.radius.default,
    color: theme.colors.text.primary,
    cursor: 'pointer',
    font: 'inherit',
    '&:hover': { borderColor: theme.colors.border.strong, background: theme.colors.action.hover },
    '&:focus-visible': { outline: `2px solid ${theme.colors.primary.border}`, outlineOffset: 1 },
  }),
  active: css({
    borderColor: theme.colors.primary.border,
    boxShadow: `inset 0 0 0 1px ${theme.colors.primary.border}`,
  }),
  head: css({ display: 'flex', alignItems: 'center', gap: theme.spacing(0.5) }),
  icon: css({ color: theme.colors.text.secondary, flex: 'none' }),
  label: css({ fontWeight: theme.typography.fontWeightMedium, fontSize: theme.typography.bodySmall.fontSize }),
  desc: css({ color: theme.colors.text.secondary, fontSize: theme.typography.bodySmall.fontSize, lineHeight: 1.3 }),
});
