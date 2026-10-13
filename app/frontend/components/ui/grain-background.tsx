export const GRAIN_TEXTURE = `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

/** zcrypt's light: cyan from the top-left, indigo from the right, teal rising
 *  from the bottom. Shared by the site backdrop and the sign-in panel. */
export const BRAND_GLOW = [
  "radial-gradient(70% 60% at 15% 10%, rgba(34,211,238,0.7) 0%, transparent 70%)",
  "radial-gradient(75% 70% at 95% 45%, rgba(99,102,241,0.6) 0%, transparent 70%)",
  "radial-gradient(60% 45% at 50% 58%, rgba(165,243,252,0.16) 0%, transparent 70%)",
  "radial-gradient(85% 55% at 25% 100%, rgba(20,184,166,0.6) 0%, transparent 70%)",
].join(",");

/** The brand light with a film grain over it. `glowClassName` sets how strong
 *  the light is per theme. Static, so it costs nothing to scroll. */
export function GrainLayers({ glowClassName }: { glowClassName?: string }) {
  return (
    <>
      <div
        aria-hidden
        className={`absolute inset-0 ${glowClassName ?? ""}`}
        style={{ background: BRAND_GLOW, filter: "blur(24px)" }}
      />
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.22] mix-blend-overlay"
        style={{ backgroundImage: GRAIN_TEXTURE, backgroundSize: "200px 200px" }}
      />
    </>
  );
}

/** Site-wide backdrop for the marketing pages. */
export function GrainBackground() {
  return (
    <div className="fixed inset-0 -z-50 overflow-hidden pointer-events-none bg-[var(--color-bg)] [contain:strict]">
      <GrainLayers glowClassName="opacity-45 dark:opacity-100" />
    </div>
  );
}
