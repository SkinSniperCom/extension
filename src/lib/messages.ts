import type { ExtensionLookup } from '../shared/extension';
import type { PricePrefs } from './config';

export type LookupOpts = { family?: boolean, exterior?: string, quality?: string };

export type ExtMessage
  = | ({ type: 'lookup', name: string } & LookupOpts)
    | { type: 'search', q: string }
    | { type: 'markets' }
    | { type: 'prefs' }
    | { type: 'open_popup', view?: 'settings' };

// The marketplace roster behind the popup's per-market settings (backend
// /market/many). Only the fields the extension renders are typed here: the
// route also serves link templates and ordering the site needs and this does
// not. Deliberately not vendored from common/market.ts - that module carries
// value code, and src/shared/ stays type-only.
export type MarketMeta = {
  id: number,
  name: string,
  title: string,
  color: string,
};

// Popup -> content script (tabs.sendMessage): "what item is this page showing?"
export type PageMessage = { type: 'current_item' };
export type CurrentItem = ({ name?: string, profile?: string } & LookupOpts) | null;

// Rows of the backend /search response the popup renders (subset of its fields).
export type SearchResultRow = {
  sid: string,
  name: string,
  type: string,
  img?: string,
  min_price?: number,
  href?: string,
};

export type SearchSection = {
  type: string,
  label: string,
  results: SearchResultRow[],
  total: number,
};

// Firefox exposes the promise-returning API on `browser`; Chrome MV3 returns
// promises from `chrome.*` when no callback is passed.
export const runtime: typeof chrome = (globalThis as { browser?: typeof chrome }).browser ?? chrome;

// A failed background API call (network error or non-2xx status): content
// scripts tell it apart from a legitimate "no match" null response.
// `no_access` marks the one failure the user can fix: a revoked host
// permission, which CORS-blocks every call the background makes.
export type ApiError = { error: true, no_access?: boolean };

export function isApiError(value: unknown): value is ApiError {
  return typeof value === 'object' && value !== null && (value as { error?: unknown }).error === true;
}

export function requestLookup(name: string, opts?: LookupOpts): Promise<ExtensionLookup | ApiError | null> {
  return runtime.runtime.sendMessage<ExtMessage, ExtensionLookup | ApiError | null>({ type: 'lookup', name, ...opts });
}

export function requestSearch(q: string): Promise<SearchSection[] | null> {
  return runtime.runtime.sendMessage<ExtMessage, SearchSection[] | null>({ type: 'search', q });
}

export function requestMarkets(): Promise<MarketMeta[] | null> {
  return runtime.runtime.sendMessage<ExtMessage, MarketMeta[] | null>({ type: 'markets' });
}

export function requestPrefs(): Promise<PricePrefs | null> {
  return runtime.runtime.sendMessage<ExtMessage, PricePrefs | null>({ type: 'prefs' });
}

// Fire-and-forget: the background opens the toolbar popup (or a tab fallback);
// there is no response to wait for. 'settings' asks it to open on the settings
// card instead of the search view.
export function requestOpenPopup(view?: 'settings'): Promise<void> {
  return runtime.runtime.sendMessage<ExtMessage, void>({ type: 'open_popup', view }).catch(() => undefined);
}
