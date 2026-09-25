// The same 4 GB upload, twice. Port of eighty-percent.tsx.
// Left labours to 80 percent and dies. Right moves in 8 chunks, drops at
// chunk five, resumes from chunk five. Runs once when scrolled into view.

import { COPY } from "./copy.js";

const CHUNKS = 8;
const DROP_AT = 5;

export function renderEighty(root, { reduce = false } = {}) {
  const e = COPY.eighty;
  root.classList.add("eighty");
  root.innerHTML = `
    <div class="card">
      <p class="kicker">${e.leftTitle}</p>
      <p class="name">${e.file}</p>
      <p class="size">${e.leftSize}</p>
      <div class="track"><div class="fill" data-left></div></div>
      <p class="status" data-left-status>0%</p>
      <p class="note">${e.leftNote}</p>
    </div>
    <div class="card accent">
      <p class="kicker accent">${e.rightTitle}</p>
      <p class="name">${e.file}</p>
      <p class="size">${e.rightSize}</p>
      <div class="chunks" aria-hidden="true">${'<div class="chunk"></div>'.repeat(CHUNKS)}</div>
      <p class="status" data-right-status>Chunk 0 of ${CHUNKS}</p>
      <p class="note">${e.rightNote}</p>
    </div>`;

  const fill = root.querySelector("[data-left]");
  const ls = root.querySelector("[data-left-status]");
  const rs = root.querySelector("[data-right-status]");
  const chunks = [...root.querySelectorAll(".chunk")];

  function finalState() {
    fill.style.width = "80%";
    fill.classList.add("dead");
    ls.textContent = e.leftDead;
    ls.classList.add("dead");
    chunks.forEach((c) => c.classList.add("on"));
    rs.textContent = e.done;
    rs.classList.add("done");
  }

  function play() {
    const t = (ms, fn) => setTimeout(fn, ms);
    [
      [300, 55],
      [700, 66],
      [1100, 73],
      [1500, 77],
      [1900, 79],
      [2300, 80],
    ].forEach(([at, pct]) =>
      t(at, () => {
        fill.style.width = pct + "%";
        ls.textContent = pct + "%";
      }),
    );
    t(3400, () => {
      fill.classList.add("dead");
      ls.textContent = e.leftDead;
      ls.classList.add("dead");
    });

    for (let i = 1; i <= DROP_AT; i++) {
      t(300 + i * 260, () => {
        chunks[i - 1].classList.add("on");
        rs.textContent = `Chunk ${i} of ${CHUNKS}`;
      });
    }
    const dropAt = 300 + DROP_AT * 260 + 150;
    t(dropAt, () => {
      rs.textContent = e.dropped;
      rs.classList.add("drop");
    });
    t(dropAt + 600, () => {
      rs.classList.remove("drop");
      rs.textContent = `Chunk ${DROP_AT} of ${CHUNKS}`;
    });
    for (let i = DROP_AT + 1; i <= CHUNKS; i++) {
      t(dropAt + 600 + (i - DROP_AT) * 260, () => {
        chunks[i - 1].classList.add("on");
        rs.textContent = `Chunk ${i} of ${CHUNKS}`;
      });
    }
    t(dropAt + 600 + (CHUNKS - DROP_AT) * 260 + 200, () => {
      rs.textContent = e.done;
      rs.classList.add("done");
    });
  }

  if (reduce || !("IntersectionObserver" in window)) {
    finalState();
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((x) => x.isIntersecting)) {
        io.disconnect();
        play();
      }
    },
    { threshold: 0.5 },
  );
  io.observe(root);
}
