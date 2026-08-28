# Changelog

## 0.2.1

- Marketplace list in the popup settings: star a market to pin it to the top of
  the price panel, or hide it so it never shows up.
- The colour dot in front of each price row is the same toggle - it turns into
  a star on hover, and stays lit once the market is pinned.

## 0.2.0

- Localized UI: the popup and the Steam page panel follow the browser UI
  language (en, pl, de, pt-BR, sv, zh-CN, es) via `_locales/`. Price data and
  currency keep following the skinsniper.com cookies, as before.
- Store name and summary come from the locale catalog
  (`__MSG_ext_name__` / `__MSG_ext_description__`).

## 0.1.1

- Popup settings card behind the header gear: the panel corner picker, the
  language and currency in use, and a link to change them on skinsniper.com.
- The panel's gear opens the popup on that card.

## 0.1.0

Initial release.

- Floating price panel on Steam Market listings (classic layout and Market
  Beta, including exterior/StatTrak facets on Beta family pages) and on Steam
  inventories (the selected item's own prices).
- Per-market price rows with the difference vs the Steam price, cheapest
  first; link to the item's skinsniper.com page.
- Toolbar popup: catalog search, current-tab item row, inventory value /
  trade-up / price comparison links, panel corner setting.
- Currency and language follow the user's skinsniper.com cookies.
- Popup warns when Firefox has site access switched off and can ask for it
  back in one click; the panel points there when a call is blocked.
- No requests to Steam servers; permissions: `cookies`, `storage`.
