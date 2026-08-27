# Privacy

This document describes everything the SkinSniper browser extension reads,
stores and transmits. The source code in this repository is the complete
extension; you can verify each claim against it.

## What the extension sends, and where

The extension talks to two hosts only: `api.skinsniper.com` and
`skinsniper.com`. It never sends requests to Steam or to any other third
party. The full list of requests (`src/background.ts`):

- `GET /extension/lookup?name=...` - the market name of the CS2 item on the
  Steam page you are viewing, plus its condition filters and your site
  language. Sent to fetch that item's marketplace prices.
- `GET /search?q=...` - the text you type into the toolbar popup's search box.
- `GET /config` - no parameters; returns currency conversion rates.

These requests carry no account identifiers, no cookies and no authentication.
Responses are cached in the extension's memory for a few minutes.

The Steam profile id in an inventory page's URL never leaves your browser: it
is only used to build the "Inventory value" link in the popup, which you may
or may not click.

## What the extension reads

- The DOM of Steam Market listing pages and Steam inventory pages you have
  open, to find the name of the item being shown. This happens locally; page
  content is not transmitted anywhere except as the single item name above.
- Two of your own `skinsniper.com` cookies: `currency` and `PARAGLIDE_LOCALE`,
  so panel prices match the currency and language you picked on the site. The
  extension has no permission to read cookies of Steam or any other site.

## What the extension stores

- `panel_pos` and `panel_xy` (extension storage): which screen corner you
  picked for the floating panel, and where you dragged it.
- `ssx_collapsed` (localStorage of the Steam page): whether you collapsed the
  panel. This value stays inside the Steam page's own storage.

Both are settings, stored locally, never transmitted.

## What the extension does not do

- No analytics, no telemetry, no error reporting.
- No reading of browsing history, tabs you are not using it on, or any page
  outside `steamcommunity.com/market` and `steamcommunity.com/.../inventory`.
- No requests to Steam servers.
- No accounts, no sign-in, nothing tied to your identity.

## Outbound links

Links from the panel and popup to `skinsniper.com` carry
`utm_source=extension` so site analytics can tell extension traffic from other
traffic. Marketplace links go through `skinsniper.com/ref/<market>` redirects;
these are affiliate links and are tracked server-side as a visit, with no data
about you beyond the visit itself.

## Contact

Questions: contact@skinsniper.com, or open an issue in this repository.
