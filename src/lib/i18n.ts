import { runtime } from './messages';

// UI strings come from _locales/<browser UI language>/messages.json; the
// SkinSniper site cookies keep steering only the price data and currency.
// A missing key falls back to the key itself so nothing renders empty.
export function t(key: string, subs?: string | string[]): string {
  return runtime.i18n.getMessage(key, subs) || key;
}
