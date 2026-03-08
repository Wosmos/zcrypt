import Link from "next/link";
import { Shield } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <Link
        href="/"
        className="flex items-center gap-2.5 mb-8 group"
      >
        <div className="flex items-center justify-center h-9 w-9 rounded-xl bg-indigo-600/15 ring-1 ring-indigo-500/20 group-hover:ring-indigo-500/40 transition-all">
          <Shield className="h-[18px] w-[18px] text-indigo-500 dark:text-indigo-400" />
        </div>
        <span className="text-lg font-bold tracking-tight">zpush</span>
      </Link>
      <div className="w-full max-w-md">
        {children}
      </div>
    </div>
  );
}
