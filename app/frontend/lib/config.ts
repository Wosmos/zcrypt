/**
 * Deployment settings read from the environment, in one place. Next inlines
 * NEXT_PUBLIC_* at build time, so these must stay literal property reads.
 */

/** Backend origin without a trailing slash. Empty means same-origin (the /api proxy). */
export const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/+$/, "");

/** WebSocket origin matching API_BASE. */
export const API_WS_BASE = API_BASE.replace(/^http/, "ws");

/** Backend the desktop shell talks to when no API URL was baked into the build. */
export const DEV_API_URL = "http://localhost:8080";
