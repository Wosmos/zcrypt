"use client";

import { useId, useLayoutEffect, useRef } from "react";
import { Eye, EyeOff } from "@/lib/icons";
import { cn } from "@/lib/utils";
import type { View } from "./drive-data";

/** Two-option segmented radio: your view, or what we (and the platforms) see. */
export function ViewToggle({
  value,
  onChange,
  size = "sm",
  className,
}: {
  value: View;
  onChange: (v: View) => void;
  size?: "sm" | "lg";
  className?: string;
}) {
  const name = useId();
  const track = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = track.current;
    if (!el) return;
    const place = () => {
      const on = el.querySelector<HTMLElement>(`[data-v="${value}"]`);
      if (!on) return;
      el.style.setProperty("--zh-tx", `${on.offsetLeft}px`);
      el.style.setProperty("--zh-tw", `${on.offsetWidth}px`);
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(el);
    return () => ro.disconnect();
  }, [value]);

  return (
    <div
      ref={track}
      role="radiogroup"
      aria-label="Choose a view"
      className={cn("zh-tog", size === "lg" && "zh-tog-lg", className)}
    >
      <span className="zh-tog-thumb" aria-hidden="true" />
      {(
        [
          ["you", "Your view"],
          ["gh", "What we see"],
        ] as const
      ).map(([v, label]) => (
        <label key={v} className="zh-tog-o" data-v={v}>
          <input
            type="radio"
            name={name}
            value={v}
            checked={value === v}
            onChange={() => onChange(v)}
            className="zh-tog-in"
          />
          <span className="zh-tog-l">
            {v === "gh" ? <EyeOff className="zh-tog-gh" /> : <Eye className="zh-tog-gh" />}
            {label}
          </span>
        </label>
      ))}
    </div>
  );
}
