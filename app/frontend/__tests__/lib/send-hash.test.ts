import { describe, expect, it } from "vitest";
import { openSendHash } from "@/lib/send-hash";
import { keyFromBytes, sealText } from "@/lib/sealed";

const HEX = "ab".repeat(32);

describe("openSendHash", () => {
  it("passes a legacy plain hex hash through", async () => {
    expect(await openSendHash(HEX, null)).toBe(HEX);
  });

  it("opens a sealed hash with the link key", async () => {
    const key = await keyFromBytes(new Uint8Array(32).fill(7));
    const sealed = await sealText(HEX, key);
    expect(sealed.startsWith("enc1:")).toBe(true);
    expect(await openSendHash(sealed, key)).toBe(HEX);
  });

  it("returns null with the wrong key, no key, or garbage", async () => {
    const key = await keyFromBytes(new Uint8Array(32).fill(7));
    const other = await keyFromBytes(new Uint8Array(32).fill(9));
    const sealed = await sealText(HEX, key);
    expect(await openSendHash(sealed, other)).toBeNull();
    expect(await openSendHash(sealed, null)).toBeNull();
    expect(await openSendHash("nope", key)).toBeNull();
  });
});
