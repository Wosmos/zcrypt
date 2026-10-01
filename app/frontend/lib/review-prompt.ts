const KEY_PREFIX = "zcrypt-review:";
const UPLOADS_NEEDED = 10;
const DAYS_NEEDED = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

interface ReviewPromptState {
  uploads: number;
  prompted: boolean;
}

function read(userId: string): ReviewPromptState {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + userId);
    if (!raw) return { uploads: 0, prompted: false };
    const parsed = JSON.parse(raw) as Partial<ReviewPromptState>;
    return {
      uploads: typeof parsed.uploads === "number" ? parsed.uploads : 0,
      prompted: parsed.prompted === true,
    };
  } catch {
    return { uploads: 0, prompted: false };
  }
}

function write(userId: string, state: ReviewPromptState): void {
  try {
    localStorage.setItem(KEY_PREFIX + userId, JSON.stringify(state));
  } catch {}
}

/** Count one more successful upload for this user on this device. */
export function recordSuccessfulUpload(userId: string): void {
  const state = read(userId);
  write(userId, { ...state, uploads: state.uploads + 1 });
}

/** Remember that the prompt was shown, so it never comes back for this user. */
export function markReviewPrompted(userId: string): void {
  write(userId, { ...read(userId), prompted: true });
}

/** True once per user, after the 10th successful upload or 7 days since signup. */
export function shouldPromptForReview(
  userId: string,
  createdAt: string | undefined,
  now: number = Date.now(),
): boolean {
  const state = read(userId);
  if (state.prompted) return false;
  if (state.uploads >= UPLOADS_NEEDED) return true;
  const signedUp = createdAt ? Date.parse(createdAt) : NaN;
  return Number.isFinite(signedUp) && now - signedUp >= DAYS_NEEDED * DAY_MS;
}
