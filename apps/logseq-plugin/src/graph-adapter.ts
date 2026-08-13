import { canonicalizeGraphContent, deterministicUuid, graphEvidenceProofPayload, stableHash, type GraphAdapter, type GraphApplyResult, type GraphEffect, type GraphSnapshot, type ManagedProjection, type TrustedGraphEvidenceMaterial } from "@task-copilot/contracts";

export interface LogseqGraphHost {
  getBlock(uuid: string, options?: { includeChildren: boolean }): Promise<unknown>;
  insertBlock(target: string, content: string, options: { sibling: boolean; before?: boolean; customUUID: string }): Promise<unknown>;
  updateBlock(uuid: string, content: string): Promise<unknown>;
  removeBlock(uuid: string): Promise<unknown>;
}

interface Block { uuid: string; content: string; rawContent: string; properties: Record<string, unknown>; children: Block[] }
const containerContent = (focusUuid: string, waitingUuid: string) => `> [Task Copilot]\ntask-copilot-managed:: true\ntask-copilot-focus-uuid:: ${focusUuid}\ntask-copilot-waiting-uuid:: ${waitingUuid}`;

function semanticContent(content: string): string {
  return canonicalizeGraphContent(content);
}

function waitingContent(condition: NonNullable<ManagedProjection["waitingCondition"]>): string {
  return [
    `等待：${condition.description}`,
    `task-copilot-waiting-subject:: ${condition.workObjectId}`,
    `task-copilot-waiting-since:: ${condition.since}`,
    ...(condition.reviewAt ? [`复查：${condition.reviewAt}`] : []),
    `task-copilot-waiting-evidence:: ${JSON.stringify(condition.evidenceIds)}`,
  ].join("\n");
}

function closureContent(closure: ManagedProjection["closure"]): string[] {
  if (!closure) return [];
  return [closure.type === "COMPLETED" ? `完成：${closure.outcomeSummary}` : `取消：${closure.reason}`, `task-copilot-closure:: ${JSON.stringify(closure)}`];
}

function stateContent(lifecycle: ManagedProjection["lifecycle"], engagementValue: ManagedProjection["engagement"], condition: ManagedProjection["waitingCondition"], closure: ManagedProjection["closure"] = null): string {
  return [`状态：${lifecycle} · ${engagementValue ?? "null"}`, ...(condition ? waitingContent(condition).split("\n") : []), ...closureContent(closure)].join("\n");
}

function propertyValue(blockValue: Block, name: string): string | null {
  const raw = Object.entries(blockValue.properties).find(([key]) => key.toLocaleLowerCase() === name.toLocaleLowerCase())?.[1];
  return typeof raw === "string" ? raw.trim() : raw === undefined || raw === null ? null : JSON.stringify(raw);
}

function waitingCondition(blockValue: Block, workObjectId: string): ManagedProjection["waitingCondition"] {
  const content = blockValue.content;
  const lines = content.split("\n");
  const subjectPrefix = "task-copilot-waiting-subject:: ";
  const sincePrefix = "task-copilot-waiting-since:: ";
  const evidencePrefix = "task-copilot-waiting-evidence:: ";
  const lineWith = (prefix: string) => lines.find((line) => line.trimStart().toLocaleLowerCase().startsWith(prefix.toLocaleLowerCase()))?.trimStart();
  const description = lineWith("等待：")?.slice(3).trim();
  const subject = lineWith(subjectPrefix)?.slice(subjectPrefix.length).trim() || propertyValue(blockValue, "task-copilot-waiting-subject") || workObjectId;
  const since = lineWith(sincePrefix)?.slice(sincePrefix.length).trim() || propertyValue(blockValue, "task-copilot-waiting-since");
  const reviewAt = lineWith("复查：")?.slice(3).trim() || null;
  const evidenceRaw = lineWith(evidencePrefix)?.slice(evidencePrefix.length).trim() || propertyValue(blockValue, "task-copilot-waiting-evidence");
  if (!subject || !description || !since || !evidenceRaw) throw new Error("GRAPH_WAITING_CONDITION_INVALID");
  const evidenceIds = JSON.parse(evidenceRaw) as unknown;
  if (!Array.isArray(evidenceIds) || evidenceIds.some((id) => typeof id !== "string")) throw new Error("GRAPH_WAITING_CONDITION_INVALID");
  return { workObjectId: subject, description, since, reviewAt, evidenceIds };
}

