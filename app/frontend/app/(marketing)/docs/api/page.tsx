import type { Metadata } from "next";
import Link from "next/link";
import {
  DocPage,
  DocSection,
  DocP,
  DocList,
  DocCode,
  DocNote,
  DocTable,
} from "@/components/docs/doc-page";

export const metadata: Metadata = {
  title: "API reference | zcrypt Docs",
  description:
    "The zcrypt REST API: base URL, Bearer-JWT authentication, JSON request and response bodies, the chunked upload and download endpoints, sharing, the SSE event stream, and admin routes.",
  alternates: { canonical: "https://zcrypt.cloud/docs/api" },
  openGraph: {
    title: "API reference | zcrypt Docs",
    description:
      "REST endpoints, Bearer-JWT auth, chunked upload/download, sharing, and the SSE event stream for zcrypt.",
    url: "https://zcrypt.cloud/docs/api",
  },
};

const toc = [
  { id: "basics", title: "Basics" },
  { id: "auth", title: "Authentication" },
  { id: "files", title: "Files & folders" },
  { id: "upload", title: "Upload (chunked)" },
  { id: "download", title: "Download (chunked)" },
  { id: "sharing", title: "Sharing" },
  { id: "send-pad", title: "Send & Pad" },
  { id: "events", title: "Events (SSE)" },
  { id: "config", title: "Quota & config" },
  { id: "admin", title: "Admin" },
];

