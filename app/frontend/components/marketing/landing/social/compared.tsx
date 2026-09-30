"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Check } from "@/lib/icons";
import { LogoIcon } from "@/components/ui/logo";
import { SectionHead } from "../section-head";

type Col = "z" | "gdrive" | "dropbox" | "proton" | "terabox";
type Rival = Exclude<Col, "z">;

const COLS: readonly { key: Col; name: string; short: string }[] = [
  { key: "z", name: "zcrypt", short: "zcrypt" },
  { key: "gdrive", name: "Google Drive", short: "Google Drive" },
  { key: "dropbox", name: "Dropbox", short: "Dropbox" },
  { key: "proton", name: "Proton Drive", short: "Proton" },
  { key: "terabox", name: "TeraBox", short: "TeraBox" },
];

const RIVALS = COLS.filter((c): c is { key: Rival; name: string; short: string } => c.key !== "z");

function Yes({ children }: { children: ReactNode }) {
  return (
    <span className="zs-yes">
      <Check className="zs-yes-ck" aria-hidden="true" />
      {children}
    </span>
  );
}

function Big({ value, note }: { value: string; note?: string }) {
  return (
    <>
      <b className="zs-big">{value}</b>
      {note ? <small className="zs-note">{note}</small> : null}
    </>
  );
}

const ROWS: readonly { label: string; big?: boolean; cells: readonly ReactNode[] }[] = [
  {
    label: "Free storage",
    big: true,
    cells: [
      <Big key="z" value="No limit" note="on accounts you connect" />,
      <Big key="g" value="Up to 15 GB" note="shared with Gmail and Photos" />,
      <Big key="d" value="2 GB" />,
      <Big key="p" value="Up to 5 GB" />,
      <Big key="t" value="1 TB" note="with ads" />,
    ],
  },
  {
    label: "Could the company open your files?",
    cells: [
      <Yes key="z">No</Yes>,
      "Yes, technically",
      "Yes, technically",
      <Yes key="p">No</Yes>,
      "Yes, technically",
    ],
  },
  {
    label: "Where your files live",
    cells: [
      <Yes key="z">Your own accounts</Yes>,
      "Their servers",
      "Their servers",
      "Their servers",
      "Their servers",
    ],
  },
  {
    label: "Paid plans",
    cells: [<Yes key="z">None exist</Yes>, "Yes", "Yes", "Yes", "Yes"],
  },
  {
    label: "Open source",
    cells: [<Yes key="z">All of it</Yes>, "No", "No", "The apps", "No"],
  },
  {
    label: "Run it on your own computer",
    cells: [<Yes key="z">Yes</Yes>, "No", "No", "No", "No"],
  },
  {
    label: "iPhone app",
    cells: [
      "Not yet (website works)",
      <Yes key="g">Yes</Yes>,
      <Yes key="d">Yes</Yes>,
      <Yes key="p">Yes</Yes>,
      <Yes key="t">Yes</Yes>,
    ],
  },
];

/** zcrypt next to the four free tiers people already know. */
export function Compared() {
  const [sel, setSel] = useState<Rival>("gdrive");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState<"start" | "mid" | "end" | "none">("none");

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 2) setEdge("none");
      else if (el.scrollLeft <= 2) setEdge("start");
      else if (el.scrollLeft >= max - 2) setEdge("end");
      else setEdge("mid");
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);

  const selIndex = RIVALS.findIndex((r) => r.key === sel);

  return (
    <section id="compared" className="pv2-sec zs-cv" aria-labelledby="h-compared">
      <div className="pv2-wrap">
        <SectionHead
          id="h-compared"
          eyebrow="Compared"
          title="Same job, different deal"
          lede="We picked the ones you've heard of."
        />

        <div className="zs-cmp" data-sel={sel}>
          <div
            className="zs-seg-pick"
            role="radiogroup"
            aria-label="Compare zcrypt with"
            style={{ "--i": selIndex } as CSSProperties}
          >
            <span className="zs-seg-thumb" aria-hidden="true" />
            {RIVALS.map((r) => (
              <label key={r.key} className="zs-seg-opt">
                <input
                  type="radio"
                  name="zs-cmp"
                  value={r.key}
                  checked={sel === r.key}
                  onChange={() => setSel(r.key)}
                  className="zs-seg-input"
                />
                <span>
                  {r.key === "gdrive" ? (
                    <>
                      Google<span className="zs-hide-xs"> Drive</span>
                    </>
                  ) : (
                    r.short
                  )}
                </span>
              </label>
            ))}
          </div>

          <div ref={scrollRef} className="zs-cmp-scroll" data-edge={edge}>
            <table className="zs-table">
              <caption className="sr-only">
                zcrypt compared with Google Drive, Dropbox, Proton Drive and TeraBox
              </caption>
              <thead>
                <tr>
                  <td className="zs-rl" />
                  {COLS.map((c) => (
                    <th key={c.key} scope="col" className={`zs-c-${c.key}`}>
                      {c.key === "z" ? <span className="zs-here">You are here</span> : null}
                      <span className="zs-cn">
                        {c.key === "z" ? <LogoIcon size={20} hover={false} /> : null}
                        {c.name}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => (
                  <tr key={row.label} className={row.big ? "zs-r-big" : undefined}>
                    <th scope="row" className="zs-rl">
                      {row.label}
                    </th>
                    {row.cells.map((cell, i) => (
                      <td key={COLS[i].key} className={`zs-c-${COLS[i].key}`}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="zs-foot">
          Their numbers come from their own pricing pages as of September 2026. They change things
          now and then, so check before you quote us. &ldquo;Technically&rdquo; means they hold the
          keys, not that anyone is snooping.
        </p>
      </div>
    </section>
  );
}
