import { beforeEach, describe, expect, it } from "vitest";
import { WaitReason, useTransferWait } from "@/store/transfer-wait";

beforeEach(() => useTransferWait.setState({ waits: {} }));

describe("useTransferWait", () => {
  it("clearAll drops every waiting row at once", () => {
    const { set, clearAll } = useTransferWait.getState();
    set("up:1", WaitReason.TelegramBlocked);
    set("dl:2", WaitReason.AllowanceUsedUp);
    expect(useTransferWait.getState().waits).toEqual({
      "up:1": WaitReason.TelegramBlocked,
      "dl:2": WaitReason.AllowanceUsedUp,
    });

    clearAll();

    expect(useTransferWait.getState().waits).toEqual({});
  });

  it("clearAll with nothing waiting leaves the state object alone", () => {
    const before = useTransferWait.getState();
    before.clearAll();
    expect(useTransferWait.getState()).toBe(before);
  });

  it("set with an unchanged reason and clear of an unknown key do not replace the state", () => {
    const { set, clear } = useTransferWait.getState();
    set("up:1", WaitReason.TelegramBlocked);
    const afterSet = useTransferWait.getState();
    set("up:1", WaitReason.TelegramBlocked);
    clear("nope");
    expect(useTransferWait.getState()).toBe(afterSet);
  });
});
