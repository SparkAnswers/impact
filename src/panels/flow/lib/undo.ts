/**
 * Minimal immutable undo/redo stack. Snapshots are treated as opaque values.
 */
export interface UndoState<T> {
  past: T[];
  future: T[];
}

export const UNDO_CAP = 50;

export const emptyUndo = <T>(): UndoState<T> => ({ past: [], future: [] });

/** Record `snapshot` (the state *before* a change) and clear the redo stack. */
export function pushUndo<T>(state: UndoState<T>, snapshot: T, cap = UNDO_CAP): UndoState<T> {
  const past = [...state.past, snapshot];
  if (past.length > cap) {
    past.splice(0, past.length - cap);
  }
  return { past, future: [] };
}

/** Pop the last snapshot. `current` is pushed on the redo stack. */
export function undo<T>(state: UndoState<T>, current: T): { state: UndoState<T>; value: T } | undefined {
  if (!state.past.length) {
    return undefined;
  }
  const past = state.past.slice(0, -1);
  const value = state.past[state.past.length - 1];
  return { state: { past, future: [current, ...state.future] }, value };
}

export function redo<T>(state: UndoState<T>, current: T): { state: UndoState<T>; value: T } | undefined {
  if (!state.future.length) {
    return undefined;
  }
  const [value, ...future] = state.future;
  return { state: { past: [...state.past, current], future }, value };
}
