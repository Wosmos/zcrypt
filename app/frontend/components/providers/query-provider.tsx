"use client";

import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { lazy, Suspense } from "react";
import {
  queryClient,
  queryPersister,
  shouldPersistQuery,
  PERSIST_MAX_AGE,
  revalidateRestored,
} from "@/lib/query-client";
import { cachedUserId } from "@/store/auth";

// A reload paints the last-known lists straight from IndexedDB, then refetches
// whatever is stale. The buster is the cached user id, so a snapshot never
// restores into another account.
const persistOptions = {
  persister: queryPersister,
  maxAge: PERSIST_MAX_AGE,
  buster: cachedUserId,
  dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
  onSuccess: revalidateRestored,
};

// Devtools are dev-only and dynamically imported so they never reach the prod
// bundle. They render a floating panel that shows the live cache state, useful
// for verifying that a delete/move/restore actually invalidates what it should.
const ReactQueryDevtools =
  process.env.NODE_ENV === "development"
    ? lazy(() =>
        import("@tanstack/react-query-devtools").then((m) => ({
          default: m.ReactQueryDevtools,
        })),
      )
    : null;

export function QueryProvider({ children }: { children: React.ReactNode }) {
  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      {children}
      {ReactQueryDevtools && (
        <Suspense fallback={null}>
          <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
        </Suspense>
      )}
    </PersistQueryClientProvider>
  );
}
