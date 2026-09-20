"use client";

import { useRef } from "react";
import { gsap, useGSAP, MOTION_FULL, hexChar } from "./gsap";

/**
 * Inside the vault: five ordinary files as slabs floating at different depths.
 *
 * Each slab sits at its own translateZ, so scrolling moves them at different
 * rates and the field reads as a volume rather than a list. The filename is on
 * the face; the ciphertext is on the slab's bottom edge, a real plane rotated
 * ninety degrees, so you only see it when the slab tilts. Same fact as the old
 * two-column panel, told as an object instead of a table.
 *
 * Human filenames on purpose. The previous page never named one thing a
 * normal person owns.
 */
const FILES = [
  { name: "passport-scan.pdf", size: "2.4 MB", x: 8, y: 12, z: -80, r: -6 },
  { name: "tax-return-2025.pdf", size: "880 KB", x: 58, y: 6, z: 40, r: 4 },
  { name: "wedding-photos.zip", size: "1.2 GB", x: 30, y: 44, z: 120, r: -2 },
  { name: "lease-signed.pdf", size: "310 KB", x: 66, y: 58, z: -140, r: 7 },
  { name: "savings.xlsx", size: "44 KB", x: 12, y: 72, z: 0, r: -4 },
];

export function DepthField() {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = root.current;
      if (!el) return;
      const q = gsap.utils.selector(el);
      const mm = gsap.matchMedia();

      mm.add(MOTION_FULL, () => {
        // Scroll parallax: deeper slabs move less, nearer ones more.
        const slabs = q(".vault-float") as HTMLElement[];
        slabs.forEach((s) => {
          const z = Number(s.dataset.z ?? 0);
          gsap.to(s, {
            y: () => -z * 0.9 - 60,
            rotationX: -6,
            ease: "none",
            scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: true },
          });
        });

        // Cursor parallax, pointer devices only.
        if (!window.matchMedia("(pointer: fine)").matches) return;
        const rx = gsap.quickTo(q(".vault-stage"), "rotationX", {
          duration: 0.8,
          ease: "power3.out",
        });
        const ry = gsap.quickTo(q(".vault-stage"), "rotationY", {
          duration: 0.8,
          ease: "power3.out",
        });
        const onMove = (e: PointerEvent) => {
          const r = el.getBoundingClientRect();
          ry(((e.clientX - r.left) / r.width - 0.5) * 10);
          rx(-((e.clientY - r.top) / r.height - 0.5) * 8);
        };
        el.addEventListener("pointermove", onMove);
        return () => el.removeEventListener("pointermove", onMove);
      });

      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <div
      ref={root}
      className="vault vault-scene relative h-[560px] sm:h-[640px]"
      aria-hidden="true"
    >
      <div className="vault-stage absolute inset-0">
        {FILES.map((f, i) => (
          <div
            key={f.name}
            className="vault-float"
            data-z={f.z}
            style={{
              left: `${f.x}%`,
              top: `${f.y}%`,
              transform: `translateZ(${f.z}px) rotateZ(${f.r}deg)`,
            }}
          >
            <div className="vault-slab w-[220px] px-4 py-3 sm:w-[260px]">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate text-sm font-medium text-[var(--color-text)]">
                  {f.name}
                </span>
                <span className="shrink-0 font-mono text-[10px] text-[var(--color-text-muted)]">
                  {f.size}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="h-1 w-1 rounded-full bg-[var(--color-accent)]" />
                <span className="text-[10px] uppercase tracking-widest text-[var(--color-text-muted)]">
                  Sealed
                </span>
              </div>
              <div className="vault-float-edge font-mono">
                {Array.from({ length: 40 }, (_, k) => hexChar(k + i * 13)).join("")}
              </div>
            </div>
          </div>
        ))}

        {/* The seam runs through the field too. */}
        <div className="vault-seam absolute inset-y-0 left-1/2 w-px -translate-x-1/2 opacity-40" />
      </div>
    </div>
  );
}
