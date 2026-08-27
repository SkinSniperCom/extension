// Steam market listing pages inline the item JSON into the initial HTML at
// varying escape depths (the React "Market Beta" serializes JSON-in-JSON). This
// pulls the first market_hash_name out of such text - the page's own item is
// serialized before the related-items rails.
const HASH_NAME_RE = /market_hash_name(\\{0,3})":\1"(.*?)\1"/;

export function listingHashName(text: string): string | null {
  const m = text.match(HASH_NAME_RE);
  if (!m?.[2]) return null;
  return m[2].replace(/\\+u([0-9a-fA-F]{4})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}
