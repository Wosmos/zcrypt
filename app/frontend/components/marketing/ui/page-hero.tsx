import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Accent({ text, accent = "." }: { text: ReactNode; accent?: string | false }) {
  if (accent === false) return null;
  if (typeof text === "string" && /[.?!]$/.test(text.trim())) return null;
  return (
    <span className="pv2-dot" aria-hidden="true">
      {accent}
    </span>
  );
}

const rise = (i: number) => ({ "--i": i }) as CSSProperties;

export function PageHero({
  id = "page-title",
  eyebrow,
  badge,
  title,
  highlight,
  highlightBreak = true,
  accent,
  lede,
  actions,
  note,
  align = "center",
  fill = false,
  className,
  children,
}: {
  id?: string;
  eyebrow?: ReactNode;
  badge?: ReactNode;
  title: ReactNode;
  highlight?: ReactNode;
  highlightBreak?: boolean;
  accent?: string | false;
  lede?: ReactNode;
  actions?: ReactNode;
  note?: ReactNode;
  align?: "center" | "left";
  fill?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className={cn(
        "pv2-hero",
        align === "left" && "pv2-hero-left",
        fill && "pv2-hero-fill",
        className,
      )}
    >
      <div className="pv2-wrap">
        <div className="pv2-hero-head">
          {badge ? (
            <div className="pv2-rise" style={rise(0)}>
              {badge}
            </div>
          ) : null}
          {eyebrow ? (
            <p className="pv2-eyebrow pv2-rise" style={rise(1)}>
              {eyebrow}
            </p>
          ) : null}
          <h1 id={id} className="pv2-h1 pv2-rise pv2-rise-keep" style={rise(2)}>
            {title}
            {highlight ? (
              <>
                {" "}
                {highlightBreak ? <br className="pv2-hl-br" /> : null}
                <span className="pv2-hl">{highlight}</span>
              </>
            ) : null}
            <Accent text={highlight ?? title} accent={accent} />
          </h1>
          {lede ? (
            <p className="pv2-sub pv2-rise" style={rise(3)}>
              {lede}
            </p>
          ) : null}
          {actions ? (
            <div className="pv2-ctas pv2-rise" style={rise(4)}>
              {actions}
            </div>
          ) : null}
          {note ? (
            <p className="pv2-micro pv2-rise" style={rise(5)}>
              {note}
            </p>
          ) : null}
        </div>
        {children ? (
          <div className="pv2-rise" style={rise(6)}>
            {children}
          </div>
        ) : null}
      </div>
    </section>
  );
}
