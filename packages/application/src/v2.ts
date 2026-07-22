import {
  assignV2PrimaryOwner,
  associateV2Objects,
  bindV2PrimaryAnchor,
  changeV2Condition,
  changeV2DueAt,
  cancelV2Lifecycle,
  completeV2Project,
  completeV2MiniProject,
  completeV2MiniProjectFromReviewedMarker,
  createV2ManagedObject,
  editV2Area,
  lifecycleForV2ExecutionMarker,
  observeV2PrimaryAnchor,
  rebindV2PrimaryAnchor,
  reopenV2Lifecycle,
  restoreV2LifecycleFromUndo,
  restoreV2PrimaryOwner,
  synchronizeV2ExplicitObject,
  transitionV2Lifecycle,
  updateV2ProjectStructure,
  type CreateV2ManagedObjectInput,
  type FocusSelection,
  type Lifecycle,
  type V2Anchor,
  type V2Association,
  type V2ManagedObject,
  type V2MiniProjectClosure,
  type V2Condition,
  type V2ExecutionMarker,
  type V2PrimaryOwnership,
  type V2ProjectClosure,
  type V2ProjectStructure,
} from "@task-copilot/domain";
import { StructuredError } from "@task-copilot/shared";

export interface V2CommandEnvelope {
  actor: string;
  expectedVersion: number;
  idempotencyKey: string;
  traceId: string;
}

export interface V2ObjectRepository {
  getCommandReceipt(idempotencyKey: string): V2CommandReceipt | undefined | Promise<V2CommandReceipt | undefined>;
  commitObject(command: V2ObjectCommand): V2ObjectCommandResult | Promise<V2ObjectCommandResult>;
  commitMaterialization(command: V2MaterializationCommand | V2ProjectCreationCommand): V2AnchorCommandResult | Promise<V2AnchorCommandResult>;
  commitSynchronization(command: V2SynchronizationCommand): V2AnchorCommandResult | Promise<V2AnchorCommandResult>;
  commitAnchorObservation(command: V2AnchorObservationCommand): V2AnchorCommandResult | Promise<V2AnchorCommandResult>;
  commitAnchorRebind(command: V2AnchorRebindCommand): V2AnchorRebindCommandResult | Promise<V2AnchorRebindCommandResult>;
  commitAnchor(command: V2AnchorCommand): V2AnchorCommandResult | Promise<V2AnchorCommandResult>;
  commitOwnership(command: V2OwnershipCommand): V2OwnershipCommandResult | Promise<V2OwnershipCommandResult>;
  commitOwnershipChange(command: V2OwnershipChangeCommand): V2OwnershipChangeCommandResult | Promise<V2OwnershipChangeCommandResult>;
  commitOwnershipUndo(command: V2OwnershipUndoCommand): V2OwnershipUndoResult | Promise<V2OwnershipUndoResult>;
  commitAssociation(command: V2AssociationCommand): V2AssociationCommandResult | Promise<V2AssociationCommandResult>;
  commitMaterializationUndo(command: V2MaterializationUndoCommand): V2MaterializationUndoResult | Promise<V2MaterializationUndoResult>;
  getObject(objectId: string): V2ManagedObject | undefined | Promise<V2ManagedObject | undefined>;
  getPrimaryAnchorByExternal(graphId: string, externalId: string): V2Anchor | undefined | Promise<V2Anchor | undefined>;
  getPrimaryAnchorById(anchorId: string): V2Anchor | undefined | Promise<V2Anchor | undefined>;
  listObjects(): V2ManagedObject[] | Promise<V2ManagedObject[]>;
  commitFocusSelection(objectId: string, expectedVersion: number, selection: FocusSelection | undefined): FocusSelection | undefined | Promise<FocusSelection | undefined>;
  reorderFocusSelections(expectedObjectIds: readonly string[], objectIds: readonly string[]): FocusSelection[] | Promise<FocusSelection[]>;
}

export interface V2AuditRecord {
  traceId: string;
  actor: string;
  command: "create_object" | "edit_area" | "create_project_with_page" | "materialize_explicit_object" | "undo_materialization" | "synchronize_explicit_object" | "complete_mini_project" | "complete_mini_project_from_marker" | "observe_primary_anchor" | "rebind_primary_anchor" | "transition_lifecycle" | "cancel_lifecycle" | "reopen_lifecycle" | "undo_lifecycle" | "complete_project" | "update_project_structure" | "change_condition" | "change_due_at" | "bind_primary_anchor" | "assign_primary_owner" | "change_primary_owner" | "undo_primary_owner_change" | "add_association";
  objectId: string;
  beforeVersion: number;
  afterVersion: number;
  occurredAt: string;
}

export interface V2ObjectCommand {
  object: V2ManagedObject;
  expectedVersion: number;
  idempotencyKey: string;
  audit: V2AuditRecord;
}

export interface V2ObjectCommandResult {
  object: V2ManagedObject;
  replayed: boolean;
}

export interface V2AnchorCommand {
  object: V2ManagedObject;
  anchor: V2Anchor;
  expectedVersion: number;
  idempotencyKey: string;
  audit: V2AuditRecord;
}

export interface V2MaterializationCommand extends V2AnchorCommand {
  expectedVersion: 0;
  audit: V2AuditRecord & { command: "materialize_explicit_object" };
}

export interface V2ProjectCreationCommand extends V2AnchorCommand {
  expectedVersion: 0;
  audit: V2AuditRecord & { command: "create_project_with_page" };
}

export interface V2SynchronizationCommand extends V2AnchorCommand {
  audit: V2AuditRecord & { command: "synchronize_explicit_object" | "complete_mini_project_from_marker" };
}

export interface V2AnchorObservationCommand extends V2AnchorCommand {
  audit: V2AuditRecord & { command: "observe_primary_anchor" };
}

