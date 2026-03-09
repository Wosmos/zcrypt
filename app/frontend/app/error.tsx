"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4">
      <div className="max-w-md text-center">
        <h2 className="text-2xl font-bold text-white mb-2">Something went wrong</h2>
        <p className="text-neutral-400 mb-6">
          An unexpected error occurred. Please try again.
        </p>
        <button
          onClick={reset}
          className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-200 transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
