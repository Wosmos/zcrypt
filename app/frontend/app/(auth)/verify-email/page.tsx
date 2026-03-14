"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { verifyEmail } from "@/lib/auth-api";
import { CheckCircle2, XCircle, ArrowRight, AlertTriangle } from "@/lib/icons";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<
    "loading" | "success" | "error" | "invalid"
  >(token ? "loading" : "invalid");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!token) return;

    verifyEmail(token)
      .then(() => setStatus("success"))
      .catch((err) => {
        setStatus("error");
        setErrorMessage(
          err instanceof Error ? err.message : "Verification failed"
        );
      });
  }, [token]);

  if (status === "invalid") {
    return (
      <div className="text-center animate-fade-in">
        <div className="flex justify-center mb-4">
          <div className="h-12 w-12 rounded-full bg-amber-500/10 flex items-center justify-center">
            <AlertTriangle className="h-6 w-6 text-amber-500" />
          </div>
        </div>
        <h2 className="text-xl font-bold">Invalid link</h2>
        <p className="text-sm text-[var(--color-text-secondary)] mt-2">
          This verification link is invalid or has expired.
        </p>
        <Link href="/login">
          <Button variant="secondary" className="mt-5">
            Go to login
          </Button>
        </Link>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="text-center animate-fade-in">
        <div className="flex items-center justify-center mb-4">
          <div className="h-10 w-10 border-2 border-[var(--color-border)] border-t-cyan-500 rounded-full animate-spin" />
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
      <div className="text-center animate-fade-in">
        <div className="flex justify-center mb-4">
          <div className="h-12 w-12 rounded-full bg-cyan-500/10 flex items-center justify-center">
            <CheckCircle2 className="h-6 w-6 text-cyan-500" />
          </div>
        </div>
        <h2 className="text-xl font-bold">Email verified</h2>
        <p className="text-sm text-[var(--color-text-secondary)] mt-2">
          Your account is now active. You can sign in.
        </p>
        <Link href="/login">
          <Button className="mt-5">
            Sign in <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="text-center animate-fade-in">
      <div className="flex justify-center mb-4">
        <div className="h-12 w-12 rounded-full bg-red-500/10 flex items-center justify-center">
          <XCircle className="h-6 w-6 text-red-500" />
        </div>
      </div>
      <h2 className="text-xl font-bold">Verification failed</h2>
      <p className="text-sm text-[var(--color-text-secondary)] mt-2">
        {errorMessage || "The link may have expired. Try requesting a new one."}
      </p>
      <Link href="/login">
        <Button variant="secondary" className="mt-5">
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
          <div className="h-6 w-6 border-2 border-[var(--color-border)] border-t-cyan-500 rounded-full animate-spin" />
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
