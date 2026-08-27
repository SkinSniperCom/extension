// Synced verbatim from the SkinSniper monorepo (common/extension.ts) by
// scripts/sync-shared.ts - edit the original there, not this copy.

// Shared response shapes for the browser-extension API (backend route/extension.ts).
// The extension bundle imports these type-only, so keep this file free of value
// imports - anything pulled in here would ship inside the extension.

export type ExtensionMarketRow = {
  id: number,
  name: string,
  title: string,
  color: string,
  // Site-relative icon path (/img/market/*.svg), prefix with the site origin.
  icon: string,
  // milliUSD (1500 = $1.50), matching the rest of the API.
  price: number,
  // Site-relative affiliate redirect (/ref/<market>?...), prefix with the site origin.
  ref: string,
};

export type ExtensionLookup = {
  kind: 'skin' | 'item' | null,
  // Set when the response aggregates a whole paint (Steam's Market Beta shows one
  // page per skin family): prices are per-market minimums across exteriors.
  family?: boolean,
  // Skin condition, when every priced row shares one: full exterior name
  // ("Field-Tested"), or "Vanilla" for paintless knives.
  exterior?: string,
  variant?: 'stattrak' | 'souvenir',
  // Canonical English market_hash_name of the matched catalog entity.
  name?: string,
  // Localized site-relative path to the skin/item page.
  href?: string,
  // Image hash servable as <site>/img/<hash>.webp (full paths/URLs pass through as-is).
  img?: string,
  // Only markets with a live price, cheapest first.
  markets: ExtensionMarketRow[],
};
