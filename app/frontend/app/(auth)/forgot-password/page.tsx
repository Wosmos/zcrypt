"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { forgotPassword } from "@/lib/auth-api";
import { toast } from "@/store/toast";
import { Mail, ArrowRight, ArrowLeft, CheckCircle2 } from "@/lib/icons";
import { LogoSpinner } from "@/components/ui/logo-spinner";

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
      <div className="text-center animate-fade-in">
        <div className="flex justify-center mb-4">
          <div className="h-12 w-12 rounded-full bg-cyan-500/10 flex items-center justify-center">
            <CheckCircle2 className="h-6 w-6 text-cyan-500" />
          </div>
        </div>
        <h2 className="text-xl font-bold">Check your email</h2>
        <p className="text-sm text-[var(--color-text-secondary)] mt-2 leading-relaxed">
          If an account exists for{" "}
          <strong className="text-[var(--color-text)]">{email}</strong>,
          you&apos;ll receive a password reset link shortly.
        </p>
        <Link href="/login">
          <Button variant="secondary" className="mt-5">
            <ArrowLeft className="h-4 w-4" /> Back to login
          </Button>
        </Link>
      </div>
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

        <Button type="submit" className="w-full" size="lg" disabled={loading || !email.trim()}>
          {loading ? (
            <span className="flex items-center gap-2">
              <LogoSpinner size={16} speed="fast" />
              Sending...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              Send reset link <ArrowRight className="h-4 w-4" />
            </span>
          )}
        </Button>
      </form>

      <p className="text-center text-sm text-[var(--color-text-secondary)] mt-6">
        <Link
          href="/login"
          className="text-cyan-600 hover:text-cyan-500 dark:text-cyan-400 dark:hover:text-cyan-300 font-medium transition-colors inline-flex items-center gap-1"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to login
        </Link>
      </p>
    </div>
  );
}
