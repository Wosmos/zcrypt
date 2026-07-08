import Link from "next/link";
import type { ReactNode } from "react";

/** Shared cyan text-link colors used across the auth flows. */
export const AUTH_LINK_COLORS =
  "text-cyan-600 hover:text-cyan-500 dark:text-cyan-400 dark:hover:text-cyan-300";

/** The full default cyan link class (colors + weight + transition). */
export const AUTH_LINK_CLASS = `${AUTH_LINK_COLORS} font-medium transition-colors`;

interface AuthLinkProps {
  href?: string;
  onClick?: () => void;
  className?: string;
  children: ReactNode;
}

/**
 * Cyan text link shared by the auth pages. Renders a Next `Link` when `href`
 * is given, otherwise a plain `button` (for onClick navigations/actions).
 */
export function AuthLink({
  href,
  onClick,
  className = AUTH_LINK_CLASS,
  children,
}: AuthLinkProps) {
  if (href) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <button onClick={onClick} className={className}>
      {children}
    </button>
  );
}
