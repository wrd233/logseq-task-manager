export function scopeKey(graphId: string, rootUuid: string): string {
  return `workbench:scope:${JSON.stringify([graphId, rootUuid])}`;
}

/** Module changes serialize so a delayed open cannot revive a closed panel. */
export type PanelCloseReason = "switch" | "close";
export class PanelCoordinator {
  active: string | null = null;
  private tail: Promise<void> = Promise.resolve();
  private revision = 0;
  private readonly closers = new Map<string, (reason: PanelCloseReason) => void | Promise<void>>();

  register(name: string, close: (reason: PanelCloseReason) => void | Promise<void>): void { this.closers.set(name, close); }

  reserve(): number { return ++this.revision; }
  isLatest(revision: number): boolean { return revision === this.revision; }

  activate(name: string, revision = this.reserve()): Promise<boolean> {
    const next = this.tail.then(async () => {
      if (!this.isLatest(revision)) return false;
      if (this.active && this.active !== name) await this.closers.get(this.active)?.("switch");
      if (!this.isLatest(revision)) return false;
      this.active = name;
      return true;
    });
    this.tail = next.then(() => undefined, () => undefined);
    return next;
  }

  release(name: string): void { if (this.active === name) this.active = null; }

  closeActive(): Promise<void> {
    const revision = this.reserve();
    const next = this.tail.then(async () => {
      if (!this.isLatest(revision)) return;
      const name = this.active;
      if (name) await this.closers.get(name)?.("close");
      if (this.active === name) this.active = null;
    });
    this.tail = next.catch(() => undefined); return next;
  }
}

export const panels = new PanelCoordinator();
