import { test, expect } from "@playwright/test";
import { testEmail, registerUser, loginUser, setupAuthenticatedUser } from "./helpers";

test.describe("Authentication", () => {
  test("register with valid credentials", async ({ page }) => {
    const email = testEmail("register");
    await page.goto("/register");

    await page.fill('input[type="email"]', email);
    await page.fill('input[name="password"], input[type="password"]', "StrongPass@2024!");
    await page.fill('input[name="username"]', `e2euser_${Date.now().toString(36)}`);
    await page.click('button[type="submit"]');

    // Should redirect away from register
    await expect(page).not.toHaveURL(/\/register/);
  });

  test("login with valid credentials navigates to dashboard", async ({ page }) => {
    const email = testEmail("login");
    await registerUser(page, email);
    await loginUser(page, email);
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("login with wrong password shows error", async ({ page }) => {
    const email = testEmail("badpass");
    await registerUser(page, email);

    await page.goto("/login");
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', "WrongPassword!!!");
    await page.click('button[type="submit"]');

    // Should stay on login, show error
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator('[role="alert"], [class*="error"]').first()).toBeVisible();
  });

  test("logout clears session and redirects to login", async ({ page }) => {
    const email = testEmail("logout");
    await registerUser(page, email);
    await loginUser(page, email);

    // Find and click logout
    const logoutBtn = page.locator('[aria-label*="logout" i], button:has-text("Logout"), button:has-text("Sign out")');
    await logoutBtn.click();

    await expect(page).toHaveURL(/\/login/);

    // Navigating to dashboard should redirect back to login
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("protected route redirects unauthenticated users", async ({ page }) => {
    // Clear any existing auth
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.removeItem("zcrypt-access-token");
      localStorage.removeItem("zcrypt-refresh-token");
    });

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("API returns 401 for requests without token", async ({ request }) => {
    const res = await request.get(`${process.env.E2E_API_URL || "http://localhost:8080"}/api/files`);
    expect(res.status()).toBe(401);
  });

  test("rate limiter blocks excessive login attempts", async ({ page }) => {
    const email = testEmail("ratelimit");
    const apiUrl = process.env.E2E_API_URL || "http://localhost:8080";

    // Fire 10 rapid login requests with wrong password
    const requests = Array.from({ length: 10 }, () =>
      page.request.post(`${apiUrl}/api/auth/login`, {
        data: { email, password: "wrong" },
      })
    );
    const responses = await Promise.all(requests);
    const statuses = responses.map((r) => r.status());

    // At least some should be rate limited (429)
    expect(statuses.some((s) => s === 429)).toBeTruthy();
  });
});

test.describe("Token Management", () => {
  test("refresh token issues new access token", async ({ page }) => {
    const email = testEmail("refresh");
    const apiUrl = process.env.E2E_API_URL || "http://localhost:8080";

    // Register
    const reg = await page.request.post(`${apiUrl}/api/auth/register`, {
      data: { email, password: "StrongPass@2024!", username: `refresh_${Date.now().toString(36)}` },
    });
    const { refresh_token } = await reg.json();

    // Refresh
    const refresh = await page.request.post(`${apiUrl}/api/auth/refresh`, {
      data: { refresh_token },
    });
    expect(refresh.ok()).toBeTruthy();
    const { access_token } = await refresh.json();
    expect(access_token).toBeTruthy();
  });

  test("invalid refresh token returns 401", async ({ page }) => {
    const apiUrl = process.env.E2E_API_URL || "http://localhost:8080";
    const res = await page.request.post(`${apiUrl}/api/auth/refresh`, {
      data: { refresh_token: "definitely-not-a-valid-token" },
    });
    expect(res.status()).toBe(401);
  });
});
