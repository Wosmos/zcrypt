import { test, expect } from "@playwright/test";
import { createHash } from "crypto";
import { connectMockStorage, setupAuthenticatedUser } from "./helpers";

// The backend requires the salt to be exactly 32 bytes, base64-encoded.
const VALID_SALT_B64 = Buffer.alloc(32, 7).toString("base64");

test.describe("Upload & Download Pipeline", () => {
  test("API upload init → chunk → complete flow works", async ({ page }) => {
    const { token } = await setupAuthenticatedUser(page);
    await connectMockStorage(page, token);
    const apiUrl = process.env.E2E_API_URL || "http://localhost:8080";

    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    // 1. Init
    const initRes = await page.request.post(`${apiUrl}/api/upload/init`, {
      headers,
      data: {
        filename: "api-e2e-test.txt",
        original_size: 42,
        sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        salt: VALID_SALT_B64,
        chunk_count: 1,
      },
    });
    expect(initRes.ok()).toBeTruthy();
    const { session_id } = await initRes.json();
    expect(session_id).toBeTruthy();

    // 2. Upload chunk
    const chunk = Buffer.from("fake encrypted chunk content for e2e test");
    const chunkRes = await page.request.put(
      `${apiUrl}/api/upload/${session_id}/chunk/0`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/octet-stream",
          "X-Chunk-SHA256": createHash("sha256").update(chunk).digest("hex"),
        },
        data: chunk,
      }
    );
    expect(chunkRes.ok()).toBeTruthy();

    // 3. Complete
    const completeRes = await page.request.post(
      `${apiUrl}/api/upload/${session_id}/complete`,
      { headers, data: {} }
    );
    expect(completeRes.ok()).toBeTruthy();

    // 4. Verify file appears in list. /api/files returns a bare JSON array.
    const listRes = await page.request.get(`${apiUrl}/api/files`, { headers });
    expect(listRes.ok()).toBeTruthy();
    const files = await listRes.json();
    expect(Array.isArray(files)).toBeTruthy();
    expect(files.some((f: { original_name: string }) => f.original_name === "api-e2e-test.txt")).toBeTruthy();
  });

  test("file list returns an array", async ({ page }) => {
    const { token } = await setupAuthenticatedUser(page);
    const apiUrl = process.env.E2E_API_URL || "http://localhost:8080";
    const headers = { Authorization: `Bearer ${token}` };

    // /api/files returns a bare JSON array (filtering via ?filter=, no offset pagination).
    const res = await page.request.get(`${apiUrl}/api/files`, { headers });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body)).toBeTruthy();
  });

  test("IDOR: user cannot access another user's file", async ({ page }) => {
    const apiUrl = process.env.E2E_API_URL || "http://localhost:8080";

    const { token: tokenA } = await setupAuthenticatedUser(page);
    const { token: tokenB } = await setupAuthenticatedUser(page);
    await connectMockStorage(page, tokenA);

    // User A creates a file
    const initRes = await page.request.post(`${apiUrl}/api/upload/init`, {
      headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
      data: {
        filename: "secret.txt",
        original_size: 10,
        sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        salt: VALID_SALT_B64,
        chunk_count: 1,
      },
    });
    expect(initRes.ok(), `init failed: ${initRes.status()}`).toBeTruthy();
    const { file_id } = await initRes.json();
    expect(file_id).toBeTruthy();

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
    expect(typeof body.quota_bytes).toBe("number");
  });
});
