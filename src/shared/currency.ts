// Synced verbatim from the SkinSniper monorepo (common/currency.ts) by
// scripts/sync-shared.ts - edit the original there, not this copy.

export const CURRENCY_LOCALE: Record<string, string> = {
  USD: 'en-US',
  EUR: 'de-DE',
  GBP: 'en-GB',
  PLN: 'pl-PL',
  BRL: 'pt-BR',
  CNY: 'zh-CN',
  ARS: 'es-AR',
  JPY: 'ja-JP',
  TRY: 'tr-TR',
  SEK: 'sv-SE',
  CHF: 'de-CH',
  INR: 'en-IN',
  UYU: 'es-UY',
  MXN: 'es-MX',
  PEN: 'es-PE',
  CLP: 'es-CL',
  CRC: 'es-CR',
  COP: 'es-CO',
  AUD: 'en-AU',
  CAD: 'en-CA',
};

export const FIAT_CODES = new Set(Object.keys(CURRENCY_LOCALE));

const LANGUAGE_CURRENCY: Record<string, string> = {
  pl: 'PLN',
  sv: 'SEK',
  zh: 'CNY',
  ja: 'JPY',
  tr: 'TRY',
  hi: 'INR',
  pt: 'BRL',
  de: 'EUR',
  fr: 'EUR',
  it: 'EUR',
  nl: 'EUR',
  el: 'EUR',
  fi: 'EUR',
  et: 'EUR',
  lv: 'EUR',
  lt: 'EUR',
  sl: 'EUR',
  sk: 'EUR',
  hr: 'EUR',
  // anything else falls back to USD (/es -> USD is fine)
};

function parseAcceptLanguage(header: string): string[] {
  return header
    .split(',')
    .map((part) => {
      const [tag = '', ...params] = part.split(';');
      const q = params.find((p) => p.trim().startsWith('q='));
      const weight = q ? Number.parseFloat(q.trim().slice(2)) : 1;
      return { tag: tag.trim().toLowerCase(), weight: Number.isFinite(weight) ? weight : 0 };
    })
    .filter((e) => e.tag && e.tag !== '*' && e.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .map((e) => e.tag);
}

/** Currency for a visitor who has never picked one, from the signal that picks their language. */
export function defaultCurrency(accept_language?: string | null, locale?: string | null): string {
  const tags = accept_language ? parseAcceptLanguage(accept_language) : [];
  if (locale) tags.push(locale.toLowerCase());
  for (const tag of tags) {
    const currency = LANGUAGE_CURRENCY[tag.split('-')[0]!];
    if (currency) return currency;
  }
  return 'USD';
}
