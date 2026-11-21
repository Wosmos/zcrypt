import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const revalidateTag = vi.fn();
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidateTag, revalidatePath }));

const { POST } = await import("@/app/hooks/release/route.web");

const call = (auth?: string) =>
  POST(
    new Request("https://www.zcrypt.cloud/hooks/release", {
      method: "POST",
      headers: auth ? { authorization: auth } : {},
    }),
  );

describe("release hook", () => {
  beforeEach(() => {
    revalidateTag.mockClear();
    revalidatePath.mockClear();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("is off until a secret is configured", async () => {
    const res = call("Bearer anything");
    expect(res.status).toBe(503);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("refuses a missing or wrong secret", () => {
    vi.stubEnv("RELEASE_HOOK_SECRET", "s3cret");
    expect(call().status).toBe(401);
    expect(call("Bearer nope!").status).toBe(401);
    expect(call("Bearer s3cret-but-longer").status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("drops the release cache and the download page", async () => {
    vi.stubEnv("RELEASE_HOOK_SECRET", "s3cret");
    const res = call("Bearer s3cret");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ revalidated: true });
    expect(revalidateTag).toHaveBeenCalledWith("github-release", { expire: 0 });
    expect(revalidatePath).toHaveBeenCalledWith("/download");
  });
});
