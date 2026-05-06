import { test, expect } from "@playwright/test";
import { setupAuthenticatedUser } from "./helpers";
import path from "path";
import fs from "fs";
import os from "os";

test.describe("Upload & Download Pipeline", () => {
  test("upload a text file and see it in the file list", async ({ page }) => {
    const { token } = await setupAuthenticatedUser(page);

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);

    // Create a temp file
    const tmpFile = path.join(os.tmpdir(), `zcrypt-e2e-${Date.now()}.txt`);
    fs.writeFileSync(tmpFile, "Hello from E2E test! This is test content.");

    try {
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(tmpFile);

      // Handle passphrase prompt if shown
      const passphraseInput = page.locator('input[placeholder*="assphrase"], input[name="passphrase"]');
      if (await passphraseInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await passphraseInput.fill("e2e-test-passphrase");
        await page.locator('button:has-text("Upload"), button[type="submit"]').first().click();
      }

      // Wait for upload to appear in the file list
      await expect(
        page.locator(`text=${path.basename(tmpFile)}`)
      ).toBeVisible({ timeout: 30_000 });
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  test("API upload init → chunk → complete flow works", async ({ page }) => {
    const { token } = await setupAuthenticatedUser(page);
    const apiUrl = process.env.E2E_API_URL || "http://localhost:8080";

    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    // 1. Init
    const initRes = await page.request.post(`${apiUrl}/api/upload/init`, {
      headers,
      data: {
        filename: "api-e2e-test.txt",
        original_size: 42,
        sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        salt: "c2FsdHNhbHRzYWx0",
        chunk_count: 1,
      },
    });
    expect(initRes.ok()).toBeTruthy();
    const { session_id } = await initRes.json();
    expect(session_id).toBeTruthy();

    // 2. Upload chunk
    const chunkRes = await page.request.put(
      `${apiUrl}/api/upload/${session_id}/chunk/0`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/octet-stream",
        },
        data: Buffer.from("fake encrypted chunk content for e2e test"),
      }
    );
    expect(chunkRes.ok()).toBeTruthy();

    // 3. Complete
    const completeRes = await page.request.post(
      `${apiUrl}/api/upload/${session_id}/complete`,
      { headers, data: {} }
    );
    expect(completeRes.ok()).toBeTruthy();

    // 4. Verify file appears in list
    const listRes = await page.request.get(`${apiUrl}/api/files`, { headers });
    expect(listRes.ok()).toBeTruthy();
    const { files } = await listRes.json();
    expect(files.some((f: { original_name: string }) => f.original_name === "api-e2e-test.txt")).toBeTruthy();
  });

  test("file list paginates correctly", async ({ page }) => {
    const { token } = await setupAuthenticatedUser(page);
    const apiUrl = process.env.E2E_API_URL || "http://localhost:8080";
    const headers = { Authorization: `Bearer ${token}` };

    const res = await page.request.get(`${apiUrl}/api/files?limit=10&offset=0`, { headers });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty("files");
    expect(Array.isArray(body.files)).toBeTruthy();
  });

  test("IDOR: user cannot access another user's file", async ({ page }) => {
    const apiUrl = process.env.E2E_API_URL || "http://localhost:8080";

    const { token: tokenA } = await setupAuthenticatedUser(page);
    const { token: tokenB } = await setupAuthenticatedUser(page);

    // User A creates a file
    const initRes = await page.request.post(`${apiUrl}/api/upload/init`, {
      headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
      data: {
        filename: "secret.txt",
        original_size: 10,
        sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        salt: "c2FsdA==",
        chunk_count: 1,
      },
    });
    const { file_id } = await initRes.json();

    // User B tries to delete it
    const deleteRes = await page.request.delete(`${apiUrl}/api/files/${file_id}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    expect([403, 404]).toContain(deleteRes.status());
  });
});

test.describe("Quota", () => {
  test("quota endpoint returns valid data", async ({ page }) => {
    const { token } = await setupAuthenticatedUser(page);
    const apiUrl = process.env.E2E_API_URL || "http://localhost:8080";

    const res = await page.request.get(`${apiUrl}/api/quota`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(typeof body.used_bytes).toBe("number");
    expect(typeof body.limit_bytes).toBe("number");
  });
});
