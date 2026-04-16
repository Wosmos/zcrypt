"use client";

import { useSearchParams } from "next/navigation";

/**
 * Browser page shown after desktop OAuth completes.
 * Tokens are stored server-side for the desktop app to poll —
 * this page just tells the user to go back to the app.
 */
export default function DesktopRelayPage() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  return (
    <div className="flex flex-col items-center justify-center gap-6 text-center px-4">
      {error ? (
        <>
          <div className="flex items-center justify-center h-16 w-16 rounded-2xl bg-red-500/10 ring-1 ring-red-500/20">
            <svg className="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              Login failed
            </h2>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              {error}
            </p>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-center h-16 w-16 rounded-2xl bg-emerald-500/10 ring-1 ring-emerald-500/20">
            <svg className="h-8 w-8 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              Login successful
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
