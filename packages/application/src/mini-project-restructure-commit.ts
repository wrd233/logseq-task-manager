import { validateV2ProposalForSubmission, type V2Proposal } from "@task-copilot/domain";
import { StructuredError, checksum } from "@task-copilot/shared";

export interface MiniProjectRestructureCreateStep {
  operationId: string;
  kind: "CREATE_BLOCK";
  blockUuid: string;
  parentBlockUuid: string;
  previousSiblingUuid: string | null;
  text: string;
  contentHash: string;
  beforeHash: string;
  afterHash: string;
}

export interface MiniProjectRestructureMoveStep {
  operationId: string;
  kind: "MOVE_BLOCK";
  blockUuid: string;
  contentHash: string;
  fromParentBlockUuid: string;
  fromPreviousSiblingUuid: string | null;
  applyFromParentBlockUuid: string;
  applyFromPreviousSiblingUuid: string | null;
  toParentBlockUuid: string;
  toPreviousSiblingUuid: string | null;
  beforeHash: string;
  afterHash: string;
}

export type MiniProjectRestructureStep = MiniProjectRestructureCreateStep | MiniProjectRestructureMoveStep;

export type MiniProjectRestructureCompensationStep =
  | { operationId: string; kind: "REMOVE_CREATED_BLOCK"; blockUuid: string; contentHash: string; expectedParentBlockUuid: string; expectedPreviousSiblingUuid: string | null }
  | { operationId: string; kind: "MOVE_BLOCK"; blockUuid: string; contentHash: string; fromParentBlockUuid: string; fromPreviousSiblingUuid: string | null; toParentBlockUuid: string; toPreviousSiblingUuid: string | null };

export interface MiniProjectRestructureCommitPlan {
  proposalId: string;
  groupId: string;
  objectId: string;
  expectedVersion: number;
  sourceRootBlockUuid: string;
  sourceScopeHash: string;
  sourceStructureHash: string;
  expectedStructureHash: string;
  steps: MiniProjectRestructureStep[];
  compensationSteps: MiniProjectRestructureCompensationStep[];
}

export interface MiniProjectRestructureUndoPlanEntry {
  stepIndex: number;
  forwardStepIndex: number;
  step: MiniProjectRestructureCompensationStep;
  operationId: string;
  beforeHash: string;
  afterHash: string;
}

function commitError(code: string, message: string): StructuredError {
  return new StructuredError({ code, message, ruleRefs: ["D-094", "D-185"] });
}

function stringValue(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value !== "string" || !value.trim()) throw commitError("V2_MINI_PROJECT_RESTRUCTURE_PLAN_INVALID", `结构操作缺少 ${key}。`);
  return value;
}

function siblingValue(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  if (value === null) return null;
  if (typeof value !== "string" || !value.trim()) throw commitError("V2_MINI_PROJECT_RESTRUCTURE_PLAN_INVALID", `结构操作缺少 ${key}。`);
  return value;
}

