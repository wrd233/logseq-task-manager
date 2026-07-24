import { randomBytes } from "node:crypto";

export class GrillPreviewSessionStore<T> {
  private readonly entries = new Map<string, { value: T; expiresAt: number }>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly ttlMs = 30 * 60_000,
    private readonly capacity = 64,
    private readonly createHandle: () => string = () => `grill_preview_${randomBytes(24).toString("base64url")}`,
  ) {}

  issue(value: T): string {
    this.prune();
    while (this.entries.size >= this.capacity) this.entries.delete(this.entries.keys().next().value as string);
    const handle = this.createHandle();
    if (!/^grill_preview_[A-Za-z0-9_-]{24,96}$/.test(handle) || this.entries.has(handle)) throw new Error("Grill preview session handle is invalid or duplicated.");
    this.entries.set(handle, { value, expiresAt: this.now() + this.ttlMs });
    return handle;
  }

  get(handle: string): T | undefined {
    this.prune();
    const entry = this.entries.get(handle);
    if (!entry) return undefined;
    this.entries.delete(handle);
    this.entries.set(handle, entry);
    return entry.value;
  }

  clear(): void { this.entries.clear(); }

  private prune(): void {
    const now = this.now();
    for (const [handle, entry] of this.entries) if (entry.expiresAt <= now) this.entries.delete(handle);
  }
}
