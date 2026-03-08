"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { verifyEmail } from "@/lib/auth-api";
import { CheckCircle2, XCircle, ArrowRight, AlertTriangle } from "lucide-react";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"loading" | "success" | "error" | "invalid">(
    token ? "loading" : "invalid"
  );
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!token) return;

    verifyEmail(token)
      .then(() => setStatus("success"))
      .catch((err) => {
        setStatus("error");
        setErrorMessage(err instanceof Error ? err.message : "Verification failed");
      });
  }, [token]);

  if (status === "invalid") {
    return (
      <div className="card p-6 sm:p-8 text-center animate-fade-in">
        <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 mb-5">
          <AlertTriangle className="h-7 w-7 text-amber-500 dark:text-amber-400" />
        </div>
        <h2 className="text-xl font-bold">Invalid link</h2>
        <p className="text-sm text-[var(--color-text-secondary)] mt-2">
          This verification link is invalid or has expired.
        </p>
        <Link href="/login">
          <Button variant="secondary" className="mt-6">
            Go to login
          </Button>
        </Link>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="card p-6 sm:p-8 text-center animate-fade-in">
        <div className="flex items-center justify-center mb-5">
          <div className="h-10 w-10 border-2 border-[var(--color-border)] border-t-emerald-500 rounded-full animate-spin" />
        </div>
        <h2 className="text-xl font-bold">Verifying your email...</h2>
        <p className="text-sm text-[var(--color-text-secondary)] mt-2">
          Just a moment
        </p>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="card p-6 sm:p-8 text-center animate-fade-in">
        <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 mb-5">
          <CheckCircle2 className="h-7 w-7 text-emerald-500 dark:text-emerald-400" />
        </div>
        <h2 className="text-xl font-bold">Email verified</h2>
        <p className="text-sm text-[var(--color-text-secondary)] mt-2">
          Your account is now active. You can sign in.
        </p>
        <Link href="/login">
          <Button className="mt-6">
            Sign in <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="card p-6 sm:p-8 text-center animate-fade-in">
      <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-red-500/10 border border-red-500/20 mb-5">
        <XCircle className="h-7 w-7 text-red-500 dark:text-red-400" />
      </div>
      <h2 className="text-xl font-bold">Verification failed</h2>
      <p className="text-sm text-[var(--color-text-secondary)] mt-2">
        {errorMessage || "The link may have expired. Try requesting a new one."}
      </p>
      <Link href="/login">
        <Button variant="secondary" className="mt-6">
          Go to login
        </Button>
      </Link>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 border-2 border-[var(--color-border)] border-t-emerald-500 rounded-full animate-spin" />
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
