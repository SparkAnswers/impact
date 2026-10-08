import React from 'react';
import { act, render, renderHook, screen } from '@testing-library/react';
import { motionAllowed, pausedBySystem, systemPrefersReducedMotion, useMotionAllowed, useMotionState } from '../motion';
import { ReducedMotionHint } from '../ReducedMotionHint';

type Listener = (e: { matches: boolean }) => void;

/** Installs a controllable matchMedia mock; returns a setter that also fires change listeners. */
function mockMatchMedia(initial: boolean) {
  const listeners = new Set<Listener>();
  const mql = {
    matches: initial,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addEventListener: jest.fn((_: string, l: Listener) => listeners.add(l)),
    removeEventListener: jest.fn((_: string, l: Listener) => listeners.delete(l)),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    dispatchEvent: jest.fn(),
  };
  const matchMedia = jest.fn(() => mql);
  (window as unknown as { matchMedia: unknown }).matchMedia = matchMedia;
  return {
    mql,
    matchMedia,
    set(matches: boolean) {
      mql.matches = matches;
      listeners.forEach((l) => l({ matches }));
    },
  };
}

describe('motionAllowed (pure)', () => {
  it('is false when animation is off regardless of preference', () => {
    expect(motionAllowed(false, 'always', false)).toBe(false);
    expect(motionAllowed(false, 'system', false)).toBe(false);
  });
  it('never → false, always → true, independent of the system query', () => {
    expect(motionAllowed(true, 'never', false)).toBe(false);
    expect(motionAllowed(true, 'always', true)).toBe(true);
  });
  it('system (and undefined) follow the query', () => {
    expect(motionAllowed(true, 'system', true)).toBe(false);
    expect(motionAllowed(true, 'system', false)).toBe(true);
    expect(motionAllowed(true, undefined, true)).toBe(false);
  });
  it('reads matchMedia when the system flag is omitted', () => {
    mockMatchMedia(true);
    expect(systemPrefersReducedMotion()).toBe(true);
    expect(motionAllowed(true, 'system')).toBe(false);
    expect(motionAllowed(true, 'always')).toBe(true);
  });
  it('pausedBySystem is true only for system + reduce + animation on', () => {
    expect(pausedBySystem(true, 'system', true)).toBe(true);
    expect(pausedBySystem(true, 'always', true)).toBe(false);
    expect(pausedBySystem(true, 'never', true)).toBe(false);
    expect(pausedBySystem(false, 'system', true)).toBe(false);
    expect(pausedBySystem(true, 'system', false)).toBe(false);
  });
});

describe('useMotionAllowed', () => {
  it('follows the media query and its change events in system mode', () => {
    const mm = mockMatchMedia(false);
    const { result } = renderHook(() => useMotionAllowed(true, 'system'));
    expect(result.current).toBe(true);
    expect(mm.mql.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    act(() => mm.set(true));
    expect(result.current).toBe(false);
    act(() => mm.set(false));
    expect(result.current).toBe(true);
  });
  it('removes the listener on unmount', () => {
    const mm = mockMatchMedia(false);
    const { unmount } = renderHook(() => useMotionAllowed(true, 'system'));
    unmount();
    expect(mm.mql.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
  it('ignores the query for always / never and animation off', () => {
    mockMatchMedia(true);
    expect(renderHook(() => useMotionAllowed(true, 'always')).result.current).toBe(true);
    expect(renderHook(() => useMotionAllowed(true, 'never')).result.current).toBe(false);
    expect(renderHook(() => useMotionAllowed(false, 'always')).result.current).toBe(false);
    expect(renderHook(() => useMotionAllowed(true, 'system')).result.current).toBe(false);
  });
  it('works without matchMedia (SSR / old engines)', () => {
    (window as unknown as { matchMedia: unknown }).matchMedia = undefined;
    expect(renderHook(() => useMotionAllowed(true, 'system')).result.current).toBe(true);
  });
  it('useMotionState reports pausedBySystem', () => {
    mockMatchMedia(true);
    expect(renderHook(() => useMotionState(true, 'system')).result.current).toEqual({ allowed: false, pausedBySystem: true });
    expect(renderHook(() => useMotionState(true, 'always')).result.current).toEqual({ allowed: true, pausedBySystem: false });
  });
});

describe('ReducedMotionHint', () => {
  it('shows only when paused by the system and the panel is wide enough', () => {
    mockMatchMedia(true);
    const { rerender } = render(<ReducedMotionHint animationEnabled preference="system" width={300} />);
    expect(screen.getByTestId('impact-reduced-motion-hint')).toBeInTheDocument();
    rerender(<ReducedMotionHint animationEnabled preference="system" width={150} />);
    expect(screen.queryByTestId('impact-reduced-motion-hint')).toBeNull();
    rerender(<ReducedMotionHint animationEnabled preference="always" width={300} />);
    expect(screen.queryByTestId('impact-reduced-motion-hint')).toBeNull();
    rerender(<ReducedMotionHint animationEnabled={false} preference="system" width={300} />);
    expect(screen.queryByTestId('impact-reduced-motion-hint')).toBeNull();
  });
  it('is hidden when the system does not ask for reduced motion', () => {
    mockMatchMedia(false);
    render(<ReducedMotionHint animationEnabled preference="system" width={300} />);
    expect(screen.queryByTestId('impact-reduced-motion-hint')).toBeNull();
  });
});
