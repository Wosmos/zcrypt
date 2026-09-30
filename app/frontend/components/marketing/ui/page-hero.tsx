import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Trailing cyan glyph for headlines; skipped when the text already ends in punctuation. */
export function Accent({ text, accent = "." }: { text: ReactNode; accent?: string | false }) {
  if (accent === false) return null;
  if (typeof text === "string" && /[.?!]$/.test(text.trim())) return null;
  return (
    <span className="pv2-dot" aria-hidden="true">
      {accent}
    </span>
  );
}

/** The inner-page hero: eyebrow, white Satoshi H1 with the cyan dot, lede, pill CTAs. */
export function PageHero({
  id = "page-title",
  eyebrow,
  badge,
  title,
  accent,
  lede,
  actions,
  note,
  align = "center",
  className,
  children,
}: {
  id?: string;
  eyebrow?: ReactNode;
  badge?: ReactNode;
  title: ReactNode;
  accent?: string | false;
  lede?: ReactNode;
  actions?: ReactNode;
  note?: ReactNode;
  align?: "center" | "left";
  className?: string;
  children?: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className={cn("pv2-hero", align === "left" && "pv2-hero-left", className)}
    >
      <div className="pv2-wrap">
        <div className="pv2-hero-head">
          {badge}
          {eyebrow ? <p className="pv2-eyebrow">{eyebrow}</p> : null}
          <h1 id={id} className="pv2-h1">
            {title}
            <Accent text={title} accent={accent} />
          </h1>
          {lede ? <p className="pv2-sub">{lede}</p> : null}
          {actions ? <div className="pv2-ctas">{actions}</div> : null}
          {note ? <p className="pv2-micro">{note}</p> : null}
        </div>
        {children}
      </div>
    </section>
  );
}
