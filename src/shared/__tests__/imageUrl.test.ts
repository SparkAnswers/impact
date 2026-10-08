import { isSafeImageUrl, MAX_IMAGE_URL, safeImageUrl } from '../imageUrl';

describe('isSafeImageUrl', () => {
  it('accepts http(s) and data:image URLs, case-insensitively and trimmed', () => {
    expect(isSafeImageUrl('https://example.test/a.png')).toBe(true);
    expect(isSafeImageUrl('HTTP://example.test/a.png')).toBe(true);
    expect(isSafeImageUrl('  data:image/svg+xml;base64,PHN2Zy8+ ')).toBe(true);
    expect(isSafeImageUrl('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
    expect(isSafeImageUrl('data:image/webp;base64,AA==')).toBe(true);
  });
  it('rejects other schemes, non-image data URLs, empty and oversized values', () => {
    expect(isSafeImageUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeImageUrl('data:text/html;base64,PHNjcmlwdD4=')).toBe(false);
    expect(isSafeImageUrl('data:image/svg+xml')).toBe(false); // no payload separator
    expect(isSafeImageUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeImageUrl('//example.test/a.png')).toBe(false);
    expect(isSafeImageUrl('/relative.png')).toBe(false);
    expect(isSafeImageUrl('')).toBe(false);
    expect(isSafeImageUrl(undefined)).toBe(false);
    expect(isSafeImageUrl(null)).toBe(false);
    expect(isSafeImageUrl(`https://x/${'a'.repeat(MAX_IMAGE_URL)}`)).toBe(false);
  });
});

describe('safeImageUrl', () => {
  it('returns the trimmed URL when safe and undefined otherwise', () => {
    expect(safeImageUrl(' https://example.test/a.png ')).toBe('https://example.test/a.png');
    expect(safeImageUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeImageUrl('')).toBeUndefined();
    expect(safeImageUrl(42)).toBeUndefined();
    expect(safeImageUrl(null)).toBeUndefined();
  });
});
