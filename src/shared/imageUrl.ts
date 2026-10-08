/**
 * Image URL policy shared by every panel that renders user-supplied images (Flow River background,
 * Flow Designer node images): only `http(s):` and `data:image/` sources are ever handed to the browser.
 */

/** Longest image URL accepted (inline data URLs for small icons fit comfortably). */
export const MAX_IMAGE_URL = 200_000;

/** Only http(s) and data:image URLs are allowed for images. */
export function isSafeImageUrl(url: string | undefined | null): boolean {
  const u = (url ?? '').trim();
  if (!u || u.length > MAX_IMAGE_URL) {
    return false;
  }
  return /^https?:\/\//i.test(u) || /^data:image\/(png|jpe?g|gif|webp|svg\+xml|avif);/i.test(u);
}

/** Trimmed URL when it is safe, otherwise `undefined` (never returns an empty string). */
export function safeImageUrl(url: unknown): string | undefined {
  if (typeof url !== 'string') {
    return undefined;
  }
  const u = url.trim();
  return isSafeImageUrl(u) ? u : undefined;
}
