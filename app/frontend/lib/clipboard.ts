/**
 * Copy text to the clipboard, with a legacy fallback.
 *
 * Tries the async Clipboard API (`navigator.clipboard.writeText`) first, and
 * falls back to the classic hidden-`<textarea>` + `document.execCommand("copy")`
 * path for non-secure contexts (plain http) and older browsers where the async
 * API is unavailable or rejects. Returns whether the copy succeeded.
 *
 * The single home for the ~11 hand-rolled copy helpers. Callers keep their own
 * toast / "copied!" flag / reset-timer UI — this only performs the copy.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the execCommand path
  }

  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    // Keep it out of view and out of the layout / focus flow.
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "0";
    ta.setAttribute("readonly", "");
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
