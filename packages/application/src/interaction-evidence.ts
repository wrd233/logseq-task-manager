export type InteractionEvidenceScene =
  | "ATTENTION_SHADOW"
  | "CONTEXT_RECOVERY"
  | "NOW"
  | "PROJECT_REENTRY"
  | "PROPOSAL_REVIEW"
  | "STATUS_NARRATION"
  | "SYSTEM";

export type InteractionEvidenceOutcome =
  | "GENERATED"
  | "REJECTED"
  | "ACCEPTED"
  | "ADJUSTED"
  | "DISMISSED"
  | "COMMITTED"
  | "UNDONE"
  | "STALE"
  | "CONFLICT"
  | "ERROR";

export interface InteractionEvidenceEntry {
  timestamp: string;
  scene: InteractionEvidenceScene;
  outcome: InteractionEvidenceOutcome;
  objectType?: "TASK" | "MINI_PROJECT" | "PROJECT" | "AREA" | "DECISION" | "OUTPUT";
  signal?: {
    type: string;
    version: string;
  };
  rule?: {
    id: string;
    version: string;
  };
  skill?: {
    name: string;
    version: string;
  };
  promptVersion?: string;
  model?: string;
  evidence?: {
    scopeHash: string;
    factCount: number;
    inferenceCount: number;
    unknownCount: number;
    suggestedChangeCount: number;
    evidenceRefCount: number;
    nextActionEligible: boolean;
  };
  userDisposition?: "HELPFUL" | "NOT_NEEDED" | "INACCURATE" | "TOO_MUCH" | "DO_NOT_REPEAT";
  failureCode?: string;
  elapsedMs?: number;
}

export interface InteractionEvidenceVersionSummary {
  versionKey: string;
  total: number;
  generated: number;
  rejected: number;
  errors: number;
  rated: number;
  helpful: number;
  noise: number;
  doNotRepeat: number;
  helpfulRate: number | null;
  noiseRate: number | null;
}

export interface InteractionEvidenceSummary {
  total: number;
  outcomes: Record<InteractionEvidenceOutcome, number>;
  dispositions: Record<NonNullable<InteractionEvidenceEntry["userDisposition"]>, number>;
  rated: number;
  helpfulRate: number | null;
  noiseRate: number | null;
  versions: InteractionEvidenceVersionSummary[];
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Interaction evidence ${name} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], name: string): void {
  const unsupported = Object.keys(value).find((key) => !allowed.includes(key));
  if (unsupported) throw new Error(`Interaction evidence ${name} contains unsupported field ${unsupported}.`);
}

function machineToken(value: unknown, name: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/.test(value)) {
    throw new Error(`Interaction evidence ${name} must be a bounded machine token.`);
  }
  return value;
}

function count(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > 10_000) {
    throw new Error(`Interaction evidence ${name} must be an integer between 0 and 10000.`);
  }
  return Number(value);
}

function versioned(value: unknown, name: string, keys: readonly [string, string]): Record<string, string> {
  const input = record(value, name);
  exactKeys(input, keys, name);
  return {
    [keys[0]]: machineToken(input[keys[0]], `${name}.${keys[0]}`),
    [keys[1]]: machineToken(input[keys[1]], `${name}.${keys[1]}`),
  };
}

