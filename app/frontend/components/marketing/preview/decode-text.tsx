"use client";

import { useRef, type ElementType, type ReactNode } from "react";
import { gsap, SplitText, hexChar, useGSAP } from "./gsap";
import { cn } from "@/lib/utils";

/**
 * Text that arrives as ciphertext and resolves into words.
 *
 * The page's claim is that your files become unreadable. The typography acts
 * that out: headlines are shown as hex first and decode character by
 * character. It is the Terminal direction's one idea grafted onto the Vault.
 *
 * Real text is in the DOM from the first paint, so LCP, SEO and screen readers
 * all see the final sentence. The hex is a visual layered on by SplitText after
 * hydration; if JS never runs the words are simply there.
 *
 * `trigger: "scroll"` decodes when the element scrolls into view.
 * `trigger: "mount"` decodes right after paint, for the hero.
 */
export function DecodeText({
  children,
  as: Tag = "span",
  className,
  trigger = "scroll",
  delay = 0,
  duration = 0.9,
}: {
  children: ReactNode;
  as?: ElementType;
  className?: string;
  trigger?: "scroll" | "mount";
  delay?: number;
  duration?: number;
}) {
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;

      const mm = gsap.matchMedia();

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        // Split by words AND chars. Chars alone are inline-blocks the browser
        // will happily wrap anywhere, which produced "fil / es." in the hero.
        // Wrapping each word keeps line breaks between words.
        // aria: "hidden" marks the split target aria-hidden. SplitText's default
        // ("auto") instead sets aria-label on it, which is prohibited on a
        // role-less span and fails an accessibility audit. The real sentence is
        // provided to assistive tech by the sr-only sibling rendered below.
        const split = SplitText.create(el, {
          type: "words,chars",
          wordsClass: "word",
          charsClass: "char",
          aria: "hidden",
        });
        const chars = split.chars as HTMLElement[];
        const finals = chars.map((c) => c.textContent ?? "");

        // Scramble each glyph to hex, then let them settle left to right with a
        // little randomness so it reads as decoding, not as a wipe.
        chars.forEach((c, i) => {
          if (finals[i].trim() === "") return;
          c.textContent = hexChar(i + 7);
          c.classList.add("is-hex");
        });

        const tl = gsap.timeline({
          paused: true,
          delay,
          defaults: { ease: "none" },
        });

        chars.forEach((c, i) => {
          if (finals[i].trim() === "") return;
          const at = (i / chars.length) * duration * 0.75 + ((i * 37) % 11) * 0.012;
          // Flicker through two more hex values before landing on the letter.
          tl.call(
            () => {
              c.textContent = hexChar(i + 31);
            },
            undefined,
            at,
          );
          tl.call(
            () => {
              c.textContent = hexChar(i + 59);
            },
            undefined,
            at + 0.05,
          );
          tl.call(
            () => {
              c.textContent = finals[i];
              c.classList.remove("is-hex");
            },
            undefined,
            at + 0.1,
          );
        });
        // Keep the timeline's total duration honest for the trigger.
        tl.to({}, { duration: 0.01 }, duration);

        if (trigger === "mount") {
          tl.play();
        } else {
          gsap.timeline({
            scrollTrigger: { trigger: el, start: "top 85%", once: true, onEnter: () => tl.play() },
          });
        }

        return () => {
          tl.kill();
          split.revert();
        };
      });

      return () => mm.revert();
    },
    { scope: ref, dependencies: [trigger, delay, duration] },
  );

  // Two copies of the text: one visual, split into characters and hidden from
  // assistive tech while it decodes; one for screen readers, never split, so
  // the heading is read as a sentence rather than as sixty letters.
  return (
    <>
      <Tag ref={ref} className={cn("vault-decode", className)}>
        {children}
      </Tag>
      <span className="sr-only">{children}</span>
    </>
  );
}
