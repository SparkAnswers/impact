import React, { useCallback, useMemo, useState } from 'react';
import { cx } from '@emotion/css';
import { dateTimeFormatTimeAgo, isIconName } from '@grafana/data';
import type { TimeZone } from '@grafana/schema';
import { Checkbox, ContextMenu, Icon, MenuItem, useStyles2, useTheme2 } from '@grafana/ui';
import type { BarRow, BarsModel, RowLink } from '../lib/rows';
import { sortRows, type SortKey, type SortState } from '../lib/sort';
import { DENSITY_ROW_HEIGHT, VIRTUALISE_THRESHOLD, type BarsOptions } from '../types';
import { RowBar } from './RowBar';
import { Sparkline } from './Sparkline';
import { getStyles, type BarsStyles } from './styles';
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

/** Links shown in the context menu (several data links on one field), anchored at a screen position. */
interface LinkMenu {
  x: number;
  y: number;
  label: string;
  links: RowLink[];
}

/** Click handler of an anchor whose link Grafana navigates itself (internal links); modifier clicks keep the browser behaviour. */
function linkOnClick(link: RowLink): React.MouseEventHandler | undefined {
  if (!link.onClick) {
    return undefined;
  }
  return (e) => {
    if (!(e.ctrlKey || e.metaKey || e.shiftKey)) {
      e.preventDefault();
      link.onClick?.(e);
    }
  };
}

interface CellLinkProps {
  /** Safe data links of the cell; without any the children render as they are. */
  links?: RowLink[];
  /** Row name, for the accessible label of the chevron. */
  label: string;
  /** Marks the name cell's anchor so the row-click mode can delegate to it. */
  role?: 'name';
  /** Block layout for cells whose content is a flex box (bar, status dot) instead of inline text. */
  block?: boolean;
  styles: BarsStyles;
  onMenu: (menu: LinkMenu) => void;
  children: React.ReactNode;
}

/** Wraps a cell's content in its first data link; further links open a menu on right-click or through a chevron. */
const CellLink: React.FC<CellLinkProps> = ({ links, label, role, block, styles, onMenu, children }) => {
  if (!links || links.length === 0) {
    return <>{children}</>;
  }
  const first = links[0];
  const more = links.length > 1;
  const open = (x: number, y: number) => onMenu({ x, y, label, links });
  const anchor = (
    <a
      href={first.href}
      target={first.target}
      rel="noreferrer"
      title={first.title}
      className={cx(styles.cellLink, block && styles.cellLinkBlock)}
      data-link={role}
      onClick={linkOnClick(first)}
      onContextMenu={
        more
          ? (e) => {
              e.preventDefault();
              open(e.clientX, e.clientY);
            }
          : undefined
      }
    >
      {children}
    </a>
  );
  if (!more) {
    return anchor;
  }
  const chevron = (
    <button
      type="button"
      className={styles.more}
      aria-label={`More links for ${label}`}
      aria-haspopup="menu"
      title={`${links.length} links`}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        open(r.left, r.bottom);
      }}
    >
      <Icon name="angle-down" size="sm" />
    </button>
  );
  return block ? (
    <span className={styles.linkRow}>
      {anchor}
      {chevron}
    </span>
  ) : (
    <>
      {anchor}
      {chevron}
    </>
  );
};

/** Links of the bar cell: the field the cell shows wins (status for pills, sparkline for sparklines), then the value field. */
function barLinks(row: BarRow): RowLink[] | undefined {
  const { links } = row;
  switch (row.style) {
    case 'pill':
      return links.status ?? links.value;
    case 'sparkline':
      return links.sparkline ?? links.value;
    default:
      return links.value ?? links.status;
  }
}

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
  const [menu, setMenu] = useState<LinkMenu | undefined>();
  const closeMenu = useCallback(() => setMenu(undefined), []);

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

  // Row click mode: a click on the plain area of a row acts like a click on the name link, so Grafana's own link
  // handling (and the link's handler) applies; clicks on links, buttons and checkboxes inside the row keep their job.
  const rowClick = options.rowClick === 'name';
  const onRowClick = useCallback((e: React.MouseEvent<HTMLTableRowElement>) => {
    if ((e.target as HTMLElement).closest('a, button, input, label')) {
      return;
    }
    e.currentTarget.querySelector<HTMLAnchorElement>('a[data-link="name"]')?.click();
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
      className={cx(styles.root, background === 'solid' && styles.rootSolid, options.showFooter && styles.rootFooter)}
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
            {visible.map((row) => {
              const clickable = rowClick && !!row.links.name;
              return (
                <tr
                  key={row.id}
                  className={cx(
                    selected.has(row.id) && (glass ? styles.selectedGlass : styles.selected),
                    clickable && styles.rowLink
                  )}
                  style={{ height: rowH }}
                  onClick={clickable ? onRowClick : undefined}
                >
                  {columns.map((c) => renderCell(c, row))}
                </tr>
              );
            })}
            {virtual && end < rows.length && (
              <tr aria-hidden="true">
                <td colSpan={columns.length} style={{ height: (rows.length - end) * rowH, padding: 0, border: 0 }} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={closeMenu}
          renderHeader={() => <span className={styles.menuHeader}>{menu.label}</span>}
          renderMenuItems={() =>
            menu.links.map((l, i) => (
              <MenuItem key={i} label={l.title} url={l.href} target={l.target} onClick={linkOnClick(l)} />
            ))
          }
        />
      )}
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
    const linked = (links: RowLink[] | undefined, children: React.ReactNode, extra?: Partial<CellLinkProps>) => (
      <CellLink links={links} label={row.name} styles={styles} onMenu={setMenu} {...extra}>
        {children}
      </CellLink>
    );
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
            {linked(
              row.links.status,
              <span className={styles.statusCell} title={row.status?.text || undefined}>
                <span
                  className={styles.dot}
                  style={{ background: color, boxShadow: `0 0 6px ${color}66` }}
                  data-testid="impact-dot"
                />
                {icon && <Icon name={icon} size="sm" />}
              </span>,
              { block: true }
            )}
          </td>
        );
      }
      case 'name':
        return (
          <td key={c.key} className={styles.name}>
            {linked(row.links.name, row.name, { role: 'name' })}
            {row.subtitle && <small>{linked(row.links.subtitle, row.subtitle)}</small>}
          </td>
        );
      case 'bar':
        return (
          <td key={c.key}>
            {linked(barLinks(row), <RowBar row={row} options={options} animate={animate} styles={styles} />, {
              block: true,
            })}
          </td>
        );
      case 'time':
        return (
          <td key={c.key} className={styles.dim}>
            {row.time !== undefined ? linked(row.links.time, dateTimeFormatTimeAgo(row.time, { timeZone })) : ''}
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
            {cell
              ? linked(
                  row.links.extras[idx],
                  cell.series ? (
                    <span className={styles.sparkCell}>
                      <Sparkline values={cell.series} color={cell.color ?? row.color} width={56} height={16} className={styles.spark} />
                      <span>{cell.text}</span>
                    </span>
                  ) : (
                    cell.text
                  )
                )
              : ''}
          </td>
        );
      }
    }
  }
};
