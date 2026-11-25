import { Role } from "@/types";

export const ADMIN_IN_BUILD = process.env.NEXT_PUBLIC_NATIVE_BUILD !== "1";

export function showsAdmin(role: string | undefined): boolean {
  return ADMIN_IN_BUILD && role === Role.Admin;
}
