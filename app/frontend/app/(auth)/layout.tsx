import Link from "next/link";
import { Shield } from "lucide-react";
import { CircuitBackground } from "@/components/ui/circuit-background";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <CircuitBackground />
      <Link
        href="/"
        className="flex items-center gap-2.5 mb-8 group"
      >
        <div className="flex items-center justify-center h-9 w-9 rounded-xl bg-emerald-500/15 ring-1 ring-emerald-500/20 group-hover:ring-emerald-500/40 transition-all">
          <Shield className="h-[18px] w-[18px] text-emerald-600 dark:text-emerald-400" />
        </div>
        <span className="text-lg font-bold tracking-tight">zpush</span>
      </Link>
      <div className="w-full max-w-md">
        {children}
      </div>
    </div>
  );
}
