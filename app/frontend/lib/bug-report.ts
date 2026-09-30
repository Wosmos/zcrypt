import { getAppVersion, isTauri } from "@/lib/tauri";
import type { BugReportInput } from "@/lib/api";

export const SHOT_MAX_DIM = 1600;
export const SHOT_MAX_BYTES = 2 * 1024 * 1024;
const SHOT_QUALITIES = [0.82, 0.6, 0.4];

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read the screenshot"));
    reader.readAsDataURL(blob);
  });
}

/** Downscale an image to at most SHOT_MAX_DIM on its long edge and return it as a JPEG data URL. */
export async function downscaleToJpeg(file: Blob): Promise<string> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("That file is not a readable image");
  }
  const scale = Math.min(1, SHOT_MAX_DIM / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Image processing is unavailable");
  }
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  for (const quality of SHOT_QUALITIES) {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (blob && blob.size <= SHOT_MAX_BYTES) return readAsDataUrl(blob);
  }
  throw new Error("That screenshot is too large");
}

/** Everything auto-attached to a report: version, platform, current route and user agent. */
export async function collectBugContext(
  route: string,
): Promise<Omit<BugReportInput, "description">> {
  const version = (await getAppVersion().catch(() => null)) ?? process.env.NEXT_PUBLIC_APP_VERSION;
  return {
    app_version: version || "unknown",
    platform: `${isTauri ? "desktop" : "web"} ${navigator.platform}`.trim().slice(0, 64),
    route: route.slice(0, 512),
    user_agent: navigator.userAgent.slice(0, 512),
  };
}
