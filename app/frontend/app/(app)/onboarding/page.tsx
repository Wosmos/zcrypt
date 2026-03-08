"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { connectPlatform } from "@/lib/api";
import { toast } from "@/store/toast";
import {
  Shield,
  Github,
  ArrowRight,
  Lock,
  Zap,
  Key,
  CheckCircle2,
} from "lucide-react";

type Step = "welcome" | "github" | "done";

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("welcome");
  const [token, setToken] = useState("");
  const [connecting, setConnecting] = useState(false);

  const handleConnect = async () => {
    if (!token.trim()) return;
    setConnecting(true);

    try {
      await connectPlatform("github", token.trim());
      toast.success("GitHub connected!");
      setStep("done");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Connection failed"
      );
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[80dvh]">
      <div className="max-w-md w-full space-y-8 animate-fade-in">
        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2">
          {(["welcome", "github", "done"] as Step[]).map((s, i) => (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                s === step
                  ? "w-8 bg-indigo-500"
                  : i < ["welcome", "github", "done"].indexOf(step)
                    ? "w-4 bg-indigo-500/40"
                    : "w-4 bg-zinc-800"
              }`}
            />
          ))}
        </div>

        {step === "welcome" && (
          <div className="space-y-8 animate-fade-in">
            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 mx-auto">
                <Shield className="h-8 w-8 text-indigo-400" />
              </div>
              <h1 className="text-3xl font-bold text-zinc-100">
                Welcome to zpush
              </h1>
              <p className="text-sm text-zinc-500 max-w-sm mx-auto">
                Encrypted, compressed, zero-knowledge cloud storage using Git
                platforms as free backends.
              </p>
            </div>

            <div className="space-y-2.5">
              <FeatureRow
                icon={<Lock className="h-4 w-4" />}
                title="AES-256-GCM Encryption"
                desc="Files are encrypted before leaving your machine"
              />
              <FeatureRow
                icon={<Zap className="h-4 w-4" />}
                title="Zstd Compression"
                desc="Maximum compression before encryption"
              />
              <FeatureRow
                icon={<Github className="h-4 w-4" />}
                title="Git-backed Storage"
                desc="Disguised as build artifacts in private repos"
              />
            </div>

            <Button className="w-full" size="lg" onClick={() => setStep("github")}>
              Get Started <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        {step === "github" && (
          <div className="space-y-6 animate-fade-in">
            <div className="text-center space-y-3">
              <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-zinc-800/60 mx-auto">
                <Github className="h-7 w-7 text-zinc-200" />
              </div>
              <h2 className="text-2xl font-bold text-zinc-100">
                Connect GitHub
              </h2>
              <p className="text-sm text-zinc-500">
                Create a Personal Access Token with{" "}
                <code className="text-xs bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300">
                  repo
                </code>{" "}
                scope
              </p>
            </div>

            <div className="space-y-4">
              <Input
                type="password"
                placeholder="ghp_xxxxxxxxxxxx"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                icon={<Key className="h-4 w-4" />}
              />

              <Button
                className="w-full"
                size="lg"
                onClick={handleConnect}
                disabled={connecting || !token.trim()}
              >
                {connecting ? "Connecting..." : "Connect"}
              </Button>

              <a
                href="https://github.com/settings/tokens/new?scopes=repo&description=zpush"
                target="_blank"
                rel="noopener noreferrer"
                className="block text-center text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                Generate token on GitHub
              </a>
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="text-center space-y-6 animate-fade-in">
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-emerald-500/10 border border-emerald-800/30 mx-auto">
              <CheckCircle2 className="h-8 w-8 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-zinc-100">
                You&apos;re all set!
              </h2>
              <p className="text-sm text-zinc-500 mt-2">
                Start uploading encrypted files from the dashboard.
              </p>
            </div>
            <Button
              className="w-full"
              size="lg"
              onClick={() => router.push("/dashboard")}
            >
              Go to Dashboard <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function FeatureRow({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-zinc-800/60 bg-zinc-900/30 p-3.5">
      <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-zinc-800/50 text-zinc-400 flex-shrink-0">
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-zinc-200">{title}</p>
        <p className="text-[11px] text-zinc-500">{desc}</p>
      </div>
    </div>
  );
}
