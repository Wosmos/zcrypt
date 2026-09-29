"use client";

import { type ComponentType, useEffect, useRef } from "react";
import { MOTION_REDUCE } from "@/components/marketing/preview/gsap";
import { SectionHead } from "@/components/marketing/v2/section-head";
import {
  DriveVignette,
  LockVignette,
  ResumeVignette,
  SendVignette,
  ShareVignette,
  SpacesVignette,
} from "./bento-vignettes";
import { useSpotlight } from "./use-spotlight";

type Tile = {
  key: string;
  kicker: string;
  title: string;
  sentence: string;
  short: string;
  size: "hero" | "wide" | "one";
  Vignette: ComponentType;
};

const TILES: readonly Tile[] = [
  {
    key: "drive",
    kicker: "Looks like a normal drive",
    title: "Folders, search, drag and drop.",
    sentence:
      "Press / to search, sort by anything, move things around. Photos, videos, PDFs and documents open right in your browser, on the web, Mac, Windows, Linux and Android (beta).",
    short: "Search, sort, drag and drop. Files open right in your browser.",
    size: "hero",
    Vignette: DriveVignette,
  },
  {
    key: "lock",
    kicker: "A second lock",
    title: "A password on any folder.",
    sentence: "For the extra private stuff. Yes, even more private than private.",
    short: "For the extra private stuff.",
    size: "one",
    Vignette: LockVignette,
  },
  {
    key: "share",
    kicker: "Share it",
    title: "Share links with rules.",
    sentence: "Add a password, an end date and a download limit. Then forget about it.",
    short: "Password, end date, download limit.",
    size: "one",
    Vignette: ShareVignette,
  },
  {
    key: "send",
    kicker: "No account needed",
    title: "Send to anyone.",
    sentence:
      "They don't need zcrypt. It can vanish after one read, like a spy film but with a PDF.",
    short: "They don't need zcrypt.",
    size: "one",
    Vignette: SendVignette,
  },
  {
    key: "spaces",
    kicker: "Spaces",
    title: "Spaces for your people.",
    sentence: "Family photos, house paperwork, the group project nobody else is doing.",
    short: "Family photos, house paperwork.",
    size: "one",
    Vignette: SpacesVignette,
  },
  {
    key: "resume",
    kicker: "Bad Wi-Fi friendly",
    title: "Uploads that carry on.",
    sentence:
      "Close the laptop, lose the signal, come back later. It picks up where it stopped. Deleted something by mistake? There's a restore button.",
    short: "Lose the signal, it picks up where it stopped.",
    size: "wide",
    Vignette: ResumeVignette,
  },
];

/** What's inside: six feature tiles, two rows deep on desktop. */
export function InsideBento() {
  const grid = useRef<HTMLDivElement>(null);
  useSpotlight(grid);

  useEffect(() => {
    const el = grid.current;
    if (!el || !("IntersectionObserver" in window)) return;
    if (window.matchMedia(MOTION_REDUCE).matches) return;
    const tiles = Array.from(el.querySelectorAll<HTMLElement>(".zc-tile"));
    const later = tiles.filter((t) => t.getBoundingClientRect().top > window.innerHeight * 0.92);
    for (const t of later) t.dataset.reveal = "wait";
    const io = new IntersectionObserver(
      (entries) => {
        const shown = entries.filter((e) => e.isIntersecting).map((e) => e.target as HTMLElement);
        shown.forEach((t, k) => {
          t.style.setProperty("--zc-d", `${Math.min(k, 5) * 50}ms`);
          t.dataset.reveal = "in";
          io.unobserve(t);
        });
      },
      { threshold: 0.15 },
    );
    for (const t of later) io.observe(t);
    return () => {
      io.disconnect();
      for (const t of later) delete t.dataset.reveal;
    };
  }, []);

  return (
    <section
      id="inside"
      className="pv2-sec zc-inside"
      aria-labelledby="h-inside"
      data-nav-tone="busy"
    >
      <div className="pv2-wrap">
        <SectionHead
          id="h-inside"
          eyebrow="What's inside"
          title="It works like the drive you already know"
          lede="It just can't read your stuff."
        />
        <div ref={grid} className="zc-bento zc-spotlist">
          {TILES.map(({ key, kicker, title, sentence, short, size, Vignette }) => (
            <article
              key={key}
              className={`zc-tile zc-tile-${key} zc-tile-${size} zc-spot pv2-ring corner-squircle`}
              aria-labelledby={`zc-b-${key}`}
            >
              <span className="zc-edge" aria-hidden="true" />
              <div className="zc-tin">
                <div className="zc-well corner-squircle" aria-hidden="true">
                  <div className="zc-vg">
                    <Vignette />
                  </div>
                </div>
                <div className="zc-tt">
                  <p className="zc-kick">{kicker}</p>
                  <h3 id={`zc-b-${key}`} className="zc-bh3">
                    {title}
                  </h3>
                  <p className="zc-sent">{sentence}</p>
                  <p className="zc-short">{short}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
