# SkinSniper - CS2 Skin Price Checker for Steam

Browser extension (Chrome and Firefox, Manifest V3) that shows CS2 marketplace
prices directly on Steam: a floating panel on Steam Market listings and Steam
inventories with the item's prices across marketplaces, each one's difference
vs the Steam price, and a link to the item's page on
[skinsniper.com](https://skinsniper.com).

## What it does

- **Market listings** - prices for the exact skin and condition on the page.
  Works on both the classic market layout and the React "Market Beta"; on Beta
  family pages it follows the exterior/StatTrak filters you pick.
- **Inventories** - select an item in any public inventory and the panel shows
  its prices; the popup links the inventory value calculator for that profile.
- **Toolbar popup** - catalog search, the item from the current tab, links to
  the trade-up and price comparison tools, and the panel position setting; the
  panel can also be dragged anywhere on the page.
- Prices show in the currency and language you picked on skinsniper.com.

## Design rules

- **No requests to Steam.** Item names are read from the DOM of the page you
  already have open (inline listing JSON on market pages, the item's own
  market link in the inventory pane). The only network traffic goes to
  `api.skinsniper.com` and `skinsniper.com`.
- **Thin client.** All matching, pricing and link logic lives in the backend
  (`GET /extension/lookup`), so catalog changes never require an extension
  release.
- **Two permissions** (`cookies`, `storage`), neither of which triggers an
  install warning. `cookies` reads the user's own currency/language cookies
  from skinsniper.com and can not read Steam's cookies (no host permission for
  Steam). No analytics, no telemetry. Details in [PRIVACY.md](PRIVACY.md).

## Building from source

Requires [Bun](https://bun.sh) >= 1.2. From the repository root:

```bash
bun install
bun run build            # Chrome  -> dist/
bun run build:firefox    # Firefox -> dist-firefox/
bun run package          # store-ready zips -> release/
```

The build bundles `src/` with `Bun.build` (iife, no minification) and emits a
per-browser `manifest.json`. Store builds use the default production URLs; the
`SS_API_URL` / `SS_SITE_URL` / `SS_STATIC_URL` env vars point a build at a
development backend (`host_permissions` in the built manifest follow
`SS_API_URL`).

`bun run package` builds both browsers with those overrides stripped from the
environment, verifies the built manifests point at the production API, and
zips them into `release/skinsniper-steam-extension-<version>-{chrome,firefox}.zip`
(the files Chrome Web Store and AMO submissions take). It builds into temp
dirs, so `dist/` and `dist-firefox/` are untouched.

Checks:

```bash
bun run ts       # type check (tsc)
bun run lint     # eslint
```

## Load unpacked

- Chrome: `chrome://extensions` -> Developer mode -> Load unpacked -> `dist/`
- Firefox: `about:debugging#/runtime/this-firefox` -> Load Temporary Add-on ->
  `dist-firefox/manifest.json`

Firefox MV3 treats `host_permissions` as optional and does NOT grant them at
install: enable the API host under about:addons -> this extension ->
Permissions, or the background fetches silently fail.

## Layout

- `src/background.ts` - service worker; the only thing that talks to the API
  (host-permission fetches bypass CORS), with a small in-memory cache and the
  site-prefs (cookie language/currency + `/config` rates) reader
- `src/market.ts` - content script for `/market/listings/730/*`; handles both
  the legacy layout and the React Market Beta (SPA URL watcher, condition
  facets)
- `src/inventory.ts` - content script for `/id|profiles/*/inventory*`; follows
  the visible item-info pane's own market link for the selected item
- `src/popup.ts|html|css` - toolbar popup: search, current-tab item, settings,
  tool links
- `src/lib/panel.ts` - shared floating-panel DOM (no external images: Steam's
  CSP must not be able to break it)
- `src/shared/` - API response types and currency locales shared with the
  SkinSniper backend (kept in sync by `scripts/sync-shared.ts`)
- `_locales/` - UI translations (en, pl, de, pt-BR, sv, zh-CN, es), picked by
  the browser UI language; `bun run check-locales` validates them against `en`
  (key set, placeholders, store character limits)
- `build.ts` - Bun bundler; also emits the per-browser manifest
- `store/` - store listing texts and screenshots; kept out of the repo (see
  `.gitignore`) and not part of the build

## Trademarks

The code is MIT licensed (see [LICENSE](LICENSE)). The SkinSniper name and
logo (`assets/logo.svg`, `icons/`) are trademarks of SkinSniper and are not
covered by the code license: forks published to extension stores must use
their own name and icons.

Not affiliated with Valve Corporation. Steam and Counter-Strike are trademarks
of Valve Corporation.
