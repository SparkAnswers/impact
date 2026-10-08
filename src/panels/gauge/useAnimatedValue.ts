import { useEffect, useRef, useState } from 'react';

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Eases from the previously displayed value to `target` over `duration` ms using
 * requestAnimationFrame. Falls back to the raw target when animation is disabled (the caller
 * resolves the reduced-motion preference through `useMotionAllowed`) or the document is hidden.
 * Stops on unmount.
 */
export function useAnimatedValue(target: number | null, enabled: boolean, duration: number): number | null {
  const [displayed, setDisplayed] = useState<number | null>(target);
  const current = useRef<number | null>(target);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const cancel = () => {
      if (raf.current !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(raf.current);
      }
      raf.current = null;
    };
    const canAnimate =
      enabled &&
      duration > 0 &&
      target !== null &&
      current.current !== null &&
      typeof requestAnimationFrame === 'function' &&
      !(typeof document !== 'undefined' && document.hidden);

    cancel();
    if (!canAnimate) {
      current.current = target;
      setDisplayed(target);
      return cancel;
    }

    const from = current.current!;
    const to = target!;
    if (Math.abs(to - from) < 1e-9) {
      setDisplayed(to);
      return cancel;
    }
    let start: number | null = null;
    const tick = (now: number) => {
      if (typeof document !== 'undefined' && document.hidden) {
        current.current = to;
        setDisplayed(to);
        raf.current = null;
        return;
      }
      if (start === null) {
        start = now;
      }
      const t = Math.min(1, (now - start) / duration);
      const v = from + (to - from) * easeOutCubic(t);
      current.current = v;
      setDisplayed(v);
      if (t < 1) {
        raf.current = requestAnimationFrame(tick);
      } else {
        raf.current = null;
      }
    };
    raf.current = requestAnimationFrame(tick);
    return cancel;
  }, [target, enabled, duration]);

  return displayed;
}
