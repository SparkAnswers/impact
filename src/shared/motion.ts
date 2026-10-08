import { useEffect, useState } from 'react';

/**
 * How a panel treats the operating system's "reduce motion" preference.
 * - `system`: follow `prefers-reduced-motion: reduce` (default).
 * - `always`: animate even when the system asks for reduced motion.
 * - `never`: never animate.
 */
export type MotionPreference = 'system' | 'always' | 'never';

export const DEFAULT_MOTION_PREFERENCE: MotionPreference = 'system';

/** Select choices for the shared "Reduced motion" panel option. */
export const MOTION_PREFERENCE_CHOICES: Array<{ value: MotionPreference; label: string }> = [
  { value: 'system', label: 'Follow system setting' },
  { value: 'always', label: 'Always animate' },
  { value: 'never', label: 'Never animate' },
];

/** Shared description for the "Reduced motion" panel option. */
export const MOTION_PREFERENCE_DESCRIPTION =
  "Follow system setting pauses animation when the operating system asks for reduced motion (a small pause icon shows in the panel corner). Always animate ignores that setting; Never animate keeps the panel static.";

const QUERY = '(prefers-reduced-motion: reduce)';

function mediaQuery(): MediaQueryList | undefined {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return undefined;
  }
  try {
    return window.matchMedia(QUERY) ?? undefined;
  } catch {
    return undefined;
  }
}

/** Current value of the system "reduce motion" media query (false when unavailable). */
export function systemPrefersReducedMotion(): boolean {
  return !!mediaQuery()?.matches;
}

/**
 * Pure decision used by both the hook and non-React code: whether motion may run.
 * `systemReduced` is the current state of the reduce-motion media query.
 */
export function motionAllowed(
  animationEnabled: boolean,
  preference: MotionPreference | undefined,
  systemReduced: boolean = systemPrefersReducedMotion()
): boolean {
  if (!animationEnabled) {
    return false;
  }
  switch (preference ?? DEFAULT_MOTION_PREFERENCE) {
    case 'always':
      return true;
    case 'never':
      return false;
    default:
      return !systemReduced;
  }
}

/** True only when motion is blocked purely by the system preference (preference `system` and the query matches). */
export function pausedBySystem(
  animationEnabled: boolean,
  preference: MotionPreference | undefined,
  systemReduced: boolean = systemPrefersReducedMotion()
): boolean {
  return animationEnabled && (preference ?? DEFAULT_MOTION_PREFERENCE) === 'system' && systemReduced;
}

/** Tracks the reduce-motion media query, re-rendering on change. */
export function useSystemReducedMotion(): boolean {
  const [reduced, setReduced] = useState(systemPrefersReducedMotion);
  useEffect(() => {
    const mq = mediaQuery();
    if (!mq) {
      return;
    }
    const onChange = () => setReduced(!!mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

export interface MotionState {
  /** Motion may run (animation on, and the preference / system allow it). */
  allowed: boolean;
  /** Motion is off only because the system asks for reduced motion and the panel follows it. */
  pausedBySystem: boolean;
}

/** Hook form of `motionAllowed` + `pausedBySystem` that follows media-query changes. */
export function useMotionState(animationEnabled: boolean, preference: MotionPreference | undefined): MotionState {
  const reduced = useSystemReducedMotion();
  return {
    allowed: motionAllowed(animationEnabled, preference, reduced),
    pausedBySystem: pausedBySystem(animationEnabled, preference, reduced),
  };
}

/**
 * React hook: false when animation is off or the preference is `never`; true when `always`;
 * otherwise follows `prefers-reduced-motion: reduce` (with a change listener).
 */
export function useMotionAllowed(animationEnabled: boolean, preference: MotionPreference | undefined): boolean {
  return useMotionState(animationEnabled, preference).allowed;
}
