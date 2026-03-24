import type { SVGProps } from "react";

interface NavIconProps extends SVGProps<SVGSVGElement> {
  filled?: boolean;
}

/**
 * Premium Tech Vault: Features a layered shield with 
 * a "digital core" lock and segmented borders.
 */
export function VaultIcon({ filled, className, ...props }: NavIconProps) {
  const strokeWidth = filled ? 1.8 : 1.4;
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} {...props}>
      <path
        d="M12 2L4 6v6c0 5.5 3.5 10 8 11.5 4.5-1.5 8-6 8-11.5V6l-8-4z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        fill={filled ? "currentColor" : "none"}
        fillOpacity={filled ? 0.15 : 0}
      />
      {/* Internal Security Detail */}
      <circle cx="12" cy="11" r="2.5" stroke="currentColor" strokeWidth={1.2} />
      <path 
        d="M12 13.5V17M10 17h4" 
        stroke="currentColor" 
        strokeWidth={1.2} 
        strokeLinecap="round" 
      />
      {/* Decorative tech corners */}
      <path d="M7 8l2-1M15 7l2 1" stroke="currentColor" strokeWidth={1} opacity={0.6} />
    </svg>
  );
}

/**
 * Premium Tech Notes: Replaced simple lines with a 
 * "grid-terminal" feel and a dynamic page fold.
 */
export function NotesIcon({ filled, className, ...props }: NavIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} {...props}>
      <path
        d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h10l4 4v12a2 2 0 01-2 2z"
        stroke="currentColor"
        strokeWidth={filled ? 1.8 : 1.5}
        strokeLinejoin="round"
        fill={filled ? "currentColor" : "none"}
        fillOpacity={filled ? 0.1 : 0}
      />
      {/* Tech 'lines' - varied lengths feel like code/data */}
      <path d="M7 8h4M7 12h10M7 16h7" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <path d="M15 3v4h4" stroke="currentColor" strokeWidth={1.2} strokeLinejoin="round" />
      {filled && <rect x="15" y="11" width="2" height="2" fill="currentColor" opacity={0.5} />}
    </svg>
  );
}

/**
 * Premium Share: Designed to look like a "Node Cluster."
 * Uses concentric circles to give it a techy, network-depth feel.
 */
export function ShareIcon({ filled, className, ...props }: NavIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} {...props}>
      {/* Connections */}
      <path d="M8.5 13.5l7 4M15.5 6.5l-7 4" stroke="currentColor" strokeWidth={1.5} opacity={0.6} />
      {/* Nodes */}
      <circle cx="18" cy="5" r="3" stroke="currentColor" strokeWidth={1.5} fill={filled ? "currentColor" : "none"} fillOpacity={0.2} />
      <circle cx="6" cy="12" r="3" stroke="currentColor" strokeWidth={1.5} fill={filled ? "currentColor" : "none"} fillOpacity={0.2} />
      <circle cx="18" cy="19" r="3" stroke="currentColor" strokeWidth={1.5} fill={filled ? "currentColor" : "none"} fillOpacity={0.2} />
      {/* Micro Inner-dots for tech detail */}
      <circle cx="18" cy="5" r="0.5" fill="currentColor" />
      <circle cx="6" cy="12" r="0.5" fill="currentColor" />
      <circle cx="18" cy="19" r="0.5" fill="currentColor" />
    </svg>
  );
}

/**
 * Premium Gear: A futuristic "Control Hub" aesthetic.
 * Uses a hollowed-out center and segmented teeth.
 */
export function GearIcon({ filled, className, ...props }: NavIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} {...props}>
      <path
        d="M10.2 3.3c.6-1.1 2.1-1.1 2.7 0l.9 1.6c.2.4.7.6 1.1.5l1.8-.4c1.2-.3 2.3.8 2 2l-.4 1.8c-.1.4.1.9.5 1.1l1.6.9c1.1.6 1.1 2.1 0 2.7l-1.6.9c-.4.2-.6.7-.5 1.1l.4 1.8c.3 1.2-.8 2.3-2 2l-1.8-.4c-.4-.1-.9.1-1.1.5l-.9 1.6c-.6 1.1-2.1 1.1-2.7 0l-.9-1.6c-.2-.4-.7-.6-1.1-.5l-1.8.4c-1.2.3-2.3-.8-2-2l.4-1.8c.1-.4-.1-.9-.5-1.1l-1.6-.9c-1.1-.6-1.1-2.1 0-2.7l1.6-.9c.4-.2.6-.7.5-1.1l-.4-1.8c-.3-1.2.8-2.3 2-2l1.8.4c.4.1.9-.1 1.1-.5l.9-1.6z"
        stroke="currentColor"
        strokeWidth={1.5}
        fill={filled ? "currentColor" : "none"}
        fillOpacity={filled ? 0.1 : 0}
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth={1.5} />
      {/* Decorative crosshairs */}
      {filled && <path d="M12 9v1M12 14v1M9 12h1M14 12h1" stroke="currentColor" strokeWidth={1} strokeLinecap="round" />}
    </svg>
  );
}

/**
 * Premium MoreDots: Using Squircles/Rectangles with 
 * differing opacities for a modern UI "overflow" look.
 */
export function MoreDotsIcon({ filled, className, ...props }: NavIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} {...props}>
      <rect x="10.5" y="10.5" width="3" height="3" rx="1" fill="currentColor" />
      <rect x="4.5" y="10.5" width="3" height="3" rx="1" fill="currentColor" opacity={filled ? 1 : 0.5} />
      <rect x="16.5" y="10.5" width="3" height="3" rx="1" fill="currentColor" opacity={filled ? 1 : 0.5} />
      {filled && (
        <rect x="3" y="9" width="18" height="6" rx="2" stroke="currentColor" strokeWidth={0.5} opacity={0.3} />
      )}
    </svg>
  );
}