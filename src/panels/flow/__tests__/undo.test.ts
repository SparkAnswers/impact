import { emptyUndo, pushUndo, redo, undo } from '../lib/undo';

describe('undo stack', () => {
  it('undoes and redoes in order', () => {
    let s = emptyUndo<number>();
    s = pushUndo(s, 1);
    s = pushUndo(s, 2);
    const u1 = undo(s, 3)!;
    expect(u1.value).toBe(2);
    expect(u1.state.future).toEqual([3]);
    const u2 = undo(u1.state, u1.value)!;
    expect(u2.value).toBe(1);
    expect(undo(u2.state, 1)).toBeUndefined();
    const r1 = redo(u2.state, 1)!;
    expect(r1.value).toBe(2);
    const r2 = redo(r1.state, 2)!;
    expect(r2.value).toBe(3);
    expect(redo(r2.state, 3)).toBeUndefined();
  });
  it('clears redo on a new push', () => {
    let s = pushUndo(emptyUndo<number>(), 1);
    const u = undo(s, 2)!;
    s = pushUndo(u.state, 9);
    expect(s.future).toEqual([]);
  });
  it('caps history at 50', () => {
    let s = emptyUndo<number>();
    for (let i = 0; i < 80; i++) {
      s = pushUndo(s, i);
    }
    expect(s.past).toHaveLength(50);
    expect(s.past[0]).toBe(30);
  });
});
