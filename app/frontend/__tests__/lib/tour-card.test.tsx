import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TourCard } from "@/components/onboarding/tour-card";

const setup = (over: Partial<Parameters<typeof TourCard>[0]> = {}) => {
  const props = {
    step: { title: "Find anything fast", content: "Type to filter." },
    currentStep: 1,
    totalSteps: 3,
    nextStep: vi.fn(),
    prevStep: vi.fn(),
    skipTour: vi.fn(),
    arrow: <i />,
    ...over,
  };
  render(<TourCard {...props} />);
  return props;
};

describe("TourCard", () => {
  afterEach(cleanup);

  it("shows progress and moves with the buttons", () => {
    const p = setup();
    expect(screen.getByText("2 of 3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip tour" }));
    expect(p.nextStep).toHaveBeenCalled();
    expect(p.prevStep).toHaveBeenCalled();
    expect(p.skipTour).toHaveBeenCalled();
  });

  it("focuses the primary button and is keyboard driven", () => {
    const p = setup();
    expect(screen.getByRole("button", { name: "Next" })).toHaveFocus();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(p.nextStep).toHaveBeenCalledTimes(1);
    expect(p.prevStep).toHaveBeenCalledTimes(1);
    expect(p.skipTour).toHaveBeenCalledTimes(1);
  });

  it("ignores arrow keys while typing", () => {
    const p = setup();
    const input = document.createElement("input");
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: "ArrowRight" });
    expect(p.nextStep).not.toHaveBeenCalled();
  });

  it("offers Done and no Back or Skip on the ends", () => {
    setup({ currentStep: 0, totalSteps: 1 });
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Skip tour" })).toBeNull();
  });
});
