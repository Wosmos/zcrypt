import { test, expect, request, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { createHash, randomBytes } from "crypto";
import fs from "fs";
import { loginUser, registerUser, testEmail } from "./helpers";

// End-to-end smoke of the core product on the isolated stack. Storage is an
// in-memory mock platform that the backend exposes only in an integration-tagged
// build running with DEV_MODE=true (POST /api/dev/mock-storage). Against any other
// backend the whole suite skips.

const API_URL = process.env.E2E_API_URL || "http://localhost:8080";
const PASSWORD = process.env.E2E_PASSWORD || `Sm0ke-${randomBytes(9).toString("hex")}!`;
const PASSPHRASE = "smoke-passphrase-2026";
const TTFR_BUDGET_MS = 15_000;

const sha256 = (b: Buffer | Uint8Array) => createHash("sha256").update(b).digest("hex");

interface SmokeFile {
  name: string;
  bytes: Buffer;
}

const single: SmokeFile = { name: "smoke-report.bin", bytes: randomBytes(96 * 1024) };
const folderName = "Smoke Folder";
const folderFiles: SmokeFile[] = [
  { name: "alpha-notes.bin", bytes: randomBytes(24 * 1024) },
  { name: "beta-data.bin", bytes: randomBytes(40 * 1024) },
];

// Entry names from a zip's central directory (enough to check names without a dependency).
function zipEntryNames(zip: Buffer): string[] {
  let eocd = -1;
  for (let i = zip.length - 22; i >= 0; i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip: no end-of-central-directory record");
  const count = zip.readUInt16LE(eocd + 10);
  let off = zip.readUInt32LE(eocd + 16);
  const names: string[] = [];
  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(off) !== 0x02014b50) throw new Error("bad central directory entry");
    const nameLen = zip.readUInt16LE(off + 28);
    const extraLen = zip.readUInt16LE(off + 30);
    const commentLen = zip.readUInt16LE(off + 32);
    names.push(zip.subarray(off + 46, off + 46 + nameLen).toString("utf8"));
    off += 46 + nameLen + extraLen + commentLen;
  }
  return names;
}

async function downloadBytes(p: Page, trigger: () => Promise<void>) {
  const [dl] = await Promise.all([p.waitForEvent("download"), trigger()]);
  const path = await dl.path();
  return { name: dl.suggestedFilename(), bytes: fs.readFileSync(path) };
}

async function freshContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({ acceptDownloads: true });
}

// Upload through the real UI. The first upload also unlocks the vault and
// confirms the one-time passphrase warning.
async function uploadViaUI(page: Page, files: SmokeFile[]) {
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles(files.map((f) => ({ name: f.name, mimeType: "application/octet-stream", buffer: f.bytes })));

  const unlock = page.getByPlaceholder("Your encryption passphrase");
  if (await unlock.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await unlock.fill(PASSPHRASE);
    await page.getByRole("button", { name: "Unlock", exact: true }).click();
  }
  const confirm = page.getByPlaceholder("Type it again");
  if (await confirm.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await confirm.fill(PASSPHRASE);
    await page.getByRole("checkbox").last().click();
    await page.getByRole("button", { name: "I understand, continue" }).click();
  }

  await expect(page.getByText("Transfers complete")).toBeVisible({ timeout: 30_000 });
  const clear = page.getByRole("button", { name: "Clear completed" });
  if (await clear.isVisible().catch(() => false)) await clear.click();
  for (const f of files) {
    await expect(page.getByText(f.name, { exact: true }).first()).toBeVisible();
  }
}

test.describe.configure({ mode: "serial" });

