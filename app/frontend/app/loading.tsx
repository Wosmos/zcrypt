import { Shield } from "lucide-react";

export default function RootLoading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] animate-fade-in">
      <div className="relative">
        <div className="h-10 w-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
          <Shield className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="absolute -inset-2 rounded-2xl border-2 border-emerald-500/20 animate-ping" />
      </div>
      <p className="text-sm text-[var(--color-text-muted)] mt-6">Loading...</p>
    </div>
  );
}
