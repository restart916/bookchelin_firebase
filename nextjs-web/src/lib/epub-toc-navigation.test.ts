import { describe, expect, it } from "vitest";

import {
  displayInitialSection,
  runGuardedTocDisplay,
  TocPreloadGuard,
} from "./epub-toc-navigation";

class FakeScrollContainer extends EventTarget {
  scrollTop = 0;
}

describe("TocPreloadGuard", () => {
  it("suppresses previous-section preloading until the safe scroll distance", () => {
    const container = new FakeScrollContainer();
    const manager = { settings: { offset: 500 }, container };
    const guard = new TocPreloadGuard(manager);

    guard.begin();
    expect(manager.settings.offset).toBe(0);

    guard.finish();
    container.scrollTop = 499;
    container.dispatchEvent(new Event("scroll"));
    expect(manager.settings.offset).toBe(0);

    container.scrollTop = 500;
    container.dispatchEvent(new Event("scroll"));
    expect(manager.settings.offset).toBe(500);
  });

  it("does not restore from programmatic scroll events during navigation", () => {
    const container = new FakeScrollContainer();
    const manager = { settings: { offset: 500 }, container };
    const guard = new TocPreloadGuard(manager);

    guard.begin();
    container.scrollTop = 800;
    container.dispatchEvent(new Event("scroll"));
    expect(manager.settings.offset).toBe(0);

    guard.finish();
    expect(manager.settings.offset).toBe(500);
  });

  it("restores the original offset when cancelled or destroyed", () => {
    const firstManager = {
      settings: { offset: 500 },
      container: new FakeScrollContainer(),
    };
    const firstGuard = new TocPreloadGuard(firstManager);
    firstGuard.begin();
    firstGuard.cancel();
    expect(firstManager.settings.offset).toBe(500);

    const secondManager = {
      settings: { offset: 320 },
      container: new FakeScrollContainer(),
    };
    const secondGuard = new TocPreloadGuard(secondManager);
    secondGuard.begin();
    secondGuard.destroy();
    expect(secondManager.settings.offset).toBe(320);
  });
});

describe("runGuardedTocDisplay", () => {
  it("finishes the guard after the chapter display resolves", async () => {
    const calls: string[] = [];
    const guard = {
      begin: () => calls.push("begin"),
      finish: () => calls.push("finish"),
      cancel: () => calls.push("cancel"),
    };

    await runGuardedTocDisplay(guard, async () => {
      calls.push("display");
    });

    expect(calls).toEqual(["begin", "display", "finish"]);
  });

  it("cancels the guard and preserves the display error", async () => {
    const calls: string[] = [];
    const guard = {
      begin: () => calls.push("begin"),
      finish: () => calls.push("finish"),
      cancel: () => calls.push("cancel"),
    };
    const error = new Error("display failed");

    await expect(
      runGuardedTocDisplay(guard, async () => {
        calls.push("display");
        throw error;
      }),
    ).rejects.toBe(error);

    expect(calls).toEqual(["begin", "display", "cancel"]);
  });
});

describe("displayInitialSection", () => {
  it("creates the guard after display initializes the rendition manager", async () => {
    const manager = {
      settings: { offset: 500 },
      container: new FakeScrollContainer(),
    };
    const rendition: {
      manager?: typeof manager;
      display: (target?: string) => Promise<void>;
    } = {
      display: async () => {
        rendition.manager = manager;
      },
    };

    const guard = await displayInitialSection(rendition, "epubcfi(test)");

    expect(guard).toBeInstanceOf(TocPreloadGuard);
    guard?.begin();
    expect(manager.settings.offset).toBe(0);
    guard?.destroy();
  });
});
