import { requestLookup, requestPrefs, runtime, type PageMessage } from './lib/messages';
import { marketPrefsReady } from './lib/markets';
import { watchDom } from './lib/observe';
import { buildPanel, markPanelsLoading, mountFloating, removeMini, removePanels } from './lib/panel';
import { hashNameFromListingPath } from './lib/steam-page';
import type { PricePrefs } from './lib/config';

let prefs_promise: Promise<PricePrefs | null> | null = null;
function sitePrefs(): Promise<PricePrefs | null> {
  prefs_promise ??= requestPrefs().catch(() => null);
  return prefs_promise;
}

// The selected item's canonical (English) market_hash_name comes straight off
// the market link Steam renders inside the visible item-info pane - no request
// to anything. Other games' items link other appids (the /730/ segment gates to
// CS2), and non-marketable items have no market link (nor prices to show).
// The pane also links applied stickers/charms and container contents, but those
// all use opaque G-ids; the item's OWN "View in Community Market" link is the
// only one carrying the name-format URL - that's the discriminator.
function selectedListingPath(): string | null {
  for (const pane of Array.from(document.querySelectorAll<HTMLElement>('#iteminfo0, #iteminfo1'))) {
    if (pane.offsetParent === null) continue;
    for (const link of Array.from(pane.querySelectorAll<HTMLAnchorElement>('a[href*="/market/listings/730/"]'))) {
      try {
        const path = new URL(link.href).pathname;
        const seg = path.match(/\/market\/listings\/730\/([^/?#]+)/)?.[1];
        if (!seg || /^G[0-9A-Z]+$/i.test(decodeURIComponent(seg))) continue;
        return path;
      } catch { /* malformed href - skip */ }
    }
    return null;
  }
  return null;
}

let selection_token = 0;
// Last selected item's market name, served to the popup's current_item query.
let current_item_name: string | null = null;

// Same floating panel as on the market pages - Steam's inventory layout stays
// untouched, and the collapse-to-logo state is shared across both.
async function onSelection(listing_path: string | null): Promise<void> {
  const token = ++selection_token;
  if (!listing_path) {
    current_item_name = null;
    removePanels();
    removeMini();
    return;
  }
  markPanelsLoading();

  const name = hashNameFromListingPath(listing_path);
  if (!name) {
    current_item_name = null;
    removePanels();
    removeMini();
    return;
  }
  current_item_name = name;

  const [data, prefs] = await Promise.all([requestLookup(name), sitePrefs(), marketPrefsReady()]);
  if (token !== selection_token) return;
  removePanels();
  const panel = buildPanel(data, 'inventory', prefs, name, () => {
    void onSelection(listing_path);
  });
  if (!panel) return;
  mountFloating(panel);
}

let current_listing_path: string | null = null;

function checkSelection(): void {
  const listing_path = selectedListingPath();
  if (listing_path === current_listing_path) return;
  current_listing_path = listing_path;
  void onSelection(listing_path);
}

// Selecting an item rerenders the visible info pane, so a document-wide
// mutation watch catches every selection change (clicks, keyboard, game
// switches) without hooking Steam's internals.
watchDom(checkSelection);

// Popup asks what this page is showing (chrome.tabs.sendMessage from popup.ts).
// The profile segment rides along even with nothing selected, so the popup can
// deep-link the inventory-value calculator to this inventory's owner.
const profile_seg = location.pathname.match(/^\/(?:id|profiles)\/([^/]+)/)?.[1];
runtime.runtime.onMessage.addListener((msg: PageMessage, _sender, sendResponse) => {
  if (msg.type === 'current_item') {
    sendResponse({
      ...(current_item_name && { name: current_item_name }),
      ...(profile_seg && { profile: profile_seg }),
    });
  }
  return undefined;
});
