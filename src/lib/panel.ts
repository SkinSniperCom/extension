import type { ExtensionLookup } from '../shared/extension';
import { formatPrice, siteLink, siteRawLink, type PricePrefs } from './config';
import { t } from './i18n';
import { isApiError, requestOpenPopup, runtime, type ApiError } from './messages';
import { clampPanelXY, panelPos, placeNode, savePanelXY } from './position';

const MAX_ROWS = 5;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text) node.textContent = text;
  return node;
}

// Small uppercase label above the price rows: the exact condition when the page
// (or its facet filters) pins one, "Cheapest condition" for a family aggregate.
export function conditionLabel(data: ExtensionLookup): string | null {
  if (data.kind !== 'skin') return null;
  const variant = data.variant === 'stattrak' ? 'StatTrak™' : data.variant === 'souvenir' ? 'Souvenir' : null;
  if (data.family && !data.exterior) return variant ? `${t('panel_cheapest_condition')} · ${variant}` : t('panel_cheapest_condition');
  const parts = [variant, data.exterior].filter(Boolean);
  return parts.length ? parts.join(' ') : null;
}

// The injected price panel, shared by the market and inventory content scripts.
// No external images on purpose: steamcommunity's CSP must not be able to break it.
const EXTERIOR_SUFFIX_RE = /\s*\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/;

// The brand mark lives on the bottom CTA: logo.svg's scope glyph cut to its
// 28x28 square (wordmark dropped), built with DOM APIs so nothing can block it,
// with currentColor following the button's green/white hover states.
const SVG_NS = 'http://www.w3.org/2000/svg';
const GLYPH_PATHS = [
  'm26.7 24-.4-.4h-.6s-.2 0-.3.2l.1-.3.1-.3V23h-.1l-.2-.3-.1-.1H25l-.2-.1h-.2l-.1.1c-.2 0-.3 0-.4.2l.1-.4.2-.2V22l-.1-.2-.3-.2-.1-.1-.2-.1h-.3v.1c-.2 0-.4 0-.5.2l.1-.3.2-.3v-.2l-.1-.1-.3-.3-.1-.1-.2-.1h-.3v.1c-.2 0-.4 0-.5.2l.2-.4.1-.2v-.4H22l-.2-.2-.1-.2H21l-.4.2.2-.3v-.6l-.2-.3-.2-.1-.2-.1H20v.1c-.2 0-.3 0-.4.2l.1-.4.1-.2v-.4l-.3-.2-.1-.2h-.6l-.4.2c.2-.2.2-.4 0-.6l-.7-.8.2-.4 1.8-1.8V13c-.1-.1-.3 0-.4 0l-1.8 1.8-.2.1-1-1-.8.2a.3.3 0 0 1-.3-.3c0-.1 0-.2.2-.3h.3l-.3-.2h-.7a.3.3 0 0 1-.4-.2l.3-.3h.3l-.2-.2h-.1l-.8.1a.3.3 0 0 1-.3-.2c0-.2 0-.3.2-.3h.4l-.2-.3-.6.1c-.2 0-.3 0-.4-.2 0-.1.1-.3.3-.3h.2l-.2-.2h-.7l-.3-.1c0-.2 0-.4.2-.4h.3l-.2-.2h-.7c-.2 0-.3 0-.3-.2 0-.1 0-.2.2-.3h.3l-.2-.2-.7.1c-.2 0-.3 0-.3-.2s0-.3.2-.3h.3l-.2-.3-.8.1c-.1 0-.3 0-.3-.2 0-.1 0-.3.2-.3h.5A70.2 70.2 0 0 1 8.2 6L2 1.7A12.1 12.1 0 0 0 5.6 9l8 7.7 1 .9 2.5-2.6-2.5 2.6-.2.1a.5.5 0 0 0-.1.3l-1.8 1.8c-.1.1-.1.3 0 .4.1.1.3.1.4 0l1.8-1.8s.2 0 .3-.2l.9.8h.5l.1-.2-.1.4-.2.2v.3h.1v.1h.1l.2.2.1.2h.6l.4-.2-.2.3-.1.3V20.9h.1v.1l.2.2.2.1v.1h.5v-.1c.2 0 .3 0 .4-.2l-.1.4-.2.2v.3h.1v.1l.2.2.2.2h.5l.5-.2-.2.3-.1.3V23.2l.1.1.2.2.1.1h.1l.2.1h.2l.1-.1c.2 0 .3 0 .4-.2l-.1.3-.1.3V24.3h.1l.2.2.1.2h.1l.2.1h.2v-.1h.1c.2 0 .3 0 .4-.2l-.1.3-.2.3v.2l.1.1v.1l.2.2.2.1.1.1h.4l.1-.1c.1 0 .3 0 .4-.2l-.2.4v.6l.4.3c.1.2.4.2.6 0 0 0 .2 0 .3-.2l1.8-1.7.2-.4V24ZM8.7 7.9H8l-.5-.6c-.2-.2-.2-.5 0-.7.2-.2.5-.1.7 0l.5.6c.2.2.2.5 0 .7ZM15.4 0 15 6.4l.6.1L17 .3 15.4 0ZM12.4 21.5 11 27.7l1.7.3.4-6.4-.6-.1Z',
  'M15.7 3.8h.5l.3-.9a12.4 12.4 0 0 0-1.3-.2v1h.5ZM25.2 15.8l.1-.6h-1a9.5 9.5 0 0 1-.2 1l1 .3.1-.7ZM17 4.1c4.5 1.4 7.5 5.5 7.4 10.2h1a11.3 11.3 0 0 0-8-11.2l-.3 1ZM4.1 11c1.4-4.5 5.5-7.5 10.2-7.4v-1a11.3 11.3 0 0 0-11.2 8l1 .3ZM11 23.9a10.4 10.4 0 0 1-7.4-10.2h-1a11.3 11.3 0 0 0 8 11.2l.4-1ZM23.9 17a10.4 10.4 0 0 1-10.2 7.4v1a11.3 11.3 0 0 0 11.2-8l-1-.4ZM3.8 12.3v-.5l-.9-.3a12.4 12.4 0 0 0-.2 1.3h1v-.5ZM12.3 24.2h-.5l-.3.9a12.4 12.4 0 0 0 1.3.2v-1h-.5Z',
  'm21.5 15.6 6.2 1.5.3-1.7-6.4-.4-.1.6ZM.3 10.9 0 12.6l6.4.4.1-.6L.3 11Z',
];

