import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";

import { Notify } from "../src/notify";

describe("Notify accessibility behavior", () => {
  let notify: Notify;

  beforeEach(() => {
    Notify.instance = undefined;
    document.body.innerHTML = "";
    vi.useFakeTimers();
    notify = new Notify();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    document.body.innerHTML = "";
    Notify.instance = undefined;
  });

  it("keeps focus on the trigger and exposes inline messages through a polite live region", async () => {
    const trigger = document.createElement("button");
    trigger.textContent = "Copy link";
    document.body.append(trigger);
    trigger.focus();

    const showInlinePromise = notify.showInline({
      element: trigger,
      message: "Link copied to clipboard.",
    });

    await vi.advanceTimersByTimeAsync(50);
    await showInlinePromise;

    const inlineMessage = document.querySelector(".z-notification-inline");

    expect(document.activeElement).toBe(trigger);
    expect(inlineMessage).not.toBeNull();
    expect(inlineMessage?.getAttribute("role")).toBe("status");
    expect(inlineMessage?.getAttribute("aria-live")).toBe("polite");
    expect(inlineMessage?.getAttribute("aria-atomic")).toBe("true");
    expect(inlineMessage?.textContent).toBe("Link copied to clipboard.");
  });

  it("keeps bottom notification controls in keyboard order and exposes an assertive live message", async () => {
    notify.showBottom({
      message: "Publishing failed. Check the form and try again.",
      status: "error",
      button: {
        text: "Retry",
        onClick: vi.fn(),
      },
    });

    const user = userEvent.setup({
      advanceTimers: vi.advanceTimersByTime,
    });
    const alert = screen.getByRole("alert");
    const closeButton = screen.getByRole("button", { name: "Schließen" });
    const actionButton = screen.getByRole("button", { name: "Retry" });

    expect(alert.getAttribute("aria-live")).toBe("assertive");
    expect(alert.textContent).toContain(
      "Publishing failed. Check the form and try again.",
    );

    await user.tab();
    expect(document.activeElement).toBe(closeButton);

    await user.tab();
    expect(document.activeElement).toBe(actionButton);
  });

  it("allows keyboard navigation to link actions in bottom notifications", async () => {
    notify.showBottom({
      message: "A new version of Notify is available.",
      status: "info",
      link: {
        text: "Open docs",
        href: "https://example.com/docs",
      },
    });

    const user = userEvent.setup({
      advanceTimers: vi.advanceTimersByTime,
    });
    const closeButton = screen.getByRole("button", { name: "Schließen" });
    const actionLink = screen.getByRole("link", { name: "Open docs" });

    await user.tab();
    expect(document.activeElement).toBe(closeButton);

    await user.tab();
    expect(document.activeElement).toBe(actionLink);
    expect(actionLink.getAttribute("href")).toBe("https://example.com/docs");
  });
});