function semanticLine(content: string, prefix: string): string | null {
  return content.split("\n").map((line) => line.trimStart()).find((line) => line.toLocaleLowerCase().startsWith(prefix.toLocaleLowerCase())) ?? null;
}

function stateOwnedExactly(blockValue: Block, waiting: ManagedProjection["waitingCondition"], closure: ManagedProjection["closure"]): boolean {
  const categories = blockValue.content.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    const lower = line.toLocaleLowerCase();
    if (lower.startsWith("状态：")) return "state";
    if (lower.startsWith("等待：")) return "description";
    if (lower.startsWith("复查：")) return "review";
    if (lower.startsWith("task-copilot-waiting-subject::")) return "subject";
    if (lower.startsWith("task-copilot-waiting-since::")) return "since";
    if (lower.startsWith("task-copilot-waiting-evidence::")) return "evidence";
    if (lower.startsWith("完成：")) return "completion";
    if (lower.startsWith("取消：")) return "cancellation";
    if (lower.startsWith("task-copilot-closure::")) return "closure";
    return null;
  });
  if (categories.some((category) => category === null) || new Set(categories).size !== categories.length) return false;
  // Logseq may omit property lines from `content` and expose them only through
  // `properties`; the human-readable closure line remains part of owned text.
  const expectedRequired: Array<Exclude<(typeof categories)[number], null>> = waiting ? ["state", "description"] : closure ? ["state", closure.type === "COMPLETED" ? "completion" : "cancellation"] : ["state"];
  if (!expectedRequired.every((category) => categories.includes(category))) return false;
  return waiting || closure ? true : categories.length === 1;
}