export function planAcceptedMiniProjectRestructure(proposal: V2Proposal): MiniProjectRestructureCommitPlan {
  validateV2ProposalForSubmission(proposal);
  const accepted = proposal.groups.filter((group) => group.disposition === "ACCEPTED");
  if (!["ACCEPTED", "PARTIALLY_ACCEPTED", "APPLIED"].includes(proposal.status) || accepted.length !== 1) throw commitError("V2_MINI_PROJECT_RESTRUCTURE_COMMIT_SHAPE_INVALID", "MiniProject 原位重构必须是唯一已接受的语义组。");
  const group = accepted[0]!;
  if (proposal.groups.some((candidate) => candidate.groupId !== group.groupId && candidate.disposition !== "REJECTED") || group.risk !== "HIGH" || group.textPatches.length !== 0 || group.semanticOperations.length < 1 || group.semanticOperations.length > 64) {
    throw commitError("V2_MINI_PROJECT_RESTRUCTURE_COMMIT_SHAPE_INVALID", "MiniProject 原位重构必须是 1–64 项、无正文 Patch 的独立 HIGH 结构组。");
  }
  if (group.semanticOperations.some((operation) => operation.kind !== "CREATE_BLOCK" && operation.kind !== "MOVE_BLOCK")) throw commitError("V2_MINI_PROJECT_RESTRUCTURE_OPERATION_UNSUPPORTED", "MiniProject 原位重构只允许 CREATE_BLOCK 与 MOVE_BLOCK。");
  const objectTargets = proposal.scope.read.filter((target) => target.kind === "OBJECT" && target.version !== undefined);
  if (objectTargets.length !== 1) throw commitError("V2_MINI_PROJECT_RESTRUCTURE_SUBJECT_INVALID", "MiniProject 原位重构必须绑定一个带版本对象。");

  const existingBlockIds = new Set([...proposal.scope.read, ...proposal.scope.modify].filter((target) => target.kind === "BLOCK").map((target) => target.id));
  const availableBlockIds = new Set(existingBlockIds);
  const steps: MiniProjectRestructureStep[] = [];
  let sourceRootBlockUuid: string | undefined;
  let sourceScopeHash: string | undefined;
  let sourceStructureHash: string | undefined;
  let expectedStructureHash: string | undefined;
  for (const operation of group.semanticOperations) {
    const operationRoot = stringValue(operation.payload, "sourceRootBlockUuid");
    const operationScopeHash = stringValue(operation.payload, "sourceScopeHash");
    const operationSourceStructureHash = stringValue(operation.payload, "sourceStructureHash");
    const operationExpectedStructureHash = stringValue(operation.payload, "expectedStructureHash");
    if (![operationScopeHash, operationSourceStructureHash, operationExpectedStructureHash].every((hash) => /^[0-9a-f]{8}$/.test(hash)) || sourceRootBlockUuid && sourceRootBlockUuid !== operationRoot || sourceScopeHash && sourceScopeHash !== operationScopeHash || sourceStructureHash && sourceStructureHash !== operationSourceStructureHash || expectedStructureHash && expectedStructureHash !== operationExpectedStructureHash) throw commitError("V2_MINI_PROJECT_RESTRUCTURE_SOURCE_EVIDENCE_INVALID", "结构操作没有共享同一个来源 root、scope 与结构指纹。");
    sourceRootBlockUuid = operationRoot;
    sourceScopeHash = operationScopeHash;
    sourceStructureHash = operationSourceStructureHash;
    expectedStructureHash = operationExpectedStructureHash;
    if (!existingBlockIds.has(operationRoot)) throw commitError("V2_MINI_PROJECT_RESTRUCTURE_SOURCE_EVIDENCE_INVALID", "来源 root 不在已审阅 scope 内。");
    if (operation.kind === "CREATE_BLOCK") {
      const blockUuid = stringValue(operation.payload, "newBlockUuid");
      const parentBlockUuid = stringValue(operation.payload, "parentBlockUuid");
      const previousSiblingUuid = siblingValue(operation.payload, "previousSiblingUuid");
      const text = stringValue(operation.payload, "text");
      const contentHash = stringValue(operation.payload, "contentHash");
      if (availableBlockIds.has(blockUuid) || !availableBlockIds.has(parentBlockUuid) || previousSiblingUuid !== null && !availableBlockIds.has(previousSiblingUuid) || checksum(text) !== contentHash) throw commitError("V2_MINI_PROJECT_RESTRUCTURE_ORDER_INVALID", "CREATE_BLOCK 引用了尚未建立的位置，或其身份/正文证据无效。");
      const position = { blockUuid, parentBlockUuid, previousSiblingUuid, contentHash };
      steps.push({ operationId: operation.operationId, kind: "CREATE_BLOCK", blockUuid, parentBlockUuid, previousSiblingUuid, text, contentHash, beforeHash: checksum({ blockUuid, exists: false }), afterHash: checksum(position) });
      availableBlockIds.add(blockUuid);
    } else {
      const blockUuid = operation.target.id;
      const contentHash = stringValue(operation.payload, "contentHash");
      const fromParentBlockUuid = stringValue(operation.payload, "fromParentBlockUuid");
      const fromPreviousSiblingUuid = siblingValue(operation.payload, "fromPreviousSiblingUuid");
      const applyFromParentBlockUuid = stringValue(operation.payload, "applyFromParentBlockUuid");
      const applyFromPreviousSiblingUuid = siblingValue(operation.payload, "applyFromPreviousSiblingUuid");
      const toParentBlockUuid = stringValue(operation.payload, "toParentBlockUuid");
      const toPreviousSiblingUuid = siblingValue(operation.payload, "toPreviousSiblingUuid");
      if (!existingBlockIds.has(blockUuid) || !availableBlockIds.has(fromParentBlockUuid) || fromPreviousSiblingUuid !== null && !availableBlockIds.has(fromPreviousSiblingUuid) || !availableBlockIds.has(applyFromParentBlockUuid) || applyFromPreviousSiblingUuid !== null && !availableBlockIds.has(applyFromPreviousSiblingUuid) || !availableBlockIds.has(toParentBlockUuid) || toPreviousSiblingUuid !== null && !availableBlockIds.has(toPreviousSiblingUuid) || operation.target.hash !== contentHash) throw commitError("V2_MINI_PROJECT_RESTRUCTURE_ORDER_INVALID", "MOVE_BLOCK 引用了未审阅或尚未建立的位置。");
      steps.push({ operationId: operation.operationId, kind: "MOVE_BLOCK", blockUuid, contentHash, fromParentBlockUuid, fromPreviousSiblingUuid, applyFromParentBlockUuid, applyFromPreviousSiblingUuid, toParentBlockUuid, toPreviousSiblingUuid, beforeHash: checksum({ blockUuid, contentHash, parentBlockUuid: applyFromParentBlockUuid, previousSiblingUuid: applyFromPreviousSiblingUuid }), afterHash: checksum({ blockUuid, contentHash, parentBlockUuid: toParentBlockUuid, previousSiblingUuid: toPreviousSiblingUuid }) });
    }
  }
  const compensationSteps: MiniProjectRestructureCompensationStep[] = steps.slice().reverse().map((step) => step.kind === "CREATE_BLOCK"
    ? { operationId: `compensate:${step.operationId}`, kind: "REMOVE_CREATED_BLOCK", blockUuid: step.blockUuid, contentHash: step.contentHash, expectedParentBlockUuid: step.parentBlockUuid, expectedPreviousSiblingUuid: step.previousSiblingUuid }
    : { operationId: `compensate:${step.operationId}`, kind: "MOVE_BLOCK", blockUuid: step.blockUuid, contentHash: step.contentHash, fromParentBlockUuid: step.toParentBlockUuid, fromPreviousSiblingUuid: step.toPreviousSiblingUuid, toParentBlockUuid: step.fromParentBlockUuid, toPreviousSiblingUuid: step.fromPreviousSiblingUuid });
  return { proposalId: proposal.proposalId, groupId: group.groupId, objectId: objectTargets[0]!.id, expectedVersion: objectTargets[0]!.version!, sourceRootBlockUuid: sourceRootBlockUuid!, sourceScopeHash: sourceScopeHash!, sourceStructureHash: sourceStructureHash!, expectedStructureHash: expectedStructureHash!, steps, compensationSteps };
}

