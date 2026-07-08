import { cn } from "@/lib/utils";

export function Marquee({
  items,
  reverse = false,
}: {
  items: readonly string[] | string[];
  reverse?: boolean;
}) {
  return (
    <div className="relative flex w-full overflow-hidden py-6 select-none bg-[var(--color-bg)]">
      {/* Edge Fades: Keeps it from looking "cut off" */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-[var(--color-bg)] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-[var(--color-bg)] to-transparent" />

      <div
        className={cn(
          "flex min-w-full shrink-0 items-center gap-4 hover:[animation-play-state:paused]",
          reverse ? "animate-marquee-reverse" : "animate-marquee"
        )}
      >
        {[...items, ...items, ...items, ...items].map((item, i) => (
          <div key={i} className="flex items-center gap-4">
            {/* The Text Style: Bold, Italic, Mixed Fill */}
            <span
              className={`
                text-xl md:text-2xl font-black italic tracking-tighter uppercase whitespace-nowrap font-heading
                transition-colors duration-300
                ${i % 2 === 0
                  ? "text-[var(--color-text-primary)]"
                  : "text-cyan-950 dark:text-cyan-500 [-webkit-text-stroke:1px_var(--color-text-muted)] opacity-50"
                }
                group-hover:text-cyan-500
              `}
            >
              {item}
            </span>

            {/* Subtle Dev-Style Separator */}
            <span className="text-cyan-500/40 font-light text-2xl">/</span>
          </div>
        ))}
      </div>
    </div>
  );
}
