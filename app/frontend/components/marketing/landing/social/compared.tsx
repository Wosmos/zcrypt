"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useTranslations } from "next-intl";
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

type Cell =
  | { k: string; yes?: boolean; big?: boolean; note?: string }
  | { raw: string; big?: boolean };

const BIG = (k: string, note?: string): Cell => ({ k: `big.${k}`, big: true, note });
const YES = (k: string): Cell => ({ k: `cell.${k}`, yes: true });
const TXT = (k: string): Cell => ({ k: `cell.${k}` });

const ROWS: readonly { id: string; big?: boolean; cells: readonly Cell[] }[] = [
  {
    id: "free",
    big: true,
    cells: [
      BIG("zcrypt", "zcryptNote"),
      BIG("gdrive", "gdriveNote"),
      { raw: "2 GB", big: true },
      BIG("proton"),
      BIG("terabox", "teraboxNote"),
    ],
  },
  {
    id: "open",
    cells: [YES("no"), TXT("technically"), TXT("technically"), YES("no"), TXT("technically")],
  },
  {
    id: "where",
    cells: [
      YES("ownAccounts"),
      TXT("theirServers"),
      TXT("theirServers"),
      TXT("theirServers"),
      TXT("theirServers"),
    ],
  },
  {
    id: "paid",
    cells: [YES("noneExist"), TXT("yes"), TXT("yes"), TXT("yes"), TXT("yes")],
  },
  {
    id: "oss",
    cells: [YES("allOfIt"), TXT("no"), TXT("no"), TXT("theApps"), TXT("no")],
  },
  {
    id: "self",
    cells: [YES("yes"), TXT("no"), TXT("no"), TXT("no"), TXT("no")],
  },
  {
    id: "iphone",
    cells: [TXT("notYet"), YES("yes"), YES("yes"), YES("yes"), YES("yes")],
  },
];

/** zcrypt next to the four free tiers people already know. */
export function Compared() {
  const t = useTranslations("site");
  const render = (cell: Cell): ReactNode => {
    if ("raw" in cell) return <b className="zs-big">{cell.raw}</b>;
    const text = t(`home.compared.${cell.k}`);
    if (cell.big) {
      return (
        <>
          <b className="zs-big">{text}</b>
          {cell.note ? (
            <small className="zs-note">{t(`home.compared.big.${cell.note}`)}</small>
          ) : null}
        </>
      );
    }
    return cell.yes ? (
      <span className="zs-yes">
        <Check className="zs-yes-ck" aria-hidden="true" />
        {text}
      </span>
    ) : (
      text
    );
  };
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
          eyebrow={t("home.compared.eyebrow")}
          title={t("home.compared.title")}
          lede={t("home.compared.lede")}
        />

        <div className="zs-cmp" data-sel={sel}>
          <div
            className="zs-seg-pick"
            role="radiogroup"
            aria-label={t("home.compared.pick")}
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
              <caption className="sr-only">{t("home.compared.caption")}</caption>
              <thead>
                <tr>
                  <td className="zs-rl" />
                  {COLS.map((c) => (
                    <th key={c.key} scope="col" className={`zs-c-${c.key}`}>
                      {c.key === "z" ? (
                        <span className="zs-here">{t("home.compared.here")}</span>
                      ) : null}
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
                  <tr key={row.id} className={row.big ? "zs-r-big" : undefined}>
                    <th scope="row" className="zs-rl">
                      {t(`home.compared.rows.${row.id}`)}
                    </th>
                    {row.cells.map((cell, i) => (
                      <td key={COLS[i].key} className={`zs-c-${COLS[i].key}`}>
                        {render(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="zs-foot">{t("home.compared.foot")}</p>
      </div>
    </section>
  );
}
