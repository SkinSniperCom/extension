// Injected at build time (extension/build.ts, define).
declare const __API_URL__: string;
declare const __SITE_URL__: string;
declare const __STATIC_URL__: string;

export const API_URL = __API_URL__;
export const SITE_URL = __SITE_URL__;
export const STATIC_URL = __STATIC_URL__;

// Site locales the backend can localize hrefs into (base 'en' stays unprefixed).
export const SITE_LOCALES = ['pl', 'de', 'pt', 'sv', 'zh', 'es'];

// Absolute site link with utm params, so extension traffic is separable in GA.
export function siteLink(sitePath: string, medium: string): string {
  const url = new URL(sitePath, SITE_URL);
  url.searchParams.set('utm_source', 'extension');
  url.searchParams.set('utm_medium', medium);
  return url.toString();
}

// Absolute link without utm - used for /ref/* redirects, which leave the site
// immediately and are tracked server-side by the redirect itself.
export function siteRawLink(sitePath: string): string {
  return new URL(sitePath, SITE_URL).toString();
}

// Dep-free map shared with the site (frontend CurrencyStore uses the same one).
import { CURRENCY_LOCALE } from '../shared/currency';

// Site preferences the background reads from skinsniper.com cookies + /config
// rates, so the extension shows the same language and currency as the site.
// Rates are "currency per USD divisor" (CurrencyStore: value = milliUSD/1000/rate).
export type PricePrefs = { lang?: string, currency: string, rate: number };

const formatters = new Map<string, Intl.NumberFormat>();

function currencyFormat(currency: string): Intl.NumberFormat {
  let format = formatters.get(currency);
  if (!format) {
    format = new Intl.NumberFormat(CURRENCY_LOCALE[currency] ?? 'en-US', { style: 'currency', currency });
    formatters.set(currency, format);
  }
  return format;
}

export function formatPrice(milli: number, prefs?: PricePrefs | null): string {
  const currency = prefs?.currency ?? 'USD';
  const rate = prefs?.rate || 1;
  try {
    return currencyFormat(currency).format(milli / 1000 / rate);
  } catch {
    return currencyFormat('USD').format(milli / 1000);
  }
}
