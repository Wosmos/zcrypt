// A real encryptor, on the visitor's machine, with no account.
// Port of components/marketing/preview/live-cipher.tsx. AES-256-GCM through
// crypto.subtle; the key is generated once and never leaves the tab.
// Debounced at 120ms and capped at 200 characters.

import { COPY } from "./copy.js";
import { LOCK } from "./marks.js";

const MAX = 200;

export function renderCipher(root) {
  const c = COPY.cipher;
  root.classList.add("cipher");
  root.innerHTML = `
    <div>
      <label for="cipher-in" class="kicker">${c.label}</label>
      <textarea id="cipher-in" rows="4" maxlength="${MAX}" spellcheck="false">${c.sample}</textarea>
      <p class="count"><span data-count>${c.sample.length}</span> of ${MAX} characters</p>
    </div>
    <div>
      <div class="lockrow">${LOCK}<span class="kicker">${c.outLabel}</span></div>
      <p class="out" data-out aria-live="polite"></p>
      <p class="foot">${c.foot}</p>
    </div>`;

  const input = root.querySelector("#cipher-in");
  const out = root.querySelector("[data-out]");
  const count = root.querySelector("[data-count]");
  let key = null;
  let timer = 0;
  let seq = 0;

  async function run() {
    const mine = ++seq;
    try {
      if (!key) {
        key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
          "encrypt",
        ]);
      }
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const buf = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        new TextEncoder().encode(input.value || " "),
      );
      if (mine !== seq) return;
      out.textContent = Array.from(new Uint8Array(buf), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("");
      out.style.color = "";
    } catch {
      out.textContent = c.failed;
      out.style.color = "var(--text-3)";
    }
  }

  input.addEventListener("input", () => {
    count.textContent = String(input.value.length);
    clearTimeout(timer);
    timer = setTimeout(run, 120);
  });
  run();
}
