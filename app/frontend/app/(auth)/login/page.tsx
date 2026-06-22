"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { login, requestMagicLink, getMe } from "@/lib/auth-api";
import { OAuthButtons, DESKTOP_OAUTH_SESSION_KEY } from "@/components/auth/oauth-buttons";
import { useAuthStore } from "@/store/auth";
import { toast } from "@/store/toast";
import { Mail, Lock, ArrowRight, Wand2 } from "@/lib/icons";
import { LogoSpinner } from "@/components/ui/logo-spinner";
import { isTauri } from "@/lib/tauri";

export default function LoginPage() {
  const router = useRouter();
  const { setUser, setTokens } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [magicLinkLoading, setMagicLinkLoading] = useState(false);

  // Desktop OAuth: poll backend for tokens after user completes login in browser
  useEffect(() => {
    if (!isTauri) return;

    let stopped = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    function startPolling() {
      const session = sessionStorage.getItem(DESKTOP_OAUTH_SESSION_KEY);
      if (!session) return;

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
      intervalId = setInterval(async () => {
        if (stopped) return;
        try {
          const res = await fetch(`${apiUrl}/api/auth/oauth/desktop-poll?session=${session}`);
          if (res.status === 404) return; // still pending
          if (!res.ok) return;

          const data = await res.json();
          sessionStorage.removeItem(DESKTOP_OAUTH_SESSION_KEY);
          if (intervalId) clearInterval(intervalId);

          if (data.error) {
            toast.error(data.error);
            return;
          }
          if (data.access_token && data.refresh_token) {
            setTokens(data.access_token, data.refresh_token);
            getMe(data.access_token)
              .then((user) => { setUser(user); router.replace("/dashboard"); })
              .catch(() => { router.replace("/dashboard"); });
          }
        } catch { /* network error, keep polling */ }
      }, 2000);
    }

    // Start polling if there's already a pending session
    startPolling();

    // Also listen for new OAuth attempts
    function onOAuthStart() { startPolling(); }
    window.addEventListener("desktop-oauth-start", onOAuthStart);

    return () => {
      stopped = true;
      if (intervalId) clearInterval(intervalId);
      window.removeEventListener("desktop-oauth-start", onOAuthStart);
    };
  }, [setTokens, setUser, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setLoading(true);
    try {
      const res = await login(email, password);

      if (res.requires_2fa && res.temp_token) {
        sessionStorage.setItem("zcrypt-temp-token", res.temp_token);
        router.push("/2fa-verify");
        return;
      }

      if (res.access_token && res.refresh_token) {
        setTokens(res.access_token, res.refresh_token);
        if (res.user) {
          setUser(res.user);
        }
        router.push("/dashboard");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error("Enter your email first");
      return;
    }
    setMagicLinkLoading(true);
    try {
      await requestMagicLink(email.trim());
      setMagicLinkSent(true);
      toast.success("Login link sent! Check your inbox.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to send login link"
      );
    } finally {
      setMagicLinkLoading(false);
    }
  };

  if (magicLinkSent) {
    return (
      <div className="text-center animate-fade-in">
        <div className="flex justify-center mb-4">
          <div className="h-12 w-12 rounded-full bg-cyan-500/10 flex items-center justify-center">
            <Mail className="h-6 w-6 text-cyan-500" />
          </div>
        </div>
        <h2 className="text-xl font-bold">Check your email</h2>
        <p className="text-sm text-[var(--color-text-secondary)] mt-2 leading-relaxed">
          We sent a login link to{" "}
          <strong className="text-[var(--color-text)]">{email}</strong>. Click
          it to sign in.
        </p>
        <p className="text-xs text-[var(--color-text-muted)] mt-2">
          Didn&apos;t get it? Check your spam folder.
        </p>
        <div className="flex flex-col items-center gap-2 mt-5">
          <button
            onClick={() => {
              setMagicLinkSent(false);
              setMagicLinkLoading(false);
            }}
            className="text-sm text-cyan-600 hover:text-cyan-500 dark:text-cyan-400 dark:hover:text-cyan-300 font-medium transition-colors"
          >
            Send again
          </button>
          <button
            onClick={() => {
              setMagicLinkSent(false);
              setMode("password");
            }}
            className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
          >
            Back to login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">


      <div className="space-y-4">
        <OAuthButtons />

        {/* Mode toggle */}
        <div className="flex gap-1 p-1 rounded-xl bg-[var(--color-surface-1)]">
          <button
            type="button"
            onClick={() => setMode("password")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all ${
              mode === "password"
                ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
            }`}
          >
            <Lock className="h-3 w-3" />
            Password
          </button>
          <button
            type="button"
            onClick={() => setMode("magic")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all ${
              mode === "magic"
                ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
            }`}
          >
            <Wand2 className="h-3 w-3" />
            Magic Link
          </button>
        </div>

        {mode === "password" ? (
          <form onSubmit={handleSubmit} className="space-y-3 animate-fade-in">
            <Input
              label="Email"
              type="email"
              name="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              icon={<Mail className="h-4 w-4" />}
              required
              autoComplete="email"
            />
            <Input
              label="Password"
              type="password"
              name="password"
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              icon={<Lock className="h-4 w-4" />}
              required
              autoComplete="current-password"
            />

            <div className="flex justify-end">
              <Link
                href="/forgot-password"
                className="text-xs text-cyan-600 hover:text-cyan-500 dark:text-cyan-400 dark:hover:text-cyan-300 transition-colors"
              >
                Forgot password?
              </Link>
            </div>

            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={loading || !email.trim() || !password}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <LogoSpinner size={16} speed="fast" />
                  Signing in...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  Sign in <ArrowRight className="h-4 w-4" />
                </span>
              )}
            </Button>
          </form>
        ) : (
          <form
            onSubmit={handleMagicLink}
            className="space-y-3 animate-fade-in"
          >
            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              icon={<Mail className="h-4 w-4" />}
              required
              autoComplete="email"
            />

            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
              We&apos;ll send a one-time login link to your email. No password
              needed.
            </p>

            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={magicLinkLoading || !email.trim()}
            >
              {magicLinkLoading ? (
                <span className="flex items-center gap-2">
                  <LogoSpinner size={16} speed="fast" />
                  Sending link...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Wand2 className="h-4 w-4" />
                  Send login link
                </span>
              )}
            </Button>
          </form>
        )}
      </div>

      <p className="text-center text-sm text-[var(--color-text-secondary)] mt-6">
        Don&apos;t have an account?{" "}
        <Link
          href="/register"
          className="text-cyan-600 hover:text-cyan-500 dark:text-cyan-400 dark:hover:text-cyan-300 font-medium transition-colors"
        >
          Sign up
        </Link>
      </p>
    </div>
  );
}
