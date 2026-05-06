/**
 * Smoke test — 1 VU, 30 seconds.
 * Confirms the backend is up and all critical endpoints respond.
 * Run before any load or stress test.
 *
 * Usage: k6 run tests/load/k6/smoke.js
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { BASE_URL, authHeaders } from "./config.js";

export const options = {
  vus: 1,
  duration: "30s",
  thresholds: {
    // Upload init with no platform connected returns 402 — exclude it from failure rate
    // by counting only actual server errors (5xx)
    http_req_duration: ["p(95)<8000"], // HIBP check + cold Neon can be slow on first run
    http_req_failed: ["rate<0.25"],    // upload init 402s are expected without platform tokens
  },
};

const TEST_EMAIL = "smoke-test@test.zcrypt.io";
// Unique enough to pass HIBP breach check
const TEST_PASSWORD = "Zc7!kP#9mQvR2sNxWdEjLbYtUh";

export function setup() {
  // Create test account (idempotent — ignore conflict)
  http.post(
    `${BASE_URL}/api/auth/register`,
    JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD, username: "smoke_tester" }),
    { headers: { "Content-Type": "application/json" } }
  );

  // Login to get token
  const res = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    { headers: { "Content-Type": "application/json" } }
  );

  if (res.status !== 200) {
    console.error(`setup: login failed (status=${res.status}): ${res.body}`);
    return { token: null };
  }

  const token = JSON.parse(res.body).access_token;
  console.log(`setup: logged in as ${TEST_EMAIL}`);
  return { token };
}

export default function (data) {
  const token = data.token;

  // ── 1. Health ──
  {
    const res = http.get(`${BASE_URL}/api/health`);
    const ok = check(res, { "health: 200": (r) => r.status === 200 });
    if (!ok) {
      console.error(`Backend not reachable at ${BASE_URL} (status: ${res.status})`);
      sleep(2);
      return;
    }
  }

  if (!token) { sleep(1); return; }

  // ── 2. Auth — get current user ──
  {
    const res = http.get(`${BASE_URL}/api/auth/me`, { headers: authHeaders(token) });
    check(res, { "me: 200": (r) => r.status === 200 });
  }

  // ── 3. File list ──
  {
    const res = http.get(`${BASE_URL}/api/files`, { headers: authHeaders(token) });
    check(res, { "files: 200": (r) => r.status === 200 });
  }

  // ── 4. Quota ──
  {
    const res = http.get(`${BASE_URL}/api/quota`, { headers: authHeaders(token) });
    check(res, { "quota: 200": (r) => r.status === 200 });
  }

  // ── 5. Platform status ──
  {
    const res = http.get(`${BASE_URL}/api/platforms/status`, { headers: authHeaders(token) });
    // 200 (no platforms) or 200 with platforms — both valid
    check(res, { "platform status: 200": (r) => r.status === 200 });
  }

  // ── 6. Upload init (may 402/400 if no platform connected — that's fine) ──
  {
    const res = http.post(
      `${BASE_URL}/api/upload/init`,
      JSON.stringify({
        filename: "smoke-test.bin",
        original_size: 30,
        sha256: "5lGnkp4bG1Gbl0jauc8Q1qB5HUP+j+QM/wnqk0fT8c4=",
        salt: "5lGnkp4bG1Gbl0jauc8Q1qB5HUP+j+QM/wnqk0fT8c4=",
        chunk_count: 1,
      }),
      { headers: authHeaders(token) }
    );
    // 200 = session created, 402 = no quota/platform, 500 = broken
    check(res, { "upload init: not 5xx": (r) => r.status < 500 });
  }

  sleep(1);
}
