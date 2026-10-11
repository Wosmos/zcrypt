"use client";

import { useParams } from "next/navigation";
import { useSyncExternalStore } from "react";
import { resolveSpaceId } from "@/lib/space-routes";

const noop = () => () => {};
const currentSearch = () => window.location.search;

export function useSpaceId(): string {
  const { id } = useParams<{ id: string }>();
  const search = useSyncExternalStore(noop, currentSearch, () => "");
  return resolveSpaceId(id, search);
}
