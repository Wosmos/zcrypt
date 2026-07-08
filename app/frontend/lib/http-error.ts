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
