"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

/** iPhone 14 Plus body at 452x950 logical px, scaled to whatever width CSS gives it. */
export function IPhoneFrame({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = () => {
      const w = el.offsetWidth;
      if (w) el.style.setProperty("--zh-k", String(w / 452));
    };
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} className="zh-phone" dir="ltr">
      <span className="zh-phone-btn zh-phone-act" aria-hidden="true" />
      <span className="zh-phone-btn zh-phone-vu" aria-hidden="true" />
      <span className="zh-phone-btn zh-phone-vd" aria-hidden="true" />
      <span className="zh-phone-btn zh-phone-pw" aria-hidden="true" />
      <div className="zh-phone-screen">
        <div className="zh-phone-scale">
          <div className="zh-phone-status" aria-hidden="true">
            <span className="zh-phone-time">9:41</span>
            <span className="zh-phone-icons">
              <svg viewBox="0 0 18 12" width="18" height="12">
                <rect x="0" y="8" width="3" height="4" rx="0.8" />
                <rect x="5" y="5.5" width="3" height="6.5" rx="0.8" />
                <rect x="10" y="3" width="3" height="9" rx="0.8" />
                <rect x="15" y="0" width="3" height="12" rx="0.8" />
              </svg>
              <svg viewBox="0 0 16 12" width="16" height="12">
                <path d="M8 11.5 10.4 9a3.4 3.4 0 0 0-4.8 0Z" />
                <path d="M3.6 7a6.2 6.2 0 0 1 8.8 0l-1.3 1.3a4.4 4.4 0 0 0-6.2 0Z" />
                <path d="M1.2 4.6a9.6 9.6 0 0 1 13.6 0l-1.3 1.3a7.8 7.8 0 0 0-11 0Z" />
              </svg>
              <svg viewBox="0 0 27 12" width="27" height="12">
                <rect
                  x="0.5"
                  y="0.5"
                  width="23"
                  height="11"
                  rx="3.2"
                  fill="none"
                  stroke="currentColor"
                  strokeOpacity="0.4"
                />
                <rect x="2" y="2" width="18" height="8" rx="2" />
                <path d="M25 4v4a2 2 0 0 0 0-4Z" opacity="0.45" />
              </svg>
            </span>
          </div>
          <span className="zh-phone-notch" aria-hidden="true" />
          {children}
          <span className="zh-phone-home" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
