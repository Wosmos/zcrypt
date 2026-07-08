"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { registerWithBreachCheck, login as loginApi } from "@/lib/auth-api";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { AuthStatusCard } from "@/components/auth/auth-status-card";
import { AuthLink } from "@/components/auth/auth-link";
import { SubmitButton } from "@/components/auth/submit-button";
import { useAuthStore } from "@/store/auth";
import { toast } from "@/store/toast";
import {
  Mail,
  Lock,
  User,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
} from "@/lib/icons";

export default function RegisterPage() {
  const router = useRouter();
  const { setUser, setTokens } = useAuthStore();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<"verified" | "pending" | false>(false);
  const [breachWarning, setBreachWarning] = useState<{
    message: string;
    count: number;
  } | null>(null);

  const doRegister = async (force: boolean) => {
    setLoading(true);
    try {
      const res = await registerWithBreachCheck(email, username, password, force);

      if (res.requires === "force" && res.warning && !force) {
        setBreachWarning({ message: res.warning, count: res.breach_count ?? 0 });
        setLoading(false);
        return;
      }

      setBreachWarning(null);

      if (res.user?.email_verified) {
        const loginRes = await loginApi(email, password);
        if (loginRes.access_token && loginRes.refresh_token) {
          setTokens(loginRes.access_token, loginRes.refresh_token);
          if (loginRes.user) {
            setUser(loginRes.user);
          }
          toast.success("Account created! Welcome aboard.");
          router.push("/dashboard");
          return;
        }
        setSuccess("verified");
        toast.success("Account created! You can now sign in.");
        setTimeout(() => router.push("/login"), 1500);
      } else {
        setSuccess("pending");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !username || !password) return;

    if (password !== confirmPassword) {
      toast.error("Passwords don't match");
      return;
    }

    await doRegister(false);
  };

  if (success === "verified") {
    return (
      <AuthStatusCard
        icon={CheckCircle2}
        tone="cyan"
        title="Account created!"
        action={
          <Link href="/login">
            <Button className="mt-5">
              Sign in <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        }
      >
        <p className="text-sm text-[var(--color-text-secondary)] mt-2 leading-relaxed">
          Redirecting you to sign in...
        </p>
      </AuthStatusCard>
    );
  }

  if (success === "pending") {
    return (
      <AuthStatusCard
        icon={CheckCircle2}
        tone="cyan"
        title="Check your email"
        action={
          <Link href="/login">
            <Button variant="secondary" className="mt-5">
              Back to login
            </Button>
          </Link>
        }
      >
        <p className="text-sm text-[var(--color-text-secondary)] mt-2 leading-relaxed">
          We sent a verification link to{" "}
          <strong className="text-[var(--color-text)]">{email}</strong>. Click
          it to activate your account.
        </p>
      </AuthStatusCard>
    );
  }

  return (
    <div className="animate-fade-in">
     

      <div className="space-y-4">
        <OAuthButtons />

        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            label="Email"
            type="email"
            name="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            icon={<Mail className="h-4 w-4" />}
            required
            autoComplete="email"
          />
          <Input
            label="Username"
            type="text"
            name="username"
            placeholder="Choose a username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            icon={<User className="h-4 w-4" />}
            required
            autoComplete="username"
          />
          <Input
            label="Password"
            type="password"
            name="password"
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
            name="confirmPassword"
            placeholder="Type it again"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            icon={<Lock className="h-4 w-4" />}
            required
            autoComplete="new-password"
          />

          {/* Breach warning */}
          {breachWarning && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 animate-fade-in">
              <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">
                  Password found in{" "}
                  {breachWarning.count.toLocaleString()} data breach
                  {breachWarning.count !== 1 ? "es" : ""}
                </p>
                <p className="text-xs text-amber-600/70 dark:text-amber-400/60 mt-0.5">
                  Consider using a different password.
                </p>
                <button
                  type="button"
                  onClick={() => doRegister(true)}
                  disabled={loading}
                  className="mt-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 underline hover:no-underline transition-colors"
                >
                  Use this password anyway
                </button>
              </div>
            </div>
          )}

          <SubmitButton
            type="submit"
            loading={loading}
            disabled={loading || !email.trim() || !username.trim() || !password || !confirmPassword}
            loadingLabel="Creating account..."
            icon={ArrowRight}
          >
            Create account
          </SubmitButton>
        </form>
      </div>

      <p className="text-center text-sm text-[var(--color-text-secondary)] mt-5">
        Already have an account?{" "}
        <AuthLink href="/login">Sign in</AuthLink>
      </p>
    </div>
  );
}
