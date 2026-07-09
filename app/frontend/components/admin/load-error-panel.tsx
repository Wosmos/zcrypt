"use client";

import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

/** Retry panel shown when an admin page's initial data fetch fails. */
export function LoadErrorPanel({
  icon,
  title,
  description,
  onRetry,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onRetry: () => void;
}) {
  return (
    <div className="panel p-6">
      <EmptyState
        icon={icon}
        title={title}
        description={description}
        action={
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Try again
          </Button>
        }
      />
    </div>
  );
}
