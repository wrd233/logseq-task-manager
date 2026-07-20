import {
  assignV2PrimaryOwner,
  bindV2PrimaryAnchor,
  createV2ManagedObject,
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
  commitAnchor(command: V2AnchorCommand): V2AnchorCommandResult | Promise<V2AnchorCommandResult>;
  commitOwnership(command: V2OwnershipCommand): V2OwnershipCommandResult | Promise<V2OwnershipCommandResult>;
  getObject(objectId: string): V2ManagedObject | undefined | Promise<V2ManagedObject | undefined>;
  listObjects(): V2ManagedObject[] | Promise<V2ManagedObject[]>;
}

export interface V2AuditRecord {
  traceId: string;
  actor: string;
  command: "create_object" | "transition_lifecycle" | "bind_primary_anchor" | "assign_primary_owner";
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
  | { command: "bind_primary_anchor"; object: V2ManagedObject; anchor: V2Anchor }
  | { command: "assign_primary_owner"; object: V2ManagedObject; ownership: V2PrimaryOwnership };

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
