/**
 * Upload pipeline load test.
 * Simulates concurrent users running the full upload flow:
 *   init → PUT chunk(s) with raw binary + X-Chunk-SHA256 header → complete
 *
 * Usage: k6 run tests/load/k6/upload.js
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate, Counter } from "k6/metrics";
import crypto from "k6/crypto";
import { BASE_URL, authHeaders } from "./config.js";

const uploadInitDuration = new Trend("upload_init_duration", true);
const chunkUploadDuration = new Trend("chunk_upload_duration", true);
const uploadCompleteDuration = new Trend("upload_complete_duration", true);
const uploadFailures = new Rate("upload_failures");
const quotaExceeded = new Counter("quota_exceeded");

export const options = {
  scenarios: {
    small_files: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 10 },
        { duration: "2m", target: 25 },
        { duration: "30s", target: 0 },
      ],
      exec: "uploadSmallFile",
    },
    medium_files: {
      executor: "constant-vus",
      vus: 5,
      duration: "3m",
      exec: "uploadMediumFile",
      startTime: "30s",
    },
  },
  thresholds: {
    upload_init_duration: ["p(95)<200", "p(99)<500"],
    chunk_upload_duration: ["p(95)<1000", "p(99)<2000"],
    upload_complete_duration: ["p(95)<300", "p(99)<600"],
    upload_failures: ["rate<0.05"],
    http_req_failed: ["rate<0.05"],
  },
};

const TEST_EMAIL = "loadtest-upload2@test.zcrypt.io";
const TEST_PASSWORD = "Zc7!kP#9mQvR2sNxWdEjLbYtUh";

// Encode a string as UTF-8 bytes (Uint8Array)
function strToBytes(s) {
  const arr = [];
  for (let i = 0; i < s.length; i++) arr.push(s.charCodeAt(i) & 0xff);
  return new Uint8Array(arr).buffer;
}

export function setup() {
  // Register (ignore conflict — server returns 200 but no token, so we always login after)
  http.post(
    `${BASE_URL}/api/auth/register`,
    JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD, username: "loadtest_upload" }),
    { headers: { "Content-Type": "application/json" } }
  );

  const res = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    { headers: { "Content-Type": "application/json" } }
  );
  if (res.status !== 200) {
    console.error(`setup: login failed (${res.status}): ${res.body}`);
    return { token: null };
  }
  return { token: JSON.parse(res.body).access_token };
}

// Upload a single chunk using the correct API:
//   PUT /api/upload/{sid}/chunk/{idx}
//   Body: raw binary (ArrayBuffer)
//   Headers: X-Chunk-SHA256: <hex-sha256-of-body>
function uploadChunk(token, sessionId, chunkIndex, data) {
  const sha256 = crypto.sha256(data, "hex");
  const start = Date.now();
  const res = http.put(
    `${BASE_URL}/api/upload/${sessionId}/chunk/${chunkIndex}`,
    data,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Chunk-SHA256": sha256,
        "Content-Type": "application/octet-stream",
        "X-Forwarded-For": `10.${__VU % 256}.${Math.floor(__VU / 256) % 256}.1`,
      },
    }
  );
  chunkUploadDuration.add(Date.now() - start);
  return res;
}

export function uploadSmallFile(data) {
  const token = data.token;
  if (!token) return;

  // 28 bytes minimum (12B IV + 16B tag), fake encrypted payload
  const chunkBody = strToBytes("IIIIIIIIIIIIAUTHTAGAUTHTAGAUTH");
  const sha256 = crypto.sha256(chunkBody, "hex");
  const fileName = `small-${Date.now()}-${Math.random().toString(36).slice(7)}.bin`;

  let sessionId;
  {
    const start = Date.now();
    const res = http.post(
      `${BASE_URL}/api/upload/init`,
      JSON.stringify({
        filename: fileName,
        original_size: 30,
        sha256,
        salt: "5lGnkp4bG1Gbl0jauc8Q1qB5HUP+j+QM/wnqk0fT8c4=", // 32 bytes b64
        chunk_count: 1,
      }),
      { headers: authHeaders(token) }
    );
    uploadInitDuration.add(Date.now() - start);

    if (res.status === 402) { quotaExceeded.add(1); return; }
    check(res, { "init: 200": (r) => r.status === 200 });
    if (res.status !== 200) { uploadFailures.add(1); return; }

    sessionId = JSON.parse(res.body).session_id;
  }

  {
    const res = uploadChunk(token, sessionId, 0, chunkBody);
    check(res, { "chunk: 200": (r) => r.status === 200 });
    if (res.status !== 200) { uploadFailures.add(1); return; }
  }

  {
    const start = Date.now();
    const res = http.post(
      `${BASE_URL}/api/upload/${sessionId}/complete`,
      "{}",
      { headers: authHeaders(token) }
    );
    uploadCompleteDuration.add(Date.now() - start);
    check(res, { "complete: 200": (r) => r.status === 200 });
    uploadFailures.add(res.status !== 200);
  }

  sleep(Math.random() * 2 + 0.5);
}

export function uploadMediumFile(data) {
  const token = data.token;
  if (!token) return;

  const CHUNKS = 3;
  // Each chunk: 28-byte fake encrypted payload (12B nonce + 16B tag minimum)
  const chunkBody = strToBytes("IIIIIIIIIIIIAUTHTAGAUTHTAGAUTH");
  const sha256 = crypto.sha256(chunkBody, "hex");
  const fileName = `medium-${Date.now()}.bin`;

  let sessionId;
  {
    const res = http.post(
      `${BASE_URL}/api/upload/init`,
      JSON.stringify({
        filename: fileName,
        original_size: 30 * CHUNKS,
        sha256,
        salt: "5lGnkp4bG1Gbl0jauc8Q1qB5HUP+j+QM/wnqk0fT8c4=",
        chunk_count: CHUNKS,
      }),
      { headers: authHeaders(token) }
    );

    if (res.status === 402) { quotaExceeded.add(1); return; }
    if (res.status !== 200) { uploadFailures.add(1); return; }
    sessionId = JSON.parse(res.body).session_id;
  }

  for (let i = 0; i < CHUNKS; i++) {
    const res = uploadChunk(token, sessionId, i, chunkBody);
    if (res.status !== 200) { uploadFailures.add(1); return; }
    sleep(0.1);
  }

  const res = http.post(
    `${BASE_URL}/api/upload/${sessionId}/complete`,
    "{}",
    { headers: authHeaders(token) }
  );
  check(res, { "medium complete: 200": (r) => r.status === 200 });
  uploadFailures.add(res.status !== 200);

  sleep(Math.random() * 3 + 1);
}