function brandGlyph(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 28 28');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of GLYPH_PATHS) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('fill', 'currentColor');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }
  return svg;
}

// Procedural 8-tooth cog for the settings button; evenodd cuts the hub hole.
// The popup reuses it so both gears are the same mark.
export function gearGlyph(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '-8 -8 16 16');
  svg.setAttribute('aria-hidden', 'true');
  const pts: string[] = [];
  const teeth = 8;
  for (let i = 0; i < teeth; i++) {
    const angle = i / teeth * 2 * Math.PI;
    for (const [radius, offset] of [[5, -0.3], [7, -0.17], [7, 0.17], [5, 0.3]] as const) {
      pts.push(`${(Math.cos(angle + offset) * radius).toFixed(2)} ${(Math.sin(angle + offset) * radius).toFixed(2)}`);
    }
  }
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', `M${pts.join('L')}Z M0 -2.6A2.6 2.6 0 1 0 0 2.6A2.6 2.6 0 1 0 0 -2.6Z`);
  path.setAttribute('fill', 'currentColor');
  path.setAttribute('fill-rule', 'evenodd');
  svg.appendChild(path);
  return svg;
}

function ctaLink(text: string, href: string): HTMLAnchorElement {
  const cta = el('a', 'ssx-cta');
  cta.href = href;
  cta.target = '_blank';
  cta.rel = 'noopener';
  cta.append(brandGlyph(), el('span', undefined, text));
  return cta;
}

// Shown when the catalog knows nothing about the name at all: the item's name,
// a short note and a search link, so the panel never just silently disappears.
function buildFallbackPanel(name: string, medium: string): HTMLElement {
  const panel = el('div', 'ssx-panel');
  panel.appendChild(el('div', 'ssx-item-name', name));
  panel.appendChild(el('div', 'ssx-empty', t('panel_not_in_catalog')));
  const base = name.replace(EXTERIOR_SUFFIX_RE, '').replace(/^★ /, '').replace(/^(StatTrak™|Souvenir)\s+/, '');
  panel.appendChild(ctaLink(t('panel_search_on_skinsniper'), siteLink(`/skins?search=${encodeURIComponent(base)}`, medium)));
  return panel;
}

