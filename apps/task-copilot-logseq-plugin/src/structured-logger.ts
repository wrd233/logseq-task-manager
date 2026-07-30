import { checksum } from "@task-copilot/shared";

import { boundedMachineToken, privateErrorEvidence } from "./private-error-evidence.ts";

export type LogLevel = "error" | "warn" | "info" | "debug" | "trace";
export type LogCategory = "plugin-lifecycle" | "ui-action" | "capture" | "source-resolution" | "logseq-adapter" | "application-command" | "persistence" | "proposal" | "semantic-commit" | "query-refresh" | "runtime-shape" | "attention-shadow";

const LOG_LEVELS: readonly LogLevel[] = ["error", "warn", "info", "debug", "trace"];
const LOG_CATEGORIES: readonly LogCategory[] = [
  "plugin-lifecycle",
  "ui-action",
  "capture",
  "source-resolution",
  "logseq-adapter",
  "application-command",
  "persistence",
  "proposal",
  "semantic-commit",
  "query-refresh",
  "runtime-shape",
  "attention-shadow",
];

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
  attentionPilotShownCount?: number;
  attentionPilotActedCount?: number;
  attentionPilotLaterCount?: number;
  attentionPilotNotRelevantCount?: number;
  attentionPilotUnresolvedCount?: number;
  nowContinueCount?: number;
  nowReviewCount?: number;
  nowWaitingCount?: number;
  nowSuggestionCount?: number;
  nowSuppressedOpenCount?: number;
  nowReviewOverflowCount?: number;
  nowWaitingOverflowCount?: number;
  focusOverload?: boolean;
}

export function createCorrelationId(now = new Date()): string {
  const suffix = globalThis.crypto.randomUUID().replaceAll("-", "").slice(0, 8);
  return `TC-${now.toISOString().replace(/\D/g, "").slice(0, 14)}-${suffix}`;
}

export function privateContentEvidence(content: string): Pick<StructuredLogEntry, "contentLength" | "contentHash"> {
  return { contentLength: content.length, contentHash: checksum(content) };
}

const MACHINE_STRING_FIELDS = [
  "correlationId",
  "actionId",
  "captureId",
  "objectId",
  "proposalId",
  "commitId",
  "blockUuid",
  "pageRefShape",
  "command",
  "result",
  "errorCode",
  "pluginVersion",
  "pluginCommit",
  "logseqVersion",
  "graphIdentity",
  "contentHash",
] as const satisfies readonly (keyof StructuredLogEntry)[];

const COUNT_FIELDS = [
  "contentLength",
  "signalRawCount",
  "signalMergedCount",
  "signalCooledCount",
  "signalActiveCount",
  "signalInvalidatedCount",
  "attentionPilotShownCount",
  "attentionPilotActedCount",
  "attentionPilotLaterCount",
  "attentionPilotNotRelevantCount",
  "attentionPilotUnresolvedCount",
  "nowContinueCount",
  "nowReviewCount",
  "nowWaitingCount",
  "nowSuggestionCount",
  "nowSuppressedOpenCount",
  "nowReviewOverflowCount",
  "nowWaitingOverflowCount",
] as const satisfies readonly (keyof StructuredLogEntry)[];

function sanitizedFields(fields: Partial<StructuredLogEntry>): Partial<StructuredLogEntry> {
  const input = fields as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of MACHINE_STRING_FIELDS) {
    const value = boundedMachineToken(input[key]);
    if (value !== undefined) result[key] = value;
  }
  for (const key of COUNT_FIELDS) {
    const value = input[key];
    if (Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 10_000_000) {
      result[key] = Number(value);
    }
  }
  const durationMs = input.durationMs;
  if (Number.isFinite(durationMs) && Number(durationMs) >= 0 && Number(durationMs) <= 3_600_000) {
    result.durationMs = Number(durationMs);
  }
  if (typeof input.focusOverload === "boolean") result.focusOverload = input.focusOverload;
  return result as Partial<StructuredLogEntry>;
}

export class StructuredLogger {
  private entries: StructuredLogEntry[] = [];
  private debugEnabled = false;

  constructor(private readonly capacity = 200, private readonly base: Pick<StructuredLogEntry, "pluginVersion" | "pluginCommit"> = {}) {
    if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 4096) {
      throw new Error("Structured logger capacity must be between 1 and 4096.");
    }
  }

  setDebug(enabled: boolean): void { this.debugEnabled = enabled; }
  isDebugEnabled(): boolean { return this.debugEnabled; }

  log(level: LogLevel, category: LogCategory, event: string, fields: Partial<StructuredLogEntry> = {}, error?: unknown): StructuredLogEntry {
    const timestamp = new Date().toISOString();
    const safeLevel = LOG_LEVELS.includes(level) ? level : "warn";
    const safeCategory = LOG_CATEGORIES.includes(category) ? category : "plugin-lifecycle";
    const safeEvent = boundedMachineToken(event) ?? "invalid_event";
    const safeBase = sanitizedFields(this.base);
    const safeFields = sanitizedFields(fields);
    const errorFields = error === undefined
      ? {}
      : (() => {
          const evidence = privateErrorEvidence(error);
          return {
            ...evidence,
            errorCode: evidence.errorCode === "UNCLASSIFIED_ERROR" && safeFields.errorCode
              ? safeFields.errorCode
              : evidence.errorCode,
          };
        })();
    const entry: StructuredLogEntry = {
      timestamp,
      level: safeLevel,
      category: safeCategory,
      event: safeEvent,
      ...safeBase,
      ...safeFields,
      ...errorFields,
    };
    if ((safeLevel === "debug" || safeLevel === "trace") && !this.debugEnabled) return entry;
    this.entries.push(entry);
    if (this.entries.length > this.capacity) this.entries.splice(0, this.entries.length - this.capacity);
    const method = safeLevel === "error" ? console.error : safeLevel === "warn" ? console.warn : console.info;
    method(`[Task Copilot] ${safeEvent}`, entry);
    return entry;
  }

  snapshot(): StructuredLogEntry[] { return structuredClone(this.entries); }
  latestError(): StructuredLogEntry | undefined { return this.entries.slice().reverse().find((entry) => entry.level === "error"); }
  clear(): void { this.entries = []; }
  exportJsonl(): string { return this.entries.map((entry) => JSON.stringify(entry)).join("\n"); }
}