export function planCompletedMiniProjectRestructureUndo(plan: MiniProjectRestructureCommitPlan): MiniProjectRestructureUndoPlanEntry[] {
  const pendingMoves = plan.steps
    .map((step, forwardStepIndex) => ({ step, forwardStepIndex }))
    .filter((entry): entry is { step: MiniProjectRestructureMoveStep; forwardStepIndex: number } => entry.step.kind === "MOVE_BLOCK");
  const orderedMoves: typeof pendingMoves = [];
  while (pendingMoves.length > 0) {
    const pendingBlockIds = new Set(pendingMoves.map(({ step }) => step.blockUuid));
    const readyIndex = pendingMoves.findIndex(({ step }) =>
      step.fromPreviousSiblingUuid === null || !pendingBlockIds.has(step.fromPreviousSiblingUuid));
    if (readyIndex < 0) throw commitError("V2_MINI_PROJECT_RESTRUCTURE_UNDO_ORDER_INVALID", "结构 Undo 的原始相邻顺序存在循环依赖。");
    orderedMoves.push(pendingMoves.splice(readyIndex, 1)[0]!);
  }
  const removals = plan.steps
    .map((step, forwardStepIndex) => ({ step, forwardStepIndex }))
    .filter((entry): entry is { step: MiniProjectRestructureCreateStep; forwardStepIndex: number } => entry.step.kind === "CREATE_BLOCK")
    .reverse();
  const ordered = [
    ...orderedMoves.map(({ step, forwardStepIndex }) => ({
      forwardStepIndex,
      forward: step,
      inverse: {
        operationId: `compensate:${step.operationId}`,
        kind: "MOVE_BLOCK" as const,
        blockUuid: step.blockUuid,
        contentHash: step.contentHash,
        fromParentBlockUuid: step.toParentBlockUuid,
        fromPreviousSiblingUuid: step.toPreviousSiblingUuid,
        toParentBlockUuid: step.fromParentBlockUuid,
        toPreviousSiblingUuid: step.fromPreviousSiblingUuid,
      },
    })),
    ...removals.map(({ step, forwardStepIndex }) => ({
      forwardStepIndex,
      forward: step,
      inverse: {
        operationId: `compensate:${step.operationId}`,
        kind: "REMOVE_CREATED_BLOCK" as const,
        blockUuid: step.blockUuid,
        contentHash: step.contentHash,
        expectedParentBlockUuid: step.parentBlockUuid,
        expectedPreviousSiblingUuid: step.previousSiblingUuid,
      },
    })),
  ];
  return ordered.map(({ forwardStepIndex, forward, inverse }, stepIndex) => ({
    stepIndex,
    forwardStepIndex,
    step: inverse,
    operationId: `undo:${forward.operationId}`,
    beforeHash: forward.afterHash,
    afterHash: forward.beforeHash,
  }));
}
