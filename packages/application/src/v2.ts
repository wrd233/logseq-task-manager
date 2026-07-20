import {
  assignV2PrimaryOwner,
  bindV2PrimaryAnchor,
  createV2ManagedObject,
  observeV2PrimaryAnchor,
  synchronizeV2ExplicitObject,
  transitionV2Lifecycle,
  type CreateV2ManagedObjectInput,
  type Lifecycle,
  type V2Anchor,
  type V2ManagedObject,
  type V2PrimaryOwnership,
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
  commitMaterialization(command: V2MaterializationCommand): V2AnchorCommandResult | Promise<V2AnchorCommandResult>;
  commitSynchronization(command: V2SynchronizationCommand): V2AnchorCommandResult | Promise<V2AnchorCommandResult>;
  commitAnchorObservation(command: V2AnchorObservationCommand): V2AnchorCommandResult | Promise<V2AnchorCommandResult>;
  commitAnchor(command: V2AnchorCommand): V2AnchorCommandResult | Promise<V2AnchorCommandResult>;
  commitOwnership(command: V2OwnershipCommand): V2OwnershipCommandResult | Promise<V2OwnershipCommandResult>;
  getObject(objectId: string): V2ManagedObject | undefined | Promise<V2ManagedObject | undefined>;
  getPrimaryAnchorByExternal(graphId: string, externalId: string): V2Anchor | undefined | Promise<V2Anchor | undefined>;
  getPrimaryAnchorById(anchorId: string): V2Anchor | undefined | Promise<V2Anchor | undefined>;
  listObjects(): V2ManagedObject[] | Promise<V2ManagedObject[]>;
}

export interface V2AuditRecord {
  traceId: string;
  actor: string;
  command: "create_object" | "materialize_explicit_object" | "synchronize_explicit_object" | "observe_primary_anchor" | "transition_lifecycle" | "bind_primary_anchor" | "assign_primary_owner";
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

export interface V2SynchronizationCommand extends V2AnchorCommand {
  audit: V2AuditRecord & { command: "synchronize_explicit_object" };
}

export interface V2AnchorObservationCommand extends V2AnchorCommand {
  audit: V2AuditRecord & { command: "observe_primary_anchor" };
}

export interface V2AnchorCommandResult {
  object: V2ManagedObject;
  anchor: V2Anchor;
  replayed: boolean;
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

export type V2CommandReceipt =
  | { command: "create_object" | "transition_lifecycle"; object: V2ManagedObject }
  | { command: "materialize_explicit_object" | "synchronize_explicit_object" | "observe_primary_anchor" | "bind_primary_anchor"; object: V2ManagedObject; anchor: V2Anchor }
  | { command: "assign_primary_owner"; object: V2ManagedObject; ownership: V2PrimaryOwnership };

export interface MaterializeExplicitObjectInput {
  objectId?: string;
  objectType: Extract<CreateV2ManagedObjectInput["objectType"], "TASK" | "MINI_PROJECT" | "DECISION" | "OUTPUT">;
  text: string;
  anchor: Omit<V2Anchor, "anchorId" | "objectId" | "role" | "status" | "lastSeenAt"> & { anchorId?: string };
}

export interface SynchronizeExplicitObjectInput {
  objectType: MaterializeExplicitObjectInput["objectType"];
  text: string;
  graphId: string;
  externalId: string;
  contentHash: string;
}

export interface ObservePrimaryAnchorInput {
  anchorId: string;
  status: "active" | "missing" | "conflict";
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
    const initial = createV2ManagedObject({
      ...(input.objectId ? { objectId: input.objectId } : {}),
      objectType: input.objectType,
      text: input.text,
      sourceOrCreationEvent: `explicit_block:${input.anchor.graphId}:${input.anchor.externalId}`,
    }, at);
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

  async synchronizeExplicitObject(
    input: SynchronizeExplicitObjectInput,
    envelope: V2CommandEnvelope,
    at = new Date(),
  ): Promise<V2AnchorCommandResult> {
    requireEnvelope(envelope);
    const replay = await this.replay(envelope.idempotencyKey, "synchronize_explicit_object");
    if (replay?.command === "synchronize_explicit_object") {
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
