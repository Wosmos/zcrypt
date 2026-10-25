import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Banner } from "@/components/ui/banner";

afterEach(cleanup);

describe("Banner", () => {
  it("renders a soft tint of the kind colour with a tinted border and no left edge", () => {
    render(<Banner kind="warning" title="Storage nearly full" body="Connect your own account." />);
    const banner = screen.getByRole("status");
    expect(banner).toHaveAttribute("data-banner", "warning");
    expect(banner.style.background).toContain("var(--toast-warning)");
    expect(banner.style.borderColor).toContain("var(--toast-warning)");
    expect(banner.className).not.toMatch(/border-l-|border-s-/);
    expect(screen.getByText("Storage nearly full")).toBeInTheDocument();
    expect(screen.getByText("Connect your own account.")).toBeInTheDocument();
  });

  it("can be an alert and takes a custom icon and children", () => {
    const Custom = () => <i data-testid="custom-icon" />;
    render(
      <Banner kind="error" role="alert" icon={Custom} title="Deleting soon">
        <p>extra</p>
      </Banner>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByTestId("custom-icon")).toBeInTheDocument();
    expect(screen.getByText("extra")).toBeInTheDocument();
  });

  it("renders button and link actions, at most two, as text or outline", () => {
    const onClick = vi.fn();
    render(
      <Banner
        kind="info"
        title="t"
        actions={[
          { label: "Retry", onClick, icon: <span data-testid="ic" /> },
          { label: "Learn more", href: "/docs", variant: "outline" },
          { label: "Third", onClick },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.getByTestId("ic")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Learn more" });
    expect(link).toHaveAttribute("href", "/docs");
    expect(link.style.borderColor).toContain("var(--color-accent)");
    expect(screen.queryByText("Third")).toBeNull();
  });

  it("disables an action", () => {
    render(<Banner kind="info" title="t" actions={[{ label: "Wait", disabled: true }]} />);
    expect(screen.getByRole("button", { name: "Wait" })).toBeDisabled();
  });

  it("shows a dismiss button only when asked", () => {
    const onDismiss = vi.fn();
    const { rerender } = render(<Banner kind="success" title="t" />);
    expect(screen.queryByRole("button")).toBeNull();
    rerender(<Banner kind="success" title="t" onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("renders no actions wrapper for an empty list", () => {
    render(<Banner kind="info" title="t" actions={[]} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
