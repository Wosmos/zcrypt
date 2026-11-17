const KEY = "zc_dl_interrupted";
const MAX_NAMES = 20;

function store(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Remember which downloads the page was running when it went away, so the next
 * load in the same tab can say they stopped. A page the browser keeps in its
 * back/forward cache comes back with its downloads intact, so that case clears
 * the note again.
 */
export function watchPageExit(activeNames: () => string[]): () => void {
  const onHide = () => {
    const names = activeNames().slice(0, MAX_NAMES);
    try {
      if (names.length > 0) store()?.setItem(KEY, JSON.stringify(names));
    } catch {
      // Storage refused: the notice is a courtesy.
    }
  };
  const onShow = (e: PageTransitionEvent) => {
    if (!e.persisted) return;
    try {
      store()?.removeItem(KEY);
    } catch {
      // Nothing to clear.
    }
  };
  window.addEventListener("pagehide", onHide);
  window.addEventListener("pageshow", onShow);
  return () => {
    window.removeEventListener("pagehide", onHide);
    window.removeEventListener("pageshow", onShow);
  };
}

/** The downloads the previous page in this tab was running when it unloaded, once. */
export function takeInterrupted(): string[] {
  const s = store();
  if (!s) return [];
  try {
    const raw = s.getItem(KEY);
    s.removeItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((n): n is string => typeof n === "string") : [];
  } catch {
    return [];
  }
}
