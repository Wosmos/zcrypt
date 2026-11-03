import { describe, it, expect } from "vitest";
import { NOTICE_LIST_MAX, noticeCopy } from "@/lib/web-transfer-notice";
import { WebTransferLimitCode } from "@/lib/web-transfer-limit";

const MB = 1024 * 1024;
const tooBig = { code: WebTransferLimitCode.FileTooLarge, limitBytes: 3 * MB };
const file = (name: string, size = 5 * MB) => ({ name, size });

describe("noticeCopy", () => {
  it("names the one file, its size and the cap", () => {
    expect(noticeCopy({ ...tooBig, files: [file("big.bin", 2.5 * MB)] })).toEqual({
      title: { key: "tooBigTitle" },
      body: { key: "tooBigBody", values: { name: "big.bin", size: "2.5 MB", limit: "3 MB" } },
      hint: { key: "hint", values: { count: 1 } },
      list: [],
      more: 0,
    });
  });

  it("lists a few refused files and counts the rest", () => {
    const files = ["a", "b", "c", "d", "e"].map((n) => file(`${n}.bin`));
    const copy = noticeCopy({ ...tooBig, files });
    expect(copy.title).toEqual({ key: "tooBigManyTitle", values: { count: 5 } });
    expect(copy.body).toEqual({ key: "capBody", values: { limit: "3 MB" } });
    expect(copy.hint).toEqual({ key: "hint", values: { count: 5 } });
    expect(copy.list).toHaveLength(NOTICE_LIST_MAX);
    expect(copy.list[0]).toEqual({ name: "a.bin", size: "5 MB" });
    expect(copy.more).toBe(2);
  });

  it("lists two files without an and-more line", () => {
    const copy = noticeCopy({ ...tooBig, files: [file("a.bin"), file("b.bin")] });
    expect(copy.list).toHaveLength(2);
    expect(copy.more).toBe(0);
  });

  it("explains the cap even without a file to name", () => {
    expect(noticeCopy({ ...tooBig, files: [] })).toEqual({
      title: { key: "tooBigTitle" },
      body: { key: "capBody", values: { limit: "3 MB" } },
      hint: undefined,
      list: [],
      more: 0,
    });
  });

  it("shows what is used of the allowance, never more than all of it, and when it starts over", () => {
    const copy = noticeCopy({
      code: WebTransferLimitCode.AllowanceExceeded,
      limitBytes: 3 * MB,
      usedBytes: 4.2 * MB,
      resetsAt: "2026-12-01T00:00:00Z",
      files: [file("a.bin")],
    });
    expect(copy).toEqual({
      title: { key: "allowanceTitle" },
      body: {
        key: "allowanceBody",
        values: { used: "3 MB", limit: "3 MB", date: "December 1" },
      },
      hint: { key: "hint", values: { count: 1 } },
      list: [],
      more: 0,
    });
  });

  it("shows the part used when under the limit", () => {
    const copy = noticeCopy({
      code: WebTransferLimitCode.AllowanceExceeded,
      limitBytes: 3 * MB,
      usedBytes: 2 * MB,
      files: [],
    });
    expect(copy.body.values?.used).toBe("2 MB");
  });

  it("falls back to the limit as used, and leaves the date out when unknown", () => {
    const copy = noticeCopy({
      code: WebTransferLimitCode.AllowanceExceeded,
      limitBytes: 3 * MB,
      files: [],
    });
    expect(copy.body).toEqual({
      key: "allowanceBodyNoDate",
      values: { used: "3 MB", limit: "3 MB" },
    });
    expect(copy.hint).toBeUndefined();
  });
});
