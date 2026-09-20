"use client";

import { useEffect, useRef, useState } from "react";
import { Lock } from "@/lib/icons";

/**
 * A real encryptor, on the visitor's machine, with no account.
 *
 * The page's whole thesis is "do not take our word for it", so the proof cannot
 * be a simulation. This runs actual AES-256-GCM through crypto.subtle: the key
 * is generated once on mount, never leaves the tab, and is never sent anywhere.
 * What you see on the right is genuinely what a server would hold.
 *
 * Deliberately text and not a file picker. A real PDF or JPEG is mostly binary,
 * so a hexdump of one renders as a wall of filler with a few readable bytes,
 * which proves nothing to a non-technical reader. Typing your own sentence and
 * watching it become unreadable is the same claim, legible.
 *
 * Debounced at 120ms and capped at 200 characters so a fast typist cannot spin
 * the crypto on every keystroke.
 */
const SAMPLE = "My passport number is not your business.";
const MAX = 200;

export function LiveCipher() {
  const [text, setText] = useState(SAMPLE);
  const [cipher, setCipher] = useState("");
  const [failed, setFailed] = useState(false);
  const keyRef = useRef<CryptoKey | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          if (!keyRef.current) {
            keyRef.current = await crypto.subtle.generateKey(
              { name: "AES-GCM", length: 256 },
              false,
              ["encrypt"],
            );
          }
          const iv = crypto.getRandomValues(new Uint8Array(12));
          const buf = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv },
            keyRef.current,
            new TextEncoder().encode(text || " "),
          );
          if (cancelled) return;
          const bytes = new Uint8Array(buf);
          setCipher(Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(""));
          setFailed(false);
        } catch {
          // Blocked crypto.subtle (an insecure origin, a locked-down browser).
          // Say so rather than showing fake ciphertext on the one panel whose
          // entire job is being real.
          if (!cancelled) setFailed(true);
        }
      })();
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [text]);

  return (
    <div className="grid gap-px overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-border)] sm:grid-cols-2">
      <div className="bg-[var(--color-surface)] p-5">
        <label
          htmlFor="live-cipher-input"
          className="text-[11px] font-medium uppercase tracking-widest text-[var(--color-text-muted)]"
        >
          Type anything. It stays on your machine.
        </label>
        <textarea
          id="live-cipher-input"
          value={text}
          maxLength={MAX}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          spellCheck={false}
          className="mt-3 w-full resize-none rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
        />
        <p className="mt-2 text-[11px] text-[var(--color-text-muted)]">
          {text.length} of {MAX} characters
        </p>
      </div>

      <div className="relative bg-[var(--color-surface)] p-5">
        <div className="flex items-center gap-2">
          <Lock className="h-3.5 w-3.5 text-[var(--color-accent)]" />
          <span className="text-[11px] font-medium uppercase tracking-widest text-[var(--color-text-muted)]">
            All we would ever hold
          </span>
        </div>
        <p
          className="mt-3 h-[104px] overflow-hidden break-all font-mono text-[12px] leading-relaxed text-[var(--color-text-muted)]"
          aria-live="polite"
        >
          {failed
            ? "Your browser blocked the encryption API, so there is nothing real to show here. That is the correct outcome: we would rather show nothing than fake it."
            : cipher}
        </p>
        <p className="mt-2 text-[11px] text-[var(--color-text-muted)]">
          Real AES-256-GCM, run in this tab. The key was made here and goes nowhere.
        </p>
      </div>
    </div>
  );
}
