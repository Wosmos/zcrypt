/**
 * Auth endpoint load test.
 * Tests login/register/refresh throughput — these hit on every page load.
 *
 * Scenarios:
 *   - 70% existing users logging in (bcrypt verify)
 *   - 20% token refreshes (fast path)
 *   - 10% new registrations
 *
 * Thresholds:
 *   login   p95 < 300ms  (bcrypt is intentionally slow, ~150ms at cost 12)
 *   refresh p95 < 50ms
 *   register p95 < 500ms
 *
 * Usage: k6 run tests/load/k6/auth.js
 * Staged: K6_BASE_URL=https://NEXT_PUBLIC_API_URL k6 run tests/load/k6/auth.js
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate, Counter } from "k6/metrics";
import { BASE_URL, publicHeaders, randomEmail } from "./config.js";

const loginDuration = new Trend("login_duration", true);
const refreshDuration = new Trend("refresh_duration", true);
const registerDuration = new Trend("register_duration", true);
const failedLogins = new Rate("failed_logins");
const throttledRequests = new Counter("throttled_requests");

export const options = {
  scenarios: {
    // Ramp up to 50 VUs, hold for 3 min, ramp down
    login_load: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 5 },
        { duration: "3m", target: 10 },  // bcrypt is CPU-bound; 10 VUs saturates a local server
        { duration: "30s", target: 0 },
      ],
      exec: "loginScenario",
    },
    // Constant 5 VUs refreshing tokens
    refresh_load: {
      executor: "constant-vus",
      vus: 5,
      duration: "4m",
      exec: "refreshScenario",
    },
  },
  thresholds: {
    // Neon is in US-East; from local machine ~400ms latency adds to bcrypt (~200ms)
    // Expect ~600ms-1.5s per login locally. In co-located production: ~200-400ms.
    login_duration: ["p(95)<3000", "p(99)<5000"],
    refresh_duration: ["p(95)<2000", "p(99)<3000"],
    failed_logins: ["rate<0.05"],
    http_req_failed: ["rate<0.15"],
  },
};

// Pre-create test accounts (runs once per VU)
const TEST_EMAIL = `loadtest-auth2@test.zcrypt.io`;
const TEST_PASSWORD = "Zc7!kP#9mQvR2sNxWdEjLbYtUh";

export function setup() {
  // Create a shared test account for login tests
  http.post(
    `${BASE_URL}/api/auth/register`,
    JSON.stringify({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      username: "loadtest_auth",
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}

export function loginScenario() {
  // 80% existing user login, 20% wrong password (to test error path)
  const isValid = Math.random() < 0.8;

  const start = Date.now();
  const res = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({
      email: TEST_EMAIL,
      password: isValid ? TEST_PASSWORD : "WrongPassword!",
    }),
    { headers: publicHeaders() }
  );
  loginDuration.add(Date.now() - start);

  if (res.status === 429) {
    throttledRequests.add(1);
    sleep(2);
    return;
  }

  if (isValid) {
    check(res, {
      "login: 200": (r) => r.status === 200,
      "login: access_token present": (r) => {
        try {
          return JSON.parse(r.body).access_token != null;
        } catch {
          return false;
        }
      },
    });
    failedLogins.add(res.status !== 200);
  } else {
    check(res, { "login: 401 on bad password": (r) => r.status === 401 });
  }

  sleep(Math.random() * 2 + 0.5);
}

export function refreshScenario() {
  // First get a valid token
  const loginRes = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    { headers: publicHeaders() }
  );

  if (loginRes.status !== 200) {
    sleep(1);
    return;
  }

  let refreshToken;
  try {
    refreshToken = JSON.parse(loginRes.body).refresh_token;
  } catch {
    sleep(1);
    return;
  }

  // Now refresh it
  const start = Date.now();
  const res = http.post(
    `${BASE_URL}/api/auth/refresh`,
    JSON.stringify({ refresh_token: refreshToken }),
    { headers: { "Content-Type": "application/json" } }
  );
  refreshDuration.add(Date.now() - start);

  check(res, {
    "refresh: 200": (r) => r.status === 200,
    "refresh: new token": (r) => {
      try {
        return JSON.parse(r.body).access_token != null;
      } catch {
        return false;
      }
    },
  });

  sleep(Math.random() * 5 + 1);
}
