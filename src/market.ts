import { requestLookup, requestPrefs, runtime, type LookupOpts, type PageMessage } from './lib/messages';
import { marketPrefsReady } from './lib/markets';
import { watchUrl } from './lib/observe';
import { buildPanel, markPanelsLoading, mountFloating, removeMini, removePanels } from './lib/panel';
import { hashNameFromScripts, hashNameFromListingPath } from './lib/steam-page';
import type { PricePrefs } from './lib/config';

let prefs_promise: Promise<PricePrefs | null> | null = null;
function sitePrefs(): Promise<PricePrefs | null> {
  prefs_promise ??= requestPrefs().catch(() => null);
  return prefs_promise;
}

// The beta page's condition switcher writes plain query params; passed to the
// backend they narrow the family aggregation to that exterior/variant.
function steamFilters(): LookupOpts {
  const params = new URLSearchParams(location.search);
  return {
    exterior: params.get('category_Exterior') ?? undefined,
    quality: params.get('category_Quality') ?? undefined,
  };
}

let current_name: string | null = null;
let shown_key: string | null = null;

// A name-format path is the legacy layout: one exact market_hash_name per page
// (with beta enabled Steam 301s name URLs to G-ids, so a surviving name path
// means legacy). A G-id path is the beta, which aggregates the whole skin
// family and narrows through query facets. Layout switches always reload, so
// the path format is stable for the page's lifetime.
function isExactListing(): boolean {
  return hashNameFromListingPath(location.pathname) !== null;
}

async function showPanel(name: string): Promise<void> {
  const opts: LookupOpts = isExactListing() ? {} : { family: true, ...steamFilters() };
  const key = `${name}|${opts.exterior ?? ''}|${opts.quality ?? ''}`;
  if (key === shown_key) return;
  shown_key = key;
  markPanelsLoading();
  const [data, prefs] = await Promise.all([requestLookup(name, opts), sitePrefs(), marketPrefsReady()]);
  if (key !== shown_key) return;
  removePanels();
  const panel = buildPanel(data, 'market_listing', prefs, name, () => {
    shown_key = null;
    void showPanel(name);
  });
  if (!panel) return;
  // Floating on every layout: the beta's hashed CSS-module class names leave no
  // safe in-flow anchor, and the legacy page has none either (#largeiteminfo
  // does not exist there - only #largeiteminfo_warning). One mount point, no
  // per-layout special case.
  mountFloating(panel);
}

// Initial extraction only on listing pages: the script now matches all of
// /market/* (the beta SPA needs it injected before the user reaches a listing),
// and market home/search pages inline other items' JSON too.
if (/\/market\/listings\/730\//.test(location.pathname)) {
  current_name = hashNameFromScripts() ?? hashNameFromListingPath(location.pathname);
  if (current_name) void showPanel(current_name);
}

// The beta market swaps the URL without a reload on condition switches (query
// facets change, same item). A path change without a reload would mean a new
// item with no local name source (the inline scripts keep the first item's
// JSON, and a G-id path carries no name), so the panel is cleared rather than
// risk showing the previous item's prices; every navigation observed so far is
// a full load, which re-injects this script and takes the initial extraction.
let current_path = location.pathname;
function refreshListing(): void {
  if (!/\/market\/listings\/730\//.test(location.pathname)) {
    current_name = null;
    shown_key = null;
    removePanels();
    removeMini();
    return;
  }
  if (location.pathname !== current_path) {
    current_path = location.pathname;
    current_name = hashNameFromListingPath(location.pathname);
  }
  if (current_name) {
    void showPanel(current_name);
  } else {
    // Unresolved listing: never leave the previous item's prices on screen.
    shown_key = null;
    removePanels();
    removeMini();
  }
}
watchUrl(refreshListing);

// Popup asks what this page is showing (chrome.tabs.sendMessage from popup.ts).
runtime.runtime.onMessage.addListener((msg: PageMessage, _sender, sendResponse) => {
  if (msg.type === 'current_item') {
    sendResponse(current_name ? { name: current_name, ...(isExactListing() ? {} : { family: true, ...steamFilters() }) } : null);
  }
  return undefined;
});
