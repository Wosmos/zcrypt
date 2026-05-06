/**
 * Soak test — moderate load, very long duration (30 min default).
 * Detects memory leaks, goroutine leaks, connection pool exhaustion,
 * and database connection rot over time.
 *
 * Watch for:
 *   - Railway memory growing linearly (goroutine/memory leak)
 *   - Neon connections not being returned (pool exhaustion)
 *   - Error rate increasing over time (not constant)
 *   - Latency percentiles drifting upward
 *
 * Usage: k6 run tests/load/k6/soak.js
 * Duration override: k6 run --duration=1h tests/load/k6/soak.js
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { BASE_URL } from "./config.js";

export const options = {
  vus: 20,
  duration: __ENV.SOAK_DURATION || "30m",
  thresholds: {
    http_req_duration: ["p(95)<600"],
    http_req_failed: ["rate<0.01"],
  },
};

const TEST_EMAIL = "loadtest-soak2@test.zcrypt.io";
const TEST_PASSWORD = "Zc7!kP#9mQvR2sNxWdEjLbYtUh";

export function setup() {
  http.post(
    `${BASE_URL}/api/auth/register`,
    JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD, username: "soak_tester" }),
    { headers: { "Content-Type": "application/json" } }
  );
  const res = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    { headers: { "Content-Type": "application/json" } }
  );
  return { token: JSON.parse(res.body).access_token };
}

export default function (data) {
  let token = data.token;

  // Every iteration: file list + upload init + quota
  // This simulates a real user session

  const listRes = http.get(`${BASE_URL}/api/files`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  check(listRes, { "list: 200": (r) => r.status === 200 });

  const quotaRes = http.get(`${BASE_URL}/api/quota`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  check(quotaRes, { "quota: 200": (r) => r.status === 200 });

  // Refresh token periodically to prevent expiry
  if (Math.random() < 0.1) {
    const loginRes = http.post(
      `${BASE_URL}/api/auth/login`,
      JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
      { headers: { "Content-Type": "application/json" } }
    );
    if (loginRes.status === 200) {
      data.token = JSON.parse(loginRes.body).access_token;
    }
  }

  sleep(Math.random() * 3 + 1);
}
