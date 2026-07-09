"use client";

import { AlertCircle } from "@/lib/icons";
import { LogoSpinner } from "@/components/ui/logo-spinner";
import { cn } from "@/lib/utils";

/** Centered spinner shown while a viewer is decoding its blob. */
export function ViewerLoading() {
  return (
    <div className="flex h-full items-center justify-center">
      <LogoSpinner size="sm" speed="fast" />
    </div>
  );
}

/** Centered error message shown when a viewer fails to decode its blob. */
export function ViewerError({
  message,
  gap = "gap-2",
  children,
}: {
  message: string;
  gap?: "gap-2" | "gap-3";
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("flex h-full flex-col items-center justify-center text-[var(--color-text-muted)]", gap)}>
      <AlertCircle className="h-8 w-8 opacity-50" />
      <p className="text-sm">{message}</p>
      {children}
    </div>
  );
}
