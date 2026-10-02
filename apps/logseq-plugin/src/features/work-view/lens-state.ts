import type { FocusRequest, VerifiedFocus } from "./lens-plan.ts";
import { focusBasisChanged } from "./lens-plan.ts";
import type { LensScope, LensSourceSnapshot } from "./lens-source.ts";
import type { LensSelection } from "./view-composer.ts";

/** Session-only reading state. No storage, host IO, layout snapshots or model calls. */
export class LensState {
  pending: FocusRequest | null = null;
  active: (LensSelection & { userFolds: Set<string> }) | null = null;
  readonly history: Array<{ selection: LensSelection & { userFolds: Set<string> }; bookmark: unknown }> = [];
  notice: string | null = null;
  suspended = false;

  begin(question: string, scope: LensScope): FocusRequest {
    this.pending = { schemaVersion: 1, requestId: crypto.randomUUID(), scope: { ...scope }, question };
    this.notice = null;
    return structuredClone(this.pending);
  }
  current(requestId: string): boolean { return this.pending?.requestId === requestId; }
  accept(focus: VerifiedFocus, bookmark: unknown, previous = false): void {
    if (this.active && !previous) {
      this.history.push({ selection: this.active, bookmark });
      if (this.history.length > 5) this.history.shift();
    }
    this.active = { focus, userFolds: previous ? new Set(this.history.at(-1)?.selection.userFolds) : new Set(), changed: false };
    if (previous) this.history.pop();
    this.pending = null; this.notice = null;
  }
  reject(requestId: string, reason: string): void { if (this.current(requestId)) this.notice = reason; }
  changed(source: LensSourceSnapshot): boolean {
    if (!this.active || this.active.changed || !focusBasisChanged(this.active.focus, source)) return false;
    this.active.changed = true; return true;
  }
  fold(uuid: string): boolean {
    if (!this.active || this.active.userFolds.has(uuid)) return false;
    this.active.userFolds.add(uuid); return true;
  }
  cancel(): void { this.pending = null; this.notice = null; }
  clear(): void { this.cancel(); this.active = null; this.history.length = 0; this.suspended = false; }
  snapshot(scope: LensScope | null): LensStatus {
    return {
      schemaVersion: 1, scope: scope ? { ...scope } : null,
      phase: this.pending ? "waiting" : this.active ? this.active.changed ? "changed" : "focused" : "reading",
      pending: this.pending ? structuredClone(this.pending) : null,
      plan: this.active ? structuredClone(this.active.focus.plan) : null,
      history: this.history.map(entry => entry.selection.focus.plan.question),
      basisChanged: this.active?.changed ?? false, suspended: this.suspended, notice: this.notice,
      rangeUnits: ["block"], transport: "plugin-local",
    };
  }
}
export interface LensStatus {
  schemaVersion: 1;
  scope: LensScope | null;
  phase: "reading" | "waiting" | "focused" | "changed";
  pending: FocusRequest | null;
  plan: VerifiedFocus["plan"] | null;
  history: string[];
  basisChanged: boolean;
  suspended: boolean;
  notice: string | null;
  rangeUnits: ["block"];
  transport: "plugin-local";
}
