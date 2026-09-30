"use client";

import { useEffect, useState, type CSSProperties, type ReactElement } from "react";
import { AlertCircle, Cloud, FileText, Folder } from "@/lib/icons";

type Scene = (props: { play: boolean }) => ReactElement;

function useTimeline(play: boolean, holds: readonly number[]) {
  const last = holds.length - 1;
  const [step, setStep] = useState(last);
  useEffect(() => {
    if (!play) {
      setStep(last);
      return;
    }
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      setStep(i);
      timer = setTimeout(() => {
        i = i === last ? 0 : i + 1;
        tick();
      }, holds[i]);
    };
    tick();
    return () => clearTimeout(timer);
  }, [play, holds, last]);
  return step;
}

const on = (v: boolean) => (v ? "true" : undefined);
const fill = (f: number) => ({ "--f": f }) as CSSProperties;

const ROOM_HOLDS = [500, 650, 650, 600, 1700, 900, 3400] as const;
const ROOM_GB = ["0.4", "9.3", "14.1", "15.0", "15.0", "15.0", "15.0"];
const ROOM_FILL = [0.03, 0.62, 0.94, 1, 1, 1, 1];

function OutOfRoom({ play }: { play: boolean }) {
  const s = useTimeline(play, ROOM_HOLDS);
  const accounts = s >= 6 ? 3 : s >= 5 ? 2 : 1;
  return (
    <div className="zs-v zs-v1" aria-hidden="true">
      <div className="zs-panel">
        <div className="zs-prow">
          <Cloud className="size-4 zs-pico" />
          <span className="zs-pname">My storage</span>
          <span className="zs-mono" data-bad={on(s >= 3)}>
            {ROOM_GB[s]} / 15 GB
          </span>
        </div>
        <div className="zs-bar" data-bad={on(s >= 3)}>
          <i style={fill(ROOM_FILL[s])} />
        </div>
        <div className="zs-accts">
          {["me", "me2", "me3"].map((n, i) => (
            <span key={n} className="zs-av" data-on={on(i < accounts)}>
              {n}
            </span>
          ))}
          <span className="zs-accts-note">
            {accounts === 1 ? "1 login" : `${accounts} logins, 1 folder`}
          </span>
        </div>
      </div>
      <div className="zs-toast" data-on={on(s === 4)}>
        <AlertCircle className="size-4 zs-toast-ico" />
        <span className="zs-toast-t">Storage full. Add a card?</span>
        <span className="zs-toast-b">Add card</span>
      </div>
    </div>
  );
}

const PRINT_HOLDS = [1300, 1900, 3800] as const;
const PRINT_LINES = [92, 84, 96, 70, 88, 94, 62, 90, 78, 86, 58] as const;

function FinePrint({ play }: { play: boolean }) {
  const s = useTimeline(play, PRINT_HOLDS);
  return (
    <div className="zs-v zs-v2" aria-hidden="true">
      <div className="zs-doc">
        <div className="zs-doc-bar">
          <FileText className="size-3.5" />
          <span>Terms of Service</span>
          <span className="zs-doc-tag">illustrative</span>
        </div>
        <div className="zs-doc-view">
          <div className="zs-doc-scroll" data-down={on(s >= 1)}>
            <p className="zs-doc-hero">
              1 TB <span>free</span>
            </p>
            {PRINT_LINES.map((w, i) => (
              <span key={`${w}-${i}`} className="zs-doc-line" style={{ width: `${w}%` }} />
            ))}
            <p className="zs-clause">
              <span className="zs-clause-n">14.3</span>{" "}
              <mark data-on={on(s >= 2)}>We may scan your content to improve our services.</mark>
            </p>
            <span className="zs-doc-line" style={{ width: "74%" }} />
          </div>
        </div>
      </div>
    </div>
  );
}

const FAIL_HOLDS = [450, 500, 600, 700, 800, 900, 800, 1300, 1300, 3200] as const;
const FAIL_PCT = [0, 34, 58, 70, 76, 79, 80, 80, 80, 80];
const FAIL_ETA = [
  "Starting",
  "6 min left",
  "14 min left",
  "31 min left",
  "About an hour left",
  "Any minute now",
  "Any minute now",
];

function EightyFail({ play }: { play: boolean }) {
  const s = useTimeline(play, FAIL_HOLDS);
  const dead = s >= 7;
  return (
    <div className="zs-v zs-v3" aria-hidden="true">
      <div className="zs-up" data-dead={on(dead)}>
        <div className="zs-up-top">
          <span className="zs-up-pct" data-bad={on(dead)}>
            {FAIL_PCT[s]}
            <small>%</small>
          </span>
          <span className="zs-up-file">
            <Folder className="size-3.5 zs-pico" />4 GB of photos
          </span>
        </div>
        <div className="zs-bar zs-bar-up" data-bad={on(dead)}>
          <i style={fill(FAIL_PCT[s] / 100)} />
        </div>
        <div className="zs-prow zs-prow-sub">
          <span className="zs-eta" data-bad={on(dead)}>
            {dead ? "Upload failed. Start again?" : FAIL_ETA[s]}
          </span>
          <span className="zs-retry" data-on={on(dead)} data-hover={on(s === 8)}>
            Retry
          </span>
        </div>
      </div>
      <svg
        className="zs-cursor"
        data-at={s === 8 ? "retry" : s === 9 ? "away" : undefined}
        viewBox="0 0 16 20"
        width="16"
        height="20"
      >
        <path
          d="M1.5 1.5v14.2l3.7-3.5 2.4 5.6 2.6-1.1-2.4-5.5h5.1L1.5 1.5Z"
          fill="var(--color-text)"
          stroke="var(--color-surface)"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

const TAG_HOLDS = [2400, 3600] as const;

function PriceTag({ play }: { play: boolean }) {
  const s = useTimeline(play, TAG_HOLDS);
  return (
    <div className="zs-v zs-v4" aria-hidden="true" data-play={on(play)}>
      <div className="zs-hang">
        <span className="zs-pin" />
        <span className="zs-string" />
        <div className="zs-tag" data-flip={on(s === 1)}>
          <div className="zs-face zs-front">
            <small>Price</small>
            <b>FREE</b>
            <small>1 TB, no card</small>
          </div>
          <div className="zs-face zs-back">
            <small>Actual price</small>
            <b>you</b>
            <small>and your files</small>
          </div>
        </div>
      </div>
    </div>
  );
}

export const STORY_SCENES: readonly Scene[] = [OutOfRoom, FinePrint, EightyFail, PriceTag];