function parseEntry(value: unknown): InteractionEvidenceEntry {
  const input = record(value, "entry");
  exactKeys(input, [
    "timestamp",
    "scene",
    "outcome",
    "objectType",
    "signal",
    "rule",
    "skill",
    "promptVersion",
    "model",
    "evidence",
    "userDisposition",
    "failureCode",
    "elapsedMs",
  ], "entry");
  if (typeof input.timestamp !== "string" || !Number.isFinite(Date.parse(input.timestamp))) {
    throw new Error("Interaction evidence timestamp must be valid.");
  }
  const scenes: InteractionEvidenceScene[] = [
    "ATTENTION_SHADOW",
    "CONTEXT_RECOVERY",
    "NOW",
    "PROJECT_REENTRY",
    "PROPOSAL_REVIEW",
    "STATUS_NARRATION",
    "SYSTEM",
  ];
  const outcomes: InteractionEvidenceOutcome[] = [
    "GENERATED",
    "REJECTED",
    "ACCEPTED",
    "ADJUSTED",
    "DISMISSED",
    "COMMITTED",
    "UNDONE",
    "STALE",
    "CONFLICT",
    "ERROR",
  ];
  if (!scenes.includes(input.scene as InteractionEvidenceScene)) throw new Error("Interaction evidence scene is invalid.");
  if (!outcomes.includes(input.outcome as InteractionEvidenceOutcome)) throw new Error("Interaction evidence outcome is invalid.");
  const objectTypes = ["TASK", "MINI_PROJECT", "PROJECT", "AREA", "DECISION", "OUTPUT"];
  if (input.objectType !== undefined && !objectTypes.includes(String(input.objectType))) {
    throw new Error("Interaction evidence objectType is invalid.");
  }
  const dispositions = ["HELPFUL", "NOT_NEEDED", "INACCURATE", "TOO_MUCH", "DO_NOT_REPEAT"];
  if (input.userDisposition !== undefined && !dispositions.includes(String(input.userDisposition))) {
    throw new Error("Interaction evidence userDisposition is invalid.");
  }
  let evidence: InteractionEvidenceEntry["evidence"];
  if (input.evidence !== undefined) {
    const rawEvidence = record(input.evidence, "evidence");
    exactKeys(rawEvidence, [
      "scopeHash",
      "factCount",
      "inferenceCount",
      "unknownCount",
      "suggestedChangeCount",
      "evidenceRefCount",
      "nextActionEligible",
    ], "evidence");
    if (typeof rawEvidence.scopeHash !== "string" || !/^[0-9a-f]{8,64}$/.test(rawEvidence.scopeHash)) {
      throw new Error("Interaction evidence scopeHash is invalid.");
    }
    if (typeof rawEvidence.nextActionEligible !== "boolean") {
      throw new Error("Interaction evidence nextActionEligible must be boolean.");
    }
    evidence = {
      scopeHash: rawEvidence.scopeHash,
      factCount: count(rawEvidence.factCount, "factCount"),
      inferenceCount: count(rawEvidence.inferenceCount, "inferenceCount"),
      unknownCount: count(rawEvidence.unknownCount, "unknownCount"),
      suggestedChangeCount: count(rawEvidence.suggestedChangeCount, "suggestedChangeCount"),
      evidenceRefCount: count(rawEvidence.evidenceRefCount, "evidenceRefCount"),
      nextActionEligible: rawEvidence.nextActionEligible,
    };
  }
  if (
    input.elapsedMs !== undefined
    && (!Number.isFinite(input.elapsedMs) || Number(input.elapsedMs) < 0 || Number(input.elapsedMs) > 3_600_000)
  ) {
    throw new Error("Interaction evidence elapsedMs is invalid.");
  }
  const objectType = input.objectType as NonNullable<InteractionEvidenceEntry["objectType"]> | undefined;
  const userDisposition = input.userDisposition as NonNullable<InteractionEvidenceEntry["userDisposition"]> | undefined;
  return {
    timestamp: input.timestamp,
    scene: input.scene as InteractionEvidenceScene,
    outcome: input.outcome as InteractionEvidenceOutcome,
    ...(objectType === undefined ? {} : { objectType }),
    ...(input.signal === undefined ? {} : { signal: versioned(input.signal, "signal", ["type", "version"]) as { type: string; version: string } }),
    ...(input.rule === undefined ? {} : { rule: versioned(input.rule, "rule", ["id", "version"]) as { id: string; version: string } }),
    ...(input.skill === undefined ? {} : { skill: versioned(input.skill, "skill", ["name", "version"]) as { name: string; version: string } }),
    ...(input.promptVersion === undefined ? {} : { promptVersion: machineToken(input.promptVersion, "promptVersion") }),
    ...(input.model === undefined ? {} : { model: machineToken(input.model, "model") }),
    ...(evidence === undefined ? {} : { evidence }),
    ...(userDisposition === undefined ? {} : { userDisposition }),
    ...(input.failureCode === undefined ? {} : { failureCode: machineToken(input.failureCode, "failureCode") }),
    ...(input.elapsedMs === undefined ? {} : { elapsedMs: Number(input.elapsedMs) }),
  };
}

