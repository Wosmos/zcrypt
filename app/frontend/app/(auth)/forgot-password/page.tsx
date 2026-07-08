"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { forgotPassword } from "@/lib/auth-api";
import { AuthStatusCard } from "@/components/auth/auth-status-card";
import { AuthLink, AUTH_LINK_CLASS } from "@/components/auth/auth-link";
import { SubmitButton } from "@/components/auth/submit-button";
import { toast } from "@/store/toast";
import { Mail, ArrowRight, ArrowLeft, CheckCircle2 } from "@/lib/icons";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    try {
      await forgotPassword(email);
      setSent(true);
    } catch {
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <AuthStatusCard
        icon={CheckCircle2}
        tone="cyan"
        title="Check your email"
        action={
          <Link href="/login">
            <Button variant="secondary" className="mt-5">
              <ArrowLeft className="h-4 w-4" /> Back to login
            </Button>
          </Link>
        }
      >
        <p className="text-sm text-[var(--color-text-secondary)] mt-2 leading-relaxed">
          If an account exists for{" "}
          <strong className="text-[var(--color-text)]">{email}</strong>,
          you&apos;ll receive a password reset link shortly.
        </p>
      </AuthStatusCard>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight">Reset password</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          Enter your email and we&apos;ll send a reset link
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
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

        <SubmitButton
          type="submit"
          loading={loading}
          disabled={loading || !email.trim()}
          loadingLabel="Sending..."
          icon={ArrowRight}
        >
          Send reset link
        </SubmitButton>
      </form>

      <p className="text-center text-sm text-[var(--color-text-secondary)] mt-6">
        <AuthLink
          href="/login"
          className={`${AUTH_LINK_CLASS} inline-flex items-center gap-1`}
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to login
        </AuthLink>
      </p>
    </div>
  );
}
