import { SITE_URL, STATIC_URL, siteLink, formatPrice, type PricePrefs } from './lib/config';
import { t } from './lib/i18n';
import { isFavMarket, isHiddenMarket, marketPrefsReady, onMarketPrefsChange, orderMarkets, toggleFavMarket, toggleHiddenMarket } from './lib/markets';
import { isApiError, requestLookup, requestMarkets, requestPrefs, requestSearch, runtime, type CurrentItem, type MarketMeta, type PageMessage, type SearchResultRow, type SearchSection } from './lib/messages';
import { conditionLabel, gearGlyph, starGlyph } from './lib/panel';
import { hasAccess, requiredOrigins } from './lib/permissions';

// Static popup markup keeps English fallback text; localized strings replace
// it by key on load (data-i18n = textContent, -title also mirrors aria-label
// when one is present, -placeholder for inputs).
document.documentElement.lang = runtime.i18n.getUILanguage();
for (const node of Array.from(document.querySelectorAll<HTMLElement>('[data-i18n]'))) {
  node.textContent = t(node.dataset.i18n ?? '');
}
for (const node of Array.from(document.querySelectorAll<HTMLElement>('[data-i18n-title]'))) {
  node.title = t(node.dataset.i18nTitle ?? '');
  if (node.hasAttribute('aria-label')) node.setAttribute('aria-label', node.title);
}
for (const node of Array.from(document.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]'))) {
  node.placeholder = t(node.dataset.i18nPlaceholder ?? '');
}

let prefs: PricePrefs | null = null;
const prefs_ready: Promise<void> = requestPrefs().then((p) => {
  prefs = p;
}).catch(() => { /* prices fall back to USD */ });

const access_el = document.getElementById('access') as HTMLElement;
const input = document.getElementById('q') as HTMLInputElement;
const current_el = document.getElementById('current') as HTMLElement;
const results = document.getElementById('results') as HTMLElement;

document.getElementById('brand-link')?.setAttribute('href', siteLink('/', 'popup'));
document.getElementById('open-site')?.setAttribute('href', siteLink('/', 'popup'));
for (const link of Array.from(document.querySelectorAll<HTMLAnchorElement>('a[data-path]'))) {
  link.href = siteLink(link.dataset.path ?? '/', 'popup');
}

// Site access can be revoked per site in Firefox, and hosts added by an update
// start off. With them off nothing works: the API calls are CORS-blocked and no
// panel is injected on Steam, so this popup is the only surface left to say so.
async function showAccessBanner(): Promise<void> {
  if (await hasAccess()) return;

  const box = document.createElement('div');
  box.className = 'access';
  const text = document.createElement('p');
  text.textContent = t('popup_no_access');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = t('access_turn_on');
  btn.addEventListener('click', () => {
    // Called straight from the click: both browsers only prompt on a gesture.
    runtime.permissions.request({ origins: requiredOrigins() }).then((granted) => {
      text.textContent = granted
        ? t('popup_access_granted')
        : `${t('popup_access_still_off')} ${t('popup_manual_hint')}`;
      if (granted) btn.remove();
    }).catch(() => {
      text.textContent = `${t('popup_access_no_prompt')} ${t('popup_manual_hint')}`;
      btn.remove();
    });
  });
  box.append(text, btn);
  access_el.replaceChildren(box);
}

void showAccessBanner();

// Settings card: the header gear swaps the search view for it, so future
// options get a place to live without crowding the search list.
const search_view = document.getElementById('search-view') as HTMLElement;
const settings_view = document.getElementById('settings-view') as HTMLElement;
const gear = document.getElementById('gear') as HTMLButtonElement;
gear.appendChild(gearGlyph());

function showSettings(on: boolean): void {
  search_view.hidden = on;
  settings_view.hidden = !on;
  gear.setAttribute('aria-pressed', String(on));
  gear.title = t(on ? 'popup_back_to_search' : 'popup_settings');
  gear.setAttribute('aria-label', gear.title);
  // The search box autofocuses, so hand the caret over when the card takes over.
  if (on) input.blur();
  else input.focus();
}

