// Event-driven replacements for the polling loops: MutationObserver turns page
// activity into checks, so an idle page costs nothing and changes register
// almost immediately.

// Bursts of calls collapse into at most one run per interval; a call after a
// quiet period runs right away (next macrotask).
function throttled(fn: () => void, interval_ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let last_run = 0;
  return () => {
    if (timer !== null) return;
    const wait = Math.max(0, last_run + interval_ms - Date.now());
    timer = setTimeout(() => {
      timer = null;
      last_run = Date.now();
      fn();
    }, wait);
  };
}

// Fires when location.href changes. The Market Beta navigates via
// history.pushState, which content scripts cannot hook, but every navigation
// rerenders the DOM - a document-wide observer with a cheap href compare turns
// those rerenders into navigation events. popstate/hashchange (which do reach
// the isolated world) cover back/forward directly.
export function watchUrl(on_change: () => void, interval_ms = 150): void {
  let last_href = location.href;
  const check = throttled(() => {
    if (location.href === last_href) return;
    last_href = location.href;
    on_change();
  }, interval_ms);
  new MutationObserver(check).observe(document.documentElement, { childList: true, subtree: true });
  addEventListener('popstate', check);
  addEventListener('hashchange', check);
}

// Document-wide mutation watch driving a cheap state check, plus one immediate
// run for state that predates the observer (e.g. an item preselected via a
// deep-link hash). Deliberately not scoped to specific elements: React remounts
// would leave element-scoped observers attached to detached nodes with no
// error, silently killing updates - the check is cheap enough that document
// scope costs nothing.
export function watchDom(on_mutate: () => void, interval_ms = 200): void {
  new MutationObserver(throttled(on_mutate, interval_ms))
    .observe(document.documentElement, { childList: true, subtree: true });
  on_mutate();
}
