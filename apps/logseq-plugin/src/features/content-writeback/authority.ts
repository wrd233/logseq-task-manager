import type { Operation, ScopeAuthority, ScopeLease, SourceScope } from "./protocol.ts";
import { fail, parsePatch, sameScope } from "./validation.ts";

/** Owned by the trusted installer. The public namespace cannot bind arbitrary roots or grant TODO rights. */
export class LocalScopeAuthority implements ScopeAuthority {
  private epoch = 0;
  private structure = false;
  private sourceWrite = false;
  private active: ScopeLease | null = null;
  private activeCheck:()=>boolean=()=>true;
  private readonly todo = new Set<string>();
  bind(scope: SourceScope, structure = false): ScopeLease {
    return this.establish(scope, true, structure);
  }
  bindRead(scope: SourceScope): ScopeLease {
    return this.establish(scope, false, false);
  }
  private establish(scope: SourceScope, sourceWrite: boolean, structure: boolean): ScopeLease {
    if(scope.kind==="page"&&(sourceWrite||structure))fail("BLOCK_SCOPE_REQUIRED");
    this.revoke();
    this.sourceWrite = sourceWrite;
    this.structure = structure;
    const controller = new AbortController();
    this.active = { scope: { ...scope }, epoch: this.epoch, signal: controller.signal, rootPath: null };
    this.abort = () => controller.abort();
    return this.active;
  }
  private abort: () => void = () => undefined;
  revoke(): void { this.abort(); this.active = null; this.activeCheck=()=>true; this.todo.clear(); this.structure = false; this.sourceWrite = false; this.epoch++; }
  current(): SourceScope | null { return this.active ? { ...this.active.scope } : null; }
  confirmRoot(lease: ScopeLease, path: readonly string[]): void { if (this.valid(lease)) lease.rootPath = [...path]; }
  capture(scope: SourceScope): ScopeLease | null { return this.active && sameScope(scope, this.active.scope) ? this.active : null; }
  valid(lease: ScopeLease): boolean {
    if(lease!==this.active||lease.epoch!==this.epoch||lease.signal.aborted)return false;
    if(!this.activeCheck()){this.revoke();return false;}return true;
  }
  /** Additional trusted lifecycle restriction; it cannot restore or enlarge a lease. */
  restrict(lease:ScopeLease,check:()=>boolean):void{if(this.valid(lease)){const previous=this.activeCheck;this.activeCheck=()=>previous()&&check();}}
  grantTodo(lease: ScopeLease, operation: Operation): void {
    if (this.valid(lease)) this.todo.add(JSON.stringify(parsePatch({schemaVersion:1,requestId:"trusted-todo-grant",scope:lease.scope,operations:[operation]}).operations[0]));
  }
  allowsStructure(lease: ScopeLease): boolean { return this.valid(lease) && this.structure; }
  allowsSourceWrite(lease: ScopeLease): boolean { return this.valid(lease) && this.sourceWrite; }
  allowsTodo(lease: ScopeLease, operation: Operation): boolean { return this.valid(lease) && this.todo.has(JSON.stringify(operation)); }
}