gear.addEventListener('click', () => {
  showSettings(settings_view.hidden);
});

// The panel's gear opens this popup straight on the settings card: the
// background leaves a timestamp behind, which the popup consumes once. Stale
// markers (popup never opened) are dropped rather than acted on.
const SETTINGS_REQUEST_KEY = 'popup_settings_at';

runtime.storage.local.get(SETTINGS_REQUEST_KEY).then((stored) => {
  const at = stored[SETTINGS_REQUEST_KEY];
  if (typeof at !== 'number') return;
  void runtime.storage.local.remove(SETTINGS_REQUEST_KEY).catch(() => { /* honoured once either way */ });
  if (Date.now() - at < 60_000) showSettings(true);
}).catch(() => { /* popup just opens on search */ });

void prefs_ready.then(() => {
  const value = document.getElementById('prefs-value');
  if (value) value.textContent = `${(prefs?.lang ?? 'en').toUpperCase()} · ${prefs?.currency ?? 'USD'}`;
});

// Floating-panel corner picker. The value lives in extension storage; content
// scripts follow storage change events, so open Steam tabs move the panel the
// moment a corner is clicked here.
const POS_KEY = 'panel_pos';
const pos_grid = document.getElementById('pos-grid');

function markActivePos(pos: string): void {
  pos_grid?.querySelectorAll('button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.pos === pos);
  });
}

runtime.storage.local.get(POS_KEY).then((stored) => {
  markActivePos(typeof stored[POS_KEY] === 'string' ? stored[POS_KEY] as string : 'br');
}).catch(() => {
  markActivePos('br');
});

pos_grid?.addEventListener('click', (event) => {
  const pos = (event.target as HTMLElement).closest('button')?.dataset.pos;
  if (!pos) return;
  markActivePos(pos);
  void runtime.storage.local.set({ [POS_KEY]: pos }).catch(() => { /* picker still shows the choice */ });
  // Picking a corner also clears a dragged free position, so panels snap back.
  void runtime.storage.local.remove('panel_xy').catch(() => { /* corner class still applies */ });
});

// Marketplace list: one row per market the site prices, each with a star (pin
// it to the top of the Steam panel) and an eye (never show it again). The roster
// comes from the backend, so a new marketplace appears here without an extension
// release. Colour dots rather than the site's icon files: the same mark the
// panel uses, and nothing to load.
const SVG_NS = 'http://www.w3.org/2000/svg';

function eyeGlyph(off: boolean): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '-10 -10 20 20');
  svg.setAttribute('aria-hidden', 'true');
  const lid = document.createElementNS(SVG_NS, 'path');
  lid.setAttribute('d', 'M-9 0C-5-5.5 5-5.5 9 0 5 5.5-5 5.5-9 0Z');
  lid.setAttribute('fill', 'none');
  lid.setAttribute('stroke', 'currentColor');
  lid.setAttribute('stroke-width', '1.6');
  const pupil = document.createElementNS(SVG_NS, 'circle');
  pupil.setAttribute('r', '2.6');
  pupil.setAttribute('fill', 'currentColor');
  svg.append(lid, pupil);
  if (off) {
    const slash = document.createElementNS(SVG_NS, 'path');
    slash.setAttribute('d', 'M-7.5-7.5 7.5 7.5');
    slash.setAttribute('stroke', 'currentColor');
    slash.setAttribute('stroke-width', '1.8');
    slash.setAttribute('stroke-linecap', 'round');
    svg.appendChild(slash);
  }
  return svg;
}

const markets_el = document.getElementById('markets') as HTMLElement;
let market_list: MarketMeta[] | null = null;

