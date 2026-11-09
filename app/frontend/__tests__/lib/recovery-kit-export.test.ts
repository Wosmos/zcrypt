import { describe, it, expect, vi, afterEach } from "vitest";
import { printRecoveryKit, recoveryKitHtml, recoveryKitText, type RecoveryKitSheet } from "@/lib/recovery-kit-export";

const sheet: RecoveryKitSheet = {
  product: "zcrypt",
  title: "Recovery kit",
  dateLabel: "Created 9 November 2026",
  keyLabel: "Recovery key",
  recoveryKey: "ZCRYPT-ABCD-EFGH",
  instructions: ["Keep it offline", "Never share <this>"],
};

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("recovery kit export", () => {
  it("writes a numbered plain-text kit", () => {
    expect(recoveryKitText(sheet)).toBe(
      "zcrypt - Recovery kit\nCreated 9 November 2026\n\nRecovery key:\nZCRYPT-ABCD-EFGH\n\n1. Keep it offline\n2. Never share <this>\n",
    );
  });

  it("escapes everything it puts in the print page and honours right-to-left", () => {
    const html = recoveryKitHtml({ ...sheet, title: 'Kit "1" & <2>', dir: "rtl" });
    expect(html).toContain('<html dir="rtl">');
    expect(html).toContain("Kit &quot;1&quot; &amp; &lt;2&gt;");
    expect(html).toContain("<li>Never share &lt;this&gt;</li>");
    expect(html).not.toContain("<this>");
    expect(recoveryKitHtml(sheet)).toContain('<html dir="ltr">');
  });

  it("prints from a hidden frame and removes it afterwards", () => {
    const print = vi.fn();
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === "iframe") {
        queueMicrotask(() => undefined);
        Object.defineProperty(el, "contentWindow", {
          get: () => {
            const win = (el as HTMLIFrameElement).ownerDocument.defaultView as Window;
            return Object.assign(Object.create(win), { print, focus: vi.fn(), addEventListener: (t: string, fn: () => void) => t === "afterprint" && fn() });
          },
        });
      }
      return el;
    });
    printRecoveryKit(sheet);
    expect(print).toHaveBeenCalled();
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("gives up quietly when the frame has no document", () => {
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === "iframe") Object.defineProperty(el, "contentDocument", { get: () => null });
      return el;
    });
    expect(() => printRecoveryKit(sheet)).not.toThrow();
    expect(document.querySelector("iframe")).toBeNull();
  });
});
