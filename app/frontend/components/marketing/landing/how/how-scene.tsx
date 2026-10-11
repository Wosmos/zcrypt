import type { CSSProperties } from "react";
import { T } from "@/components/i18n/t";
import { Lock, Plus, UploadCloud, Video } from "@/lib/icons";
import {
  CAPTIONS,
  FILE,
  type Caption,
  PIECES,
  PLATFORMS,
  pieceHex,
  type HowPart,
} from "./how-data";

export type ScenePart = "all" | HowPart;

const STORE_TILES = new Set(["telegram", "github"]);

function captionsFor(part: ScenePart): readonly Caption[] {
  if (part === "all") return [...CAPTIONS.connect, ...CAPTIONS.drop, ...CAPTIONS.store];
  return CAPTIONS[part];
}

/** The scroll scene: accounts light up, a file is cut and locked, the pieces land in Telegram. */
export function HowScene({ part = "all" }: { part?: ScenePart }) {
  const caps = captionsFor(part);
  const work = part !== "connect";
  const tiles =
    part === "drop" ? [] : PLATFORMS.filter((p) => part !== "store" || STORE_TILES.has(p.key));

  return (
    <div className="zw-stage pv2-ring corner-squircle" data-part={part} aria-hidden="true">
      <div className="zw-in">
        <div className="zw-caps">
          {caps.map((c, i) => (
            <span key={"k" in c ? c.k : c.raw} className="zw-cap" data-cap={i}>
              {"k" in c ? <T k={c.k} /> : c.raw}
            </span>
          ))}
        </div>

        {work ? (
          <div className="zw-work">
            <span className="zw-slot">
              <UploadCloud className="h-6 w-6" />
            </span>
            <div className="zw-file">
              <span className="zw-ext">{FILE.ext}</span>
              <span className="zw-ftype">
                <Video className="h-5 w-5" />
              </span>
              <span className="zw-fname">{FILE.name}</span>
              <span className="zw-fsize">{FILE.size}</span>
              {[1, 2, 3].map((k) => (
                <i key={k} className="zw-cut" style={{ left: `${k * 25}%` }} />
              ))}
            </div>
            {Array.from({ length: PIECES }, (_, i) => {
              const [a, b] = pieceHex(i);
              return (
                <div key={a} className="zw-piece" style={{ "--i": i } as CSSProperties}>
                  <span className="zw-plain">
                    <i />
                    <i />
                    <i />
                  </span>
                  <span className="zw-hex">
                    {a}
                    <br />
                    {b}
                  </span>
                  <span className="zw-lock">
                    <Lock className="h-3 w-3" />
                  </span>
                </div>
              );
            })}
            <span className="zw-more">
              <T k="site.home.how.more" />
            </span>
          </div>
        ) : null}

        {tiles.length ? (
          <ul className="zw-tiles" data-count={tiles.length}>
            {tiles.map(({ key, name, tint, Mark }) => (
              <li
                key={key}
                className="zw-tile corner-squircle"
                data-p={key}
                style={{ "--zw-tint": tint } as CSSProperties}
              >
                <span className="zw-glow" />
                <span className="zw-mark">
                  <Mark className="h-[18px] w-[18px]" />
                </span>
                <span className="zw-tname">{name}</span>
                <span className="zw-limit">
                  <T k={`site.home.how.limits.${key}`} />
                </span>
                {key === "github" ? (
                  <span className="zw-meter">
                    <i className="zw-meter-fill" />
                  </span>
                ) : null}
                <span className="zw-status">
                  <i className="zw-live" />
                  <T k="site.home.how.connected" />
                </span>
                {key === "telegram" ? (
                  <>
                    <span className="zw-count">
                      <T k="site.home.how.pieces" />
                    </span>
                    <span className="zw-stack">
                      <i />
                      <i />
                      <i />
                      <i />
                    </span>
                  </>
                ) : null}
                {key === "github" ? (
                  <span className="zw-ghost">
                    <Plus className="h-3 w-3" />
                    <T k="site.home.how.newSpot" />
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
