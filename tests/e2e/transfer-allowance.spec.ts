import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { createHash, randomBytes } from "crypto";
import { connectMockStorage, loginUser, setupAuthenticatedUser, skipTourIfShown } from "./helpers";

// The transfer allowance on bytes that pass through the server. CI starts the
// backend with a small allowance (ci.yml: 12 MiB per file, 100 MiB a day,
// 200 MiB a month) and passes the same numbers here.

const API_URL = process.env.E2E_API_URL || "http://localhost:8080";
const MAX_FILE = Number(process.env.E2E_RELAY_MAX_FILE_BYTES || 0);
const DAILY = Number(process.env.E2E_RELAY_DAILY_BYTES || 0);
const SALT = Buffer.alloc(32, 7).toString("base64");
const PASSPHRASE = "allowance-passphrase-2026";

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function quota(req: APIRequestContext, token: string) {
  const res = await req.get(`${API_URL}/api/quota`, { headers: auth(token) });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

function initUpload(req: APIRequestContext, token: string, size: number) {
  return req.post(`${API_URL}/api/upload/init`, {
    headers: { ...auth(token), "Content-Type": "application/json" },
    data: {
      // The server only ever sees a client-sealed name.
      encrypted_name: randomBytes(48).toString("base64"),
      original_size: size,
      sha256: randomBytes(32).toString("hex"),
      salt: SALT,
      chunk_count: Math.max(1, Math.ceil(size / (4 << 20))),
    },
  });
}

test.describe("Transfer allowance", () => {
  test.beforeEach(() => {
    if (process.env.CI) expect(MAX_FILE && DAILY, "E2E_RELAY_* not set").toBeTruthy();
    test.skip(!MAX_FILE || !DAILY, "set E2E_RELAY_MAX_FILE_BYTES and E2E_RELAY_DAILY_BYTES to match the backend");
  });

  test("quota reports the server's limits", async ({ page }) => {
    const { token } = await setupAuthenticatedUser(page);
    const q = await quota(page.request, token);
    expect(q.relay_max_file_bytes).toBe(MAX_FILE);
    expect(q.relay_day_limit_bytes).toBe(DAILY);
    expect(q.relay_day_used_bytes).toBe(0);
    expect(q.relay_reserved_bytes).toBe(0);
  });

  test("a file over the per-file cap is refused at init", async ({ page }) => {
    const { token } = await setupAuthenticatedUser(page);
    await connectMockStorage(page, token);
    const res = await initUpload(page.request, token, MAX_FILE + 1);
    expect(res.status()).toBe(413);
    const body = await res.json();
    expect(body.code).toBe("relay_file_too_large");
    expect(body.limit_bytes).toBe(MAX_FILE);
    expect((await quota(page.request, token)).relay_reserved_bytes).toBe(0);
  });

  test("open uploads reserve the daily window, and cancelling one frees it", async ({ page }) => {
    const { token } = await setupAuthenticatedUser(page);
    await connectMockStorage(page, token);

    const sessions: string[] = [];
    const fits = Math.floor(DAILY / MAX_FILE);
    for (let i = 0; i < fits; i++) {
      const res = await initUpload(page.request, token, MAX_FILE);
      expect(res.ok(), `init ${i + 1} of ${fits}: ${res.status()}`).toBeTruthy();
      sessions.push((await res.json()).session_id);
    }
    expect((await quota(page.request, token)).relay_reserved_bytes).toBe(fits * MAX_FILE);

    const over = await initUpload(page.request, token, MAX_FILE);
    expect(over.status()).toBe(403);
    expect((await over.json()).code).toBe("relay_daily_exceeded");

    const cancel = await page.request.delete(`${API_URL}/api/upload/${sessions[0]}`, {
      headers: { ...auth(token), "Content-Type": "application/json" },
      data: {},
    });
    expect(cancel.ok(), `cancel: ${cancel.status()}`).toBeTruthy();
    expect((await quota(page.request, token)).relay_reserved_bytes).toBe((fits - 1) * MAX_FILE);
    expect((await initUpload(page.request, token, MAX_FILE)).ok()).toBeTruthy();
  });

  test("a relayed chunk is counted against today's allowance", async ({ page }) => {
    const { token } = await setupAuthenticatedUser(page);
    await connectMockStorage(page, token);
    const chunk = randomBytes(64 * 1024);
    const init = await initUpload(page.request, token, chunk.length);
    expect(init.ok()).toBeTruthy();
    const { session_id } = await init.json();

    const put = await page.request.put(`${API_URL}/api/upload/${session_id}/chunk/0`, {
      headers: {
        ...auth(token),
        "Content-Type": "application/octet-stream",
        "X-Chunk-SHA256": createHash("sha256").update(chunk).digest("hex"),
      },
      data: chunk,
    });
    expect(put.ok(), `chunk: ${put.status()} ${await put.text()}`).toBeTruthy();
    expect((await quota(page.request, token)).relay_day_used_bytes).toBe(chunk.length);
  });

  test.describe("in the browser", () => {
    let page: Page;
    let token: string;

    test.beforeEach(async ({ browser }) => {
      page = await browser.newPage();
      const user = await setupAuthenticatedUser(page);
      token = user.token;
      await connectMockStorage(page, token);
      // Sign in through the real form, from a clean guest session.
      await page.evaluate(() => localStorage.clear());
      await page.context().clearCookies();
      await loginUser(page, user.email, user.password);
      await skipTourIfShown(page);
    });

    test.afterEach(async () => {
      await page?.close();
    });

    test("settings show today's and this month's allowance", async () => {
      await page.goto("/settings?tab=storage");
      await expect(page.getByRole("heading", { name: "Usage & limits" })).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole("heading", { name: "Transfer allowance" })).toBeVisible();
      await expect(page.getByText("Today", { exact: true })).toBeVisible();
      await expect(page.getByText("This month", { exact: true })).toBeVisible();
      await expect(page.getByText("Biggest file through our server")).toBeVisible();
    });

    test("a file over the cap is stopped before anything is sent", async () => {
      await page.getByRole("button", { name: "Upload", exact: true }).click();
      await page
        .locator('input[type="file"]')
        .first()
        .setInputFiles({
          name: "too-big.bin",
          mimeType: "application/octet-stream",
          buffer: randomBytes(MAX_FILE + 1024),
        });
      // A first upload unlocks the vault and confirms the passphrase once, as a person would.
      const tooBig = page.getByText("Too big for the browser").first();
      const unlock = page.getByPlaceholder("Your encryption passphrase");
      const confirm = page.getByPlaceholder("Type it again");
      await expect(tooBig.or(unlock).or(confirm).first()).toBeVisible({ timeout: 20_000 });
      if (await unlock.isVisible()) {
        await unlock.fill(PASSPHRASE);
        await page.getByRole("button", { name: "Unlock", exact: true }).click();
        await expect(tooBig.or(confirm).first()).toBeVisible({ timeout: 20_000 });
      }
      if (await confirm.isVisible()) {
        await confirm.fill(PASSPHRASE);
        await page.getByRole("checkbox", { name: /I understand my passphrase/ }).click();
        await page.getByRole("button", { name: "I understand, continue" }).click();
      }
      await expect(tooBig).toBeVisible({ timeout: 20_000 });

      const q = await quota(page.request, token);
      expect(q.relay_day_used_bytes).toBe(0);
      expect(q.relay_reserved_bytes).toBe(0);
    });
  });
});
