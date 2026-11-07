import type { SVGProps } from "react";
import { Github, Globe, Mail } from "@/lib/icons";
import { cn } from "@/lib/utils";

/**
 * Single source of truth for the maker behind zcrypt.
 * Used by the /about page, the philosophy "who's behind this" section,
 * the landing "built by" strip, and the marketing footer.
 */
export const WOSMO = {
  name: "Wasif Malik",
  handle: "Wosmo",
  role: "Full-stack engineer",
  location: "Karachi, Pakistan",
  tagline: "I build real systems, not just CRUD apps.",
  portfolio: "https://wosmos.vercel.app",
  github: "https://github.com/Wosmos",
  linkedin: "https://www.linkedin.com/in/wasif-m-79205a1bb/",
  instagram: "https://www.instagram.com/wosmo_tech/",
  hashnode: "https://hashnode.com/@Wosmo",
  email: "m.wasifmalik17@gmail.com",
} as const;

/**
 * The full "Wosmo" wordmark (public/wosmo-wordmark.svg), drawn as a mask over
 * `currentColor` so it follows the theme. The file is fetched once and cached
 * instead of inlining 5 KB of path data into every page's HTML. Size it via
 * className height, e.g. `h-4 w-auto`.
 */
export function WosmoWordmark({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Wosmo"
      className={cn(
        "block aspect-[1291.84/260.2] bg-current [mask:url(/wosmo-wordmark.svg)_center/contain_no-repeat]",
        className,
      )}
    />
  );
}

// ─── Brand glyphs not carried by the Hugeicons barrel ────────────────────────
function LinkedInGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.07 2.07 0 1 1 0-4.14 2.07 2.07 0 0 1 0 4.14zM7.12 20.45H3.55V9h3.57v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.55C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.72C24 .77 23.2 0 22.22 0z" />
    </svg>
  );
}

function InstagramGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.7 3.7 0 0 1-1.38-.9 3.7 3.7 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23-.06-1.27-.07-1.65-.07-4.85s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16zM12 0C8.74 0 8.33.01 7.05.07c-1.28.06-2.15.26-2.91.56-.79.3-1.46.72-2.12 1.38A5.86 5.86 0 0 0 .63 4.14c-.3.76-.5 1.63-.56 2.91C.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.28.26 2.15.56 2.91.3.79.72 1.46 1.38 2.12.66.66 1.33 1.08 2.12 1.38.76.3 1.63.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.28-.06 2.15-.26 2.91-.56a5.86 5.86 0 0 0 2.12-1.38 5.86 5.86 0 0 0 1.38-2.12c.3-.76.5-1.63.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.28-.26-2.15-.56-2.91a5.86 5.86 0 0 0-1.38-2.12A5.86 5.86 0 0 0 19.86.63c-.76-.3-1.63-.5-2.91-.56C15.67.01 15.26 0 12 0zm0 5.84a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm7.85-10.4a1.44 1.44 0 1 1-2.88 0 1.44 1.44 0 0 1 2.88 0z" />
    </svg>
  );
}

function HashnodeGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M22.35 9.39l-7.74-7.74a3.6 3.6 0 0 0-5.11 0L1.65 9.39a3.6 3.6 0 0 0 0 5.11l7.74 7.74a3.6 3.6 0 0 0 5.11 0l7.74-7.74a3.6 3.6 0 0 0 0-5.11zM12 15.53a3.53 3.53 0 1 1 0-7.06 3.53 3.53 0 0 1 0 7.06z" />
    </svg>
  );
}

export type WosmoSocial = {
  label: string;
  href: string;
  Icon: React.ComponentType<{ className?: string }>;
};

/** Ordered social/contact links for the maker. */
export const WOSMO_SOCIALS: WosmoSocial[] = [
  { label: "Portfolio", href: WOSMO.portfolio, Icon: Globe },
  { label: "GitHub", href: WOSMO.github, Icon: Github },
  { label: "LinkedIn", href: WOSMO.linkedin, Icon: LinkedInGlyph },
  { label: "Instagram", href: WOSMO.instagram, Icon: InstagramGlyph },
  { label: "Hashnode", href: WOSMO.hashnode, Icon: HashnodeGlyph },
  { label: "Email", href: `mailto:${WOSMO.email}`, Icon: Mail },
];