export default function ApiDocPage() {
  return (
    <DocPage
      href="/docs/api"
      title="API reference"
      description="zcrypt exposes a JSON REST API. Encryption happens on the client, so the API only ever moves opaque ciphertext, metadata, and chunks — never plaintext or keys."
      toc={toc}
    >
      <DocSection id="basics" title="Basics">
        <DocList
          items={[
            <>
              <strong>Base URL.</strong> Your backend origin, with every route
              under <code>/api</code>. On a self-hosted instance this is whatever
              you set as <code>BACKEND_URL</code>.
            </>,
            <>
              <strong>Content type.</strong> Request and response bodies are
              JSON, except chunk transfers, which send and receive raw bytes.
              JSON request bodies are capped at 1&nbsp;MB.
            </>,
            <>
              <strong>Errors.</strong> Non-2xx responses return{" "}
              <code>{`{ "error": "message" }`}</code> with a matching HTTP status.
            </>,
            <>
              <strong>Rate limits.</strong> Requests are rate-limited per IP.
              Auth and public (share / send / pad) routes have their own tighter
              limits; the SSE and WebSocket endpoints are exempt.
            </>,
          ]}
        />
        <DocNote type="info" title="Stability">
          This documents the routes the web and terminal apps use today. zcrypt
          is open source and pre-1.0 — treat the surface as evolving, and read{" "}
          <code>app/backend/main.go</code> as the authoritative route table.
        </DocNote>
      </DocSection>

      <DocSection id="auth" title="Authentication">
        <DocP>
          Authenticate by sending a JSON Web Token in the{" "}
          <code>Authorization</code> header. Logging in returns an access token
          (and a refresh token); send the access token on every protected
          request.
        </DocP>
        <DocCode label="Authorization header">{`Authorization: Bearer <access-token>`}</DocCode>
        <DocP>
          When an account has two-factor enabled, <code>login</code> returns a 2FA
          challenge instead of tokens; complete it with{" "}
          <code>POST /api/auth/2fa/verify</code>. Access tokens are short-lived —
          use <code>POST /api/auth/refresh</code> to mint a new one.
        </DocP>
        <DocTable
          head={["Method", "Path", "Purpose"]}
          rows={[
            ["POST", <code key="p">/api/auth/register</code>, "Create an account."],
            ["POST", <code key="p">/api/auth/login</code>, "Sign in; returns tokens or a 2FA challenge."],
            ["POST", <code key="p">/api/auth/refresh</code>, "Exchange a refresh token for a new access token."],
            ["POST", <code key="p">/api/auth/logout</code>, "Invalidate the current session."],
            ["POST", <code key="p">/api/auth/2fa/verify</code>, "Complete a TOTP challenge during login."],
            ["POST", <code key="p">/api/auth/2fa/setup</code>, "Generate a TOTP secret (authenticated)."],
            ["POST", <code key="p">/api/auth/2fa/enable</code>, "Enable 2FA after verifying a code."],
            ["POST", <code key="p">/api/auth/forgot-password</code>, "Send a password-reset email."],
            ["POST", <code key="p">/api/auth/reset-password</code>, "Reset a password with a token."],
            ["POST", <code key="p">/api/auth/verify-email</code>, "Verify an email address."],
            ["POST", <code key="p">/api/auth/magic-link</code>, "Request a passwordless sign-in link."],
            ["GET", <code key="p">/api/auth/me</code>, "Return the current user."],
            ["GET", <code key="p">/api/auth/oauth/{`{provider}`}</code>, "Begin a Google/GitHub OAuth flow."],
          ]}
        />
      </DocSection>

      <DocSection id="files" title="Files & folders">
        <DocP>
          Files and folders carry only encrypted metadata. Folders can be nested,
          renamed, moved, and given their own password; deletes are soft (Trash)
          until purged. File names and folder names are ciphertext on the server.
        </DocP>
        <DocTable
          head={["Method", "Path", "Purpose"]}
          rows={[
            ["GET", <code key="p">/api/files</code>, "List files (filterable by folder)."],
            ["GET", <code key="p">/api/files/trash</code>, "List soft-deleted files."],
            ["DELETE", <code key="p">/api/files/{`{id}`}</code>, "Move a file to Trash."],
            ["POST", <code key="p">/api/files/bulk-delete</code>, "Move many files to Trash."],
            ["PATCH", <code key="p">/api/files/{`{id}`}/move</code>, "Move a file into a folder."],
            ["POST", <code key="p">/api/files/{`{id}`}/restore</code>, "Restore from Trash."],
            ["DELETE", <code key="p">/api/files/{`{id}`}/purge</code>, "Permanently delete a file."],
            ["GET", <code key="p">/api/folders</code>, "List folders."],
            ["POST", <code key="p">/api/folders</code>, "Create a folder."],
            ["PATCH", <code key="p">/api/folders/{`{id}`}</code>, "Rename a folder."],
            ["PATCH", <code key="p">/api/folders/{`{id}`}/move</code>, "Move a folder."],
            ["POST", <code key="p">/api/folders/{`{id}`}/password</code>, "Set a folder password."],
            ["DELETE", <code key="p">/api/folders/{`{id}`}</code>, "Delete a folder."],
          ]}
        />
      </DocSection>

      <DocSection id="upload" title="Upload (chunked)">
        <DocP>
          Uploads are client-side encrypted and chunked. Initialise a session,
          push each encrypted chunk (or upload it directly to the platform via a
          presigned URL where supported), then complete the session. Sessions are
          resumable — query status and re-send only the chunks that are missing.
        </DocP>
        <DocTable
          head={["Method", "Path", "Purpose"]}
          rows={[
            ["POST", <code key="p">/api/upload/init</code>, "Start an upload session; returns a session id."],
            ["PUT", <code key="p">/api/upload/{`{sid}`}/chunk/{`{idx}`}</code>, "Upload one encrypted chunk through the server."],
            ["POST", <code key="p">/api/upload/{`{sid}`}/presign/{`{idx}`}</code>, "Get a presigned URL to upload a chunk directly."],
            ["POST", <code key="p">/api/upload/{`{sid}`}/confirm/{`{idx}`}</code>, "Confirm a directly-uploaded chunk."],
            ["POST", <code key="p">/api/upload/{`{sid}`}/complete</code>, "Finalise the file once all chunks are in."],
            ["GET", <code key="p">/api/upload/{`{sid}`}/status</code>, "Report which chunks are received (resume)."],
            ["DELETE", <code key="p">/api/upload/{`{sid}`}</code>, "Cancel an in-flight upload."],
          ]}
        />
        <DocNote type="info" title="Chunk integrity headers">
          Chunk uploads carry an <code>X-Chunk-SHA256</code> hash and an{" "}
          <code>X-Chunk-Compressed</code> flag so the server can verify each chunk
          and record how it was packed — without ever decrypting it.
        </DocNote>
      </DocSection>

      <DocSection id="download" title="Download (chunked)">
        <DocP>
          Downloads fetch metadata, then pull chunks by index. The client verifies
          each chunk, reassembles, decrypts with your passphrase-derived key, and
          decompresses — all locally.
        </DocP>
        <DocTable
          head={["Method", "Path", "Purpose"]}
          rows={[
            ["GET", <code key="p">/api/files/{`{id}`}/meta</code>, "File metadata: size, chunk count, salt/IV."],
            ["GET", <code key="p">/api/files/{`{id}`}/chunks/{`{idx}`}</code>, "Fetch one encrypted chunk by index."],
          ]}
        />
      </DocSection>

      <DocSection id="sharing" title="Sharing">
        <DocP>
          Share links expose a single file to anyone with the token, optionally
          guarded by a password and bounded by an expiry or download limit. The
          public read routes are unauthenticated and rate-limited; a share
          password is supplied via the <code>X-Share-Password</code> header.
        </DocP>
        <DocTable
          head={["Method", "Path", "Purpose"]}
          rows={[
            ["POST", <code key="p">/api/shares</code>, "Create a share link (authenticated)."],
            ["GET", <code key="p">/api/shares</code>, "List your share links."],
            ["DELETE", <code key="p">/api/shares/{`{id}`}</code>, "Revoke a share link."],
            ["GET", <code key="p">/api/share/{`{token}`}</code>, "Public: share info (name, size, flags)."],
            ["GET", <code key="p">/api/share/{`{token}`}/meta</code>, "Public: file metadata for the share."],
            ["GET", <code key="p">/api/share/{`{token}`}/chunks/{`{idx}`}</code>, "Public: fetch a shared chunk."],
          ]}
        />
      </DocSection>

      <DocSection id="send-pad" title="Send & Pad">
        <DocP>
          <strong>Send</strong> lets anyone upload an encrypted file without an
          account and hand over a token; <strong>Pad</strong> stores a one-time
          encrypted note. Both are unauthenticated and rate-limited by IP.
        </DocP>
        <DocTable
          head={["Method", "Path", "Purpose"]}
          rows={[
            ["POST", <code key="p">/api/send/init</code>, "Start an anonymous send."],
            ["PUT", <code key="p">/api/send/{`{sid}`}/chunk/{`{idx}`}</code>, "Upload an encrypted chunk."],
            ["POST", <code key="p">/api/send/{`{sid}`}/complete</code>, "Finalise the send; returns a token."],
            ["GET", <code key="p">/api/send/{`{token}`}</code>, "Fetch send info / metadata / chunks."],
            ["POST", <code key="p">/api/pad</code>, "Create an encrypted one-time pad."],
            ["GET", <code key="p">/api/pad/{`{token}`}</code>, "Read pad info, then its content."],
          ]}
        />
      </DocSection>

      <DocSection id="events" title="Events (SSE)">
        <DocP>
          Real-time progress (uploads, syncs) streams over Server-Sent Events.
          Because <code>EventSource</code> cannot set headers, this endpoint
          authenticates with the JWT in a query parameter instead of the{" "}
          <code>Authorization</code> header.
        </DocP>
        <DocCode label="text/event-stream">{`GET /api/events?token=<access-token>`}</DocCode>
        <DocP>
          A separate WebSocket endpoint, <code>GET /api/transfer/ws</code>, backs
          live device-to-device transfer. Both long-lived endpoints bypass the
          per-request rate limiter.
        </DocP>
      </DocSection>

      <DocSection id="config" title="Quota & config">
        <DocP>
          These routes report account limits, connected storage, and instance
          settings. Most are read-only for normal users; writing config requires
          admin.
        </DocP>
        <DocTable
          head={["Method", "Path", "Purpose"]}
          rows={[
            ["GET", <code key="p">/api/quota</code>, "Storage quota and max concurrent uploads."],
            ["GET", <code key="p">/api/config</code>, "Effective instance configuration."],
            ["GET", <code key="p">/api/platforms/status</code>, "Connection status per storage platform."],
            ["POST", <code key="p">/api/platforms/connect</code>, "Connect a platform token."],
            ["DELETE", <code key="p">/api/platforms/disconnect</code>, "Disconnect a platform."],
            ["GET", <code key="p">/api/repos</code>, "List repositories in your storage pool."],
            ["GET", <code key="p">/api/plans</code>, "Public plan configs (no auth)."],
            ["GET", <code key="p">/api/health</code>, "Health check (no auth)."],
          ]}
        />
      </DocSection>

      <DocSection id="admin" title="Admin">
        <DocP>
          Admin routes require an account with the admin role. They cover user
          management, quotas and plans, global tokens, and audit data.
        </DocP>
        <DocTable
          head={["Method", "Path", "Purpose"]}
          rows={[
            ["GET", <code key="p">/api/admin/users</code>, "List all users."],
            ["GET", <code key="p">/api/admin/stats</code>, "System statistics."],
            ["PUT", <code key="p">/api/admin/users/{`{id}`}/role</code>, "Set a user's role."],
            ["PUT", <code key="p">/api/admin/users/{`{id}`}/plan</code>, "Set a user's plan."],
            ["PUT", <code key="p">/api/admin/users/{`{id}`}/quota</code>, "Set a user's quota."],
            ["DELETE", <code key="p">/api/admin/users/{`{id}`}</code>, "Delete a user."],
            ["GET", <code key="p">/api/admin/tokens</code>, "List global storage tokens."],
            ["GET", <code key="p">/api/admin/audit</code>, "Read the audit log."],
          ]}
        />
        <DocP>
          Looking to run your own instance? See{" "}
          <Link href="/docs/self-hosting" className="text-cyan-600 hover:underline dark:text-cyan-400">
            Self-hosting
          </Link>{" "}
          and{" "}
          <Link href="/docs/architecture" className="text-cyan-600 hover:underline dark:text-cyan-400">
            Architecture
          </Link>
          .
        </DocP>
      </DocSection>
    </DocPage>
  );
}