export interface V2AnchorRebindCommand extends V2AnchorCommand {
  previousAnchor: V2Anchor;
  expectedPreviousAnchor: Pick<V2Anchor, "externalId" | "status" | "contentHash">;
  audit: V2AuditRecord & { command: "rebind_primary_anchor" };
}

export interface V2AnchorCommandResult {
  object: V2ManagedObject;
  anchor: V2Anchor;
  replayed: boolean;
}

export interface V2AnchorRebindCommandResult extends V2AnchorCommandResult {
  previousAnchor: V2Anchor;
}

export interface V2OwnershipCommand {
  object: V2ManagedObject;
  ownership: V2PrimaryOwnership;
  expectedVersion: number;
  idempotencyKey: string;
  audit: V2AuditRecord;
}

export interface V2OwnershipCommandResult {
  object: V2ManagedObject;
  ownership: V2PrimaryOwnership;
  replayed: boolean;
}

export interface V2OwnershipChangeCommand extends V2OwnershipCommand {
  expectedCurrentOwnerId: string | undefined;
  expectedOwnerVersion: number;
  audit: V2AuditRecord & { command: "change_primary_owner" };
}

export interface V2OwnershipChangeCommandResult extends V2OwnershipCommandResult {
  previousOwnerId?: string;
}

export interface V2OwnershipUndoCommand {
  object: V2ManagedObject;
  expectedVersion: number;
  expectedCurrentOwnerId: string;
  restoredOwnership?: V2PrimaryOwnership;
  expectedPreviousOwnerVersion?: number;
  idempotencyKey: string;
  audit: V2AuditRecord & { command: "undo_primary_owner_change" };
}

export interface V2OwnershipUndoResult {
  object: V2ManagedObject;
  ownership?: V2PrimaryOwnership;
  replayed: boolean;
}

export interface V2AssociationCommand {
  object: V2ManagedObject;
  association: V2Association;
  expectedVersion: number;
  idempotencyKey: string;
  audit: V2AuditRecord & { command: "add_association" };
}

export interface V2AssociationCommandResult {
  object: V2ManagedObject;
  association: V2Association;
  replayed: boolean;
}

export interface V2MaterializationUndoCommand {
  expectedObject: V2ManagedObject;
  expectedAnchor: V2Anchor;
  idempotencyKey: string;
  audit: V2AuditRecord & { command: "undo_materialization" };
}

export interface V2MaterializationUndoResult {
  object: V2ManagedObject;
  anchor: V2Anchor;
  replayed: boolean;
}

export type V2CommandReceipt =
  | { command: "create_object" | "edit_area" | "transition_lifecycle" | "cancel_lifecycle" | "reopen_lifecycle" | "undo_lifecycle" | "complete_mini_project" | "complete_project" | "update_project_structure" | "change_condition" | "change_due_at"; object: V2ManagedObject }
  | { command: "create_project_with_page" | "materialize_explicit_object" | "undo_materialization" | "synchronize_explicit_object" | "complete_mini_project_from_marker" | "observe_primary_anchor" | "bind_primary_anchor"; object: V2ManagedObject; anchor: V2Anchor }
  | { command: "rebind_primary_anchor"; object: V2ManagedObject; previousAnchor: V2Anchor; anchor: V2Anchor }
  | { command: "assign_primary_owner"; object: V2ManagedObject; ownership: V2PrimaryOwnership }
  | { command: "change_primary_owner"; object: V2ManagedObject; ownership: V2PrimaryOwnership; previousOwnerId?: string }
  | { command: "undo_primary_owner_change"; object: V2ManagedObject; ownership?: V2PrimaryOwnership }
  | { command: "add_association"; object: V2ManagedObject; association: V2Association };

export interface MaterializeExplicitObjectInput {
  objectId?: string;
  objectType: Extract<CreateV2ManagedObjectInput["objectType"], "TASK" | "MINI_PROJECT" | "DECISION" | "OUTPUT">;
  text: string;
  marker?: V2ExecutionMarker;
  anchor: Omit<V2Anchor, "anchorId" | "objectId" | "role" | "status" | "lastSeenAt"> & { anchorId?: string };
}

export interface CreateProjectWithPageInput {
  objectId?: string;
  name: string;
  page: Omit<V2Anchor, "anchorId" | "objectId" | "role" | "status" | "lastSeenAt"> & { anchorId?: string };
}

export interface SynchronizeExplicitObjectInput {
  objectType: MaterializeExplicitObjectInput["objectType"];
  text: string;
  graphId: string;
  externalId: string;
  contentHash: string;
  expectedObjectId?: string;
  marker?: V2ExecutionMarker;
}

export type CompleteMiniProjectFromMarkerInput = SynchronizeExplicitObjectInput & {
  objectType: "MINI_PROJECT";
  marker: "DONE";
  expectedObjectId: string;
  closure: V2MiniProjectClosure;
};

export interface ObservePrimaryAnchorInput {
  anchorId: string;
  status: "active" | "missing" | "conflict";
}

export interface RebindPrimaryAnchorInput {
  previousAnchorId: string;
  expectedAnchorStatus: V2Anchor["status"];
  expectedAnchorContentHash: string;
  objectType: MaterializeExplicitObjectInput["objectType"];
  text: string;
  graphId: string;
  externalId: string;
  contentHash: string;
  confirmation: "REBIND_PRIMARY_ANCHOR";
}

function requireEnvelope(envelope: V2CommandEnvelope): void {
  const missing = [envelope.actor, envelope.idempotencyKey, envelope.traceId].some((value) => !value.trim());
  if (missing || !Number.isSafeInteger(envelope.expectedVersion) || envelope.expectedVersion < 0) {
    throw new StructuredError({
      code: "V2_COMMAND_ENVELOPE_INVALID",
      message: "V2 Command 必须包含 actor、expected version、idempotency key 和 trace_id。",
      ruleRefs: ["D-185", "D-190"],
    });
  }
}

