import type { ReactElement, ReactNode } from "react";
import { render } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient as appClient } from "@/lib/query-client";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

export function installDomStubs() {
  const g = globalThis as unknown as Record<string, unknown>;
  g.ResizeObserver ??= ResizeObserverStub;
  const css = (g.CSS ?? {}) as { escape?: (s: string) => string };
  css.escape ??= (s: string) => s;
  g.CSS = css;
  if (!window.matchMedia) {
    window.matchMedia = ((q: string) => ({
      matches: false,
      media: q,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      onchange: null,
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
  }
}

export function renderWithQuery(ui: ReactElement) {
  appClient.clear();
  const wrap = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={appClient}>{children}</QueryClientProvider>
  );
  return render(ui, { wrapper: wrap });
}
