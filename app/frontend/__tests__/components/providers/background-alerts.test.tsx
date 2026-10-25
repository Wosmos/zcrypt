import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const h = vi.hoisted(() => ({ alerts: vi.fn(), register: vi.fn(async () => {}) }));
vi.mock("@/hooks/useAlertEvents", () => ({ useAlertEvents: h.alerts }));
vi.mock("@/lib/service-worker", () => ({ registerServiceWorker: h.register }));

import { BackgroundAlerts } from "@/components/providers/background-alerts";

describe("BackgroundAlerts", () => {
  it("listens for alerts and registers the service worker once, rendering nothing", () => {
    const { container, rerender } = render(<BackgroundAlerts />);
    rerender(<BackgroundAlerts />);
    expect(container).toBeEmptyDOMElement();
    expect(h.alerts).toHaveBeenCalled();
    expect(h.register).toHaveBeenCalledTimes(1);
  });
});
