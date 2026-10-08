import type { BarRow } from './rows';

export type SortKey = 'name' | 'value' | 'status' | 'time' | `extra:${number}`;

export interface SortState {
  key: SortKey;
  desc: boolean;
}

function cellValue(row: BarRow, key: SortKey): string | number | undefined {
  switch (key) {
    case 'name':
      return row.name;
    case 'value':
      return row.value;
    case 'status':
      return row.status?.text ?? '';
    case 'time':
      return row.time;
    default: {
      const idx = Number(key.slice('extra:'.length));
      const cell = row.extras[idx];
      if (!cell) {
        return undefined;
      }
      return typeof cell.numeric === 'number' && Number.isFinite(cell.numeric) ? cell.numeric : cell.text;
    }
  }
}

function compare(a: string | number | undefined, b: string | number | undefined): number {
  const aMissing = a === undefined || a === null || (typeof a === 'number' && Number.isNaN(a));
  const bMissing = b === undefined || b === null || (typeof b === 'number' && Number.isNaN(b));
  if (aMissing && bMissing) {
    return 0;
  }
  if (aMissing) {
    return 1;
  }
  if (bMissing) {
    return -1;
  }
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

/** Returns a new, stably sorted array of rows (missing values always sort last). */
export function sortRows(rows: BarRow[], sort: SortState | undefined): BarRow[] {
  if (!sort) {
    return rows;
  }
  const indexed = rows.map((row, i) => ({ row, i }));
  indexed.sort((x, y) => {
    const a = cellValue(x.row, sort.key);
    const b = cellValue(y.row, sort.key);
    const aMissing = a === undefined || (typeof a === 'number' && Number.isNaN(a));
    const bMissing = b === undefined || (typeof b === 'number' && Number.isNaN(b));
    // Missing values stay last regardless of direction
    if (aMissing !== bMissing) {
      return aMissing ? 1 : -1;
    }
    const c = compare(a, b);
    return (sort.desc ? -c : c) || x.i - y.i;
  });
  return indexed.map((x) => x.row);
}
