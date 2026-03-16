import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { screen } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { virtual } from "@guidepup/virtual-screen-reader";

import { Notify } from "../src/notify";

const waitForAnnouncement = async (delay = 200): Promise<void> => {
  await new Promise((resolve) => {
    setTimeout(resolve, delay);
  });
};

describe.sequential("Notify spoken accessibility", () => {
  let notify: Notify;

  beforeEach(() => {
    Notify.instance = undefined;
    document.body.innerHTML = "";
    notify = new Notify();
  });

  afterEach(async () => {
    document.body.innerHTML = "";
    Notify.instance = undefined;

    try {
      await virtual.stop();
    } catch {
      // No-op if the virtual screen reader was not active for this test.
    }
  });

  it("announces inline messages without moving focus away from the trigger", async () => {
    const trigger = document.createElement("button");
    trigger.textContent = "Copy link";
    document.body.append(trigger);

    await virtual.start({ container: document.body });
    await virtual.interact();

    const user = userEvent.setup();
    await user.tab();

    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Copy link" }),
    );

    await notify.showInline({
      element: trigger,
      message: "Link copied to clipboard.",
    });
    await waitForAnnouncement();

    expect(document.activeElement).toBe(trigger);
    expect((await virtual.lastSpokenPhrase()).toLowerCase()).toContain(
      "link copied to clipboard",
    );
  });

  it("announces bottom alerts and speaks the close and action buttons in tab order", async () => {
    await virtual.start({ container: document.body });
    await virtual.interact();

    notify.showBottom({
      message: "Publishing failed. Check the form and try again.",
      status: "error",
      button: {
        text: "Retry",
        onClick: () => undefined,
      },
    });
    await waitForAnnouncement();

    expect((await virtual.lastSpokenPhrase()).toLowerCase()).toContain(
      "publishing failed. check the form and try again.",
    );

    const user = userEvent.setup();
    await user.tab();

    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Schließen" }),
    );
    expect((await virtual.lastSpokenPhrase()).toLowerCase()).toContain(
      "schließen",
    );

    await user.tab();

    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Retry" }),
    );
    const spoken = (await virtual.lastSpokenPhrase()).toLowerCase();
    expect(spoken).toContain("retry");
    expect(spoken).toContain("button");
  });

  it("speaks link actions when navigating bottom notifications by keyboard", async () => {
    await virtual.start({ container: document.body });
    await virtual.interact();

    notify.showBottom({
      message: "A new version of Notify is available.",
      status: "info",
      link: {
        text: "Open docs",
        href: "https://example.com/docs",
      },
    });
    await waitForAnnouncement();

    const user = userEvent.setup();
    await user.tab();
    await user.tab();

    expect(document.activeElement).toBe(
      screen.getByRole("link", { name: "Open docs" }),
    );

    const spoken = (await virtual.lastSpokenPhrase()).toLowerCase();
    expect(spoken).toContain("open docs");
    expect(spoken).toContain("link");
  });
});
