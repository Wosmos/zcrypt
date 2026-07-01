/**
 * Stable per-device identifier, persisted in localStorage. Used to key
 * per-device server preferences (e.g. the color theme), so each device keeps
 * its own look — "per-device set, per-device consistent". Not a security
 * boundary; just a display-preference key.
 */
const DEVICE_ID_KEY = "zcrypt-device-id";

export function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}
