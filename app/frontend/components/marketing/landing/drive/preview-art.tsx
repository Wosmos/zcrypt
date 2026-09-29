import { useId } from "react";
import type { ArtKey } from "./drive-data";

type Props = { art: ArtKey; seed?: number; className?: string; wide?: boolean };

/** Flat vector illustrations standing in for sample photos. Never photos, never faces. */
export function PreviewArt({ art, seed = 0, className, wide }: Props) {
  const uid = useId().replace(/:/g, "");
  const w = wide ? 320 : 300;
  const h = wide ? 180 : 200;
  const s = seed % 4;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="xMidYMid slice"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {art === "beach" && <Beach id={uid} w={w} h={h} s={s} />}
      {art === "cat" && <Cat id={uid} w={w} h={h} s={s} />}
      {art === "sunset" && <Sunset id={uid} w={w} h={h} s={s} />}
      {art === "party" && <Party w={w} h={h} />}
      {art === "wallpaper" && <Wallpaper id={uid} w={w} h={h} s={s} />}
      {art === "wedding" && <Wedding id={uid} w={w} h={h} />}
    </svg>
  );
}

type A = { id: string; w: number; h: number; s: number };

function Beach({ id, w, h, s }: A) {
  const sunX = w * (0.68 - s * 0.08);
  return (
    <>
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7dd3fc" />
          <stop offset="1" stopColor="#e0f2fe" />
        </linearGradient>
      </defs>
      <rect width={w} height={h} fill={`url(#${id}-sky)`} />
      <circle cx={sunX} cy={h * 0.3} r={h * 0.12} fill="#fde68a" />
      <path d={`M0 ${h * 0.52}H${w}V${h * 0.62}H0Z`} fill="#0284c7" />
      <path
        d={`M0 ${h * 0.6}q${w * 0.12} -8 ${w * 0.25} 0t${w * 0.25} 0t${w * 0.25} 0t${w * 0.25} 0V${h * 0.72}H0Z`}
        fill="#0ea5e9"
      />
      <path
        d={`M0 ${h * 0.7}q${w * 0.12} -7 ${w * 0.25} 0t${w * 0.25} 0t${w * 0.25} 0t${w * 0.25} 0V${h * 0.8}H0Z`}
        fill="#38bdf8"
      />
      <path d={`M0 ${h * 0.78}Q${w * 0.5} ${h * 0.7} ${w} ${h * 0.8}V${h}H0Z`} fill="#fcd9a5" />
    </>
  );
}

