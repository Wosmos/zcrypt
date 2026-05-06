// Shared configuration for all k6 load test scripts
// Usage: import { BASE_URL, thresholds, headers } from './config.js'

export const BASE_URL = __ENV.K6_BASE_URL || "http://localhost:8080";

// Default thresholds — import and merge in individual scripts
export const defaultThresholds = {
  http_req_duration: ["p(95)<500", "p(99)<1000"],
  http_req_failed: ["rate<0.01"],
};

export const strictThresholds = {
  http_req_duration: ["p(95)<200", "p(99)<400"],
  http_req_failed: ["rate<0.005"],
};

export const uploadThresholds = {
  http_req_duration: ["p(95)<2000", "p(99)<5000"],
  http_req_failed: ["rate<0.02"],
};

// Create auth headers from token
// Spoofs a unique X-Forwarded-For IP per VU so rate limiting doesn't block all VUs from localhost.
// This simulates real production where users come from different IPs.
export function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "X-Forwarded-For": `10.${__VU % 256}.${Math.floor(__VU / 256) % 256}.1`,
  };
}

export function publicHeaders() {
  return {
    "Content-Type": "application/json",
    "X-Forwarded-For": `10.${__VU % 256}.${Math.floor(__VU / 256) % 256}.1`,
  };
}

// Register a test user and return their access token
export function registerUser(http, email, password) {
  const res = http.post(
    `${BASE_URL}/api/auth/register`,
    JSON.stringify({
      email,
      password,
      username: email.split("@")[0],
    }),
    { headers: { "Content-Type": "application/json" } }
  );
  if (res.status !== 201 && res.status !== 200) {
    return null;
  }
  const body = JSON.parse(res.body);
  return body.access_token || null;
}

// Login and return access token
export function login(http, email, password) {
  const res = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email, password }),
    { headers: { "Content-Type": "application/json" } }
  );
  if (res.status !== 200) return null;
  const body = JSON.parse(res.body);
  return body.access_token || null;
}

// Generate a random email for test isolation
export function randomEmail() {
  return `k6-${Math.random().toString(36).substring(2, 10)}@test.zcrypt.io`;
}

// Generate random bytes of given size
export function randomBytes(size) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < size; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
