export type SecondaryReducer = 'mean' | 'last' | 'min' | 'max' | 'sum' | 'range';

export const REDUCER_OPTIONS: Array<{ value: SecondaryReducer; label: string }> = [
  { value: 'mean', label: 'Mean' },
  { value: 'last', label: 'Last' },
  { value: 'min', label: 'Min' },
  { value: 'max', label: 'Max' },
  { value: 'sum', label: 'Sum' },
  { value: 'range', label: 'Range' },
];

/** Reduces a list of numbers (nulls/NaN ignored). Returns null when there is nothing to reduce. */
export function reduceValues(values: Array<number | null | undefined>, reducer: SecondaryReducer): number | null {
  const xs: number[] = [];
  for (const v of values) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      xs.push(v);
    }
  }
  if (xs.length === 0) {
    return null;
  }
  switch (reducer) {
    case 'last':
      return xs[xs.length - 1];
    case 'min':
      return Math.min(...xs);
    case 'max':
      return Math.max(...xs);
    case 'sum':
      return xs.reduce((a, b) => a + b, 0);
    case 'range':
      return Math.max(...xs) - Math.min(...xs);
    case 'mean':
    default:
      return xs.reduce((a, b) => a + b, 0) / xs.length;
  }
}
