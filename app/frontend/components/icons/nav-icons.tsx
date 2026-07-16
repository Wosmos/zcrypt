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