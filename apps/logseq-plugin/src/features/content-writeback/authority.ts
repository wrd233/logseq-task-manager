import type { Operation, ScopeAuthority, ScopeLease, SourceScope } from "./protocol.ts";
import { parsePatch, sameScope } from "./validation.ts";

/** Owned by the trusted installer. The public namespace cannot bind arbitrary roots or grant TODO rights. */
export class LocalScopeAuthority implements ScopeAuthority {
  private epoch = 0;
  private active: ScopeLease | null = null;
  private readonly todo = new Set<string>();
  bind(scope: SourceScope): ScopeLease {
    this.revoke();
    const controller = new AbortController();
    this.active = { scope: { ...scope }, epoch: this.epoch, signal: controller.signal, rootPath: null };
    this.abort = () => controller.abort();
    return this.active;
  }
  private abort: () => void = () => undefined;
  revoke(): void { this.abort(); this.active = null; this.todo.clear(); this.epoch++; }
  current(): SourceScope | null { return this.active ? { ...this.active.scope } : null; }
  confirmRoot(lease: ScopeLease, path: readonly string[]): void { if (this.valid(lease)) lease.rootPath = [...path]; }
  capture(scope: SourceScope): ScopeLease | null { return this.active && sameScope(scope, this.active.scope) ? this.active : null; }
  valid(lease: ScopeLease): boolean { return lease === this.active && lease.epoch === this.epoch && !lease.signal.aborted; }
  grantTodo(lease: ScopeLease, operation: Operation): void {
    if (this.valid(lease)) this.todo.add(JSON.stringify(parsePatch({schemaVersion:1,requestId:"trusted-todo-grant",scope:lease.scope,operations:[operation]}).operations[0]));
  }
  allowsTodo(lease: ScopeLease, operation: Operation): boolean { return this.valid(lease) && this.todo.has(JSON.stringify(operation)); }
}
