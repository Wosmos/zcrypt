import { test, expect, request, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { execFileSync } from "child_process";
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
const DB_URL = process.env.E2E_DATABASE_URL || "postgres://zcrypt:testpassword@127.0.0.1:5434/zcrypt_test";
const PSQL = process.env.E2E_PSQL || "/Applications/Postgres.app/Contents/Versions/latest/bin/psql";

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

function promoteToAdmin(adminEmail: string): boolean {
  try {
    execFileSync(PSQL, [DB_URL, "-qc", `UPDATE users SET role='admin' WHERE email='${adminEmail}'`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function skipTourIfShown(p: Page) {
  const skip = p.getByRole("button", { name: "Skip tour" });
  try {
    await skip.waitFor({ state: "visible", timeout: 1_500 });
    await skip.click();
    await skip.waitFor({ state: "hidden" });
  } catch {
    return;
  }
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

async function adminPage(browser: Browser): Promise<Page | null> {
  const adminEmail = testEmail("smoke-admin");
  const ctx = await freshContext(browser);
  const p = await ctx.newPage();
  await registerUser(p, adminEmail, PASSWORD);
  if (!promoteToAdmin(adminEmail)) {
    await ctx.close();
    return null;
  }
  await loginUser(p, adminEmail, PASSWORD);
  return p;
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

    const context = await browser.newContext({ acceptDownloads: true });
    await context.addInitScript(() => localStorage.setItem("zcrypt-remember-device", "1"));
    page = await context.newPage();
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

  test("vault tour appears once, can be skipped and does not come back", async () => {
    await page.evaluate(() => {
      Object.keys(localStorage)
        .filter((k) => k.startsWith("zcrypt-tours:"))
        .forEach((k) => localStorage.removeItem(k));
    });
    await page.goto("/dashboard");
    const skip = page.getByRole("button", { name: "Skip tour" });
    await expect(skip).toBeVisible({ timeout: 15_000 });
    await skip.click();
    await expect(skip).toBeHidden();

    await page.reload();
    await expect(page.getByText("No files yet").or(page.getByText(single.name, { exact: true }).first())).toBeVisible({
      timeout: 15_000,
    });
    await page.waitForTimeout(2_500);
    await expect(skip).toHaveCount(0);
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
    await skipTourIfShown(page);
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

  test("bug report reaches the admin inbox", async ({ browser }) => {
    const description = `smoke bug ${Date.now()}: the widget misbehaves`;
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("button", { name: "Report a bug" }).click();
    await page.getByLabel("Bug description").fill(description);
    await page.getByRole("button", { name: "Send report" }).click();
    await expect(page.getByText("Bug report sent. Thank you.").first()).toBeVisible({ timeout: 10_000 });

    const admin = await adminPage(browser);
    if (!admin) test.skip(true, "cannot promote an admin (psql unavailable)");
    try {
      await admin!.goto("/admin/reports");
      await expect(admin!.getByText(description).first()).toBeVisible({ timeout: 15_000 });
    } finally {
      await admin!.context().close();
    }
  });

  test("review is moderated and then served publicly", async ({ browser }) => {
    const quote = `smoke review ${Date.now()}: honest and quick`;
    const api = await request.newContext();
    const before = await (await api.get(`${API_URL}/api/reviews/public`)).json();
    expect(JSON.stringify(before)).not.toContain(quote);

    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("button", { name: "Rate zcrypt" }).click();
    await page.getByRole("radio", { name: "5 stars" }).click();
    await page.getByLabel("Your review").fill(quote);
    await page.getByLabel("Display name").fill("Smoke Tester");
    await page.getByText("OK to show on the website").click();
    await page.getByRole("button", { name: "Send review" }).click();
    await expect(page.getByText(/Thanks\. It will show on the site/).first()).toBeVisible({ timeout: 10_000 });

    const pending = await (await api.get(`${API_URL}/api/reviews/public`)).json();
    expect(JSON.stringify(pending)).not.toContain(quote);

    const admin = await adminPage(browser);
    if (!admin) test.skip(true, "cannot promote an admin (psql unavailable)");
    try {
      await admin!.goto("/admin/reviews");
      const row = admin!.getByRole("listitem").filter({ hasText: quote });
      await expect(row).toBeVisible({ timeout: 15_000 });
      await row.getByRole("button", { name: "Approve" }).click();
      await expect(admin!.getByRole("listitem").filter({ hasText: quote })).toHaveCount(0, { timeout: 10_000 });
    } finally {
      await admin!.context().close();
    }

    await expect
      .poll(async () => JSON.stringify(await (await api.get(`${API_URL}/api/reviews/public`)).json()), { timeout: 10_000 })
      .toContain(quote);
    await api.dispose();
  });

  test("language switch to Arabic flips direction and translates the nav", async ({ browser }) => {
    const ctx = await freshContext(browser);
    try {
      const guest = await ctx.newPage();
      await guest.goto("/");
      await expect(guest.locator("html")).not.toHaveAttribute("dir", "rtl");
      await expect(guest.getByRole("link", { name: "Log in" }).first()).toBeVisible();
      await guest.getByLabel("Language").selectOption("ar");
      await expect(guest.locator("html")).toHaveAttribute("dir", "rtl");
      await expect(guest.locator("html")).toHaveAttribute("lang", "ar");
      await expect(guest.getByRole("link", { name: "تسجيل الدخول" }).first()).toBeVisible();
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