function object(value: unknown): Record<string, unknown> | null { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function block(value: unknown): Block | null {
  let candidate = object(value);
  if (!candidate && Array.isArray(value)) candidate = object(value.find((item) => object(item)?.uuid));
  if (!candidate || typeof candidate.uuid !== "string" || typeof candidate.content !== "string") return null;
  return { uuid: candidate.uuid, content: semanticContent(candidate.content), rawContent: candidate.content, properties: object(candidate.properties) ?? {}, children: Array.isArray(candidate.children) ? candidate.children.map(block).filter((item): item is Block => item !== null) : [] };
}

function engagement(value: string): ManagedProjection["engagement"] {
  if (value === "ACTIONABLE" || value === "WAITING" || value === "PARKED") return value;
  if (value === "null") return null;
  throw new Error("GRAPH_PROJECTION_STATE_INVALID");
}

function projectionFromContainer(container: Block): ManagedProjection {
  const title = container.children.find((child) => semanticLine(child.content, "标题："));
  const state = container.children.find((child) => semanticLine(child.content, "状态："));
  const focus = container.children.find((child) => semanticLine(child.content, "当前推进："));
  const identity = /^> \[Task Copilot\]\ntask-copilot-managed:: true\ntask-copilot-focus-uuid:: ([0-9a-f-]+)(?:\ntask-copilot-waiting-uuid:: ([0-9a-f-]+))?$/u.exec(container.content);
  const declaredFocusUuid = identity?.[1];
  const declaredWaitingUuid = identity?.[2];
  const legacyWaiting = container.children.find((child) => child.uuid === declaredWaitingUuid && semanticLine(child.content, "等待："));
  if (!title || !state) throw new Error("GRAPH_PROJECTION_INCOMPLETE");
  const legacy = container.content === "> [Task Copilot]\ntask-copilot-managed:: true";
  const focusUuid = declaredFocusUuid ?? (legacy ? deterministicUuid(`focus:${container.uuid}`) : null);
  const waitingUuid = declaredWaitingUuid ?? (legacy || declaredFocusUuid ? deterministicUuid(`waiting:${container.uuid}`) : null);
  if (!focusUuid || !waitingUuid || (focus && focus.uuid !== focusUuid) || (legacyWaiting && legacyWaiting.uuid !== waitingUuid)) throw new Error("GRAPH_PROJECTION_FIELD_IDENTITY_INVALID");
  const stateLine = semanticLine(state.content, "状态：");
  const match = /^状态：(OPEN|COMPLETED|CANCELLED) · (ACTIONABLE|WAITING|PARKED|null)$/u.exec(stateLine ?? "");
  if (!match) throw new Error("GRAPH_PROJECTION_STATE_INVALID");
  const engagementValue = engagement(match[2]!);
  const embeddedWaiting = state.content.includes("task-copilot-waiting-subject::") || state.content.split("\n").some((line) => line.trimStart().startsWith("等待："));
  const waitingConditionValue = embeddedWaiting || propertyValue(state, "task-copilot-waiting-subject") ? waitingCondition(state, "") : legacyWaiting ? waitingCondition(legacyWaiting, "") : null;
  const closureRaw = semanticLine(state.content, "task-copilot-closure:: ")?.slice("task-copilot-closure:: ".length) || propertyValue(state, "task-copilot-closure");
  const closure = closureRaw ? JSON.parse(closureRaw) as NonNullable<ManagedProjection["closure"]> : null;
  const coreBase = { containerUuid: container.uuid, titleUuid: title.uuid, stateUuid: state.uuid, focusUuid, waitingUuid, title: semanticLine(title.content, "标题：")!.slice(3), lifecycle: match[1] as ManagedProjection["lifecycle"], engagement: engagementValue, waitingCondition: waitingConditionValue, currentFocus: focus ? semanticLine(focus.content, "当前推进：")!.slice(5) || null : null };
  const core = closure ? { ...coreBase, closure } : coreBase;
  if ((engagementValue === "WAITING") !== Boolean(waitingConditionValue)) throw new Error("GRAPH_WAITING_INVARIANT_INVALID");
  if ((match[1] === "OPEN") === Boolean(closure)) throw new Error("GRAPH_CLOSURE_INVARIANT_INVALID");
  const ownedExactly = (container.content === containerContent(focusUuid, waitingUuid) || legacy || Boolean(declaredFocusUuid)) && stateOwnedExactly(state, waitingConditionValue, closure) && container.children.length === 2 + (focus ? 1 : 0) + (legacyWaiting ? 1 : 0);
  return { ...core, projectionHash: ownedExactly ? stableHash(core) : stableHash({ core, actual: container }) };
}

export class LogseqGraphAdapter implements GraphAdapter {
  readonly #host: LogseqGraphHost;
  readonly #graphId: string;
  readonly #now: () => string;
  constructor(host: LogseqGraphHost, graphId: string, now: () => string = () => new Date().toISOString()) { this.#host = host; this.#graphId = graphId; this.#now = now; }

  async #required(uuid: string, includeChildren: boolean): Promise<Block> {
    const value = block(await this.#host.getBlock(uuid, { includeChildren }));
    if (!value) throw new Error(`LOGSEQ_BLOCK_NOT_FOUND:${uuid}`);
    return value;
  }

  async readGraphSnapshot(input: { graphId: string; sourceBlockUuid: string }): Promise<GraphSnapshot> {
    if (input.graphId !== this.#graphId) throw new Error("GRAPH_ID_MISMATCH");
    const source = await this.#required(input.sourceBlockUuid, true);
    const managedRef = source.children.find((child) => child.content.includes("task-copilot-managed:: true"));
    const managed = managedRef ? await this.#required(managedRef.uuid, true) : null;
    const marker = /^(TODO|DONE|DOING|NOW|LATER|CANCELED|CANCELLED)\s+/u.exec(source.content)?.[1] as GraphSnapshot["sourceMarker"] | undefined;
    return { graphId: this.#graphId, sourceBlockUuid: source.uuid, sourceContentHash: stableHash(source.content), sourceMarker: marker ?? null, projection: managed ? projectionFromContainer(managed) : null };
  }

  async readEvidenceMaterial(input: { graphId: string; blockUuid: string }, proofKey: string): Promise<TrustedGraphEvidenceMaterial> {
    if (input.graphId !== this.#graphId) throw new Error("GRAPH_ID_MISMATCH");
    const source = await this.#required(input.blockUuid, false);
    const material = { graphId: this.#graphId, blockUuid: source.uuid, content: source.content, sourceContentHash: stableHash(source.content) };
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(proofKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const proof = Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(graphEvidenceProofPayload(material))))).map((value) => value.toString(16).padStart(2, "0")).join("");
    return { ...material, proof };
  }

  async #ensureBlock(target: string, uuid: string, content: string, options: { sibling: boolean; before?: boolean }): Promise<void> {
    const existing = block(await this.#host.getBlock(uuid, { includeChildren: false }));
    if (existing) {
      if (existing.content !== content) throw new Error(`GRAPH_MANAGED_BLOCK_CHANGED:${uuid}`);
      return;
    }
    const created = block(await this.#host.insertBlock(target, content, { ...options, customUUID: uuid }));
    if (!created || created.uuid !== uuid) throw new Error(`GRAPH_CUSTOM_UUID_UNVERIFIED:${uuid}`);
  }

  async applyGraphEffect(effect: GraphEffect): Promise<GraphApplyResult> {
    if (effect.graphId !== this.#graphId) throw new Error("GRAPH_ID_MISMATCH");
    if (effect.type === "UPSERT_MANAGED_PROJECTION") {
      const projection = effect.projection;
      await this.#ensureBlock(effect.sourceBlockUuid, projection.containerUuid, containerContent(projection.focusUuid, projection.waitingUuid), { sibling: false });
      await this.#ensureBlock(projection.containerUuid, projection.titleUuid, `标题：${projection.title}`, { sibling: false, before: true });
      await this.#ensureBlock(projection.titleUuid, projection.stateUuid, stateContent(projection.lifecycle, projection.engagement, projection.waitingCondition, projection.closure), { sibling: true });
      if (projection.currentFocus) await this.#ensureBlock(projection.stateUuid, projection.focusUuid, `当前推进：${projection.currentFocus}`, { sibling: true });
    } else if (effect.type === "UPDATE_MANAGED_FIELD") {
      const before = await this.readGraphSnapshot({ graphId: effect.graphId, sourceBlockUuid: effect.sourceBlockUuid });
      if (!before.projection || before.projection.projectionHash !== effect.expectedProjectionHash) throw new Error("GRAPH_UPDATE_PRECONDITION_FAILED");
      const existing = await this.#required(effect.fieldUuid, false);
      if (!existing.content.startsWith("标题：")) throw new Error("GRAPH_MANAGED_FIELD_CHANGED");
      await this.#host.updateBlock(effect.fieldUuid, effect.content);
    } else if (effect.type === "SET_CURRENT_FOCUS_FIELD") {
      const before = await this.readGraphSnapshot({ graphId: effect.graphId, sourceBlockUuid: effect.sourceBlockUuid });
      if (!before.projection || before.projection.containerUuid !== effect.containerUuid || before.projection.focusUuid !== effect.fieldUuid || before.projection.projectionHash !== effect.expectedProjectionHash) throw new Error("GRAPH_FOCUS_PRECONDITION_FAILED");
      const existing = block(await this.#host.getBlock(effect.fieldUuid, { includeChildren: false }));
      if (effect.content === null) {
        if (existing) {
          if (!existing.content.startsWith("当前推进：")) throw new Error("GRAPH_MANAGED_FIELD_CHANGED");
          await this.#host.removeBlock(effect.fieldUuid);
        }
      } else if (existing) {
        if (!existing.content.startsWith("当前推进：")) throw new Error("GRAPH_MANAGED_FIELD_CHANGED");
        await this.#host.updateBlock(effect.fieldUuid, `当前推进：${effect.content}`);
      } else {
        await this.#ensureBlock(before.projection.stateUuid, effect.fieldUuid, `当前推进：${effect.content}`, { sibling: true });
      }
    } else if (effect.type === "CHANGE_ENGAGEMENT_FIELDS") {
      const before = await this.readGraphSnapshot({ graphId: effect.graphId, sourceBlockUuid: effect.sourceBlockUuid });
      if (before.projection?.projectionHash === effect.resultingProjectionHash) return { commitId: effect.commitId, effectId: effect.effectId, effectType: effect.type, graphId: effect.graphId, sourceBlockUuid: effect.sourceBlockUuid, projectionHash: effect.resultingProjectionHash, appliedAt: this.#now() };
      if (!before.projection || before.projection.containerUuid !== effect.containerUuid || before.projection.stateUuid !== effect.stateUuid || before.projection.waitingUuid !== effect.waitingUuid || before.projection.projectionHash !== effect.expectedProjectionHash) throw new Error("GRAPH_ENGAGEMENT_PRECONDITION_FAILED");
      await this.#host.updateBlock(effect.stateUuid, stateContent("OPEN", effect.engagement, effect.waiting));
    } else if (effect.type === "CHANGE_CLOSURE_FIELDS") {
      const before = await this.readGraphSnapshot({ graphId: effect.graphId, sourceBlockUuid: effect.sourceBlockUuid });
      if (before.projection?.projectionHash === effect.resultingProjectionHash && (before.sourceMarker ?? null) === (effect.resultingSourceMarker ?? null)) return { commitId: effect.commitId, effectId: effect.effectId, effectType: effect.type, graphId: effect.graphId, sourceBlockUuid: effect.sourceBlockUuid, projectionHash: effect.resultingProjectionHash, appliedAt: this.#now() };
      if (!before.projection || before.projection.containerUuid !== effect.containerUuid || before.projection.stateUuid !== effect.stateUuid || before.projection.focusUuid !== effect.focusUuid) throw new Error("GRAPH_CLOSURE_PRECONDITION_FAILED");
      const projectionMatches = (value: ManagedProjection, expected: ManagedProjection) => value.title === expected.title && value.containerUuid === expected.containerUuid && value.titleUuid === expected.titleUuid && value.stateUuid === expected.stateUuid && value.focusUuid === expected.focusUuid && value.waitingUuid === expected.waitingUuid;
      if (!projectionMatches(before.projection, effect.expectedProjection)) throw new Error("GRAPH_CLOSURE_PRECONDITION_FAILED");
      const markerState = before.sourceMarker ?? null; if (markerState !== (effect.expectedSourceMarker ?? null) && markerState !== (effect.resultingSourceMarker ?? null)) throw new Error("GRAPH_CLOSURE_PRECONDITION_FAILED");
      const projectionState = before.projection.projectionHash === effect.expectedProjectionHash ? "before" : before.projection.projectionHash === effect.resultingProjectionHash ? "after" : "partial";
      if (projectionState === "partial") {
        const allowedPartial = before.projection.lifecycle === effect.lifecycle && before.projection.engagement === effect.engagement && JSON.stringify(before.projection.waitingCondition) === JSON.stringify(effect.waitingCondition) && JSON.stringify(before.projection.closure ?? null) === JSON.stringify(effect.closure) && (before.projection.currentFocus === effect.expectedProjection.currentFocus || before.projection.currentFocus === effect.currentFocus);
        if (!allowedPartial) throw new Error("GRAPH_CLOSURE_PRECONDITION_FAILED");
      }
      const source = await this.#required(effect.sourceBlockUuid, false);
      const freshMarker = (/^(TODO|DONE|DOING|NOW|LATER|CANCELED|CANCELLED)\s+/u.exec(source.content)?.[1] ?? null) as GraphSnapshot["sourceMarker"];
      if (freshMarker !== (effect.expectedSourceMarker ?? null) && freshMarker !== (effect.resultingSourceMarker ?? null)) throw new Error("GRAPH_CLOSURE_PRECONDITION_FAILED");
      if (freshMarker !== (effect.resultingSourceMarker ?? null) && effect.resultingSourceMarker !== effect.expectedSourceMarker) {
        const natural = source.rawContent.replace(/^(TODO|DONE|DOING|NOW|LATER|CANCELED|CANCELLED)\s+/u, "");
        if (!effect.resultingSourceMarker) throw new Error("GRAPH_MARKER_REMOVAL_UNSUPPORTED");
        await this.#host.updateBlock(effect.sourceBlockUuid, `${effect.resultingSourceMarker} ${natural}`);
      }
      // Every physical write is preceded by a fresh semantic read. This cannot
      // turn Logseq's non-CAS SDK into a database transaction, but it prevents a
      // marker-side event or user edit from being overwritten by the next write.
      const afterMarker = await this.readGraphSnapshot({ graphId: effect.graphId, sourceBlockUuid: effect.sourceBlockUuid });
      if (!afterMarker.projection || !projectionMatches(afterMarker.projection, effect.expectedProjection)) throw new Error("GRAPH_CLOSURE_PRECONDITION_FAILED");
      const stateStillBefore = afterMarker.projection.projectionHash === effect.expectedProjectionHash;
      const stateAlreadyAfter = afterMarker.projection.lifecycle === effect.lifecycle && afterMarker.projection.engagement === effect.engagement && JSON.stringify(afterMarker.projection.waitingCondition) === JSON.stringify(effect.waitingCondition) && JSON.stringify(afterMarker.projection.closure ?? null) === JSON.stringify(effect.closure);
      if (!stateStillBefore && !stateAlreadyAfter) throw new Error("GRAPH_CLOSURE_PRECONDITION_FAILED");
      if (!stateAlreadyAfter) await this.#host.updateBlock(effect.stateUuid, stateContent(effect.lifecycle, effect.engagement, effect.waitingCondition, effect.closure));
      let beforeFocus = await this.readGraphSnapshot({ graphId: effect.graphId, sourceBlockUuid: effect.sourceBlockUuid });
      // Logseq's updateBlock promise can resolve before DB reads expose the new
      // value. Retry only while the exact pre-write semantic hash is visible;
      // any different hash is treated as a real concurrent edit and fails closed.
      for (let attempt = 0; attempt < 20 && beforeFocus.projection?.projectionHash === effect.expectedProjectionHash; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 25));
        beforeFocus = await this.readGraphSnapshot({ graphId: effect.graphId, sourceBlockUuid: effect.sourceBlockUuid });
      }
      if (!beforeFocus.projection) throw new Error("GRAPH_CLOSURE_PRECONDITION_FAILED:BEFORE_FOCUS_MISSING");
      if (!projectionMatches(beforeFocus.projection, effect.expectedProjection)) throw new Error("GRAPH_CLOSURE_PRECONDITION_FAILED:BEFORE_FOCUS_IDENTITY");
      if (beforeFocus.projection.lifecycle !== effect.lifecycle) throw new Error("GRAPH_CLOSURE_PRECONDITION_FAILED:BEFORE_FOCUS_LIFECYCLE");
      if (beforeFocus.projection.engagement !== effect.engagement) throw new Error("GRAPH_CLOSURE_PRECONDITION_FAILED:BEFORE_FOCUS_ENGAGEMENT");
      if (JSON.stringify(beforeFocus.projection.waitingCondition) !== JSON.stringify(effect.waitingCondition)) throw new Error("GRAPH_CLOSURE_PRECONDITION_FAILED:BEFORE_FOCUS_WAITING");
      if (JSON.stringify(beforeFocus.projection.closure ?? null) !== JSON.stringify(effect.closure)) throw new Error("GRAPH_CLOSURE_PRECONDITION_FAILED:BEFORE_FOCUS_CLOSURE");
      if (beforeFocus.projection.currentFocus !== effect.expectedProjection.currentFocus && beforeFocus.projection.currentFocus !== effect.currentFocus) throw new Error("GRAPH_CLOSURE_PRECONDITION_FAILED:BEFORE_FOCUS_VALUE");
      const focus = block(await this.#host.getBlock(effect.focusUuid, { includeChildren: false }));
      const expectedFocusContent = beforeFocus.projection.currentFocus === null ? null : `当前推进：${beforeFocus.projection.currentFocus}`;
      if ((focus?.content ?? null) !== expectedFocusContent) throw new Error("GRAPH_CLOSURE_PRECONDITION_FAILED:FOCUS_CONTENT");
      if (effect.currentFocus === null && focus) {
        await this.#host.removeBlock(effect.focusUuid);
      } else if (effect.currentFocus !== null && focus) await this.#host.updateBlock(effect.focusUuid, `当前推进：${effect.currentFocus}`);
      else if (effect.currentFocus !== null) await this.#ensureBlock(effect.stateUuid, effect.focusUuid, `当前推进：${effect.currentFocus}`, { sibling: true });
    } else {
      const before = await this.readGraphSnapshot({ graphId: effect.graphId, sourceBlockUuid: effect.sourceBlockUuid });
      if (!before.projection || before.projection.containerUuid !== effect.containerUuid || before.projection.projectionHash !== effect.expectedProjectionHash) throw new Error("GRAPH_REMOVE_PRECONDITION_FAILED");
      await this.#host.removeBlock(effect.containerUuid);
    }
    let actual = await this.readGraphSnapshot({ graphId: effect.graphId, sourceBlockUuid: effect.sourceBlockUuid });
    const expectedHash = effect.type === "UPSERT_MANAGED_PROJECTION" ? effect.projection.projectionHash : effect.type === "UPDATE_MANAGED_FIELD" || effect.type === "SET_CURRENT_FOCUS_FIELD" || effect.type === "CHANGE_ENGAGEMENT_FIELDS" || effect.type === "CHANGE_CLOSURE_FIELDS" ? effect.resultingProjectionHash : null;
    for (let attempt = 0; attempt < 20 && (actual.projection?.projectionHash ?? null) !== expectedHash; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      actual = await this.readGraphSnapshot({ graphId: effect.graphId, sourceBlockUuid: effect.sourceBlockUuid });
    }
    if ((actual.projection?.projectionHash ?? null) !== expectedHash) throw new Error("GRAPH_EFFECT_VERIFY_FAILED");
    return { commitId: effect.commitId, effectId: effect.effectId, effectType: effect.type, graphId: effect.graphId, sourceBlockUuid: effect.sourceBlockUuid, projectionHash: expectedHash, appliedAt: this.#now() };
  }
}

export function graphIdentity(value: unknown): string {
  const candidate = object(value);
  if (!candidate) throw new Error("LOGSEQ_GRAPH_SHAPE_UNSUPPORTED");
  return `${typeof candidate.name === "string" ? candidate.name : "unknown-graph"}:${typeof candidate.url === "string" ? candidate.url : "unknown-location"}`;
}

export function logseqBlock(value: unknown): { uuid: string; content: string } | null {
  const candidate = block(value); return candidate ? { uuid: candidate.uuid, content: candidate.content } : null;
}
