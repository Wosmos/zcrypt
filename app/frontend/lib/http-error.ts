/**
 * Shared HTTP error extraction.
 *
 * The backend returns errors as `{ "error": "<message>" }` JSON, but some
 * handlers (and unexpected 5xx/proxy responses) send a plain-text body. These
 * helpers pull the server message out of either shape, falling back to the raw
 * body so nothing is silently swallowed.
 */

/** Return the server's `error` field from a JSON body, else the raw body. */
export function parseErrorBody(body: string): string {
  try {
    return JSON.parse(body).error || body;
  } catch {
    return body;
  }
}

/** Read a non-ok response body and throw an Error carrying the server message. */
export async function throwResponseError(res: Response): Promise<never> {
  throw new Error(parseErrorBody(await res.text()));
}

/**
 * Read a response body as JSON (once) and return its `error` field, or the
 * caller's `fallback` string when the body isn't JSON, has no `error`, or can't
 * be read. Complements parseErrorBody (which reads text). Folds the ubiquitous
 *   `const body = await res.json().catch(() => ({})); throw new Error(body.error || "…")`
 * pattern — callers wrap the result in their own `throw new Error(...)`, so each
 * keeps its bespoke fallback message.
 */
export async function parseErrorJson(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => ({} as unknown));
  return (body as { error?: string })?.error || fallback;
}
