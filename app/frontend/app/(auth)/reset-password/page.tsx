"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resetPassword } from "@/lib/auth-api";
import { toast } from "@/store/toast";
import { Lock, ArrowRight, CheckCircle2, AlertTriangle } from "@/lib/icons";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  if (!token) {
    return (
      <div className="text-center animate-fade-in">
        <div className="flex justify-center mb-4">
          <div className="h-12 w-12 rounded-full bg-amber-500/10 flex items-center justify-center">
            <AlertTriangle className="h-6 w-6 text-amber-500" />
          </div>
        </div>
        <h2 className="text-xl font-bold">Invalid link</h2>
        <p className="text-sm text-[var(--color-text-secondary)] mt-2">
          This password reset link is invalid or has expired.
        </p>
        <Link href="/forgot-password">
          <Button variant="secondary" className="mt-5">
            Request a new link
          </Button>
        </Link>
      </div>
    );
  }

  if (success) {
    return (
      <div className="text-center animate-fade-in">
        <div className="flex justify-center mb-4">
          <div className="h-12 w-12 rounded-full bg-cyan-500/10 flex items-center justify-center">
            <CheckCircle2 className="h-6 w-6 text-cyan-500" />
          </div>
        </div>
        <h2 className="text-xl font-bold">Password updated</h2>
        <p className="text-sm text-[var(--color-text-secondary)] mt-2">
          Your password has been reset. You can now sign in.
        </p>
        <Link href="/login">
          <Button className="mt-5">
            Sign in <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>
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

        <Button type="submit" className="w-full" size="lg" disabled={loading}>
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 border-2 border-slate-900/30 border-t-slate-900 rounded-full animate-spin" />
              Resetting...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              Reset password <ArrowRight className="h-4 w-4" />
            </span>
          )}
        </Button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 border-2 border-[var(--color-border)] border-t-cyan-500 rounded-full animate-spin" />
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