test.describe("Smoke: vault, sharing, tools, session", () => {
  let page: Page;
  let email: string;

  test.beforeAll(async ({ browser }) => {
    const probe = await request.newContext();
    const res = await probe.post(`${API_URL}/api/dev/mock-storage`);
    await probe.dispose();
    // 401 means the route exists (auth required); 404/405 means a build without it.
    test.skip(res.status() !== 401, "backend has no mock storage (needs -tags=integration and DEV_MODE=true)");

    page = await (await browser.newContext({ acceptDownloads: true })).newPage();
    email = testEmail("smoke");
  });

  test.afterAll(async () => {
    await page?.context().close();
  });

  test("register, skip onboarding, empty vault loads", async () => {
    await registerUser(page, email, PASSWORD);

    const api = await request.newContext();
    const login = await api.post(`${API_URL}/api/auth/login`, { data: { email, password: PASSWORD } });
    expect(login.ok()).toBeTruthy();
    const { access_token } = await login.json();
    const auth = { headers: { Authorization: `Bearer ${access_token}` } };
    expect((await api.post(`${API_URL}/api/dev/mock-storage`, auth)).ok()).toBeTruthy();
    expect((await api.post(`${API_URL}/api/dev/mock-global-storage`, auth)).ok()).toBeTruthy();
    await api.dispose();

    await loginUser(page, email, PASSWORD);
    await expect(page.getByText("No files yet")).toBeVisible({ timeout: 15_000 });
  });

  test("upload a small file and it appears", async () => {
    await uploadViaUI(page, [single]);
  });

  test("vault time-to-first-row on reload", async () => {
    const started = Date.now();
    await page.goto("/dashboard");
    await expect(page.getByText(single.name, { exact: true }).first()).toBeVisible({ timeout: TTFR_BUDGET_MS });
    const ttfr = Date.now() - started;
    test.info().annotations.push({ type: "ttfr_ms", description: String(ttfr) });
    expect(ttfr).toBeLessThan(TTFR_BUDGET_MS);
  });

  test("file share: fresh browser downloads the original name and bytes", async ({ browser }) => {
    await page.getByText(single.name, { exact: true }).first().click({ button: "right" });
    await page.getByRole("menuitem", { name: "Share" }).click();
    await page.getByRole("button", { name: "Generate Link" }).click();
    const url = await page.locator('input[readonly][value*="/s/"]').inputValue();
    expect(url).toContain("#key=");
    await page.goto("/dashboard");

    const ctx = await freshContext(browser);
    try {
      const guest = await ctx.newPage();
      await guest.goto(url);
      await expect(guest.getByText(single.name, { exact: true })).toBeVisible({ timeout: 15_000 });
      const got = await downloadBytes(guest, () =>
        guest.getByRole("button", { name: /Download/ }).first().click(),
      );
      expect(got.name).toBe(single.name);
      expect(sha256(got.bytes)).toBe(sha256(single.bytes));
    } finally {
      await ctx.close();
    }
  });

  test("folder share: zip entries keep their real names", async ({ browser }) => {
    await page.getByRole("button", { name: "New folder" }).first().click();
    await page.getByPlaceholder("Folder name").fill(folderName);
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await page.getByText(folderName, { exact: true }).first().click();
    await expect(page.getByText(single.name, { exact: true })).toHaveCount(0);
    await uploadViaUI(page, folderFiles);

    await page.goto("/dashboard");
    await page.getByText(folderName, { exact: true }).first().click({ button: "right" });
    await page.getByRole("menuitem", { name: "Share" }).click();
    await expect(page.getByText(`${folderFiles.length} files will be shared`)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Create link" }).click();
    const url = await page.locator('input[readonly][value*="/f/"]').inputValue();
    expect(url).toContain("#");
    await page.goto("/dashboard");

    const ctx = await freshContext(browser);
    try {
      const guest = await ctx.newPage();
      await guest.goto(url);
      for (const f of folderFiles) {
        await expect(guest.getByText(f.name, { exact: true }).first()).toBeVisible({ timeout: 15_000 });
      }
      const got = await downloadBytes(guest, () =>
        guest.getByRole("button", { name: /Download all/ }).click(),
      );
      expect(got.name).toMatch(/\.zip$/);
      const entries = zipEntryNames(got.bytes).map((n) => n.split("/").pop());
      expect(entries.sort()).toEqual(folderFiles.map((f) => f.name).sort());
    } finally {
      await ctx.close();
    }
  });

  test("insights second visit issues no analytics request", async () => {
    // The app holds an SSE stream open, so "networkidle" never settles; wait on
    // the analytics responses themselves instead.
    const firstLoad = page.waitForResponse((r) => r.url().includes("/api/analytics/"));
    await page.getByRole("link", { name: "Insights" }).first().click();
    await page.waitForURL(/\/analytics/);
    await firstLoad;
    await page.waitForTimeout(1_500);

    await page.getByRole("link", { name: "Vault" }).first().click();
    await page.waitForURL(/\/dashboard/);
    await expect(page.getByText(folderName, { exact: true }).first()).toBeVisible();

    const hits: string[] = [];
    const onRequest = (r: { url(): string }) => {
      if (r.url().includes("/api/analytics/")) hits.push(r.url());
    };
    page.on("request", onRequest);
    await page.getByRole("link", { name: "Insights" }).first().click();
    await page.waitForURL(/\/analytics/);
    await page.waitForTimeout(2_500);
    page.off("request", onRequest);
    expect(hits).toEqual([]);
  });

  test("pad round-trip", async ({ browser }) => {
    const secret = `smoke pad ${Date.now()}\nline two`;
    const ctx = await freshContext(browser);
    try {
      const author = await ctx.newPage();
      await author.goto("/pad");
      await author.getByPlaceholder("Type or paste your text here...").fill(secret);
      await author.getByRole("button", { name: /Encrypt & Share/ }).click();
      const link = (await author.getByText(/\/pad\/[^\s]+#/).first().textContent())?.trim() ?? "";
      expect(link).toContain("/pad/");

      const readerCtx = await freshContext(browser);
      try {
        const reader = await readerCtx.newPage();
        await reader.goto(link);
        await reader.getByRole("button", { name: /Decrypt & View/ }).click();
        await expect(reader.locator("pre")).toHaveText(secret);
      } finally {
        await readerCtx.close();
      }
    } finally {
      await ctx.close();
    }
  });

  test("send round-trip", async ({ browser }) => {
    const file: SmokeFile = { name: "smoke-send.bin", bytes: randomBytes(64 * 1024) };
    const ctx = await freshContext(browser);
    try {
      const sender = await ctx.newPage();
      await sender.goto("/send");
      await sender
        .locator('input[type="file"]')
        .first()
        .setInputFiles({ name: file.name, mimeType: "application/octet-stream", buffer: file.bytes });
      await sender.getByRole("button", { name: /Encrypt & Send/ }).click();
      const linkText = sender.getByText(/\/send\/[^\s]+#/).first();
      await expect(linkText.or(sender.getByText("Upload Failed"))).toBeVisible({ timeout: 20_000 });
      expect(await sender.getByText("Upload Failed").isVisible(), await sender.locator("body").innerText()).toBe(false);
      const link = (await linkText.textContent())?.trim() ?? "";
      expect(link).toContain("/send/");

      const recvCtx = await freshContext(browser);
      try {
        const recv = await recvCtx.newPage();
        await recv.goto(link);
        await expect(recv.getByText(file.name, { exact: true }).first()).toBeVisible({ timeout: 15_000 });
        const got = await downloadBytes(recv, () =>
          recv.getByRole("button", { name: /Download/ }).first().click(),
        );
        expect(got.name).toBe(file.name);
        expect(sha256(got.bytes)).toBe(sha256(file.bytes));
      } finally {
        await recvCtx.close();
      }
    } finally {
      await ctx.close();
    }
  });

  test("logout stays logged out", async () => {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login/);

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
    await page.reload();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
  });
});
