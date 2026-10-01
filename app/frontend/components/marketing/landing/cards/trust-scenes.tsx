import type { CSSProperties } from "react";
import { FileText, GitCommit, File, Check } from "@/lib/icons";
import { GitHubIcon } from "@/components/icons/github";
import { GitlabIcon as GitLabIcon } from "@/components/icons/gitlab";
import { TelegramIcon } from "@/components/icons/telegram";

const HEX = [
  "9f04 c1e2 b7d8",
  "e1a3 5c0b 72fd",
  "4d19 aa6e 03c8",
  "b2f7 1e94 d05a",
  "7c3e 88b1 f4",
];
const PLAIN = [72, 88, 64, 80, 46];

export function EncryptScene() {
  return (
    <div className="zc-sc zc-enc">
      <span className="zc-enc-halo" />
      <span className="zc-enc-ring zc-enc-ring-a" />
      <span className="zc-enc-ring zc-enc-ring-b" />
      <div className="zc-enc-doc">
        <span className="zc-enc-back" />
        <div className="zc-enc-page">
          <span className="zc-enc-fold" />
          <div className="zc-enc-head">
            <span className="zc-enc-ic">
              <FileText strokeWidth={1.8} />
            </span>
            <span className="zc-enc-ext">PDF</span>
          </div>
          <div className="zc-enc-body">
            <div className="zc-enc-plain">
              {PLAIN.map((w) => (
                <i key={w} style={{ width: `${w}%` }} />
              ))}
            </div>
            <div className="zc-enc-hex">
              {HEX.map((h) => (
                <span key={h}>{h}</span>
              ))}
            </div>
          </div>
        </div>
        <span className="zc-enc-lock">
          <span className="zc-enc-ping" />
          <svg viewBox="0 0 40 46" aria-hidden="true">
            <defs>
              <linearGradient id="zc-enc-body" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#5ee9f3" />
                <stop offset="0.55" stopColor="#00c2d2" />
                <stop offset="1" stopColor="#008896" />
              </linearGradient>
              <linearGradient id="zc-enc-shackle" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#9aa3b5" />
                <stop offset="0.5" stopColor="#e6e9ef" />
                <stop offset="1" stopColor="#8a93a6" />
              </linearGradient>
            </defs>
            <g className="zc-enc-shackle">
              <path
                d="M11 22V14a9 9 0 0 1 18 0v8"
                fill="none"
                stroke="url(#zc-enc-shackle)"
                strokeWidth="4.6"
                strokeLinecap="round"
              />
            </g>
            <rect x="4" y="19" width="32" height="25" rx="7" fill="url(#zc-enc-body)" />
            <rect
              x="4.6"
              y="19.6"
              width="30.8"
              height="23.8"
              rx="6.4"
              fill="none"
              stroke="#ffffff"
              strokeOpacity="0.45"
              strokeWidth="1.2"
            />
            <circle cx="20" cy="29.5" r="3.2" fill="#04363c" fillOpacity="0.55" />
            <rect
              x="18.6"
              y="30"
              width="2.8"
              height="7"
              rx="1.4"
              fill="#04363c"
              fillOpacity="0.55"
            />
          </svg>
        </span>
      </div>
    </div>
  );
}

const TUBES = [
  { key: "gh", mark: GitHubIcon, cls: "zc-tube-gh" },
  { key: "new", mark: GitHubIcon, cls: "zc-tube-new" },
  { key: "gl", mark: GitLabIcon, cls: "zc-tube-gl" },
  { key: "tg", mark: TelegramIcon, cls: "zc-tube-tg" },
] as const;

export function ScaleScene() {
  return (
    <div className="zc-sc zc-scale">
      <ul className="zc-tubes">
        {TUBES.map(({ key, mark: Mark, cls }) => (
          <li key={key} className={`zc-tube ${cls}`}>
            <span className="zc-tube-top">
              {key === "gh" ? (
                <span className="zc-tube-full">
                  <Check strokeWidth={2.4} />
                </span>
              ) : null}
              {key === "new" ? <span className="zc-tube-tag">new</span> : null}
              {key === "tg" ? <span className="zc-tube-inf">∞</span> : null}
            </span>
            <span className="zc-tube-body">
              <i className="zc-tube-fill" />
            </span>
            <span className="zc-tube-mark">
              <Mark />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const BINS = [
  ["a3/9f04c1e2b7d8e1.bin", "10.0 MB"],
  ["5c/0b72fd4d19aa6e.bin", "10.0 MB"],
  ["e8/03c8b2f71e94d0.bin", "10.0 MB"],
  ["1d/5a7c3e88b1f42c.bin", "10.0 MB"],
  ["b7/d8e1a35c0b72fd.bin", "3.4 MB"],
] as const;

export function StealthScene() {
  return (
    <div className="zc-sc zc-stealth">
      <div className="zc-gh">
        <div className="zc-gh-repo">
          <GitHubIcon className="zc-gh-mark" />
          <span>quick-loader-v2</span>
        </div>
        <div className="zc-gh-commit">
          <GitCommit strokeWidth={1.8} />
          <span className="zc-gh-hash">7c1e2f9</span>
          <span className="zc-gh-when">3 hours ago</span>
          <i className="zc-gh-live" />
        </div>
        <ul className="zc-gh-rows">
          {BINS.map(([name, size]) => (
            <li key={name}>
              <File strokeWidth={1.6} />
              <span className="zc-gh-name">{name}</span>
              <span className="zc-gh-size">{size}</span>
            </li>
          ))}
        </ul>
        <span className="zc-gh-scan" />
      </div>
    </div>
  );
}

const CODE = [
  [{ w: 26 }, { w: 34, a: true }],
  [{ w: 18 }, { w: 44 }],
  [{ w: 10 }, { w: 30 }, { w: 22, a: true }],
  [{ w: 10 }, { w: 52 }],
  [{ w: 18 }, { w: 28 }],
  [{ w: 12 }],
] as const;

export function OpenScene() {
  return (
    <div className="zc-sc zc-open">
      <div className="zc-code">
        <div className="zc-code-bar">
          <i />
          <i />
          <i />
          <span>core/src/crypto.rs</span>
        </div>
        <ol className="zc-code-lines">
          {CODE.map((line, n) => (
            <li key={line.map((t) => t.w).join("-")} style={{ "--n": n } as CSSProperties}>
              <span className="zc-code-ln">{n + 1}</span>
              {line.map((t, k) => (
                <i
                  key={`${t.w}-${k}`}
                  className={"a" in t && t.a ? "zc-code-acc" : undefined}
                  style={{ width: `${t.w}%` }}
                />
              ))}
            </li>
          ))}
        </ol>
        <span className="zc-open-check">
          <svg viewBox="0 0 48 48" aria-hidden="true">
            <circle className="zc-open-disc" cx="24" cy="24" r="22" />
            <path
              className="zc-open-tick"
              d="M15 24.5l6.2 6.2L33.5 18"
              fill="none"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </div>
    </div>
  );
}
