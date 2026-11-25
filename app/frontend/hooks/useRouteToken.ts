"use client";

import { useParams, useSearchParams } from "next/navigation";
import { resolveRouteId } from "@/lib/route-shell";

/** The share token of a `/s`, `/f`, `/send` or `/pad` page. */
export function useRouteToken(): string {
  const { token } = useParams<{ token: string }>();
  const search = useSearchParams();
  return resolveRouteId(token, search.toString());
}
