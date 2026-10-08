import { useEffect, useState } from 'react';
import { type MotionPreference, useMotionAllowed } from '../../../shared/motion';

/**
 * True when animations should run: the Animation option is on, the Reduced motion preference allows it
 * (see `src/shared/motion.ts`) and the document is visible. Listens for changes to all conditions.
 */
export function useMotionEnabled(enabled: boolean, preference: MotionPreference | undefined): boolean {
  const allowed = useMotionAllowed(enabled, preference);
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.hidden);

  useEffect(() => {
    const onVis = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  return allowed && !hidden;
}

/** Re-renders the caller every `ms` milliseconds (used to keep relative times fresh). */
export function useTick(ms: number, active: boolean): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) {
      return;
    }
    const id = window.setInterval(() => setTick((t) => t + 1), ms);
    return () => window.clearInterval(id);
  }, [ms, active]);
  return tick;
}
