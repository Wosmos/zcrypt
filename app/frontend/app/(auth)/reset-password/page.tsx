"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resetPassword } from "@/lib/auth-api";
import { AuthStatusCard } from "@/components/auth/auth-status-card";
import { SubmitButton } from "@/components/auth/submit-button";
import { toast } from "@/store/toast";
import { Lock, ArrowRight, CheckCircle2, AlertTriangle } from "@/lib/icons";
import { LogoSpinner } from "@/components/ui/logo-spinner";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  if (!token) {
    return (
      <AuthStatusCard
        icon={AlertTriangle}
        tone="amber"
        title="Invalid link"
        action={
          <Link href="/forgot-password">
            <Button variant="secondary" className="mt-5">
              Request a new link
            </Button>
          </Link>
        }
      >
        <p className="text-sm text-[var(--color-text-secondary)] mt-2">
          This password reset link is invalid or has expired.
        </p>
      </AuthStatusCard>
    );
  }

  if (success) {
    return (
      <AuthStatusCard
        icon={CheckCircle2}
        tone="cyan"
        title="Password updated"
        action={
          <Link href="/login">
            <Button className="mt-5">
              Sign in <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        }
      >
        <p className="text-sm text-[var(--color-text-secondary)] mt-2">
          Your password has been reset. You can now sign in.
        </p>
      </AuthStatusCard>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error("Passwords don't match");
      return;
    }

    setLoading(true);
    try {
      await resetPassword(token, password);
      setSuccess(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight">New password</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          Choose a new password for your vault
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <Input
          label="New Password"
          type="password"
          placeholder="Your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          icon={<Lock className="h-4 w-4" />}
          required
          autoComplete="new-password"
        />
        <Input
          label="Confirm Password"
          type="password"
          placeholder="Type it again"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          icon={<Lock className="h-4 w-4" />}
          required
          autoComplete="new-password"
        />

        <SubmitButton
          type="submit"
          loading={loading}
          disabled={loading || !password || !confirmPassword}
          loadingLabel="Resetting..."
          icon={ArrowRight}
        >
          Reset password
        </SubmitButton>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-16">
          <LogoSpinner size="sm" speed="default" />
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
