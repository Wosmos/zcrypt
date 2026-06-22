import { Page, expect } from "@playwright/test";

const API_URL = process.env.E2E_API_URL || "http://localhost:8080";

// Generate a unique test email for each test run
export function testEmail(tag = "e2e"): string {
  return `${tag}-${Date.now()}-${Math.random().toString(36).substring(7)}@test.zcrypt.io`;
}

// Generate a unique, valid username (3-32 chars, [a-zA-Z0-9_]) for each test run
export function testUsername(tag = "e2euser"): string {
  return `${tag}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`.substring(0, 32);
}

// Register a user via the UI. The register form requires a matching
// confirm-password before the submit button is enabled.
export async function registerUser(
  page: Page,
  email: string,
  password = "E2ETest@2024!"
): Promise<void> {
  await page.goto("/register");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="username"]', testUsername());
  await page.fill('input[name="password"]', password);
  await page.fill('input[name="confirmPassword"]', password);
  await page.click('button[type="submit"]');
  // After register the app either auto-logs in (no SMTP configured -> dashboard),
  // shows the verify-email screen, or bounces to login.
  await page.waitForURL(/\/(dashboard|verify-email|login)/, { timeout: 10_000 });
  // Leave a clean guest session. When SMTP is not configured the app auto-logs
  // in after registering; clearing the tokens lets callers drive login explicitly
  // (otherwise GuestGuard would redirect them away from /login).
  await page.evaluate(() => {
    localStorage.removeItem("zcrypt-access-token");
    localStorage.removeItem("zcrypt-refresh-token");
  });
}

// Log in via the UI
export async function loginUser(
  page: Page,
  email: string,
  password = "E2ETest@2024!"
): Promise<void> {
  await page.goto("/login");
  await page.fill('input[name="email"], input[type="email"]', email);
  await page.fill('input[name="password"], input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 10_000 });
}

// Log in via API (faster than UI — use for test setup)
export async function loginViaAPI(
  page: Page,
  email: string,
  password = "E2ETest@2024!"
): Promise<string> {
  const response = await page.request.post(`${API_URL}/api/auth/login`, {
    data: { email, password },
  });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  return body.access_token;
}

// Register + login via API — fastest setup path for E2E tests.
// NOTE: /api/auth/register does NOT return tokens (the real frontend logs in
// after registering), so we must call /api/auth/login to obtain them.
export async function setupAuthenticatedUser(page: Page): Promise<{
  email: string;
  password: string;
  token: string;
  refreshToken: string;
}> {
  const email = testEmail();
  const password = "E2ETest@2024!";

  // Register via API (auto-verified when SMTP is not configured, as in CI)
  const regResp = await page.request.post(`${API_URL}/api/auth/register`, {
    data: { email, password, username: testUsername() },
  });
  expect(regResp.ok(), `register failed: ${regResp.status()} ${await regResp.text()}`).toBeTruthy();

  // Log in to obtain access + refresh tokens
  const loginResp = await page.request.post(`${API_URL}/api/auth/login`, {
    data: { email, password },
  });
  expect(loginResp.ok(), `login failed: ${loginResp.status()} ${await loginResp.text()}`).toBeTruthy();
  const { access_token, refresh_token } = await loginResp.json();
  expect(access_token).toBeTruthy();

  // Inject tokens into localStorage so the frontend picks them up on next load
  await page.goto("/");
  await page.evaluate(
    ([access, refresh]) => {
      localStorage.setItem("zcrypt-access-token", access);
      localStorage.setItem("zcrypt-refresh-token", refresh);
    },
    [access_token, refresh_token]
  );

  return { email, password, token: access_token, refreshToken: refresh_token };
}

// Whether the backend has a usable storage platform configured for this user.
// The upload pipeline requires a git-platform adapter (GitHub/GitLab/etc.); a
// plain CI backend has none, so upload-dependent tests should skip rather than fail.
export async function storageAvailable(page: Page, token: string): Promise<boolean> {
  const res = await page.request.get(`${API_URL}/api/quota`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) return false;
  const body = await res.json();
  return body.can_upload === true;
}

// Wait for toast notification to appear
export async function waitForToast(page: Page, text: string | RegExp): Promise<void> {
  await expect(page.locator('[role="alert"], [data-toast]').filter({ hasText: text })).toBeVisible({
    timeout: 5_000,
  });
}

// Upload a test file via drag-and-drop or file input
export async function uploadFile(
  page: Page,
  fileName: string,
  content: string,
  passphrase: string
): Promise<void> {
  // Create a test file buffer
  const fileBuffer = Buffer.from(content);

  // Find file input
  const fileInput = page.locator('input[type="file"]').first();
  if (await fileInput.isVisible()) {
    await fileInput.setInputFiles({
      name: fileName,
      mimeType: "text/plain",
      buffer: fileBuffer,
    });
  }

  // Enter passphrase if prompted
  const passphraseInput = page.locator('input[placeholder*="passphrase" i], input[name="passphrase"]');
  if (await passphraseInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await passphraseInput.fill(passphrase);
    await page.click('button:has-text("Encrypt"), button[type="submit"]');
  }

  // Wait for upload to complete
  await expect(
    page.locator('[data-testid="upload-complete"], [class*="success"]').filter({ hasText: fileName })
  ).toBeVisible({ timeout: 30_000 });
}
