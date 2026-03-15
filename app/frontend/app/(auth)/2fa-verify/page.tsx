"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { verify2FA, getMe } from "@/lib/auth-api";
import { useAuthStore } from "@/store/auth";
import { toast } from "@/store/toast";
import { ArrowLeft } from "@/lib/icons";
import { LogoSpinner } from "@/components/ui/logo-spinner";

export default function TwoFactorVerifyPage() {
  const router = useRouter();
  const { setUser, setTokens } = useAuthStore();
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const tempToken =
    typeof window !== "undefined"
      ? sessionStorage.getItem("zcrypt-temp-token")
      : null;

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newCode = [...code];
    newCode[index] = value.slice(-1);
    setCode(newCode);

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    if (index === 5 && value) {
      const fullCode = newCode.join("");
      if (fullCode.length === 6) {
        handleSubmit(fullCode);
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 6);
    const newCode = [...code];
    for (let i = 0; i < 6; i++) {
      newCode[i] = pasted[i] || "";
    }
    setCode(newCode);
    if (pasted.length === 6) {
      handleSubmit(pasted);
    } else {
      inputRefs.current[pasted.length]?.focus();
    }
  };

  const handleSubmit = async (codeStr?: string) => {
    const fullCode = codeStr || code.join("");
    if (fullCode.length !== 6) {
      toast.warning("Enter all 6 digits");
      return;
    }
    if (!tempToken) {
      toast.error("Session expired. Please log in again.");
      router.push("/login");
      return;
    }

    setLoading(true);
    try {
      const res = await verify2FA(tempToken, fullCode);

      if (res.access_token && res.refresh_token) {
        sessionStorage.removeItem("zcrypt-temp-token");
        setTokens(res.access_token, res.refresh_token);
        if (res.user) {
          setUser(res.user);
        } else {
          const me = await getMe(res.access_token);
          setUser(me);
        }
        router.push("/dashboard");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invalid code");
      setCode(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight">
          Two-factor authentication
        </h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          Enter the 6-digit code from your authenticator app
        </p>
      </div>

      <div className="flex justify-center gap-2 mb-5" onPaste={handlePaste}>
        {code.map((digit, i) => (
          <input
            key={i}
            ref={(el) => {
              inputRefs.current[i] = el;
            }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            className="w-11 h-13 text-center text-xl font-bold rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] focus:border-cyan-500/40 focus:ring-2 focus:ring-cyan-500/10 outline-none transition-all"
            disabled={loading}
          />
        ))}
      </div>

      <Button
        onClick={() => handleSubmit()}
        className="w-full"
        size="lg"
        disabled={loading || code.join("").length !== 6}
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <LogoSpinner size={16} speed="fast" />
            Verifying...
          </span>
        ) : (
          "Verify"
        )}
      </Button>

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
