import { isSealed, openText, LOCKED } from "@/lib/sealed";

export async function openLinkName(
  raw: string | undefined,
  makeKey: (() => Promise<CryptoKey>) | null,
): Promise<string> {
  if (!raw) return "";
  if (!isSealed(raw)) return raw;
  if (!makeKey) return "";
  const name = await openText(raw, await makeKey());
  return name === LOCKED ? "" : name;
}
