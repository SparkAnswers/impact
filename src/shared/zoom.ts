/** Session zoom and pan shared by the Flow Designer and the Flow River: a viewport in panel pixels. */

export interface ZoomViewport {
  x: number;
  y: number;
  zoom: number;
}

/** Far enough out for graphs of several hundred nodes to fit a panel. */
export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 4;

/**
 * Zoom a viewport by `factor` keeping the canvas point under the pointer (px, py in panel pixels) fixed.
 * Zoom is clamped to MIN_ZOOM..MAX_ZOOM and rounded to 3 decimals.
 */
export function zoomAt(vp: ZoomViewport, px: number, py: number, factor: number, max = MAX_ZOOM): ZoomViewport {
  const zoom = Math.round(Math.min(max, Math.max(MIN_ZOOM, vp.zoom * factor)) * 1000) / 1000;
  const k = zoom / vp.zoom;
  return { x: px - (px - vp.x) * k, y: py - (py - vp.y) * k, zoom };
}

/**
 * Zoom factor for one wheel event. Deltas are normalised to pixels (Firefox reports lines or pages), one
 * mouse notch (~100 px) gives the same ×1.25 / ×0.8 step as the +/− buttons, and a single event is capped so
 * a flicked wheel cannot jump from fitted to fully zoomed. Trackpad pinches arrive as Ctrl + wheel with
 * small deltas and get a steeper curve so a pinch still feels direct.
 */
export function wheelZoomFactor(e: { deltaY: number; deltaMode: number; ctrlKey: boolean }, pageHeight: number): number {
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? Math.max(1, pageHeight) : 1;
  const dy = Math.max(-300, Math.min(300, e.deltaY * unit));
  const k = e.ctrlKey && Math.abs(dy) < 20 ? 0.004 : 0.00223;
  return Math.exp(-dy * k);
}

/** Whether a wheel event should zoom in view mode: Ctrl / ⌘ held (also trackpad pinch), or the panel is viewed alone. */
export function wheelZooms(e: { ctrlKey: boolean; metaKey: boolean }, alone: boolean): boolean {
  return e.ctrlKey || e.metaKey || alone;
}

/** A panel resize of more than 20 % in either direction: a session zoom made for the old size is dropped. */
export function bigResize(prev: { width: number; height: number }, next: { width: number; height: number }): boolean {
  return Math.abs(next.width - prev.width) > prev.width * 0.2 || Math.abs(next.height - prev.height) > prev.height * 0.2;
}

export const ZOOM_HINT_VIEW = 'Ctrl + scroll (⌘ on Mac) or pinch to zoom at the pointer · drag to pan · double-click empty space to fit';
