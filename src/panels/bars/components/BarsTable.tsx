import React, { useCallback, useMemo, useState } from 'react';
import { cx } from '@emotion/css';
import { dateTimeFormatTimeAgo, isIconName } from '@grafana/data';
import type { TimeZone } from '@grafana/schema';
import { Checkbox, Icon, useStyles2, useTheme2 } from '@grafana/ui';
import type { BarRow, BarsModel } from '../lib/rows';
import { sortRows, type SortKey, type SortState } from '../lib/sort';
import { DENSITY_ROW_HEIGHT, VIRTUALISE_THRESHOLD, type BarsOptions } from '../types';
import { RowBar } from './RowBar';
import { getStyles } from './styles';
import { useTick } from './useMotion';

interface Props {
  model: BarsModel;
  options: BarsOptions;
  width: number;
  height: number;
  animate: boolean;
  timeZone: TimeZone;
  refreshedAt?: number;
}

interface Column {
  key: SortKey | 'check' | 'dot' | 'bar';
  title: string;
  width?: number;
  numeric?: boolean;
  sortKey?: SortKey;
}

const HEADER_H = 30;
const FOOTER_H = 24;
const SAFE_HREF = /^(https?:\/\/|\/|\.\/|#)/i;

/** Resolves the option's default sort column into a sort key for this model. */
export function defaultSortFor(model: BarsModel, options: BarsOptions): SortState | undefined {
  const f = options.defaultSortField?.trim();
  if (!f) {
    return undefined;
  }
  const lower = f.toLowerCase();
  let key: SortKey | undefined;
  if (lower === 'name') {
    key = 'name';
  } else if (lower === 'value' || lower === 'progress' || lower === model.valueTitle.toLowerCase()) {
    key = 'value';
  } else if (lower === 'status') {
    key = 'status';
  } else if (lower === 'time' || lower === 'updated') {
    key = 'time';
  } else {
    const idx = model.extraColumns.findIndex((c) => c.title.toLowerCase() === lower);
    if (idx >= 0) {
      key = `extra:${idx}`;
    }
  }
  return key ? { key, desc: options.defaultSortDesc } : undefined;
}

export const BarsTable: React.FC<Props> = ({ model, options, width, height, animate, timeZone, refreshedAt }) => {
  const styles = useStyles2(getStyles);
  const theme = useTheme2();
  const [userSort, setUserSort] = useState<SortState | undefined>();
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [scrollTop, setScrollTop] = useState(0);

  const sort = userSort ?? defaultSortFor(model, options);
  const rows = useMemo(() => sortRows(model.rows, sort), [model.rows, sort]);
  useTick(30_000, options.showFooter || model.hasTime);

  const hasSubtitle = model.rows.some((r) => r.subtitle);
  const baseRowH = options.rowHeight > 0 ? options.rowHeight : DENSITY_ROW_HEIGHT[options.density];
  const rowH = hasSubtitle ? Math.max(baseRowH, 44) : baseRowH;

  const columns = useMemo<Column[]>(() => {
    const cols: Column[] = [];
    if (options.showCheckbox) {
      cols.push({ key: 'check', title: '', width: 34 });
    }
    if (options.showStatusDot) {
      cols.push({ key: 'dot', title: '', width: 36 });
    }
    cols.push({ key: 'name', title: 'Name', sortKey: 'name' });
    cols.push({ key: 'bar', title: model.fromTimeSeries ? 'Value' : model.valueTitle, sortKey: 'value' });
    model.extraColumns.forEach((c, i) =>
      cols.push({ key: `extra:${i}`, title: c.title, numeric: c.numeric, sortKey: `extra:${i}` })
    );
    if (model.hasTime) {
      cols.push({ key: 'time', title: 'Updated', sortKey: 'time', width: 110 });
    }
    return cols;
  }, [options.showCheckbox, options.showStatusDot, model]);

  const onSort = useCallback((key: SortKey) => {
    setUserSort((prev) => (prev?.key === key ? { key, desc: !prev.desc } : { key, desc: false }));
  }, []);

  const toggleRow = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = useCallback(() => {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  }, [allSelected, rows]);

  // Simple windowing for large tables.
  const virtual = rows.length > VIRTUALISE_THRESHOLD;
  const bodyH = height - (options.showHeader ? HEADER_H : 0) - (options.showFooter ? FOOTER_H : 0);
  let start = 0;
  let end = rows.length;
  if (virtual) {
    const overscan = 10;
    start = Math.max(0, Math.floor(scrollTop / rowH) - overscan);
    end = Math.min(rows.length, Math.ceil((scrollTop + bodyH) / rowH) + overscan);
  }
  const visible = virtual ? rows.slice(start, end) : rows;

  const background = options.background ?? 'panel';
  const glass = background === 'transparent';
  const fill =
    background === 'solid'
      ? theme.visualization.getColorByName(options.backgroundColor || 'transparent')
      : theme.colors.background.primary;
  const cssVars = {
    '--pb-h': `${options.trackHeight}px`,
    '--pb-r': `${options.radius}px`,
    '--pb-w': `${options.trackWidth}px`,
    '--pb-speed': `${Math.max(0.2, options.animationSpeed)}s`,
    '--pb-bg': fill,
  } as React.CSSProperties;

  const sortLabel = sort
    ? `sorted by ${columns.find((c) => c.sortKey === sort.key)?.title ?? sort.key} ${sort.desc ? '↓' : '↑'}`
    : undefined;

  return (
    <div
      className={cx(styles.root, background === 'solid' && styles.rootSolid)}
      style={{ width, height, ...cssVars }}
      data-testid="impact-bars"
      data-background={background}
    >
      <div className={styles.scroller} onScroll={virtual ? (e) => setScrollTop(e.currentTarget.scrollTop) : undefined}>
        <table className={cx(styles.table, glass ? styles.headerGlass : styles.headerSolid)}>
          <colgroup>
            {columns.map((c) => (
              <col key={c.key} style={c.width ? { width: c.width } : undefined} />
            ))}
          </colgroup>
          {options.showHeader && (
            <thead>
              <tr>
                {columns.map((c) => {
                  if (c.key === 'check') {
                    return (
                      <th key={c.key}>
                        <Checkbox value={allSelected} onChange={toggleAll} aria-label="Select all rows" />
                      </th>
                    );
                  }
                  const active = sort?.key === c.sortKey;
                  return (
                    <th
                      key={c.key}
                      className={cx(c.sortKey && styles.sortable, active && styles.sorted, c.numeric && styles.num)}
                      onClick={c.sortKey ? () => onSort(c.sortKey!) : undefined}
                      aria-sort={active ? (sort?.desc ? 'descending' : 'ascending') : undefined}
                    >
                      {c.title}
                      {active && <span className={cx(styles.caret, sort?.desc && styles.caretDown)} />}
                    </th>
                  );
                })}
              </tr>
            </thead>
          )}
          <tbody>
            {virtual && start > 0 && (
              <tr aria-hidden="true">
                <td colSpan={columns.length} style={{ height: start * rowH, padding: 0, border: 0 }} />
              </tr>
            )}
            {visible.map((row) => (
              <tr
                key={row.id}
                className={cx(selected.has(row.id) && (glass ? styles.selectedGlass : styles.selected))}
                style={{ height: rowH }}
              >
                {columns.map((c) => renderCell(c, row))}
              </tr>
            ))}
            {virtual && end < rows.length && (
              <tr aria-hidden="true">
                <td colSpan={columns.length} style={{ height: (rows.length - end) * rowH, padding: 0, border: 0 }} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {options.showFooter && (
        <div className={styles.footer}>
          <span>
            {rows.length} {rows.length === 1 ? 'row' : 'rows'}
            {sortLabel ? ` · ${sortLabel}` : ''}
            {options.showCheckbox && selected.size > 0 ? ` · ${selected.size} selected` : ''}
          </span>
          <span>{refreshedAt ? `Refreshed ${dateTimeFormatTimeAgo(refreshedAt, { timeZone })}` : ''}</span>
        </div>
      )}
    </div>
  );

  function renderCell(c: Column, row: BarRow): React.ReactNode {
    switch (c.key) {
      case 'check':
        return (
          <td key={c.key} className={styles.checkbox}>
            <Checkbox
              value={selected.has(row.id)}
              onChange={() => toggleRow(row.id)}
              aria-label={`Select ${row.name}`}
            />
          </td>
        );
      case 'dot': {
        const color = row.status?.color ?? row.color;
        const icon = row.status?.icon && isIconName(row.status.icon) ? row.status.icon : undefined;
        return (
          <td key={c.key}>
            <span className={styles.statusCell} title={row.status?.text || undefined}>
              <span
                className={styles.dot}
                style={{ background: color, boxShadow: `0 0 6px ${color}66` }}
                data-testid="impact-dot"
              />
              {icon && <Icon name={icon} size="sm" />}
            </span>
          </td>
        );
      }
      case 'name':
        return (
          <td key={c.key} className={styles.name}>
            {row.link && SAFE_HREF.test(row.link.href) ? (
              <a href={row.link.href} target={row.link.target} rel="noreferrer" title={row.link.title}>
                {row.name}
              </a>
            ) : (
              row.name
            )}
            {row.subtitle && <small>{row.subtitle}</small>}
          </td>
        );
      case 'bar':
        return (
          <td key={c.key}>
            <RowBar row={row} options={options} animate={animate} styles={styles} />
          </td>
        );
      case 'time':
        return (
          <td key={c.key} className={styles.dim}>
            {row.time !== undefined ? dateTimeFormatTimeAgo(row.time, { timeZone }) : ''}
          </td>
        );
      default: {
        const idx = Number(String(c.key).slice('extra:'.length));
        const cell = row.extras[idx];
        return (
          <td
            key={c.key}
            className={cx(c.numeric ? styles.num : styles.dim)}
            style={cell?.color && c.numeric ? { color: cell.color } : undefined}
          >
            {cell?.text ?? ''}
          </td>
        );
      }
    }
  }
};