function Cat({ id, w, h, s }: A) {
  const cx = w * (0.5 + (s - 1.5) * 0.04);
  const sill = h * 0.78;
  return (
    <>
      <defs>
        <linearGradient id={`${id}-dusk`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4c1d95" />
          <stop offset="0.65" stopColor="#f472b6" />
          <stop offset="1" stopColor="#fdba74" />
        </linearGradient>
      </defs>
      <rect width={w} height={h} fill={`url(#${id}-dusk)`} />
      <circle cx={w * 0.22} cy={h * 0.24} r={h * 0.06} fill="#fdba74" opacity="0.9" />
      <rect x={w * 0.5 - 3} y="0" width="6" height={sill} fill="#1e1b2e" opacity="0.9" />
      <rect x="0" y={h * 0.4 - 3} width={w} height="6" fill="#1e1b2e" opacity="0.9" />
      <rect x="0" y={sill} width={w} height={h - sill} fill="#1e1b2e" />
      <g fill="#1e1b2e" transform={`translate(${cx - 34} ${sill - 66})`}>
        <ellipse cx="34" cy="48" rx="30" ry="22" />
        <circle cx="52" cy="22" r="15" />
        <path d="M41 12 44 0 51 9ZM56 9 63 0 64 13Z" />
        <path
          d="M6 58c-10 -2 -14 -12 -8 -20"
          stroke="#1e1b2e"
          strokeWidth="6"
          fill="none"
          strokeLinecap="round"
        />
      </g>
    </>
  );
}

function Sunset({ id, w, h, s }: A) {
  const bars = [0.1, 0.06, 0.14, 0.08, 0.12, 0.05, 0.1, 0.07, 0.13, 0.06, 0.09];
  let x = 0;
  return (
    <>
      <defs>
        <linearGradient id={`${id}-sun`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f97316" />
          <stop offset="1" stopColor="#fde047" />
        </linearGradient>
      </defs>
      <rect width={w} height={h} fill={`url(#${id}-sun)`} />
      <circle cx={w * (0.4 + s * 0.06)} cy={h * 0.62} r={h * 0.2} fill="#fef3c7" opacity="0.9" />
      <g fill="#431407">
        {bars.map((bw, i) => {
          const bh = h * (0.18 + ((i * 37 + s * 11) % 23) / 60);
          const r = <rect key={i} x={x} y={h - bh} width={w * bw + 1} height={bh} />;
          x += w * bw;
          return r;
        })}
        <rect x={w * 0.62} y={h * 0.28} width="4" height={h * 0.2} />
      </g>
    </>
  );
}

function Party({ w, h }: { w: number; h: number }) {
  const flags = ["#f43f5e", "#f59e0b", "#0ea5e9", "#f43f5e", "#f59e0b", "#0ea5e9", "#f43f5e"];
  const step = w / flags.length;
  return (
    <>
      <rect width={w} height={h} fill="#fdf2f8" />
      <path d={`M0 18Q${w / 2} 52 ${w} 18`} stroke="#be185d" strokeWidth="1.5" fill="none" />
      {flags.map((c, i) => {
        const x0 = i * step + 4;
        const y0 = 18 + Math.sin((i / (flags.length - 1)) * Math.PI) * 26;
        return <path key={i} d={`M${x0} ${y0}h${step - 8}l${-(step - 8) / 2} 24Z`} fill={c} />;
      })}
      <g transform={`translate(${w / 2 - 56} ${h - 96})`}>
        <rect x="0" y="40" width="112" height="46" rx="8" fill="#be185d" />
        <rect x="12" y="10" width="88" height="34" rx="7" fill="#fbcfe8" />
        <path d="M12 26q11 8 22 0t22 0 22 0 22 0" stroke="#be185d" strokeWidth="3" fill="none" />
        <rect x="53" y="-8" width="6" height="18" rx="2" fill="#0ea5e9" />
        <ellipse cx="56" cy="-13" rx="4" ry="6" fill="#f59e0b" />
      </g>
      <rect x="0" y={h - 10} width={w} height="10" fill="#fbcfe8" />
    </>
  );
}

function Wallpaper({ id, w, h, s }: A) {
  return (
    <>
      <defs>
        <filter id={`${id}-soft`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="18" />
        </filter>
      </defs>
      <rect width={w} height={h} fill="#ecfeff" />
      <g filter={`url(#${id}-soft)`}>
        <circle cx={w * (0.25 + s * 0.03)} cy={h * 0.35} r={h * 0.34} fill="#67e8f9" />
        <circle cx={w * 0.72} cy={h * 0.62} r={h * 0.4} fill="#22d3ee" opacity="0.8" />
        <circle cx={w * 0.55} cy={h * 0.18} r={h * 0.22} fill="#a5f3fc" />
        <circle cx={w * 0.1} cy={h * 0.9} r={h * 0.25} fill="#0891b2" opacity="0.55" />
      </g>
    </>
  );
}

function Wedding({ id, w, h }: { id: string; w: number; h: number }) {
  const cx = w / 2;
  const base = h * 0.9;
  return (
    <>
      <defs>
        <linearGradient id={`${id}-dawn`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fce7f3" />
          <stop offset="1" stopColor="#fff7ed" />
        </linearGradient>
      </defs>
      <rect width={w} height={h} fill={`url(#${id}-dawn)`} />
      <path
        d={`M${cx - h * 0.42} ${base}V${h * 0.42}a${h * 0.42} ${h * 0.34} 0 0 1 ${h * 0.84} 0V${base}`}
        stroke="#f9a8d4"
        strokeWidth="12"
        fill="none"
      />
      <rect x="0" y={base} width={w} height={h - base} fill="#fbcfe8" />
      <g fill="#334155">
        <circle cx={cx - h * 0.26} cy={h * 0.5} r={h * 0.05} />
        <path
          d={`M${cx - h * 0.33} ${base}l${h * 0.02} -${h * 0.3}h${h * 0.1}l${h * 0.02} ${h * 0.3}Z`}
        />
        <circle cx={cx + h * 0.26} cy={h * 0.52} r={h * 0.047} />
        <path
          d={`M${cx + h * 0.18} ${base}l${h * 0.05} -${h * 0.28}h${h * 0.06}l${h * 0.05} ${h * 0.28}Z`}
          opacity="0.75"
        />
      </g>
    </>
  );
}
