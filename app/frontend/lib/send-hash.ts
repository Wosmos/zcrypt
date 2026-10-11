import { isSealed, openText } from "@/lib/sealed";

const PLAIN_HEX = /^[0-9a-f]{64}$/;

export async function openSendHash(stored: string, key: CryptoKey | null): Promise<string | null> {
  if (PLAIN_HEX.test(stored)) return stored;
  if (!isSealed(stored) || !key) return null;
  const hex = await openText(stored, key);
  return PLAIN_HEX.test(hex) ? hex : null;
}
