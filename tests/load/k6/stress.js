/**
 * Stress test — ramps VUs to find the breaking point.
 * Run this to find the maximum load your architecture handles
 * before errors exceed 1% or p95 latency exceeds 1s.
 *
 * Stages:
 *   0 → 50 VUs over 2 min    (warm-up)
 *   50 → 100 VUs over 3 min  (normal load)
 *   100 → 200 VUs over 3 min (high load)
 *   200 → 300 VUs over 2 min (stress)
 *   300 → 0 over 2 min       (recovery)
 *
 * Watch for:
 *   - The VU count where error rate first exceeds 1%
 *   - The VU count where p95 latency first exceeds 1s
 *   - Memory growth on the Railway server
 *   - Neon connection pool exhaustion (max 5 connections)
 *
 * Usage: k6 run tests/load/k6/stress.js
 * DO NOT run against production. Use staging only.
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate } from "k6/metrics";
import { BASE_URL, publicHeaders } from "./config.js";

const duration = new Trend("scenario_duration", true);
const errors = new Rate("errors");

export const options = {
  stages: [
    { duration: "2m", target: 50 },
    { duration: "3m", target: 100 },
    { duration: "3m", target: 200 },
    { duration: "2m", target: 300 },
    { duration: "2m", target: 0 },
  ],
  thresholds: {
    // These are intentionally loose — stress test finds the breaking point
    http_req_duration: ["p(99)<5000"],
    errors: ["rate<0.15"],
  },
};

const TEST_EMAIL = "loadtest-stress2@test.zcrypt.io";
const TEST_PASSWORD = "Zc7!kP#9mQvR2sNxWdEjLbYtUh";

export function setup() {
  http.post(
    `${BASE_URL}/api/auth/register`,
    JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD, username: "stress_tester" }),
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
  const token = data.token;

  // Mixed workload — simulate real user behaviour
  const scenario = Math.random();

  if (scenario < 0.3) {
    // 30% — auth
    const start = Date.now();
    const res = http.post(
      `${BASE_URL}/api/auth/login`,
      JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
      { headers: publicHeaders() }
    );
    duration.add(Date.now() - start, { scenario: "auth" });
    errors.add(res.status >= 500);
    check(res, { "auth ok": (r) => r.status < 400 || r.status === 401 });
  } else if (scenario < 0.6) {
    // 30% — file list
    const start = Date.now();
    const res = http.get(`${BASE_URL}/api/files`, {
      headers: { Authorization: `Bearer ${token}`, ...publicHeaders() },
    });
    duration.add(Date.now() - start, { scenario: "list" });
    errors.add(res.status >= 500);
    check(res, { "list ok": (r) => r.status === 200 || r.status === 401 });
  } else if (scenario < 0.85) {
    // 25% — upload init
    const start = Date.now();
    const res = http.post(
      `${BASE_URL}/api/upload/init`,
      JSON.stringify({
        filename: `stress-${Date.now()}.bin`,
        original_size: 1024,
        sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        salt: "5lGnkp4bG1Gbl0jauc8Q1qB5HUP+j+QM/wnqk0fT8c4=",
        chunk_count: 1,
      }),
      { headers: { Authorization: `Bearer ${token}`, ...publicHeaders() } }
    );
    duration.add(Date.now() - start, { scenario: "upload_init" });
    errors.add(res.status >= 500);
    check(res, { "init ok": (r) => r.status < 500 });
  } else {
    // 15% — quota check
    const start = Date.now();
    const res = http.get(`${BASE_URL}/api/quota`, {
      headers: { Authorization: `Bearer ${token}`, ...publicHeaders() },
    });
    duration.add(Date.now() - start, { scenario: "quota" });
    errors.add(res.status >= 500);
  }

  sleep(Math.random() * 0.5);
}
