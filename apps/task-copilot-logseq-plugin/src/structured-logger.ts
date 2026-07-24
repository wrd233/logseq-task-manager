import { checksum } from "@task-copilot/shared";

export type LogLevel = "error" | "warn" | "info" | "debug" | "trace";
export type LogCategory = "plugin-lifecycle" | "ui-action" | "capture" | "source-resolution" | "logseq-adapter" | "application-command" | "persistence" | "proposal" | "semantic-commit" | "query-refresh" | "runtime-shape" | "attention-shadow";

export interface StructuredLogEntry {
  timestamp: string;
  level: LogLevel;
  category: LogCategory;
  event: string;
  correlationId?: string;
  actionId?: string;
  captureId?: string;
  objectId?: string;
  proposalId?: string;
  commitId?: string;
  blockUuid?: string;
  pageRefShape?: string;
  command?: string;
  durationMs?: number;
  result?: string;
  errorCode?: string;
  errorName?: string;
  errorMessage?: string;
  stack?: string;
  cause?: string;
  pluginVersion?: string;
  pluginCommit?: string;
  logseqVersion?: string;
  graphIdentity?: string;
  contentLength?: number;
  contentHash?: string;
  signalRawCount?: number;
  signalMergedCount?: number;
  signalCooledCount?: number;
  signalActiveCount?: number;
  signalInvalidatedCount?: number;
}

export function createCorrelationId(now = new Date()): string {
  const suffix = globalThis.crypto.randomUUID().replaceAll("-", "").slice(0, 8);
  return `TC-${now.toISOString().replace(/\D/g, "").slice(0, 14)}-${suffix}`;
}

export function privateContentEvidence(content: string): Pick<StructuredLogEntry, "contentLength" | "contentHash"> {
  return { contentLength: content.length, contentHash: checksum(content) };
}

export class StructuredLogger {
  private entries: StructuredLogEntry[] = [];
  private debugEnabled = false;

  constructor(private readonly capacity = 200, private readonly base: Pick<StructuredLogEntry, "pluginVersion" | "pluginCommit"> = {}) {}

  setDebug(enabled: boolean): void { this.debugEnabled = enabled; }
  isDebugEnabled(): boolean { return this.debugEnabled; }

  log(level: LogLevel, category: LogCategory, event: string, fields: Partial<StructuredLogEntry> = {}, error?: unknown): StructuredLogEntry {
    if ((level === "debug" || level === "trace") && !this.debugEnabled) return { timestamp: new Date().toISOString(), level, category, event, ...this.base, ...fields };
    const errorFields: Partial<StructuredLogEntry> = {};
    if (error instanceof Error) {
      errorFields.errorName = error.name;
      errorFields.errorMessage = error.message;
      if (error.stack) errorFields.stack = error.stack;
      if (error.cause !== undefined) errorFields.cause = error.cause instanceof Error ? `${error.cause.name}: ${error.cause.message}` : String(error.cause);
      const code = (error as Error & { code?: unknown }).code;
      if (typeof code === "string") errorFields.errorCode = code;
    } else if (error !== undefined) {
      errorFields.errorName = "UnknownError";
      errorFields.errorMessage = String(error);
    }
    const entry: StructuredLogEntry = { timestamp: new Date().toISOString(), level, category, event, ...this.base, ...fields, ...errorFields };
    this.entries.push(entry);
    if (this.entries.length > this.capacity) this.entries.splice(0, this.entries.length - this.capacity);
    const method = level === "error" ? console.error : level === "warn" ? console.warn : console.info;
    method(`[Task Copilot] ${event}`, entry);
    return entry;
  }

  snapshot(): StructuredLogEntry[] { return structuredClone(this.entries); }
  latestError(): StructuredLogEntry | undefined { return this.entries.slice().reverse().find((entry) => entry.level === "error"); }
  clear(): void { this.entries = []; }
  exportJsonl(): string { return this.entries.map((entry) => JSON.stringify(entry)).join("\n"); }
}