function toggleButton(on: boolean, label: string, glyph: SVGSVGElement, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = on ? 'mk-btn on' : 'mk-btn';
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.setAttribute('aria-pressed', String(on));
  btn.appendChild(glyph);
  btn.addEventListener('click', onClick);
  return btn;
}

function marketRow(market: MarketMeta): HTMLElement {
  const fav = isFavMarket(market.name);
  const off = isHiddenMarket(market.name);

  const row = document.createElement('div');
  row.className = off ? 'mk-row off' : 'mk-row';
  const dot = document.createElement('i');
  dot.style.background = market.color;
  const name = document.createElement('span');
  name.textContent = market.title;

  const star = toggleButton(fav, t(fav ? 'popup_market_unpin' : 'popup_market_pin'), starGlyph(), () => {
    toggleFavMarket(market.name);
  });
  // A starred market keeps its own colour, so the list reads like the panel.
  if (fav) star.style.color = market.color;
  const eye = toggleButton(off, t(off ? 'popup_market_show' : 'popup_market_hide'), eyeGlyph(off), () => {
    toggleHiddenMarket(market.name);
  });

  row.append(dot, name, star, eye);
  return row;
}

function renderMarkets(): void {
  if (market_list) markets_el.replaceChildren(...market_list.map(marketRow));
}

void Promise.all([requestMarkets().catch(() => null), marketPrefsReady()]).then(([list]) => {
  if (!list?.length) {
    const note = document.createElement('p');
    note.className = 'hint';
    note.textContent = t('panel_api_error');
    markets_el.replaceChildren(note);
    return;
  }
  market_list = list;
  renderMarkets();
  onMarketPrefsChange(renderMarkets);
});

function rowHref(row: SearchResultRow): string | null {
  if (row.href) return row.href;
  if (row.type === 'paint') return `/skins/${row.sid}`;
  if (row.type === 'item') return `/items/${row.sid}`;
  if (row.type === 'collection') return `/collections/${row.sid}`;
  return null;
}

// Mirrors frontend getStaticImageUrl: bare hashes live on the static host at
// /img/<hash>.webp, values that are already a path or URL pass through.
function imgSrc(img: string | undefined): string | null {
  if (!img) return null;
  if (img.startsWith('http')) return img;
  if (img.startsWith('/')) return `${SITE_URL}${img}`;
  return `${STATIC_URL}/img/${img}.webp`;
}

function itemThumb(img: string | undefined): HTMLImageElement | null {
  const src = imgSrc(img);
  if (!src) return null;
  const thumb = document.createElement('img');
  thumb.src = src;
  thumb.alt = '';
  thumb.loading = 'lazy';
  // Keep the box on error so the row text never shifts.
  thumb.onerror = () => {
    thumb.style.visibility = 'hidden';
  };
  return thumb;
}

// When the active tab is a Steam listing/inventory page, its content script
// tells us what item it is showing; surface that right under the search box.
async function showCurrentItem(): Promise<void> {
  let current: CurrentItem;
  try {
    const [tab] = await runtime.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    current = await runtime.tabs.sendMessage(tab.id, { type: 'current_item' } satisfies PageMessage) as CurrentItem;
  } catch {
    return; // not a Steam page, or no content script there
  }
  if (!current) return;
  // On an inventory page the content script hands over the profile segment, so
  // the footer's calculator link targets that inventory's owner directly.
  if (current.profile) {
    const calc = document.querySelector<HTMLAnchorElement>('footer a[data-path="/tools/inventory-value-calculator"]');
    if (calc) calc.href = siteLink(`/tools/inventory-value-calculator/${encodeURIComponent(current.profile)}`, 'popup');
  }
  if (!current.name) return;
  const data = await requestLookup(current.name, current);
  await Promise.all([prefs_ready, marketPrefsReady()]);
  // An API error just leaves the row out - the popup has no error state.
  if (!data || isApiError(data) || data.kind === null || !data.href) return;

  const a = document.createElement('a');
  a.className = 'current';
  a.href = siteLink(data.href, 'popup');
  a.target = '_blank';
  a.rel = 'noopener';
  const thumb = itemThumb(data.img);
  if (thumb) a.appendChild(thumb);
  const text = document.createElement('span');
  text.className = 'cur-text';
  const name = document.createElement('span');
  name.className = 'cur-name';
  name.textContent = data.name ?? current.name ?? '';
  const sub = document.createElement('span');
  sub.className = 'cur-sub';
  // Exact matches carry the condition inside the name already; only the family
  // label ("Cheapest condition") adds information here.
  const cond = data.family ? conditionLabel(data) : null;
  sub.textContent = `${t('popup_on_this_page')}${cond ? ` · ${cond}` : ''}`;
  text.append(name, sub);
  a.appendChild(text);
  // Same ordering the panel uses, so the price quoted here is the one the
  // panel's top row shows.
  const best = orderMarkets(data.markets)[0];
  if (best) {
    const price = document.createElement('b');
    price.textContent = formatPrice(best.price, prefs);
    a.appendChild(price);
  }
  current_el.replaceChildren(a);
}

