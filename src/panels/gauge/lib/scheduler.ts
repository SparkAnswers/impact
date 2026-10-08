/**
 * One shared requestAnimationFrame loop for every gauge on the page. Subscribers are called with the
 * frame timestamp and the wall-clock time. The loop stops when nobody is subscribed and pauses while
 * the document is hidden (resuming on visibilitychange).
 */
export type FrameCallback = (frameTime: number, wallTime: number) => void;

const subscribers = new Set<FrameCallback>();
let handle: number | null = null;
let lastFrame = 0;
let listening = false;
/** Minimum frame spacing in ms (~60 fps cap). */
const MIN_FRAME_MS = 15;

const hasRaf = () => typeof requestAnimationFrame === 'function' && typeof cancelAnimationFrame === 'function';
const hidden = () => typeof document !== 'undefined' && document.hidden;

function frame(now: number) {
  handle = null;
  if (hidden() || subscribers.size === 0) {
    return;
  }
  if (now - lastFrame >= MIN_FRAME_MS) {
    lastFrame = now;
    const wall = Date.now();
    for (const cb of subscribers) {
      cb(now, wall);
    }
  }
  if (subscribers.size > 0 && handle === null) {
    handle = requestAnimationFrame(frame);
  }
}

function start() {
  if (handle === null && !hidden() && subscribers.size > 0 && hasRaf()) {
    handle = requestAnimationFrame(frame);
  }
}

function stop() {
  if (handle !== null && hasRaf()) {
    cancelAnimationFrame(handle);
  }
  handle = null;
}

function onVisibility() {
  if (hidden()) {
    stop();
  } else {
    start();
  }
}

/** Subscribes to the shared frame loop; returns the unsubscribe function. */
export function subscribeFrames(cb: FrameCallback): () => void {
  subscribers.add(cb);
  if (!listening && typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility);
    listening = true;
  }
  start();
  return () => {
    subscribers.delete(cb);
    if (subscribers.size === 0) {
      stop();
    }
  };
}

/** For tests. */
export function frameSubscriberCount(): number {
  return subscribers.size;
}
