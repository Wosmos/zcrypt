import type { ReactNode } from "react";

/** Type of any icon component exported from `@/lib/icons`. */
type StatusIcon = (typeof import("@/lib/icons"))["File"];

type Tone = "cyan" | "amber" | "red";

const TONE_BG: Record<Tone, string> = {
  cyan: "bg-cyan-500/10",
  amber: "bg-amber-500/10",
  red: "bg-red-500/10",
};

const TONE_ICON: Record<Tone, string> = {
  cyan: "text-cyan-500",
  amber: "text-amber-500",
  red: "text-red-500",
};

interface AuthStatusCardProps {
  icon: StatusIcon;
  tone: Tone;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}

/**
 * Centered status card used across the auth flows: a tinted icon circle, a
 * bold title, freeform body (`children`), and an optional `action` slot.
 */
export function AuthStatusCard({
  icon: Icon,
  tone,
  title,
  children,
  action,
}: AuthStatusCardProps) {
  return (
    <div className="text-center animate-fade-in">
      <div className="flex justify-center mb-4">
        <div
          className={`h-12 w-12 rounded-full ${TONE_BG[tone]} flex items-center justify-center`}
        >
          <Icon className={`h-6 w-6 ${TONE_ICON[tone]}`} />
        </div>
      </div>
      <h2 className="text-xl font-bold">{title}</h2>
      {children}
      {action}
    </div>
  );
}