void showCurrentItem();

// Site listing behind each section's "More results" link.
const SECTION_MORE: Record<string, string> = {
  skins: '/skins',
  items: '/items',
  collections: '/collections',
};

// The backend labels search sections in English; known types map to local
// labels, a type this build doesn't know keeps the server's label.
const SECTION_LABELS: Record<string, string> = {
  skins: 'section_skins',
  items: 'section_items',
  collections: 'section_collections',
  weapons: 'section_weapons',
  families: 'section_families',
  phases: 'section_phases',
  updates: 'section_updates',
  blog: 'section_blog',
};

function render(sections: SearchSection[] | null, q: string): void {
  results.replaceChildren();
  if (!sections) return;
  for (const section of sections) {
    const rows = section.results.map((row) => ({ row, href: rowHref(row) })).filter((r) => r.href);
    if (!rows.length) continue;

    const label = document.createElement('div');
    label.className = 'section';
    const label_key = SECTION_LABELS[section.type];
    label.textContent = label_key ? t(label_key) : section.label;
    results.appendChild(label);

    for (const { row, href } of rows) {
      const a = document.createElement('a');
      a.className = 'result';
      a.href = siteLink(href!, 'popup');
      a.target = '_blank';
      a.rel = 'noopener';

      const thumb = itemThumb(row.img);
      if (thumb) a.appendChild(thumb);
      const name = document.createElement('span');
      name.textContent = row.name;
      a.appendChild(name);
      if (row.min_price) {
        const price = document.createElement('b');
        price.textContent = formatPrice(row.min_price, prefs);
        a.appendChild(price);
      }
      results.appendChild(a);
    }

    const more_path = SECTION_MORE[section.type];
    if (more_path && section.total > rows.length) {
      const more = document.createElement('a');
      more.className = 'more';
      more.href = siteLink(q ? `${more_path}?search=${encodeURIComponent(q)}` : more_path, 'popup');
      more.target = '_blank';
      more.rel = 'noopener';
      more.textContent = t('popup_more_results', String(section.total));
      results.appendChild(more);
    }
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;
let latest = 0;

// An empty query returns the site's default search content (newest skins/items),
// so the popup opens with something to click, like the on-site search box.
let default_sections: SearchSection[] | null = null;
async function showDefault(): Promise<void> {
  const token = ++latest;
  default_sections ??= await requestSearch('');
  await prefs_ready;
  if (token === latest) render(default_sections, '');
}

input.addEventListener('input', () => {
  clearTimeout(timer);
  const q = input.value.trim();
  if (q.length < 2) {
    void showDefault();
    return;
  }
  timer = setTimeout(() => {
    const token = ++latest;
    void requestSearch(q).then(async (sections) => {
      await prefs_ready;
      if (token === latest) render(sections, q);
    });
  }, 250);
});

void showDefault();