export class V2Application {
  constructor(private readonly objects: V2ObjectRepository) {}

  async selectFocus(objectId: string, rank: number, expectedVersion: number, at = new Date()): Promise<FocusSelection> {
    if (!objectId.trim() || !Number.isSafeInteger(rank) || rank < 0 || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
      throw new StructuredError({ code: "V2_FOCUS_COMMAND_INVALID", message: "Focus 必须引用对象版本和非负排序位置。", ruleRefs: ["D-148", "D-159"] });
    }
    const object = await this.objects.getObject(objectId);
    if (!object || object.version !== expectedVersion || object.lifecycle !== "OPEN") {
      throw new StructuredError({ code: "V2_FOCUS_OBJECT_STALE", message: "对象不存在、版本已变化或已关闭；Focus 没有写入。", ruleRefs: ["D-148", "D-185"] });
    }
    return (await this.objects.commitFocusSelection(objectId, expectedVersion, { objectId, selectedAt: at.toISOString(), rank }))!;
  }

  async removeFocus(objectId: string, expectedVersion: number): Promise<void> {
    if (!objectId.trim() || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw new StructuredError({ code: "V2_FOCUS_COMMAND_INVALID", message: "Focus 移出必须引用对象版本。", ruleRefs: ["D-148"] });
    await this.objects.commitFocusSelection(objectId, expectedVersion, undefined);
  }

  async reorderFocus(expectedObjectIds: readonly string[], objectIds: readonly string[]): Promise<FocusSelection[]> {
    if (new Set(expectedObjectIds).size !== expectedObjectIds.length || new Set(objectIds).size !== objectIds.length || expectedObjectIds.length !== objectIds.length || expectedObjectIds.some((id) => !id.trim()) || objectIds.some((id) => !id.trim()) || expectedObjectIds.some((id) => !objectIds.includes(id))) {
      throw new StructuredError({ code: "V2_FOCUS_ORDER_INVALID", message: "Focus 排序必须包含同一组唯一对象。", ruleRefs: ["D-159"] });
    }
    return this.objects.reorderFocusSelections(expectedObjectIds, objectIds);
  }

  async createObject(
    input: CreateV2ManagedObjectInput,
    envelope: V2CommandEnvelope,
    at = new Date(),
  ): Promise<V2ManagedObject> {
    requireEnvelope(envelope);
    const replay = await this.replay(envelope.idempotencyKey, "create_object");
    if (replay) return replay.object;
    if (envelope.expectedVersion !== 0) {
      throw new StructuredError({
        code: "V2_CREATE_EXPECTED_VERSION_INVALID",
        message: "创建对象的 expected version 必须为 0。",
        ruleRefs: ["D-185"],
      });
    }
    const candidate = createV2ManagedObject(input, at);
    const result = await this.objects.commitObject({
      object: candidate,
      expectedVersion: 0,
      idempotencyKey: envelope.idempotencyKey,
      audit: {
        traceId: envelope.traceId,
        actor: envelope.actor,
        command: "create_object",
        objectId: candidate.objectId,
        beforeVersion: 0,
        afterVersion: candidate.version,
        occurredAt: at.toISOString(),
      },
    });
    return result.object;
  }

  async editArea(objectId: string, text: string, envelope: V2CommandEnvelope, at = new Date()): Promise<V2ManagedObject> {
    requireEnvelope(envelope);
    const replay = await this.replay(envelope.idempotencyKey, "edit_area", objectId);
    if (replay) return replay.object;
    const current = await this.requireObject(objectId);
    const candidate = editV2Area(current, text, envelope.expectedVersion, at);
    const result = await this.objects.commitObject({
      object: candidate,
      expectedVersion: envelope.expectedVersion,
      idempotencyKey: envelope.idempotencyKey,
      audit: {
        traceId: envelope.traceId,
        actor: envelope.actor,
        command: "edit_area",
        objectId,
        beforeVersion: current.version,
        afterVersion: candidate.version,
        occurredAt: at.toISOString(),
      },
    });
    return result.object;
  }

  async materializeExplicitObject(
    input: MaterializeExplicitObjectInput,
    envelope: V2CommandEnvelope,
    at = new Date(),
  ): Promise<V2AnchorCommandResult> {
    requireEnvelope(envelope);
    const replay = await this.replay(envelope.idempotencyKey, "materialize_explicit_object");
    if (replay?.command === "materialize_explicit_object") {
      return { object: replay.object, anchor: replay.anchor, replayed: true };
    }
    if (envelope.expectedVersion !== 0) {
      throw new StructuredError({
        code: "V2_CREATE_EXPECTED_VERSION_INVALID",
        message: "显式对象物化的 expected version 必须为 0。",
        ruleRefs: ["D-185"],
      });
    }
    if (!["TASK", "MINI_PROJECT", "DECISION", "OUTPUT"].includes(input.objectType)) {
      throw new StructuredError({
        code: "V2_EXPLICIT_OBJECT_TYPE_UNSUPPORTED",
        message: `显式 Block Parser 不支持 ${input.objectType}；Area 与 Project 必须使用各自受控创建入口。`,
        ruleRefs: ["D-044", "D-079", "D-220"],
      });
    }
    const created = createV2ManagedObject({
      ...(input.objectId ? { objectId: input.objectId } : {}),
      objectType: input.objectType,
      text: input.text,
      sourceOrCreationEvent: `explicit_block:${input.anchor.graphId}:${input.anchor.externalId}`,
    }, at);
    const initial = {
      ...created,
      lifecycle: lifecycleForV2ExecutionMarker(created.objectType, created.lifecycle, input.marker),
    };
    const candidate = bindV2PrimaryAnchor(initial, input.anchor, initial.version, at);
    return this.objects.commitMaterialization({
      ...candidate,
      expectedVersion: 0,
      idempotencyKey: envelope.idempotencyKey,
      audit: {
        traceId: envelope.traceId,
        actor: envelope.actor,
        command: "materialize_explicit_object",
        objectId: candidate.object.objectId,
        beforeVersion: 0,
        afterVersion: candidate.object.version,
        occurredAt: at.toISOString(),
      },
    });
  }

  async undoMaterialization(
    expected: { object: V2ManagedObject; anchor: V2Anchor },
    envelope: V2CommandEnvelope,
    at = new Date(),
  ): Promise<V2MaterializationUndoResult> {
    requireEnvelope(envelope);
    const replay = await this.replay(envelope.idempotencyKey, "undo_materialization");
    if (replay?.command === "undo_materialization") return { object: replay.object, anchor: replay.anchor, replayed: true };
    if (envelope.expectedVersion !== expected.object.version || expected.anchor.objectId !== expected.object.objectId || expected.anchor.role !== "primary_text") {
      throw new StructuredError({ code: "V2_UNDO_EXPECTATION_INVALID", message: "Undo 必须引用同一对象的精确版本和 Primary Anchor。", ruleRefs: ["D-185", "D-188"] });
    }
    return this.objects.commitMaterializationUndo({
      expectedObject: expected.object,
      expectedAnchor: expected.anchor,
      idempotencyKey: envelope.idempotencyKey,
      audit: {
        traceId: envelope.traceId,
        actor: envelope.actor,
        command: "undo_materialization",
        objectId: expected.object.objectId,
        beforeVersion: expected.object.version,
        afterVersion: 0,
        occurredAt: at.toISOString(),
      },
    });
  }

  async createProjectWithPage(
    input: CreateProjectWithPageInput,
    envelope: V2CommandEnvelope,
    at = new Date(),
  ): Promise<V2AnchorCommandResult> {
    requireEnvelope(envelope);
    const replay = await this.replay(envelope.idempotencyKey, "create_project_with_page");
    if (replay?.command === "create_project_with_page") {
      return { object: replay.object, anchor: replay.anchor, replayed: true };
    }
    if (envelope.expectedVersion !== 0) {
      throw new StructuredError({
        code: "V2_CREATE_EXPECTED_VERSION_INVALID",
        message: "Project 与页面原子创建的 expected version 必须为 0。",
        ruleRefs: ["D-185", "D-220"],
      });
    }
    const name = input.name.trim();
    if (!name || name.includes("\n") || input.page.externalId.trim().length === 0) {
      throw new StructuredError({
        code: "V2_PROJECT_CREATION_INVALID",
        message: "Project 创建必须包含名称和已验证的 Project 页面 UUID。",
        ruleRefs: ["D-044", "D-220"],
      });
    }
    const created = createV2ManagedObject({
      ...(input.objectId ? { objectId: input.objectId } : {}),
      objectType: "PROJECT",
      text: name,
      sourceOrCreationEvent: `project_page:${input.page.graphId}:${input.page.externalId}`,
    }, at);
    const candidate = bindV2PrimaryAnchor(created, input.page, created.version, at);
    return this.objects.commitMaterialization({
      ...candidate,
      expectedVersion: 0,
      idempotencyKey: envelope.idempotencyKey,
      audit: {
        traceId: envelope.traceId,
        actor: envelope.actor,
        command: "create_project_with_page",
        objectId: candidate.object.objectId,
        beforeVersion: 0,
        afterVersion: candidate.object.version,
        occurredAt: at.toISOString(),
      },
    });
  }

  async synchronizeExplicitObject(
    input: SynchronizeExplicitObjectInput,
    envelope: V2CommandEnvelope,
    at = new Date(),
  ): Promise<V2AnchorCommandResult> {
    requireEnvelope(envelope);
    const replay = await this.replay(envelope.idempotencyKey, "synchronize_explicit_object", input.expectedObjectId);
    if (replay?.command === "synchronize_explicit_object") {
      if (replay.anchor.graphId !== input.graphId || replay.anchor.externalId !== input.externalId || replay.anchor.objectId !== replay.object.objectId) {
        throw new StructuredError({ code: "V2_IDEMPOTENCY_KEY_REUSED", message: "idempotency key 的既有同步回执不属于当前 Graph Anchor。", ruleRefs: ["D-030", "D-185", "D-190"] });
      }
      return { object: replay.object, anchor: replay.anchor, replayed: true };
    }
    const anchor = await this.objects.getPrimaryAnchorByExternal(input.graphId, input.externalId);
    if (!anchor) {
      throw new StructuredError({
        code: "V2_EXPLICIT_BINDING_NOT_FOUND",
        message: "该 Logseq Block 尚未绑定正式对象；必须先走首次物化。",
        ruleRefs: ["D-030", "D-185"],
      });
    }
    if (input.expectedObjectId !== undefined && anchor.objectId !== input.expectedObjectId) {
      throw new StructuredError({
        code: "V2_EXPLICIT_BINDING_OBJECT_MISMATCH",
        message: "该 Logseq Block 已不再绑定审阅时的正式对象；本次同步没有写入。",
        ruleRefs: ["D-030", "D-094", "D-185"],
      });
    }
    const current = await this.requireObject(anchor.objectId);
    const candidate = synchronizeV2ExplicitObject(current, anchor, input, envelope.expectedVersion, at);
    return this.objects.commitSynchronization({
      ...candidate,
      expectedVersion: envelope.expectedVersion,
      idempotencyKey: envelope.idempotencyKey,
      audit: {
        traceId: envelope.traceId,
        actor: envelope.actor,
        command: "synchronize_explicit_object",
        objectId: current.objectId,
        beforeVersion: current.version,
        afterVersion: candidate.object.version,
        occurredAt: at.toISOString(),
      },
    });
  }

  async completeMiniProjectFromMarker(
    input: CompleteMiniProjectFromMarkerInput,
    envelope: V2CommandEnvelope,
    at = new Date(),
  ): Promise<V2AnchorCommandResult> {
    requireEnvelope(envelope);
    const replay = await this.replay(envelope.idempotencyKey, "complete_mini_project_from_marker", input.expectedObjectId);
    if (replay?.command === "complete_mini_project_from_marker") {
      if (replay.anchor.graphId !== input.graphId || replay.anchor.externalId !== input.externalId) {
        throw new StructuredError({ code: "V2_IDEMPOTENCY_KEY_REUSED", message: "idempotency key 的既有关闭回执不属于当前 Graph Anchor。", ruleRefs: ["D-030", "D-185", "D-190"] });
      }
      return { object: replay.object, anchor: replay.anchor, replayed: true };
    }
    const anchor = await this.objects.getPrimaryAnchorByExternal(input.graphId, input.externalId);
    if (!anchor || anchor.objectId !== input.expectedObjectId) {
      throw new StructuredError({
        code: "V2_EXPLICIT_BINDING_OBJECT_MISMATCH",
        message: "该 Logseq Block 已不再绑定审阅时的 MiniProject；本次关闭没有写入。",
        ruleRefs: ["D-030", "D-094", "D-185"],
      });
    }
    const current = await this.requireObject(input.expectedObjectId);
    const candidate = completeV2MiniProjectFromReviewedMarker(current, anchor, input, envelope.expectedVersion, at);
    return this.objects.commitSynchronization({
      ...candidate,
      expectedVersion: envelope.expectedVersion,
      idempotencyKey: envelope.idempotencyKey,
      audit: {
        traceId: envelope.traceId,
        actor: envelope.actor,
        command: "complete_mini_project_from_marker",
        objectId: current.objectId,
        beforeVersion: current.version,
        afterVersion: candidate.object.version,
        occurredAt: at.toISOString(),
      },
    });
  }

  async completeMiniProject(
    objectId: string,
    closure: V2MiniProjectClosure,
    envelope: V2CommandEnvelope,
    at = new Date(),
  ): Promise<V2ManagedObject> {
    requireEnvelope(envelope);
    const replay = await this.replay(envelope.idempotencyKey, "complete_mini_project", objectId);
    if (replay) return replay.object;
    const current = await this.requireObject(objectId);
    const candidate = completeV2MiniProject(current, closure, envelope.expectedVersion, at);
    const result = await this.objects.commitObject({
      object: candidate,
      expectedVersion: envelope.expectedVersion,
      idempotencyKey: envelope.idempotencyKey,
      audit: {
        traceId: envelope.traceId,
        actor: envelope.actor,
        command: "complete_mini_project",
        objectId: candidate.objectId,
        beforeVersion: current.version,
        afterVersion: candidate.version,
        occurredAt: at.toISOString(),
      },
    });
    return result.object;
  }

  async observePrimaryAnchor(
    input: ObservePrimaryAnchorInput,
    envelope: V2CommandEnvelope,
    at = new Date(),
  ): Promise<V2AnchorCommandResult> {
    requireEnvelope(envelope);
    const replay = await this.replay(envelope.idempotencyKey, "observe_primary_anchor");
    if (replay?.command === "observe_primary_anchor") {
      return { object: replay.object, anchor: replay.anchor, replayed: true };
    }
    const anchor = await this.objects.getPrimaryAnchorById(input.anchorId);
    if (!anchor) {
      throw new StructuredError({ code: "V2_PRIMARY_ANCHOR_NOT_FOUND", message: `Primary Anchor ${input.anchorId} 不存在。`, ruleRefs: ["D-030", "D-185"] });
    }
    const current = await this.requireObject(anchor.objectId);
    if (anchor.status === input.status) return { object: current, anchor, replayed: true };
    const candidate = observeV2PrimaryAnchor(current, anchor, input.status, envelope.expectedVersion, at);
    return this.objects.commitAnchorObservation({
      ...candidate,
      expectedVersion: envelope.expectedVersion,
      idempotencyKey: envelope.idempotencyKey,
      audit: {
        traceId: envelope.traceId,
        actor: envelope.actor,
        command: "observe_primary_anchor",
        objectId: current.objectId,
        beforeVersion: current.version,
        afterVersion: candidate.object.version,
        occurredAt: at.toISOString(),
      },
    });
  }

  async rebindPrimaryAnchor(
    input: RebindPrimaryAnchorInput,
    envelope: V2CommandEnvelope,
    at = new Date(),
  ): Promise<V2AnchorRebindCommandResult> {
    requireEnvelope(envelope);
    const replay = await this.replay(envelope.idempotencyKey, "rebind_primary_anchor");
    if (replay?.command === "rebind_primary_anchor") {
      return { object: replay.object, previousAnchor: replay.previousAnchor, anchor: replay.anchor, replayed: true };
    }
    if (input.confirmation !== "REBIND_PRIMARY_ANCHOR") {
      throw new StructuredError({ code: "V2_REBIND_CONFIRMATION_REQUIRED", message: "重新绑定 Primary Anchor 必须单独明确确认。", ruleRefs: ["D-030", "D-185"] });
    }
    const previousAnchor = await this.objects.getPrimaryAnchorById(input.previousAnchorId);
    if (!previousAnchor || previousAnchor.status === "replaced") {
      throw new StructuredError({ code: "V2_PRIMARY_ANCHOR_NOT_FOUND", message: `Primary Anchor ${input.previousAnchorId} 不存在或已被替换。`, ruleRefs: ["D-030", "D-185"] });
    }
    if (previousAnchor.status !== input.expectedAnchorStatus || previousAnchor.contentHash !== input.expectedAnchorContentHash) {
      throw new StructuredError({ code: "V2_REBIND_PREVIEW_STALE", message: "Primary Anchor 已在预览后变化；本次重新绑定没有写入。", ruleRefs: ["D-030", "D-185"] });
    }
    const current = await this.requireObject(previousAnchor.objectId);
    const candidate = rebindV2PrimaryAnchor(current, previousAnchor, input, envelope.expectedVersion, at);
    return this.objects.commitAnchorRebind({
      ...candidate,
      expectedPreviousAnchor: {
        externalId: previousAnchor.externalId,
        status: previousAnchor.status,
        contentHash: previousAnchor.contentHash,
      },
      expectedVersion: envelope.expectedVersion,
      idempotencyKey: envelope.idempotencyKey,
      audit: {
        traceId: envelope.traceId,
        actor: envelope.actor,
        command: "rebind_primary_anchor",
        objectId: current.objectId,
        beforeVersion: current.version,
        afterVersion: candidate.object.version,
        occurredAt: at.toISOString(),
      },
    });
  }

  async transitionLifecycle(
    objectId: string,
    next: Lifecycle,
    envelope: V2CommandEnvelope,
    at = new Date(),
  ): Promise<V2ManagedObject> {
    requireEnvelope(envelope);
    const replay = await this.replay(envelope.idempotencyKey, "transition_lifecycle", objectId);
    if (replay) return replay.object;
    const current = await this.objects.getObject(objectId);
    if (!current) {
      throw new StructuredError({
        code: "V2_OBJECT_NOT_FOUND",
        message: `对象 ${objectId} 不存在。`,
        ruleRefs: ["D-185"],
      });
    }
    const candidate = transitionV2Lifecycle(current, next, envelope.expectedVersion, at);
    const result = await this.objects.commitObject({
      object: candidate,
      expectedVersion: envelope.expectedVersion,
      idempotencyKey: envelope.idempotencyKey,
      audit: {
        traceId: envelope.traceId,
        actor: envelope.actor,
        command: "transition_lifecycle",
        objectId: candidate.objectId,
        beforeVersion: current.version,
        afterVersion: candidate.version,
        occurredAt: at.toISOString(),
      },
    });
    return result.object;
  }

  async cancelLifecycle(objectId: string, reason: string, envelope: V2CommandEnvelope, at = new Date()): Promise<V2ManagedObject> {
    requireEnvelope(envelope);
    const replay = await this.replay(envelope.idempotencyKey, "cancel_lifecycle", objectId);
    if (replay) return replay.object;
    const current = await this.objects.getObject(objectId);
    if (!current) throw new StructuredError({ code: "V2_OBJECT_NOT_FOUND", message: `对象 ${objectId} 不存在。`, ruleRefs: ["D-185"] });
    const candidate = cancelV2Lifecycle(current, reason, envelope.expectedVersion, at);
    return (await this.objects.commitObject({ object: candidate, expectedVersion: envelope.expectedVersion, idempotencyKey: envelope.idempotencyKey, audit: { traceId: envelope.traceId, actor: envelope.actor, command: "cancel_lifecycle", objectId, beforeVersion: current.version, afterVersion: candidate.version, occurredAt: at.toISOString() } })).object;
  }

  async reopenLifecycle(objectId: string, reason: string, envelope: V2CommandEnvelope, at = new Date()): Promise<V2ManagedObject> {
    requireEnvelope(envelope);
    const replay = await this.replay(envelope.idempotencyKey, "reopen_lifecycle", objectId);
    if (replay) return replay.object;
    const current = await this.objects.getObject(objectId);
    if (!current) throw new StructuredError({ code: "V2_OBJECT_NOT_FOUND", message: `对象 ${objectId} 不存在。`, ruleRefs: ["D-185"] });
    const candidate = reopenV2Lifecycle(current, reason, envelope.expectedVersion, at);
    return (await this.objects.commitObject({ object: candidate, expectedVersion: envelope.expectedVersion, idempotencyKey: envelope.idempotencyKey, audit: { traceId: envelope.traceId, actor: envelope.actor, command: "reopen_lifecycle", objectId, beforeVersion: current.version, afterVersion: candidate.version, occurredAt: at.toISOString() } })).object;
  }

  async undoLifecycle(
    objectId: string,
    previous: { lifecycle: "OPEN" | "COMPLETED" | "CANCELLED"; closure?: V2ProjectClosure | V2MiniProjectClosure },
    envelope: V2CommandEnvelope,
    at = new Date(),
  ): Promise<V2ManagedObject> {
    requireEnvelope(envelope);
    const replay = await this.replay(envelope.idempotencyKey, "undo_lifecycle", objectId);
    if (replay) return replay.object;
    const current = await this.objects.getObject(objectId);
    if (!current) throw new StructuredError({ code: "V2_OBJECT_NOT_FOUND", message: `对象 ${objectId} 不存在。`, ruleRefs: ["D-185"] });
    const candidate = restoreV2LifecycleFromUndo(current, previous, envelope.expectedVersion, at);
    return (await this.objects.commitObject({
      object: candidate,
      expectedVersion: envelope.expectedVersion,
      idempotencyKey: envelope.idempotencyKey,
      audit: { traceId: envelope.traceId, actor: envelope.actor, command: "undo_lifecycle", objectId, beforeVersion: current.version, afterVersion: candidate.version, occurredAt: at.toISOString() },
    })).object;
  }

  async completeProject(
    objectId: string,
    closure: V2ProjectClosure,
    envelope: V2CommandEnvelope,
    at = new Date(),
  ): Promise<V2ManagedObject> {
    requireEnvelope(envelope);
    const replay = await this.replay(envelope.idempotencyKey, "complete_project", objectId);
    if (replay) return replay.object;
    const current = await this.objects.getObject(objectId);
    if (!current) throw new StructuredError({ code: "V2_OBJECT_NOT_FOUND", message: `对象 ${objectId} 不存在。`, ruleRefs: ["D-185"] });
    const candidate = completeV2Project(current, closure, envelope.expectedVersion, at);
    const result = await this.objects.commitObject({
      object: candidate,
      expectedVersion: envelope.expectedVersion,
      idempotencyKey: envelope.idempotencyKey,
      audit: {
        traceId: envelope.traceId,
        actor: envelope.actor,
        command: "complete_project",
        objectId: candidate.objectId,
        beforeVersion: current.version,
        afterVersion: candidate.version,
        occurredAt: at.toISOString(),
      },
    });
    return result.object;
  }

  async updateProjectStructure(
    objectId: string,
    structure: V2ProjectStructure,
    envelope: V2CommandEnvelope,
    at = new Date(),
  ): Promise<V2ManagedObject> {
    requireEnvelope(envelope);
    const replay = await this.replay(envelope.idempotencyKey, "update_project_structure", objectId);
    if (replay) return replay.object;
    const current = await this.objects.getObject(objectId);
    if (!current) throw new StructuredError({ code: "V2_OBJECT_NOT_FOUND", message: `对象 ${objectId} 不存在。`, ruleRefs: ["D-185"] });
    const candidate = updateV2ProjectStructure(current, structure, envelope.expectedVersion, at);
    const result = await this.objects.commitObject({
      object: candidate,
      expectedVersion: envelope.expectedVersion,
      idempotencyKey: envelope.idempotencyKey,
      audit: {
        traceId: envelope.traceId,
        actor: envelope.actor,
        command: "update_project_structure",
        objectId: candidate.objectId,
        beforeVersion: current.version,
        afterVersion: candidate.version,
        occurredAt: at.toISOString(),
      },
    });
    return result.object;
  }

  async changeCondition(
    objectId: string,
    condition: V2Condition,
    envelope: V2CommandEnvelope,
    at = new Date(),
  ): Promise<V2ManagedObject> {
    requireEnvelope(envelope);
    const replay = await this.replay(envelope.idempotencyKey, "change_condition", objectId);
    if (replay) return replay.object;
    const current = await this.objects.getObject(objectId);
    if (!current) throw new StructuredError({ code: "V2_OBJECT_NOT_FOUND", message: `对象 ${objectId} 不存在。`, ruleRefs: ["D-185"] });
    const candidate = changeV2Condition(current, condition, envelope.expectedVersion, at);
    if (candidate.condition.kind === "BLOCKED" && candidate.condition.blockerObjectId) {
      const blocker = await this.objects.getObject(candidate.condition.blockerObjectId);
      if (!blocker) throw new StructuredError({ code: "V2_BLOCKER_OBJECT_NOT_FOUND", message: "选择的阻碍对象不存在；Condition 没有更新。", ruleRefs: ["D-151", "D-185"] });
      if (blocker.lifecycle !== "OPEN") throw new StructuredError({ code: "V2_BLOCKER_OBJECT_CLOSED", message: "已关闭对象不能作为当前阻碍来源。", ruleRefs: ["D-148", "D-151"] });
    }
    const result = await this.objects.commitObject({
      object: candidate,
      expectedVersion: envelope.expectedVersion,
      idempotencyKey: envelope.idempotencyKey,
      audit: { traceId: envelope.traceId, actor: envelope.actor, command: "change_condition", objectId, beforeVersion: current.version, afterVersion: candidate.version, occurredAt: at.toISOString() },
    });
    return result.object;
  }

  async changeDueAt(objectId: string, dueAt: string | undefined, envelope: V2CommandEnvelope, at = new Date()): Promise<V2ManagedObject> {
    requireEnvelope(envelope);
    const replay = await this.replay(envelope.idempotencyKey, "change_due_at", objectId);
    if (replay) return replay.object;
    const current = await this.objects.getObject(objectId);
    if (!current) throw new StructuredError({ code: "V2_OBJECT_NOT_FOUND", message: `对象 ${objectId} 不存在。`, ruleRefs: ["D-185"] });
    const candidate = changeV2DueAt(current, dueAt, envelope.expectedVersion, at);
    const result = await this.objects.commitObject({
      object: candidate,
      expectedVersion: envelope.expectedVersion,
      idempotencyKey: envelope.idempotencyKey,
      audit: { traceId: envelope.traceId, actor: envelope.actor, command: "change_due_at", objectId, beforeVersion: current.version, afterVersion: candidate.version, occurredAt: at.toISOString() },
    });
    return result.object;
  }

  async bindPrimaryAnchor(
    objectId: string,
    input: Parameters<typeof bindV2PrimaryAnchor>[1],
    envelope: V2CommandEnvelope,
    at = new Date(),
  ): Promise<V2AnchorCommandResult> {
    requireEnvelope(envelope);
    const replay = await this.replay(envelope.idempotencyKey, "bind_primary_anchor", objectId);
    if (replay?.command === "bind_primary_anchor") return { object: replay.object, anchor: replay.anchor, replayed: true };
    const current = await this.requireObject(objectId);
    const candidate = bindV2PrimaryAnchor(current, input, envelope.expectedVersion, at);
    return this.objects.commitAnchor({
      ...candidate,
      expectedVersion: envelope.expectedVersion,
      idempotencyKey: envelope.idempotencyKey,
      audit: {
        traceId: envelope.traceId,
        actor: envelope.actor,
        command: "bind_primary_anchor",
        objectId,
        beforeVersion: current.version,
        afterVersion: candidate.object.version,
        occurredAt: at.toISOString(),
      },
    });
  }

  async assignPrimaryOwner(
    childObjectId: string,
    ownerObjectId: string,
    envelope: V2CommandEnvelope,
    at = new Date(),
  ): Promise<V2OwnershipCommandResult> {
    requireEnvelope(envelope);
    const replay = await this.replay(envelope.idempotencyKey, "assign_primary_owner", childObjectId);
    if (replay?.command === "assign_primary_owner") {
      return { object: replay.object, ownership: replay.ownership, replayed: true };
    }
    const [child, owner] = await Promise.all([this.requireObject(childObjectId), this.requireObject(ownerObjectId)]);
    const candidate = assignV2PrimaryOwner(child, owner, envelope.expectedVersion, at);
    return this.objects.commitOwnership({
      ...candidate,
      expectedVersion: envelope.expectedVersion,
      idempotencyKey: envelope.idempotencyKey,
      audit: {
        traceId: envelope.traceId,
        actor: envelope.actor,
        command: "assign_primary_owner",
        objectId: childObjectId,
        beforeVersion: child.version,
        afterVersion: candidate.object.version,
        occurredAt: at.toISOString(),
      },
    });
  }

  async changePrimaryOwner(childObjectId: string, ownerObjectId: string, expectedOwnerVersion: number, expectedCurrentOwnerId: string | undefined, envelope: V2CommandEnvelope, at = new Date()): Promise<V2OwnershipChangeCommandResult> {
    requireEnvelope(envelope);
    if (expectedCurrentOwnerId === ownerObjectId) throw new StructuredError({ code: "V2_PRIMARY_OWNER_UNCHANGED", message: "新 Primary Owner 与当前 Owner 相同；没有正式变化。", ruleRefs: ["D-035"] });
    const replay = await this.replay(envelope.idempotencyKey, "change_primary_owner", childObjectId);
    if (replay?.command === "change_primary_owner") return { object: replay.object, ownership: replay.ownership, ...(replay.previousOwnerId ? { previousOwnerId: replay.previousOwnerId } : {}), replayed: true };
    const [child, owner] = await Promise.all([this.requireObject(childObjectId), this.requireObject(ownerObjectId)]);
    const candidate = assignV2PrimaryOwner(child, owner, envelope.expectedVersion, at);
    return this.objects.commitOwnershipChange({ ...candidate, expectedCurrentOwnerId, expectedOwnerVersion, expectedVersion: envelope.expectedVersion, idempotencyKey: envelope.idempotencyKey, audit: { traceId: envelope.traceId, actor: envelope.actor, command: "change_primary_owner", objectId: childObjectId, beforeVersion: child.version, afterVersion: candidate.object.version, occurredAt: at.toISOString() } });
  }

  async undoPrimaryOwnerChange(childObjectId: string, expectedCurrentOwnerId: string, previousOwnerId: string | undefined, envelope: V2CommandEnvelope, at = new Date()): Promise<V2OwnershipUndoResult> {
    requireEnvelope(envelope);
    const replay = await this.replay(envelope.idempotencyKey, "undo_primary_owner_change", childObjectId);
    if (replay?.command === "undo_primary_owner_change") return { object: replay.object, ...(replay.ownership ? { ownership: replay.ownership } : {}), replayed: true };
    const [child, previousOwner] = await Promise.all([this.requireObject(childObjectId), previousOwnerId ? this.requireObject(previousOwnerId) : undefined]);
    const candidate = restoreV2PrimaryOwner(child, previousOwner, envelope.expectedVersion, at);
    return this.objects.commitOwnershipUndo({
      object: candidate.object,
      expectedVersion: envelope.expectedVersion,
      expectedCurrentOwnerId,
      ...(candidate.ownership ? { restoredOwnership: candidate.ownership, expectedPreviousOwnerVersion: previousOwner!.version } : {}),
      idempotencyKey: envelope.idempotencyKey,
      audit: { traceId: envelope.traceId, actor: envelope.actor, command: "undo_primary_owner_change", objectId: childObjectId, beforeVersion: child.version, afterVersion: candidate.object.version, occurredAt: at.toISOString() },
    });
  }

  async addAssociation(
    sourceObjectId: string,
    targetObjectId: string,
    envelope: V2CommandEnvelope,
    at = new Date(),
  ): Promise<V2AssociationCommandResult> {
    requireEnvelope(envelope);
    const replay = await this.replay(envelope.idempotencyKey, "add_association", sourceObjectId);
    if (replay?.command === "add_association") return { object: replay.object, association: replay.association, replayed: true };
    const [source, target] = await Promise.all([this.requireObject(sourceObjectId), this.requireObject(targetObjectId)]);
    const candidate = associateV2Objects(source, target, envelope.expectedVersion, at);
    return this.objects.commitAssociation({
      ...candidate,
      expectedVersion: envelope.expectedVersion,
      idempotencyKey: envelope.idempotencyKey,
      audit: { traceId: envelope.traceId, actor: envelope.actor, command: "add_association", objectId: sourceObjectId, beforeVersion: source.version, afterVersion: candidate.object.version, occurredAt: at.toISOString() },
    });
  }

  private async requireObject(objectId: string): Promise<V2ManagedObject> {
    const object = await this.objects.getObject(objectId);
    if (!object) {
      throw new StructuredError({ code: "V2_OBJECT_NOT_FOUND", message: `对象 ${objectId} 不存在。`, ruleRefs: ["D-185"] });
    }
    return object;
  }

  private async replay(
    idempotencyKey: string,
    expectedCommand: V2CommandReceipt["command"],
    expectedObjectId?: string,
  ): Promise<V2CommandReceipt | undefined> {
    const receipt = await this.objects.getCommandReceipt(idempotencyKey);
    if (!receipt) return undefined;
    if (receipt.command !== expectedCommand || (expectedObjectId && receipt.object.objectId !== expectedObjectId)) {
      throw new StructuredError({
        code: "V2_IDEMPOTENCY_KEY_REUSED",
        message: "idempotency key 已被另一个命令使用。",
        ruleRefs: ["D-185", "D-190"],
      });
    }
    return receipt;
  }

  async getObject(objectId: string): Promise<V2ManagedObject | undefined> {
    return this.objects.getObject(objectId);
  }

  async listObjects(): Promise<V2ManagedObject[]> {
    return this.objects.listObjects();
  }
}
