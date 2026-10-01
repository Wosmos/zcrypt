"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

type Stage = "idle" | "approving" | "approved" | "failed";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

/**
 * Browser page shown after desktop OAuth completes.
 * The sign-in waits server-side until the person approves it here, from the
 * browser that finished the login, so a link someone else built cannot hand
 * the session to their own app. The desktop app then collects it.
 */
export default function DesktopRelayPage() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const [approval, setApproval] = useState({ session: "", token: "", code: "" });
  const [stage, setStage] = useState<Stage>("idle");

  useEffect(() => {
    const p = new URLSearchParams(window.location.hash.substring(1));
    const session = p.get("session") ?? "";
    const token = p.get("approve") ?? "";
    if (session && token) {
      setApproval({ session, token, code: p.get("code") ?? "" });
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  const approve = async () => {
    setStage("approving");
    try {
      const res = await fetch(`${API_BASE}/api/auth/oauth/desktop-approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session: approval.session, token: approval.token }),
      });
      setStage(res.ok ? "approved" : "failed");
    } catch {
      setStage("failed");
    }
  };

  const awaiting = !error && stage !== "approved" && stage !== "failed";

  return (
    <div className="flex flex-col items-center justify-center gap-6 text-center px-4">
      {error ? (
        <>
          <div className="flex items-center justify-center h-16 w-16 rounded-2xl bg-red-500/10 ring-1 ring-red-500/20">
            <svg
              className="h-8 w-8 text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Login failed</h2>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">{error}</p>
          </div>
        </>
      ) : stage === "failed" || (awaiting && !approval.token) ? (
        <div>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
            Nothing to approve
          </h2>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            This sign-in expired or was already handled. Start again from the zcrypt app.
          </p>
        </div>
      ) : awaiting ? (
        <div className="max-w-sm space-y-4">
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
            Sign in to the zcrypt app?
          </h2>
          {approval.code ? (
            <>
              <p className="text-sm text-[var(--color-text-muted)]">
                Approve only if the app on your device shows this code.
              </p>
              <p className="font-mono text-3xl tracking-[0.25em] text-[var(--color-text-primary)]">
                {approval.code}
              </p>
            </>
          ) : (
            <p className="text-sm text-[var(--color-text-muted)]">
              Approve only if you just started this sign-in from the zcrypt app yourself.
            </p>
          )}
          <Button onClick={approve} disabled={stage === "approving"} className="w-full">
            Approve sign-in
          </Button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-center h-16 w-16 rounded-2xl bg-emerald-500/10 ring-1 ring-emerald-500/20">
            <svg
              className="h-8 w-8 text-emerald-400"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              Sign-in approved
            </h2>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              You can close this tab and return to the zcrypt app.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
