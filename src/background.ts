import { API_URL, SITE_URL, SITE_LOCALES, type PricePrefs } from './lib/config';
import { isApiError, type ApiError, type ExtMessage, type MarketMeta } from './lib/messages';
import { hasAccess } from './lib/permissions';

// Firefox event pages promise on `browser`; Chrome MV3 promises on `chrome`.
const rt: typeof chrome = (globalThis as { browser?: typeof chrome }).browser ?? chrome;

const CACHE_TTL_MS = 5 * 60_000;
const CACHE_MAX = 300;
const cache = new Map<string, { at: number, data: unknown }>();

// Failed calls are reported (not cached), so a retry actually re-fetches and
// the panels can show "can't reach" instead of "not in the catalog".
const API_ERROR: ApiError = { error: true };

// A revoked host permission looks exactly like a network failure from here, so
// every error checks once whether that is what happened and says so.
async function apiError(): Promise<ApiError> {
  return await hasAccess() ? API_ERROR : { error: true, no_access: true };
}

async function apiGet(path: string): Promise<unknown> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;
  try {
    const res = await fetch(`${API_URL}${path}`);
    if (!res.ok) return await apiError();
    const data: unknown = await res.json();
    if (cache.size >= CACHE_MAX) cache.clear();
    cache.set(path, { at: Date.now(), data });
    return data;
  } catch {
    return await apiError();
  }
}

function browserUiLang(): string | undefined {
  const ui = rt.i18n?.getUILanguage?.() ?? '';
  const two = ui.toLowerCase().split('-')[0] ?? '';
  return SITE_LOCALES.includes(two) ? two : undefined;
}

async function siteCookie(name: string): Promise<string | undefined> {
  try {
    const cookie = await rt.cookies.get({ url: SITE_URL, name });
    return cookie?.value || undefined;
  } catch {
    return undefined;
  }
}

// Site preferences: language and currency follow what the user picked on
// skinsniper.com (its cookies), conversion rates come from /config.
let prefs_cache: { at: number, prefs: PricePrefs } | null = null;

async function getPrefs(): Promise<PricePrefs> {
  if (prefs_cache && Date.now() - prefs_cache.at < 60_000) return prefs_cache.prefs;
  const cookie_lang = await siteCookie('PARAGLIDE_LOCALE');
  const lang = cookie_lang && SITE_LOCALES.includes(cookie_lang) ? cookie_lang : browserUiLang();
  let currency = (await siteCookie('currency')) ?? 'USD';
  let rate = 1;
  if (currency !== 'USD') {
    const config = await apiGet('/config') as { currency_rates?: Record<string, number> } | null;
    const config_rate = config?.currency_rates?.[currency];
    if (config_rate && config_rate > 0) rate = config_rate;
    else currency = 'USD';
  }
  const prefs: PricePrefs = { lang, currency, rate };
  prefs_cache = { at: Date.now(), prefs };
  return prefs;
}

let popup_last_attempt = 0;

rt.runtime.onMessage.addListener((msg: ExtMessage, _sender, sendResponse) => {
  if (msg.type === 'prefs') {
    void getPrefs().then(sendResponse);
    return true;
  }
  if (msg.type === 'lookup') {
    void (async () => {
      const { lang } = await getPrefs();
      const params = new URLSearchParams({ name: msg.name });
      if (msg.family) params.set('family', 'true');
      if (msg.exterior) params.set('exterior', msg.exterior);
      if (msg.quality) params.set('quality', msg.quality);
      if (lang) params.set('lang', lang);
      sendResponse(await apiGet(`/extension/lookup?${params}`));
    })();
    return true;
  }
  if (msg.type === 'search') {
    void (async () => {
      const { lang } = await getPrefs();
      const data = await apiGet(`/search?${msg.q ? `q=${encodeURIComponent(msg.q)}&` : ''}limit=10${lang ? `&lang_skin=${lang}` : ''}`);
      // The popup renders sections or an empty state; it has no error UI.
      sendResponse(isApiError(data) ? null : data);
    })();
    return true;
  }
  if (msg.type === 'markets') {
    void (async () => {
      const data = await apiGet('/market/many') as { markets?: MarketMeta[] } | ApiError | null;
      // The settings list has its own "could not load" state, so an error just
      // comes back as null here.
      sendResponse(isApiError(data) ? null : data?.markets ?? null);
    })();
    return true;
  }
  if (msg.type === 'open_popup') {
    // The panel's gear button. action.openPopup works on Chrome 127+; anywhere
    // it is missing or refuses (older Chrome, Firefox's user-input rule), the
    // popup page opens as a regular tab instead. No response either way.
    // A double-click's second event lands while the first click's popup is
    // still open/closing, and openPopup then throws a transient "Could not
    // find an active browser window" - so rapid repeats are dropped and a
    // failure is retried once before the tab fallback, which should only fire
    // where openPopup genuinely cannot work.
    const now = Date.now();
    if (now - popup_last_attempt < 500) return undefined;
    popup_last_attempt = now;
    void (async () => {
      // The panel's gear asks for the settings card; the popup reads this
      // marker once on load, so it has to be stored before the popup opens.
      if (msg.view === 'settings') {
        await rt.storage.local.set({ popup_settings_at: now }).catch(() => { /* opens on search then */ });
      }
      try {
        await rt.action.openPopup();
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 150));
        try {
          await rt.action.openPopup();
        } catch {
          await rt.tabs.create({ url: rt.runtime.getURL('popup.html') });
        }
      }
    })();
    return undefined;
  }
  return undefined;
});
