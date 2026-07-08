"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, User, Crown } from "@/lib/icons";
import { Role } from "@/types";

// Pill shape shared by the admin badges (rounded-full, tighter padding, medium weight)
const pillClass = "gap-1 rounded-full px-2 font-medium";

const planVariant = (plan: string) =>
  plan === "pro" ? "violet" : plan === "plus" ? "blue" : "muted";

/**
 * Role / plan pills shared by the admin user table and the user-detail header.
 *
 * The two call sites render two different shells for the *same* content:
 *   - the user table uses the `Badge` primitive (a `<div>`),
 *   - the user-detail header uses a hand-rolled bordered `<span>`.
 * `bordered` selects the second look so both sites stay pixel- and DOM-identical
 * to what they rendered before this extraction.
 */
export function RoleBadge({ role, bordered = false }: { role: Role; bordered?: boolean }) {
  const icon = role === Role.Admin ? <ShieldCheck className="h-3 w-3" /> : <User className="h-3 w-3" />;
  if (bordered) {
    return (
      <span className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        role === Role.Admin
          ? "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400"
          : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-muted)]"
      )}>
        {icon}
        {role}
      </span>
    );
  }
  return (
    <Badge variant={role === Role.Admin ? "amber" : "muted"} className={pillClass}>
      {icon}
      {role}
    </Badge>
  );
}

export function PlanBadge({ plan, bordered = false }: { plan: string; bordered?: boolean }) {
  const showCrown = ["pro", "plus"].includes(plan);
  if (bordered) {
    return (
      <span className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        plan === "pro"
          ? "border-violet-500/20 bg-violet-500/10 text-violet-600 dark:text-violet-400"
          : plan === "plus"
            ? "border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400"
            : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-muted)]"
      )}>
        {showCrown && <Crown className="h-3 w-3" />}
        {plan}
      </span>
    );
  }
  return (
    <Badge variant={planVariant(plan)} className={pillClass}>
      {showCrown && <Crown className="h-3 w-3" />}
      {plan}
    </Badge>
  );
}
