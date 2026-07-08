"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { verifyEmail } from "@/lib/auth-api";
import { AuthStatusCard } from "@/components/auth/auth-status-card";
import { CheckCircle2, XCircle, ArrowRight, AlertTriangle } from "@/lib/icons";
import { LogoSpinner } from "@/components/ui/logo-spinner";

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
      <AuthStatusCard
        icon={AlertTriangle}
        tone="amber"
        title="Invalid link"
        action={
          <Link href="/login">
            <Button variant="secondary" className="mt-5">
              Go to login
            </Button>
          </Link>
        }
      >
        <p className="text-sm text-[var(--color-text-secondary)] mt-2">
          This verification link is invalid or has expired.
        </p>
      </AuthStatusCard>
    );
  }

  if (status === "loading") {
    return (
      <div className="text-center animate-fade-in">
        <div className="flex items-center justify-center mb-4">
          <LogoSpinner size={40} speed="default" />
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
      <AuthStatusCard
        icon={CheckCircle2}
        tone="cyan"
        title="Email verified"
        action={
          <Link href="/login">
            <Button className="mt-5">
              Sign in <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        }
      >
        <p className="text-sm text-[var(--color-text-secondary)] mt-2">
          Your account is now active. You can sign in.
        </p>
      </AuthStatusCard>
    );
  }

  return (
    <AuthStatusCard
      icon={XCircle}
      tone="red"
      title="Verification failed"
      action={
        <Link href="/login">
          <Button variant="secondary" className="mt-5">
            Go to login
          </Button>
        </Link>
      }
    >
      <p className="text-sm text-[var(--color-text-secondary)] mt-2">
        {errorMessage || "The link may have expired. Try requesting a new one."}
      </p>
    </AuthStatusCard>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-16">
          <LogoSpinner size="sm" speed="default" />
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