// Shown when the SkinSniper API did not answer (offline, server error):
// distinct from the "not in catalog" fallback. Errors are never cached by the
// background, so the retry re-fetches for real. A revoked host permission gets
// its own text and sends the user to the popup, which is the only place that
// can ask for the permission back - a content script cannot.
export function buildErrorPanel(retry?: () => void, no_access?: boolean): HTMLElement {
  const panel = el('div', 'ssx-panel');
  if (no_access) {
    panel.appendChild(el('div', 'ssx-empty', t('panel_no_site_access')));
    const btn = el('button', 'ssx-more', t('access_turn_on'));
    btn.type = 'button';
    btn.addEventListener('click', () => {
      void requestOpenPopup();
    });
    panel.appendChild(btn);
    return panel;
  }
  panel.appendChild(el('div', 'ssx-empty', t('panel_api_error')));
  if (retry) {
    const btn = el('button', 'ssx-more', t('panel_try_again'));
    btn.type = 'button';
    btn.addEventListener('click', retry);
    panel.appendChild(btn);
  }
  return panel;
}

export function buildPanel(data: ExtensionLookup | ApiError | null, medium: string, prefs?: PricePrefs | null, fallback_name?: string, retry?: () => void): HTMLElement | null {
  if (data && isApiError(data)) return buildErrorPanel(retry, data.no_access);
  if (!data || data.kind === null) {
    return fallback_name ? buildFallbackPanel(fallback_name, medium) : null;
  }

  const panel = el('div', 'ssx-panel');

  // The full catalog name when the match carries one. The inventory name
  // already encodes the condition, so it stands alone there; market panels
  // put the condition on its own line and strip its suffix from the name.
  if (medium === 'inventory') {
    if (data.name) panel.appendChild(el('div', 'ssx-item-name', data.name));
  } else {
    const cond_label = conditionLabel(data);
    const name = cond_label ? data.name?.replace(EXTERIOR_SUFFIX_RE, '') : data.name;
    if (name) panel.appendChild(el('div', 'ssx-item-name', name));
    if (cond_label) panel.appendChild(el('div', 'ssx-cond', cond_label));
  }

  const steam = data.markets.find((r) => r.name === 'steam');
  const rows = el('div', 'ssx-rows');
  for (const [index, row] of data.markets.entries()) {
    const a = el('a', index < MAX_ROWS ? 'ssx-row' : 'ssx-row ssx-hidden');
    a.href = siteRawLink(row.ref);
    a.target = '_blank';
    a.rel = 'noopener nofollow';
    const dot = el('i');
    dot.style.background = row.color;
    a.append(dot, el('span', 'ssx-name', row.title));
    if (steam && row.name !== 'steam' && row.price < steam.price) {
      const pct = Math.round((1 - row.price / steam.price) * 100);
      if (pct >= 1) {
        const badge = el('span', 'ssx-badge', `-${pct}%`);
        badge.title = t('panel_cheaper_than_steam', String(pct));
        a.appendChild(badge);
      }
    }
    a.appendChild(el('b', undefined, formatPrice(row.price, prefs)));
    rows.appendChild(a);
  }
  if (!data.markets.length) rows.appendChild(el('div', 'ssx-empty', t('panel_no_prices')));
  const hidden_count = data.markets.length - MAX_ROWS;
  if (hidden_count > 0) {
    const toggle = el('button', 'ssx-more', hidden_count === 1 ? t('panel_more_markets_one') : t('panel_more_markets', String(hidden_count)));
    toggle.type = 'button';
    toggle.addEventListener('click', () => {
      rows.querySelectorAll('.ssx-hidden').forEach((node) => {
        node.classList.remove('ssx-hidden');
      });
      toggle.remove();
    });
    rows.appendChild(toggle);
  }
  panel.appendChild(rows);

  if (data.href) {
    panel.appendChild(ctaLink(t(data.kind === 'skin' ? 'panel_check_skin' : 'panel_check_item'), siteLink(data.href, medium)));
  }

  return panel;
}

export function removePanels(): void {
  document.querySelectorAll('.ssx-panel').forEach((node) => {
    node.remove();
  });
}

// Marks the panel(s) already on the page as refreshing (pulsing dot + dimmed
// rows) while the next lookup is in flight; the stale panel is replaced when
// the response lands, so the class never needs manual clearing.
export function markPanelsLoading(): void {
  document.querySelectorAll('.ssx-panel').forEach((node) => {
    node.classList.add('ssx-loading');
  });
}

