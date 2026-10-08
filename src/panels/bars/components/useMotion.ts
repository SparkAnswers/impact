import { useEffect, useState } from 'react';

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

/**
 * True when animations should run: the Animation option is on, the user does not prefer reduced motion
 * and the document is visible. Listens for changes to both conditions.
 */
export function useMotionEnabled(enabled: boolean): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.hidden);

  useEffect(() => {
    const mq =
      typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : undefined;
    const onMq = () => setReduced(!!mq?.matches);
    const onVis = () => setHidden(document.hidden);
    mq?.addEventListener?.('change', onMq);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      mq?.removeEventListener?.('change', onMq);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  return enabled && !reduced && !hidden;
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
