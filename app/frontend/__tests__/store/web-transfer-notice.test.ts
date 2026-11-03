import { describe, it, expect, beforeEach } from "vitest";
import { useWebTransferNotice } from "@/store/web-transfer-notice";
import { WebTransferLimitCode } from "@/lib/web-transfer-limit";

const tooBig = { code: WebTransferLimitCode.FileTooLarge, limitBytes: 1000 };
const allowance = {
  code: WebTransferLimitCode.AllowanceExceeded,
  limitBytes: 3000,
  usedBytes: 3100,
  resetsAt: "2026-12-01T00:00:00Z",
};
const a = { name: "a.bin", size: 2000 };
const b = { name: "b.bin", size: 3000 };

const state = () => useWebTransferNotice.getState();

let n = 0;
const nextBatch = () => `batch-${++n}`;

beforeEach(() => {
  state().close();
});

describe("useWebTransferNotice", () => {
  it("opens one dialog per refusal, starting fresh each time", () => {
    const seq = state().seq;
    state().show(tooBig, a);
    expect(state().notice).toEqual({ ...tooBig, files: [a] });
    expect(state().seq).toBe(seq + 1);
    state().close();
    expect(state().notice).toBeNull();
    state().show(allowance);
    expect(state().notice).toEqual({ ...allowance, files: [] });
    expect(state().seq).toBe(seq + 2);
  });

  it("collects the refused files of one batch into the open dialog, each once", () => {
    const batch = nextBatch();
    state().show(tooBig, a, batch);
    state().show(tooBig, b, batch);
    state().show(tooBig, a, batch);
    state().show(tooBig, undefined, batch);
    expect(state().notice?.files).toEqual([a, b]);
    expect(state().batch).toBe(batch);
  });

  it("keeps the open dialog when another kind of refusal or another batch arrives", () => {
    const batch = nextBatch();
    state().show(tooBig, a, batch);
    state().show(allowance, b, batch);
    state().show(tooBig, b, nextBatch());
    state().show(tooBig, b);
    expect(state().notice).toEqual({ ...tooBig, files: [a] });
  });

  it("stays quiet for the rest of a batch once its dialog was closed", () => {
    const batch = nextBatch();
    state().show(allowance, a, batch);
    state().close();
    state().show(allowance, b, batch);
    expect(state().notice).toBeNull();
    state().show(tooBig, b, batch);
    expect(state().notice?.code).toBe(WebTransferLimitCode.FileTooLarge);
  });

  it("joins batch-less refusals into an open batch-less dialog", () => {
    state().show(tooBig, a);
    state().show(tooBig, b);
    expect(state().notice?.files).toEqual([a, b]);
  });
});
