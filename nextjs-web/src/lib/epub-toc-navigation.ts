const DEFAULT_CONTINUOUS_OFFSET = 500;

interface ScrollContainerLike {
  scrollTop: number;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ): void;
}

export interface ContinuousManagerLike {
  settings: { offset?: number };
  container: ScrollContainerLike;
}

export interface TocDisplayGuard {
  begin(): void;
  finish(): void;
  cancel(): void;
}

export async function runGuardedTocDisplay(
  guard: TocDisplayGuard,
  display: () => Promise<unknown>,
) {
  guard.begin();
  try {
    await display();
    guard.finish();
  } catch (error) {
    guard.cancel();
    throw error;
  }
}

/**
 * Prevents epub.js's continuous manager from prepending the previous section
 * while a TOC display is laying out its target section.
 */
export class TocPreloadGuard {
  private active = false;
  private navigating = false;
  private originalOffset = DEFAULT_CONTINUOUS_OFFSET;

  constructor(private readonly manager: ContinuousManagerLike) {
    manager.container.addEventListener("scroll", this.onScroll, { passive: true });
  }

  begin() {
    if (!this.active) {
      this.originalOffset =
        typeof this.manager.settings.offset === "number"
          ? this.manager.settings.offset
          : DEFAULT_CONTINUOUS_OFFSET;
      this.active = true;
    }
    this.navigating = true;
    this.manager.settings.offset = 0;
  }

  finish() {
    this.navigating = false;
    this.restoreWhenSafe();
  }

  cancel() {
    this.restore();
  }

  destroy() {
    this.restore();
    this.manager.container.removeEventListener("scroll", this.onScroll);
  }

  private readonly onScroll = () => {
    if (!this.navigating) this.restoreWhenSafe();
  };

  private restoreWhenSafe() {
    if (
      this.active &&
      this.manager.container.scrollTop >= this.originalOffset
    ) {
      this.restore();
    }
  }

  private restore() {
    if (this.active) this.manager.settings.offset = this.originalOffset;
    this.active = false;
    this.navigating = false;
  }
}

export interface RenditionWithManager {
  manager?: ContinuousManagerLike;
  display(target?: string): Promise<unknown>;
}

/** The continuous manager is created asynchronously during the first display. */
export async function displayInitialSection(
  rendition: RenditionWithManager,
  target?: string,
) {
  await rendition.display(target);
  const manager = rendition.manager;
  return manager?.settings && manager.container
    ? new TocPreloadGuard(manager)
    : null;
}
