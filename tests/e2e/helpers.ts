import { Page, expect } from "@playwright/test";

const API_URL = process.env.E2E_API_URL || "http://localhost:8080";

// Generate a unique test email for each test run
export function testEmail(tag = "e2e"): string {
  return `${tag}-${Date.now()}-${Math.random().toString(36).substring(7)}@test.zcrypt.io`;
}

// Register a user and return their credentials
export async function registerUser(
  page: Page,
  email: string,
  password = "E2ETest@2024!"
): Promise<void> {
  await page.goto("/register");
  await page.fill('input[name="email"], input[type="email"]', email);
  await page.fill('input[name="password"], input[type="password"]', password);
  await page.fill('input[name="username"]', email.split("@")[0].replace(/[^a-z0-9_]/gi, "_").substring(0, 20));
  await page.click('button[type="submit"]');
  // Wait for redirect to dashboard or email verification page
  await page.waitForURL(/\/(dashboard|verify-email|login)/, { timeout: 10_000 });
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

// Register + login via API — fastest setup path for E2E tests
export async function setupAuthenticatedUser(page: Page): Promise<{
  email: string;
  password: string;
  token: string;
}> {
  const email = testEmail();
  const password = "E2ETest@2024!";

  // Register via API
  const regResp = await page.request.post(`${API_URL}/api/auth/register`, {
    data: {
      email,
      password,
      username: `e2euser_${Date.now().toString(36)}`,
    },
  });
  expect(regResp.ok()).toBeTruthy();
  const { access_token } = await regResp.json();

  // Inject token into localStorage so the frontend picks it up
  await page.goto("/");
  await page.evaluate(
    ([token]) => {
      localStorage.setItem("zcrypt-access-token", token);
    },
    [access_token]
  );

  return { email, password, token: access_token };
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
