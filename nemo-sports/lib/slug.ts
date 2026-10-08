/**
 * Decode a dynamic route segment safely. Arabic slugs arrive percent-encoded
 * (e.g. %D9%86…) on some routes; stored slugs are plain Unicode. Malformed
 * input is returned unchanged rather than throwing.
 */
export function decodeSlug(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
