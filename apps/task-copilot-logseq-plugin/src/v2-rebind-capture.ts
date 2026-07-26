import type { ExplicitSyncController, ExplicitSyncTransport } from "./explicit-sync-controller.ts";

type RebindSyncPort = Pick<ExplicitSyncController, "pause" | "resume">;

interface RebindCaptureClock {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

const defaultClock: RebindCaptureClock = {
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>),
};

export class V2RebindCaptureController {
  private activeValue = false;
  private timer: unknown;

  constructor(
    private readonly onExpire: () => Promise<void>,
    private readonly clock: RebindCaptureClock = defaultClock,
    private readonly ttlMs = 5 * 60 * 1000,
  ) {
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 1 || ttlMs > 10 * 60 * 1000) {
      throw new Error("Rebind capture TTL must be between 1 ms and 10 minutes.");
    }
  }

  get active(): boolean {
    return this.activeValue;
  }

  begin(sync: RebindSyncPort): void {
    if (!this.activeValue) {
      this.activeValue = true;
      sync.pause();
    }
    this.clearTimer();
    this.timer = this.clock.setTimeout(() => {
      this.timer = undefined;
      void this.onExpire();
    }, this.ttlMs);
  }

  async finish(sync: RebindSyncPort | undefined, transport: ExplicitSyncTransport | undefined): Promise<void> {
    this.clearTimer();
    if (!this.activeValue) return;
    this.activeValue = false;
    if (sync && transport) await sync.resume(transport);
  }

  abandon(): void {
    this.clearTimer();
    this.activeValue = false;
  }

  private clearTimer(): void {
    if (this.timer !== undefined) this.clock.clearTimeout(this.timer);
    this.timer = undefined;
  }
}
