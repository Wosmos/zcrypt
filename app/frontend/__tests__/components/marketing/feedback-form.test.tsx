import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({
  search: "",
  submit: vi.fn(),
  downscale: vi.fn(),
  refresh: vi.fn(),
  me: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(h.search),
}));
vi.mock("@/lib/api", () => ({ submitBugReport: h.submit }));
vi.mock("@/lib/auth-fetch", () => ({ tryRefreshToken: h.refresh }));
vi.mock("@/lib/auth-api", () => ({ getMe: h.me }));
vi.mock("@/lib/bug-report", () => ({
  collectBugContext: async (route: string) => ({
    app_version: "9.9.9",
    platform: "web test",
    route,
    user_agent: "ua",
  }),
  downscaleToJpeg: h.downscale,
}));

import { FeedbackForm } from "@/components/marketing/feedback/feedback-form";
import { ApiError } from "@/lib/http-error";
import { useAuthStore } from "@/store/auth";

function signIn(email = "me@example.com") {
  useAuthStore.setState({
    accessToken: "tok",
    user: { id: "u1", email } as never,
  });
}

describe("FeedbackForm", () => {
  beforeEach(() => {
    h.search = "";
    h.submit.mockReset().mockResolvedValue({ success: true });
    h.downscale.mockReset().mockResolvedValue("data:image/jpeg;base64,AAAA");
    h.refresh.mockReset().mockResolvedValue(null);
    h.me.mockReset().mockResolvedValue(null);
    useAuthStore.setState({ accessToken: null, user: null });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("offers the four types and defaults to a bug", () => {
    render(<FeedbackForm />);
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(4);
    expect(screen.getByRole("radio", { name: "Something's broken" })).toBeChecked();
  });

  it.each([
    ["idea", "An idea"],
    ["left", "Why I stopped using zcrypt"],
    ["other", "Something else"],
    ["bug", "Something's broken"],
    ["nonsense", "Something's broken"],
  ])("preselects ?type=%s", (param, label) => {
    h.search = `type=${param}`;
    render(<FeedbackForm />);
    expect(screen.getByRole("radio", { name: label })).toBeChecked();
  });

  it("keeps submit disabled until there is a message and counts characters", () => {
    render(<FeedbackForm />);
    const submit = screen.getByRole("button", { name: "Send feedback" });
    expect(submit).toBeDisabled();
    expect(screen.getByText("0 / 5000")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Your message"), { target: { value: "   " } });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Your message"), { target: { value: "hello" } });
    expect(submit).toBeEnabled();
    expect(screen.getByText("5 / 5000")).toBeInTheDocument();
  });

  it("signed out: shows the email field and an off-screen honeypot, no screenshot", () => {
    render(<FeedbackForm />);
    expect(screen.getByLabelText("Want a reply? Leave your email")).toBeInTheDocument();
    expect(screen.queryByText(/Sending as/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("feedback-file")).not.toBeInTheDocument();
    const pot = document.querySelector<HTMLInputElement>('input[name="website"]')!;
    expect(pot).toBeInTheDocument();
    expect(pot.tabIndex).toBe(-1);
    expect(pot).toHaveAttribute("autocomplete", "off");
    const wrap = pot.parentElement!;
    expect(wrap).toHaveAttribute("aria-hidden", "true");
    expect(wrap.style.position).toBe("absolute");
    expect(wrap.style.left).toBe("-9999px");
    expect(wrap.style.display).not.toBe("none");
  });

  it("signed out: sends email, honeypot and elapsed_ms", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    render(<FeedbackForm />);
    fireEvent.change(screen.getByLabelText("Your message"), { target: { value: "  great app  " } });
    fireEvent.change(screen.getByLabelText("Want a reply? Leave your email"), {
      target: { value: " a@b.co " },
    });
    fireEvent.click(screen.getByRole("radio", { name: "An idea" }));
    vi.setSystemTime(new Date("2026-01-01T00:00:07Z"));
    fireEvent.click(screen.getByRole("button", { name: "Send feedback" }));
    await screen.findByText("Thanks, I read every one.");
    expect(h.submit).toHaveBeenCalledWith({
      description: "great app",
      kind: "idea",
      contact_email: "a@b.co",
      website: "",
      elapsed_ms: 7000,
      app_version: "9.9.9",
      platform: "web test",
      route: "/feedback",
      user_agent: "ua",
    });
    expect(screen.getByRole("link", { name: "Back to home" })).toHaveAttribute("href", "/");
  });

  it("forwards whatever a bot typed into the honeypot", async () => {
    render(<FeedbackForm />);
    fireEvent.change(document.querySelector('input[name="website"]')!, {
      target: { value: "http://spam" },
    });
    fireEvent.change(screen.getByLabelText("Your message"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Send feedback" }));
    await waitFor(() => expect(h.submit).toHaveBeenCalled());
    expect(h.submit.mock.calls[0][0].website).toBe("http://spam");
  });

  it("signed in: names the account, hides email and honeypot, never sends them", async () => {
    signIn();
    render(<FeedbackForm />);
    expect(screen.getByText("Sending as me@example.com")).toBeInTheDocument();
    expect(screen.queryByLabelText("Want a reply? Leave your email")).not.toBeInTheDocument();
    expect(document.querySelector('input[name="website"]')).toBeNull();
    fireEvent.change(screen.getByLabelText("Your message"), { target: { value: "broken" } });
    fireEvent.click(screen.getByRole("button", { name: "Send feedback" }));
    await waitFor(() => expect(h.submit).toHaveBeenCalled());
    const payload = h.submit.mock.calls[0][0];
    expect(payload).not.toHaveProperty("contact_email");
    expect(payload).not.toHaveProperty("website");
    expect(payload).not.toHaveProperty("screenshot");
    expect(payload.kind).toBe("bug");
    expect(payload.elapsed_ms).toBeGreaterThanOrEqual(0);
  });

  it("signed in without a known email says it is sending from the account", () => {
    signIn("");
    render(<FeedbackForm />);
    expect(screen.getByText("Sending from your account")).toBeInTheDocument();
  });

  it("signed in: attaches, previews, removes and sends a screenshot only for bugs", async () => {
    signIn();
    render(<FeedbackForm />);
    const file = new File(["x"], "s.png", { type: "image/png" });
    fireEvent.change(screen.getByTestId("feedback-file"), { target: { files: [file] } });
    const img = await screen.findByAltText("Attached screenshot");
    expect(img).toHaveAttribute("src", "data:image/jpeg;base64,AAAA");

    fireEvent.click(screen.getByRole("button", { name: "Remove screenshot" }));
    expect(screen.queryByAltText("Attached screenshot")).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId("feedback-file"), { target: { files: [file] } });
    await screen.findByAltText("Attached screenshot");
    fireEvent.change(screen.getByLabelText("Your message"), { target: { value: "bug" } });
    fireEvent.click(screen.getByRole("button", { name: "Send feedback" }));
    await waitFor(() => expect(h.submit).toHaveBeenCalledTimes(1));
    expect(h.submit.mock.calls[0][0].screenshot).toBe("data:image/jpeg;base64,AAAA");

    cleanup();
    h.submit.mockClear();
    render(<FeedbackForm />);
    fireEvent.change(screen.getByTestId("feedback-file"), { target: { files: [file] } });
    await screen.findByAltText("Attached screenshot");
    fireEvent.click(screen.getByRole("radio", { name: "An idea" }));
    expect(screen.queryByTestId("feedback-file")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Your message"), { target: { value: "idea" } });
    fireEvent.click(screen.getByRole("button", { name: "Send feedback" }));
    await waitFor(() => expect(h.submit).toHaveBeenCalledTimes(1));
    expect(h.submit.mock.calls[0][0]).not.toHaveProperty("screenshot");
  });

  it("the attach button opens the file picker and ignores an empty selection", () => {
    signIn();
    render(<FeedbackForm />);
    const input = screen.getByTestId("feedback-file") as HTMLInputElement;
    const click = vi.spyOn(input, "click");
    fireEvent.click(screen.getByRole("button", { name: "Attach a screenshot (optional)" }));
    expect(click).toHaveBeenCalled();
    fireEvent.change(input, { target: { files: [] } });
    expect(h.downscale).not.toHaveBeenCalled();
  });

  it("shows why an attachment failed", async () => {
    signIn();
    h.downscale.mockRejectedValueOnce(new Error("That file is not a readable image"));
    render(<FeedbackForm />);
    fireEvent.change(screen.getByTestId("feedback-file"), {
      target: { files: [new File(["x"], "s.txt")] },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("That file is not a readable image");
  });

  it("falls back to a generic attach message for non-Error failures", async () => {
    signIn();
    h.downscale.mockRejectedValueOnce("boom");
    render(<FeedbackForm />);
    fireEvent.change(screen.getByTestId("feedback-file"), {
      target: { files: [new File(["x"], "s.txt")] },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not attach that image");
  });

  it("429 asks to try again later and keeps the message", async () => {
    h.submit.mockRejectedValueOnce(new ApiError("too many reports, try again later", 429));
    render(<FeedbackForm />);
    fireEvent.change(screen.getByLabelText("Your message"), { target: { value: "hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Send feedback" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Please try again in a little while");
    expect(screen.getByLabelText("Your message")).toHaveValue("hello");
    expect(screen.getByRole("button", { name: "Send feedback" })).toBeEnabled();
  });

  it("400 shows the server message", async () => {
    h.submit.mockRejectedValueOnce(new ApiError("invalid email", 400));
    render(<FeedbackForm />);
    fireEvent.change(screen.getByLabelText("Your message"), { target: { value: "hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Send feedback" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("invalid email");
  });

  it("any other failure is a generic message", async () => {
    h.submit.mockRejectedValueOnce(new Error("network"));
    render(<FeedbackForm />);
    fireEvent.change(screen.getByLabelText("Your message"), { target: { value: "hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Send feedback" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not send that");
  });

  it("does not submit an empty message from the keyboard", () => {
    render(<FeedbackForm />);
    fireEvent.submit(screen.getByRole("button", { name: "Send feedback" }).closest("form")!);
    expect(h.submit).not.toHaveBeenCalled();
  });

  it("lets you send another after success", async () => {
    render(<FeedbackForm />);
    fireEvent.change(screen.getByLabelText("Your message"), { target: { value: "one" } });
    fireEvent.click(screen.getByRole("button", { name: "Send feedback" }));
    fireEvent.click(await screen.findByRole("button", { name: "Send another" }));
    expect(screen.getByLabelText("Your message")).toHaveValue("");
  });

  it("restores a signed-in session from the cookie and shows who is sending", async () => {
    h.refresh.mockImplementation(async () => {
      useAuthStore.setState({ accessToken: "fresh" });
      return "fresh";
    });
    h.me.mockResolvedValue({ id: "u1", email: "back@example.com" });
    render(<FeedbackForm />);
    await waitFor(() => expect(screen.getByText(/back@example.com/)).toBeTruthy());
    expect(h.me).toHaveBeenCalledWith("fresh");
  });

  it("stays signed out when there is no session to restore", async () => {
    render(<FeedbackForm />);
    await waitFor(() => expect(h.refresh).toHaveBeenCalled());
    expect(h.me).not.toHaveBeenCalled();
  });

  it("loads the profile for a token that has no user yet", async () => {
    useAuthStore.setState({ accessToken: "tok", user: null });
    h.me.mockRejectedValue(new Error("down"));
    render(<FeedbackForm />);
    await waitFor(() => expect(h.me).toHaveBeenCalledWith("tok"));
    expect(h.refresh).not.toHaveBeenCalled();
  });
});
