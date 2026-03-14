import Link from "next/link";
import { Shield } from "@/lib/icons";
import { CircuitBackground } from "@/components/ui/circuit-background";
import { AuthGuard } from "@/components/auth/auth-guard";

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard skipOnboardingCheck>
      <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
        <CircuitBackground />
        <Link
          href="/"
          className="flex items-center gap-2.5 mb-8 group"
        >
          <div className="flex items-center justify-center h-9 w-9 rounded-xl bg-cyan-500/15 ring-1 ring-cyan-500/20 group-hover:ring-cyan-500/40 transition-all">
            <Shield className="h-[18px] w-[18px] text-cyan-600 dark:text-cyan-400" />
          </div>
          <span className="text-lg font-bold tracking-tight">zcrypt</span>
        </Link>
        <div className="w-full max-w-lg">
          {children}
        </div>
      </div>
    </AuthGuard>
  );
}
