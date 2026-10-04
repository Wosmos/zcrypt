"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore, readCachedUser } from "@/store/auth";
import { getMe } from "@/lib/auth-api";
import { refreshSessionToken, tryRefreshToken } from "@/lib/auth-fetch";
import { prefetchVault } from "@/store/files";
import { LogoSpinner } from "@/components/ui/logo-spinner";
import { isTauri, startSync, subscribeTokens } from "@/lib/tauri";

export function AuthGuard({
  children,
  skipOnboardingCheck = false,
}: {
  children: React.ReactNode;
  skipOnboardingCheck?: boolean;
}) {
  const router = useRouter();
  const [redirecting, setRedirecting] = useState(false);
  const [stranded, setStranded] = useState(false);
  const initRunning = useRef(false);
  const recovered = useRef(false);
  const {
    user,
    accessToken,
    refreshTokenValue,
    initialized,
    setUser,
    setTokens,
    setInitialized,
    clearAuth,
  } = useAuthStore();

  useEffect(() => {
    // The session check itself stores fresh tokens, which re-runs this effect:
    // one check at a time is enough.
    if (initialized || initRunning.current) return;

    // Show onboarding to anyone who has never seen it, full stop.
    //
    // This used to ask "is any platform connected?" and redirect only when the
    // answer was no. That answer is always yes: zcrypt runs a shared global
    // token so a brand new user can upload immediately, and a global token
    // makes every platform report connected. So the redirect never fired, and
    // nobody ever saw the one screen that explains what the product is or that
    // they can plug in their own storage. 22 people verified an email and 8
    // ever stored a file.
    //
    // onboarded_at is a server-side stamp, so this means once per person, not
    // once per browser. Users who skip still get stamped: the screen's job is
    // to explain the product once, not to force a connection. Those who carry
    // on with shared storage are nudged later by the dashboard banner instead.
    const runOnboardingCheck = () => {
      if (skipOnboardingCheck) return;
      const current = useAuthStore.getState().user;
      if (current && !current.onboarded_at) {
        setRedirecting(true);
        router.replace("/onboarding");
      }
    };

    async function init() {
      // Desktop persists refreshTokenValue to localStorage, so its absence
      // here really does mean "never logged in" — skip straight to login.
      // Web never persists it (store/auth.ts): a returning user with an
      // expired access token and no in-memory refresh value may still have
      // a valid httpOnly session cookie, so fall through and let the
      // refresh path below try it rather than bouncing them out.
      if (!accessToken && !refreshTokenValue && isTauri) {
        setInitialized(true);
        router.replace("/login");
        return;
      }

      // Fast path: user already set by the login/register/2fa/oauth page. Show the
      // dashboard immediately and verify onboarding in the background.
      const existingUser = useAuthStore.getState().user;
      if (existingUser && accessToken) {
        setInitialized(true);
        void prefetchVault();
        runOnboardingCheck();
        return;
      }

      const toLogin = () => {
        clearAuth();
        setInitialized(true);
        router.replace("/login");
      };

      // The web keeps its access token in memory only (store/auth.ts), so a
      // reload starts without one: trade the httpOnly session cookie for a
      // fresh token before anything asks for data.
      let token = accessToken;
      if (!token && !isTauri) {
        const outcome = await refreshSessionToken();
        if (outcome.rejected) {
          toLogin();
          return;
        }
        if (!outcome.token) {
          // Offline or a 5xx: keep the session and paint what this device knows.
          const known = readCachedUser();
          if (known) setUser(known);
          setStranded(true);
          setInitialized(true);
          return;
        }
        token = outcome.token;
      }

      // Resolve the session. Refreshes go through the shared, deduped
      // tryRefreshToken: the vault prefetch below may hit a 401 and refresh at
      // the same moment, and refresh tokens rotate on use. It clears auth itself
      // on a definitive rejection; a transient miss leaves the tokens alone.
      const resolveUser = async (): Promise<"ok" | "rejected" | "transient"> => {
        if (token) {
          try {
            setUser(await getMe(token));
            return "ok";
          } catch {
            // token might be expired, try refresh
          }
        }
        // Desktop requires an actual in-memory token (never silently probes
        // without one); web always attempts it since the httpOnly cookie, not
        // this value, is what actually carries the session across reloads.
        if (!refreshTokenValue && isTauri) return "rejected";
        const fresh = await tryRefreshToken();
        if (fresh) {
          try {
            setUser(await getMe(fresh));
            return "ok";
          } catch {
            return "transient";
          }
        }
        return useAuthStore.getState().accessToken ? "transient" : "rejected";
      };

      // Returning user on this device: paint the shell (and the persisted
      // lists) right away from the cached identity while the session check and
      // the vault lists load in parallel.
      const cached = token ? readCachedUser() : null;
      if (cached) {
        setUser(cached);
        setInitialized(true);
        void prefetchVault();
        runOnboardingCheck();
        const result = await resolveUser();
        if (result === "ok") runOnboardingCheck();
        else if (result === "rejected") toLogin();
        return;
      }

      if (token) void prefetchVault();
      const result = await resolveUser();
      if (result === "ok") {
        setInitialized(true);
        runOnboardingCheck();
        return;
      }
      if (result === "transient") {
        // Only a DEFINITIVE rejection should log out. A transient failure on
        // load (offline, 5xx, timeout) must NOT nuke a valid session.
        setInitialized(true);
        return;
      }
      toLogin();
    }

    initRunning.current = true;
    void init().finally(() => {
      initRunning.current = false;
    });
  }, [
    initialized,
    accessToken,
    refreshTokenValue,
    router,
    skipOnboardingCheck,
    setUser,
    setTokens,
    setInitialized,
    clearAuth,
  ]);

  // A reload that could not reach the server has no access token, and nothing
  // else may fetch one: keep retrying the cookie refresh with backoff, and
  // right away when the browser comes back online.
  useEffect(() => {
    if (!stranded || accessToken) return;
    recovered.current = false;
    let cancelled = false;
    let inFlight = false;
    let delay = 2_000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attempt = async () => {
      if (inFlight) return;
      inFlight = true;
      clearTimeout(timer);
      const outcome = await refreshSessionToken();
      inFlight = false;
      if (cancelled || outcome.token) return;
      if (outcome.rejected) {
        setStranded(false);
        clearAuth();
        router.replace("/login");
        return;
      }
      delay = Math.min(delay * 2, 60_000);
      timer = setTimeout(() => void attempt(), delay);
    };
    timer = setTimeout(() => void attempt(), delay);
    const onOnline = () => void attempt();
    window.addEventListener("online", onOnline);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener("online", onOnline);
    };
  }, [stranded, accessToken, router, clearAuth]);

  // Recovered, by the retry above or by any request that refreshed on a 401:
  // finish what the reload could not.
  useEffect(() => {
    if (!stranded || !accessToken || recovered.current) return;
    recovered.current = true;
    if (!useAuthStore.getState().user) {
      getMe(accessToken)
        .then(setUser)
        .catch(() => {});
    }
    void prefetchVault();
  }, [stranded, accessToken, setUser]);

  // The engine rotates on its own during uploads and sync: adopt its pair so
  // the webview never refreshes with a token the engine already spent.
  useEffect(() => {
    if (!isTauri) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void subscribeTokens((t) => setTokens(t.access_token, t.refresh_token)).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [setTokens]);

  // Start the desktop sync worker as soon as tokens exist, alongside the
  // session check rather than after it. A rotated token re-runs this.
  useEffect(() => {
    if (!isTauri || !accessToken || !refreshTokenValue) return;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
    startSync(apiUrl, accessToken, refreshTokenValue).catch(() => {});
  }, [accessToken, refreshTokenValue]);

  // A session that ends mid-use (refresh token rejected: expired, revoked, or
  // rotated by another tab) clears auth after the guard has initialized. Without
  // this the shell unmounted to a blank page and nothing sent the user back.
  const signedOut = initialized && !user && !accessToken && !stranded;
  useEffect(() => {
    if (signedOut) router.replace("/login");
  }, [signedOut, router]);

  if (!initialized || redirecting || signedOut || (stranded && !accessToken && !user)) {
    return (
      <div className="flex items-center justify-center h-dvh">
        <LogoSpinner size="lg" speed="slow" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center h-dvh">
        <LogoSpinner size="lg" speed="slow" />
      </div>
    );
  }

  return <>{children}</>;
}
