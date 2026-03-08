"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { register, login as loginApi, getMe } from "@/lib/auth-api";
import { useAuthStore } from "@/store/auth";
import { toast } from "@/store/toast";
import {
  Mail,
  Lock,
  User,
  ArrowRight,
  UserPlus,
  CheckCircle2,
} from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const { setUser, setTokens } = useAuthStore();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<"verified" | "pending" | false>(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !username || !password) return;

    if (password !== confirmPassword) {
      toast.error("Passwords don't match");
      return;
    }

    // ─── Free-form Password Pattern Constraint Removed ────────────────

    setLoading(true);
    try {
      const res = await register(email, username, password);
      if (res.user?.email_verified) {
        // Auto-verified — log in automatically
        const loginRes = await loginApi(email, password);
        if (loginRes.access_token && loginRes.refresh_token) {
          setTokens(loginRes.access_token, loginRes.refresh_token);
          if (loginRes.user) {
            setUser(loginRes.user);
          } else {
            const me = await getMe(loginRes.access_token);
            setUser(me);
          }
          toast.success("Account created! Welcome aboard.");
          router.push("/dashboard");
          return;
        }
        // Fallback if login somehow fails
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

  if (success === "verified") {
    return (
      <div className="card p-6 sm:p-8 text-center animate-fade-in">
        <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 mb-5">
          <CheckCircle2 className="h-7 w-7 text-emerald-500 dark:text-emerald-400" />
        </div>
        <h2 className="text-xl font-bold">Account created!</h2>
        <p className="text-sm text-[var(--color-text-secondary)] mt-2 max-w-sm mx-auto leading-relaxed">
          Redirecting you to sign in...
        </p>
        <Link href="/login">
          <Button className="mt-6">
            Sign in <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    );
  }

  if (success === "pending") {
    return (
      <div className="card p-6 sm:p-8 text-center animate-fade-in">
        <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 mb-5">
          <CheckCircle2 className="h-7 w-7 text-emerald-500 dark:text-emerald-400" />
        </div>
        <h2 className="text-xl font-bold">Check your email</h2>
        <p className="text-sm text-[var(--color-text-secondary)] mt-2 max-w-sm mx-auto leading-relaxed">
          We sent a verification link to{" "}
          <strong className="text-[var(--color-text)]">{email}</strong>. Click
          it to activate your account.
        </p>
        <Link href="/login">
          <Button variant="secondary" className="mt-6">
            Back to login
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="card p-6 sm:p-8 animate-fade-in">
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-emerald-500/10 mb-4">
          <UserPlus className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h1 className="text-xl font-bold">Create your vault</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          Free encrypted storage. No credit card.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
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
        <Input
          label="Username"
          type="text"
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
              Creating account...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              Create account <ArrowRight className="h-4 w-4" />
            </span>
          )}
        </Button>
      </form>

      <p className="text-center text-sm text-[var(--color-text-secondary)] mt-6">
        Already have an account?{" "}
        <Link
          href="/login"
          className="text-emerald-600 hover:text-emerald-500 dark:text-emerald-400 dark:hover:text-emerald-300 font-medium transition-colors"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
