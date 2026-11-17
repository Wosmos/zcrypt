import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ invoke: vi.fn(async () => {}) }));
vi.mock("@/lib/tauri", () => ({ isTauri: false, tauriInvoke: h.invoke }));

import { pushBackupNotifications } from "@/lib/backup-notifications";

describe("pushBackupNotifications", () => {
  it("does nothing outside the desktop and Android shells", async () => {
    await pushBackupNotifications(true, true);
    expect(h.invoke).not.toHaveBeenCalled();
  });
});