const COLLAPSED_KEY = 'ssx_collapsed';

function isCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

function setCollapsed(value: boolean): void {
  try {
    if (value) localStorage.setItem(COLLAPSED_KEY, '1');
    else localStorage.removeItem(COLLAPSED_KEY);
  } catch { /* private mode etc. - collapse just won't persist */ }
}

export function removeMini(): void {
  document.querySelectorAll('.ssx-mini').forEach((node) => {
    node.remove();
  });
}

// Dragging either floating element moves it anywhere on the page; the dropped
// position is stored and overrides the corner setting until a corner is
// picked in the popup again. Move/up listeners live on window (capture phase):
// a fast cursor outruns the 44px mini between two events, so node-scoped
// listeners (or pointer capture) would lose the drag. preventDefault on
// pointerdown stops text selection; interactive children opt out so their
// clicks keep working.
function makeDraggable(node: HTMLElement, opts: { allowInteractive?: boolean, onDragged?: () => void } = {}): void {
  node.addEventListener('pointerdown', (down) => {
    if (down.button !== 0) return;
    if (!opts.allowInteractive && (down.target as Element).closest('a, button')) return;
    down.preventDefault();
    const rect = node.getBoundingClientRect();
    const off_x = down.clientX - rect.left;
    const off_y = down.clientY - rect.top;
    let moved = false;
    let last = { x: rect.left, y: rect.top };
    const onMove = (move: PointerEvent): void => {
      if (!moved && Math.abs(move.clientX - down.clientX) < 4 && Math.abs(move.clientY - down.clientY) < 4) return;
      moved = true;
      node.classList.add('ssx-dragging');
      last = clampPanelXY(move.clientX - off_x, move.clientY - off_y, rect);
      node.style.left = `${last.x}px`;
      node.style.top = `${last.y}px`;
      node.style.right = 'auto';
      node.style.bottom = 'auto';
    };
    const onEnd = (): void => {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onEnd, true);
      window.removeEventListener('pointercancel', onEnd, true);
      node.classList.remove('ssx-dragging');
      if (moved) {
        opts.onDragged?.();
        savePanelXY(last);
      }
    };
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onEnd, true);
    window.addEventListener('pointercancel', onEnd, true);
  });
}

// Floating mount, shared by the market and inventory scripts: fixed corner
// panel with a close button that collapses it down to a small square logo;
// clicking the logo brings the panel back. The choice sticks (localStorage)
// so the panel doesn't reappear on every page.
export function mountFloating(panel: HTMLElement): void {
  panel.classList.add('ssx-float', `ssx-pos-${panelPos()}`);

  const mini = document.createElement('button');
  mini.className = `ssx-mini ssx-pos-${panelPos()}`;
  mini.type = 'button';
  mini.title = t('panel_mini_title');
  const icon = document.createElement('img');
  icon.src = runtime.runtime.getURL('icons/icon-48.png');
  icon.alt = 'SkinSniper';
  mini.appendChild(icon);

  const close = document.createElement('button');
  close.className = 'ssx-close';
  close.type = 'button';
  close.title = t('panel_collapse');
  close.textContent = '×';
  close.addEventListener('click', () => {
    panel.hidden = true;
    mini.hidden = false;
    setCollapsed(true);
    placeNode(mini);
  });
  // A drag on the mini ends with a click on it; the flag swallows that one
  // click so dropping the logo somewhere doesn't also expand the panel.
  let mini_dragged = false;
  mini.addEventListener('click', () => {
    if (mini_dragged) {
      mini_dragged = false;
      return;
    }
    panel.hidden = false;
    mini.hidden = true;
    setCollapsed(false);
    placeNode(panel);
  });

  const gear = document.createElement('button');
  gear.className = 'ssx-gear';
  gear.type = 'button';
  gear.title = t('panel_settings_title');
  gear.appendChild(gearGlyph());
  gear.addEventListener('click', () => {
    void requestOpenPopup('settings');
  });

  panel.prepend(gear, close);

  makeDraggable(panel);
  makeDraggable(mini, {
    allowInteractive: true,
    onDragged: () => {
      mini_dragged = true;
    },
  });

  const collapsed = isCollapsed();
  panel.hidden = collapsed;
  mini.hidden = !collapsed;
  removeMini();
  document.body.append(panel, mini);
  placeNode(panel);
  placeNode(mini);
}