function versionKey(entry: InteractionEvidenceEntry): string {
  return [
    entry.skill ? `${entry.skill.name}@${entry.skill.version}` : "skill:none",
    entry.promptVersion ? `prompt:${entry.promptVersion}` : "prompt:none",
    entry.model ? `model:${entry.model}` : "model:none",
  ].join("|");
}

function rate(value: number, total: number): number | null {
  return total === 0 ? null : Number((value / total).toFixed(4));
}

function summarize(entries: readonly InteractionEvidenceEntry[]): InteractionEvidenceSummary {
  const outcomes: InteractionEvidenceSummary["outcomes"] = {
    GENERATED: 0,
    REJECTED: 0,
    ACCEPTED: 0,
    ADJUSTED: 0,
    DISMISSED: 0,
    COMMITTED: 0,
    UNDONE: 0,
    STALE: 0,
    CONFLICT: 0,
    ERROR: 0,
  };
  const dispositions: InteractionEvidenceSummary["dispositions"] = {
    HELPFUL: 0,
    NOT_NEEDED: 0,
    INACCURATE: 0,
    TOO_MUCH: 0,
    DO_NOT_REPEAT: 0,
  };
  const groups = new Map<string, Omit<InteractionEvidenceVersionSummary, "helpfulRate" | "noiseRate">>();
  for (const entry of entries) {
    outcomes[entry.outcome] += 1;
    if (entry.userDisposition) dispositions[entry.userDisposition] += 1;
    const key = versionKey(entry);
    const group = groups.get(key) ?? {
      versionKey: key,
      total: 0,
      generated: 0,
      rejected: 0,
      errors: 0,
      rated: 0,
      helpful: 0,
      noise: 0,
      doNotRepeat: 0,
    };
    group.total += 1;
    if (entry.outcome === "GENERATED") group.generated += 1;
    if (entry.outcome === "REJECTED") group.rejected += 1;
    if (entry.outcome === "ERROR") group.errors += 1;
    if (entry.userDisposition) {
      group.rated += 1;
      if (entry.userDisposition === "HELPFUL") group.helpful += 1;
      else group.noise += 1;
      if (entry.userDisposition === "DO_NOT_REPEAT") group.doNotRepeat += 1;
    }
    groups.set(key, group);
  }
  const rated = Object.values(dispositions).reduce((sum, value) => sum + value, 0);
  const helpful = dispositions.HELPFUL;
  const noise = rated - helpful;
  return {
    total: entries.length,
    outcomes,
    dispositions,
    rated,
    helpfulRate: rate(helpful, rated),
    noiseRate: rate(noise, rated),
    versions: [...groups.values()]
      .map((group) => ({
        ...group,
        helpfulRate: rate(group.helpful, group.rated),
        noiseRate: rate(group.noise, group.rated),
      }))
      .sort((left, right) => left.versionKey.localeCompare(right.versionKey)),
  };
}

export class InteractionEvidenceBuffer {
  private readonly entries: InteractionEvidenceEntry[] = [];

  constructor(private readonly capacity = 500) {
    if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 4096) {
      throw new Error("Interaction evidence capacity must be between 1 and 4096.");
    }
  }

  record(value: unknown): InteractionEvidenceEntry {
    const entry = parseEntry(value);
    this.entries.push(entry);
    if (this.entries.length > this.capacity) this.entries.splice(0, this.entries.length - this.capacity);
    return structuredClone(entry);
  }

  snapshot(): InteractionEvidenceEntry[] {
    return structuredClone(this.entries);
  }

  exportJsonl(): string {
    return this.entries.map((entry) => JSON.stringify(entry)).join("\n");
  }

  summary(): InteractionEvidenceSummary {
    return structuredClone(summarize(this.entries));
  }

  clear(): void {
    this.entries.length = 0;
  }
}
