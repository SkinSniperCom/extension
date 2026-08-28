import { runtime } from './messages';

// Per-market user preferences: starred markets are pinned above the rest of the
// price rows, hidden ones never render at all. Both live in extension storage
// keyed by the market's stable `name` ('csfloat', 'steam', ...), so the popup
// and every open Steam tab share one source of truth and storage change events
// re-render already-mounted panels live.
const FAV_KEY = 'market_fav';
const HIDDEN_KEY = 'market_hidden';

let fav = new Set<string>();
let hidden = new Set<string>();
let ready: Promise<void> | null = null;
// Set once anything has written or observed a newer value, so the initial read
// resolving late cannot put a stale snapshot back.
let touched = false;
const listeners = new Set<() => void>();

function asSet(value: unknown): Set<string> {
  return new Set(Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []);
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && [...a].every((name) => b.has(name));
}

function notify(): void {
  for (const fn of listeners) fn();
}

// One storage watch per context, started with the first read: it carries the
// choices made in the popup over to every open Steam tab. The context that made
// the change has already applied it, so an echo of its own write is dropped
// rather than re-rendering everything twice.
function startWatch(): void {
  runtime.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    // Storage carries the corner setting and the popup marker too; only our own
    // keys count, or an unrelated write would mark the state as newer than the
    // initial read that is still in flight.
    if (!(FAV_KEY in changes) && !(HIDDEN_KEY in changes)) return;
    touched = true;
    const next_fav = FAV_KEY in changes ? asSet(changes[FAV_KEY]?.newValue) : fav;
    const next_hidden = HIDDEN_KEY in changes ? asSet(changes[HIDDEN_KEY]?.newValue) : hidden;
    if (sameSet(next_fav, fav) && sameSet(next_hidden, hidden)) return;
    fav = next_fav;
    hidden = next_hidden;
    notify();
  });
}

// Awaited alongside the lookup itself, so the first paint already honours the
// stored choices instead of reordering a frame later.
export function marketPrefsReady(): Promise<void> {
  if (!ready) {
    startWatch();
    ready = runtime.storage.local.get([FAV_KEY, HIDDEN_KEY]).then((stored) => {
      if (touched) return;
      fav = asSet(stored[FAV_KEY]);
      hidden = asSet(stored[HIDDEN_KEY]);
    }).catch(() => { /* nothing starred, nothing hidden */ });
  }
  return ready;
}

export function onMarketPrefsChange(fn: () => void): void {
  listeners.add(fn);
}

export function isFavMarket(name: string): boolean {
  return fav.has(name);
}

export function isHiddenMarket(name: string): boolean {
  return hidden.has(name);
}

// Drops hidden markets and lifts starred ones to the front. Rows arrive sorted
// by price and the partition is stable, so the price order survives inside both
// groups - a starred market keeps its place among the other starred ones.
export function orderMarkets<T extends { name: string }>(rows: readonly T[]): T[] {
  const visible = rows.filter((row) => !hidden.has(row.name));
  return [...visible.filter((row) => fav.has(row.name)), ...visible.filter((row) => !fav.has(row.name))];
}

// Applied in memory first, then persisted: a storage write and its change event
// take a turn to come back, and two quick clicks would otherwise both start from
// the same stale state and the first one would be lost.
function apply(next_fav: Set<string>, next_hidden: Set<string>): void {
  touched = true;
  fav = next_fav;
  hidden = next_hidden;
  notify();
  void runtime.storage.local.set({ [FAV_KEY]: [...fav], [HIDDEN_KEY]: [...hidden] })
    .catch(() => { /* choice holds for this page only */ });
}

function toggled(set: Set<string>, name: string): Set<string> {
  const next = new Set(set);
  if (!next.delete(name)) next.add(name);
  return next;
}

function without(set: Set<string>, name: string): Set<string> {
  if (!set.has(name)) return set;
  const next = new Set(set);
  next.delete(name);
  return next;
}

// Starring and hiding are mutually exclusive: a market pinned to the top cannot
// also be the one you never want to see, so each toggle clears the other flag.
export function toggleFavMarket(name: string): void {
  apply(toggled(fav, name), without(hidden, name));
}

export function toggleHiddenMarket(name: string): void {
  apply(without(fav, name), toggled(hidden, name));
}
