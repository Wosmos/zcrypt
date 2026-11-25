"use client";

import { useCallback, useEffect, useRef } from "react";
import { isTauri } from "@/lib/tauri";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const TOKEN_WAIT_MS = 20_000;

interface TurnstileApi {
  render(el: HTMLElement, options: Record<string, unknown>): string;
  reset(id: string): void;
  remove(id: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile"));
    s.onerror = () => {
      loading = null;
      reject(new Error("turnstile"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/** The web forms run the check; the desktop and Android apps have no widget. */
export function turnstileEnabled(siteKey = SITE_KEY, tauri = isTauri): boolean {
  return Boolean(siteKey) && !tauri;
}

/**
 * Cloudflare Turnstile for the sign-up, sign-in and password reset forms. It
 * stays invisible unless Cloudflare wants the person to tick a box. getToken
 * resolves once a token is ready (or undefined when the check can't run, and
 * the server then refuses the form); reset readies a fresh one, since a token
 * is good for one submission.
 */
export function useTurnstile() {
  const enabled = turnstileEnabled();
  const box = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const token = useRef<string | null>(null);
  const waiting = useRef<((t: string | undefined) => void)[]>([]);

  const settle = useCallback((t: string | undefined) => {
    const pending = waiting.current;
    waiting.current = [];
    for (const resolve of pending) resolve(t);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    loadTurnstile()
      .then((api) => {
        if (cancelled || !box.current) return;
        widgetId.current = api.render(box.current, {
          sitekey: SITE_KEY,
          appearance: "interaction-only",
          theme: "auto",
          size: "flexible",
          callback: (t: string) => {
            token.current = t;
            settle(t);
          },
          "expired-callback": () => {
            token.current = null;
          },
          "error-callback": () => {
            token.current = null;
            settle(undefined);
          },
        });
      })
      .catch(() => settle(undefined));
    return () => {
      cancelled = true;
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [enabled, settle]);

  const getToken = useCallback((): Promise<string | undefined> => {
    if (!enabled) return Promise.resolve(undefined);
    if (token.current) return Promise.resolve(token.current);
    return new Promise((resolve) => {
      waiting.current.push(resolve);
      setTimeout(() => resolve(undefined), TOKEN_WAIT_MS);
    });
  }, [enabled]);

  const reset = useCallback(() => {
    token.current = null;
    if (widgetId.current) window.turnstile?.reset(widgetId.current);
  }, []);

  const widget = enabled ? <div ref={box} className="flex justify-center empty:hidden" /> : null;
  return { widget, getToken, reset };
}
