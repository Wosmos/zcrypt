"use client";

import { useParams, useSearchParams } from "next/navigation";
import { resolveSpaceId } from "@/lib/space-routes";

export function useSpaceId(): string {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  return resolveSpaceId(id, search.toString());
}
