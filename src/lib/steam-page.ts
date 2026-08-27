import { listingHashName } from './steam-listing';

// Steam serves the CS2 market in two skins: the legacy PHP layout (stable ids like
// #largeiteminfo, item name in the URL) and the React "Market Beta" (opaque
// /market/listings/730/G... ids, hashed CSS-module class names, no usable globals
// from the isolated world). Both inline the item JSON into the initial HTML, so
// the market_hash_name is recoverable from the DOM's script text - no request to
// steamcommunity needed. First occurrence wins: the page's own item is serialized
// before the related-items rails.
export function hashNameFromScripts(): string | null {
  for (const script of Array.from(document.scripts)) {
    const name = listingHashName(script.textContent ?? '');
    if (name) return name;
  }
  return null;
}

// Beta listing ids look like G18BD283004; anything else in that path segment is a
// legacy URL still carrying the url-encoded market_hash_name itself.
export function hashNameFromListingPath(pathname: string): string | null {
  const seg = pathname.match(/\/market\/listings\/730\/([^/?#]+)/)?.[1];
  if (!seg) return null;
  const decoded = decodeURIComponent(seg);
  return /^G[0-9A-Z]+$/i.test(decoded) ? null : decoded;
}
