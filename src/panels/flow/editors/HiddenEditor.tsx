import React from 'react';
import { css } from '@emotion/css';
import type { GrafanaTheme2, StandardEditorProps } from '@grafana/data';
import { Button, IconButton, Stack, useStyles2 } from '@grafana/ui';
import type { FlowOptions, HiddenItems } from '../types';

type Props = StandardEditorProps<HiddenItems, {}, FlowOptions>;

/** Lists the nodes and groups hidden through the context menu, with per-item restore and "Show all". */
export const HiddenEditor: React.FC<Props> = ({ value, onChange }) => {
  const s = useStyles2(getStyles);
  const hidden: HiddenItems = { nodes: value?.nodes ?? [], groups: value?.groups ?? [] };
  const count = hidden.nodes.length + hidden.groups.length;
  const remove = (kind: keyof HiddenItems, id: string) =>
    onChange({ ...hidden, [kind]: hidden[kind].filter((x) => x !== id) });

  if (!count) {
    return (
      <div className={s.hint}>
        Nothing hidden. Right-click a node or a group label in the panel (view mode) to hide it.
      </div>
    );
  }
  return (
    <Stack direction="column" gap={0.5}>
      {(['groups', 'nodes'] as const).map((kind) =>
        hidden[kind].length ? (
          <div key={kind}>
            <div className={s.section}>{kind === 'groups' ? 'Groups' : 'Nodes'}</div>
            <ul className={s.list} data-testid={`flow-hidden-${kind}`}>
              {hidden[kind].map((id) => (
                <li key={id} className={s.item}>
                  <span className={s.name} title={id}>
                    {id}
                  </span>
                  <IconButton
                    name="eye"
                    size="sm"
                    variant="secondary"
                    aria-label={`Show ${id}`}
                    tooltip={`Show ${id}`}
                    onClick={() => remove(kind, id)}
                  />
                </li>
              ))}
            </ul>
          </div>
        ) : null
      )}
      <div>
        <Button
          size="sm"
          variant="secondary"
          fill="outline"
          icon="eye"
          onClick={() => onChange({ nodes: [], groups: [] })}
        >
          Show all ({count})
        </Button>
      </div>
    </Stack>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  hint: css({ fontSize: theme.typography.bodySmall.fontSize, color: theme.colors.text.secondary }),
  section: css({
    fontSize: 11,
    fontWeight: theme.typography.fontWeightMedium,
    color: theme.colors.text.secondary,
    margin: theme.spacing(0.5, 0),
  }),
  list: css({ listStyle: 'none', margin: 0, padding: 0 }),
  item: css({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing(1),
    padding: theme.spacing(0.25, 0.5),
    borderRadius: theme.shape.radius.default,
    '&:hover': { background: theme.colors.action.hover },
  }),
  name: css({
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontFamily: theme.typography.fontFamilyMonospace,
    fontSize: theme.typography.bodySmall.fontSize,
  }),
});
