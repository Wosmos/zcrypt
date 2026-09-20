"use client";

import { useEffect } from "react";
import { isTauri, openExternal } from "@/lib/tauri";
import { toast } from "@/store/toast";

/**
 * Makes external links work inside the Tauri shell.
 *
 * A webview has no second tab, so `<a target="_blank">` and `window.open()` are
 * both swallowed: the user taps a link and nothing happens at all. Before
 * this, exactly one call site (the OAuth buttons) routed through the opener
 * plugin; every other external link in the app was dead. The worst of them was
 * onboarding, where the "get a token" links to GitHub/GitLab/HuggingFace are
 * the only way to connect storage, so a new Android user hit a wall on the
 * first screen.
 *
 * One capture-phase listener covers every anchor at once, including any added
 * later, which is why this is a listener rather than a wrapper component that
 * each link has to remember to use. `window.open()` calls are invisible to it
 * and are converted individually.
 *
 * No-op on the web, where target="_blank" works natively.
 */
export function ExternalLinkHandler() {
  useEffect(() => {
    if (!isTauri) return;

    const onClick = (e: MouseEvent) => {
      // Let the app handle modified clicks and anything already defaulted away.
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }
      const anchor = (e.target as Element | null)?.closest?.("a");
      if (!anchor) return;

      // Resolve through the DOM so relative hrefs and <base> are handled for us.
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;

      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }

      // mailto:/tel: are equally dead in the webview, so they go out too.
      const external =
        url.origin !== window.location.origin ||
        url.protocol === "mailto:" ||
        url.protocol === "tel:";
      if (!external) return;

      e.preventDefault();
      void openExternal(url.href).catch(() => {
        // Thrown when no installed app claims the URL. Say so, the old
        // behaviour was an unexplained dead tap.
        toast.error("Couldn't open that link on this device");
      });
    };

    // Capture phase so this runs before a component's own onClick can stop it.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
