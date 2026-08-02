import {
  validateCreationSession,
  validateV2ProposalForSubmission,
  type CreationDraftNode,
  type CreationDraftRevision,
  type CreationPlacementPlan,
  type CreationSession,
  type V2Proposal,
  type V2ProposalScopeTarget,
} from "@task-copilot/domain";
import { StructuredError, checksum } from "@task-copilot/shared";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface CreationSessionProposalInput {
  proposalId: string;
  session: CreationSession;
  objectId: string;
  createdBlockUuids: Readonly<Record<string, string>>;
  createdAt: string;
}

export interface CreationSessionCommitNode {
  nodeId: string;
  semanticKey: string;
  text: string;
  parentNodeId?: string;
  order: number;
  nodeType: CreationDraftNode["nodeType"];
  operation: CreationDraftNode["operation"];
  sourceBlockUuid?: string;
  blockUuid: string;
  contentHash: string;
}

export interface CreationSessionCommitPlan {
  proposalId: string;
  groupId: string;
  sessionId: string;
  expectedSessionVersion: number;
  draftRevisionId: string;
  targetType: CreationSession["targetType"];
  objectId: string;
  sourceFingerprint: string;
  placement: CreationPlacementPlan;
  nodes: CreationSessionCommitNode[];
}

export interface CreationSessionMiniTreeNode {
  blockUuid: string;
  text: string;
  parentBlockUuid?: string;
  order: number;
  contentHash: string;
  operation: CreationDraftNode["operation"];
}

export interface CreationSessionMiniGraphPlan {
  mode: "IN_PLACE" | "NEW_TREE";
  placement: Exclude<CreationPlacementPlan, { kind: "NEW_PROJECT_PAGE" }>;
  rootBlockUuid: string;
  beforeNodes: CreationSessionMiniTreeNode[];
  afterNodes: CreationSessionMiniTreeNode[];
  beforeHash: string;
  afterHash: string;
}

function creationPlanError(code: string, message: string): StructuredError {
  return new StructuredError({ code, message, ruleRefs: ["CREATION-SESSION-001", "D-094", "D-185"] });
}

function currentDraft(session: CreationSession): CreationDraftRevision {
  const draft = session.draftRevisions.find(({ revisionId }) => revisionId === session.currentDraftRevisionId);
  if (!draft || !draft.adopted) throw creationPlanError("CREATION_SESSION_DRAFT_NOT_ADOPTED", "正式创建必须绑定当前已采用 Draft Revision。");
  return draft;
}

function currentCapture(source: CreationSession["sources"][number]) {
  return source.captures.find(({ captureId }) => captureId === source.currentCaptureId)!;
}

function sourceFingerprint(session: CreationSession): string {
  return checksum(session.sources.map((source) => ({
    sourceId: source.sourceId,
    kind: source.kind,
    externalId: source.externalId,
    pageName: source.pageName,
    captureId: source.currentCaptureId,
    snapshotHash: currentCapture(source).snapshotHash,
  })));
}

function graphSourceTargets(session: CreationSession): V2ProposalScopeTarget[] {
  const targets = new Map<string, V2ProposalScopeTarget>();
  for (const source of session.sources) {
    if (source.kind === "BLANK") continue;
    const capture = currentCapture(source);
    if (source.availability !== "AVAILABLE" || source.latestKnownHash !== capture.snapshotHash || capture.reason !== "PRE_COMMIT") {
      throw creationPlanError("CREATION_SESSION_PRE_COMMIT_CAPTURE_REQUIRED", "所有 Graph 来源必须先保存与当前内容一致的 PRE_COMMIT 快照。");
    }
    if (source.kind === "PAGE") {
      const pageId = source.externalId!;
      targets.set(`PAGE:${pageId}`, { kind: "PAGE", id: pageId, expectedExistence: "PRESENT", hash: capture.snapshotHash });
    }
    for (const node of capture.hierarchy.filter(({ relation }) => relation !== "PARENT")) {
      targets.set(`BLOCK:${node.nodeId}`, { kind: "BLOCK", id: node.nodeId, hash: checksum(node.text) });
    }
  }
  return [...targets.values()];
}

function placementTarget(session: CreationSession, readTargets: V2ProposalScopeTarget[]): V2ProposalScopeTarget {
  const placement = session.placementPlan!;
  const block = (id: string, expectedHash?: string): V2ProposalScopeTarget => {
    const observed = readTargets.find((target) => target.kind === "BLOCK" && target.id === id);
    const hash = expectedHash ?? observed?.hash;
    if (!hash) throw creationPlanError("CREATION_SESSION_PLACEMENT_UNSCOPED", "Placement Block 不在已重读的来源 scope 中。");
    return { kind: "BLOCK", id, hash };
  };
  switch (placement.kind) {
    case "SOURCE_BLOCK_IN_PLACE": return block(placement.sourceBlockUuid);
    case "SOURCE_BLOCK_CHILD": return block(placement.sourceBlockUuid);
    case "AFTER_SELECTED_BLOCK": return block(placement.selectedBlockUuid, placement.selectionHash);
    case "PAGE_END": {
      const observed = readTargets.find((target) => target.kind === "PAGE" && target.id === placement.pageId);
      const hash = placement.pageHash ?? observed?.hash;
      if (!hash) throw creationPlanError("CREATION_SESSION_PLACEMENT_UNSCOPED", "Page 末尾 Placement 必须保存当前 Page hash。");
      return { kind: "PAGE", id: placement.pageId, expectedExistence: "PRESENT", hash };
    }
    case "NEW_PROJECT_PAGE": return { kind: "PAGE", id: placement.pageName, expectedExistence: "ABSENT" };
  }
}

function validatePlacement(session: CreationSession, draft: CreationDraftRevision): void {
  const placement = session.placementPlan!;
  if (session.targetType === "PROJECT") {
    if (placement.kind !== "NEW_PROJECT_PAGE") throw creationPlanError("CREATION_SESSION_PROJECT_PLACEMENT_INVALID", "Project Creation Session 必须创建独立新 Page。");
    if (draft.nodes.some(({ operation }) => operation !== "CREATE")) throw creationPlanError("CREATION_SESSION_PROJECT_SOURCE_MUTATION", "Project Draft 不能改写或移动来源；所有正式节点必须新建。");
    return;
  }
  if (placement.kind === "NEW_PROJECT_PAGE") throw creationPlanError("CREATION_SESSION_MINI_PROJECT_PLACEMENT_INVALID", "MiniProject 不能使用 Project Page Placement。");
  if (placement.kind !== "SOURCE_BLOCK_IN_PLACE") {
    if (draft.nodes.some(({ operation }) => operation !== "CREATE")) throw creationPlanError("CREATION_SESSION_NEW_TREE_SOURCE_MUTATION", "非原位 MiniProject 必须创建新树，不能改写或移动来源。");
    return;
  }
  const primary = session.sources.find(({ role }) => role === "PRIMARY")!;
  if (primary.kind !== "BLOCK_SUBTREE" || primary.externalId !== placement.sourceBlockUuid) throw creationPlanError("CREATION_SESSION_IN_PLACE_SOURCE_INVALID", "原位 MiniProject Placement 必须指向主 Block subtree 根。");
  const sourceIds = currentCapture(primary).hierarchy.filter(({ relation }) => relation !== "PARENT").map(({ nodeId }) => nodeId);
  const retainedIds = draft.nodes.filter(({ operation }) => operation !== "CREATE").map(({ sourceBlockUuid }) => sourceBlockUuid!);
  if (draft.nodes.find(({ parentNodeId }) => !parentNodeId)?.sourceBlockUuid !== placement.sourceBlockUuid
    || new Set(retainedIds).size !== retainedIds.length
    || sourceIds.length !== retainedIds.length
    || sourceIds.some((id) => !retainedIds.includes(id))) {
    throw creationPlanError("CREATION_SESSION_IN_PLACE_MATERIAL_LOSS", "原位 MiniProject Draft 必须以来源根为根，并逐项保留完整来源子树。");
  }
}

function commitNodes(draft: CreationDraftRevision, createdBlockUuids: Readonly<Record<string, string>>): CreationSessionCommitNode[] {
  const used = new Set<string>();
  return [...draft.nodes].sort((left, right) => left.parentNodeId === right.parentNodeId ? left.order - right.order : left.nodeId.localeCompare(right.nodeId)).map((node) => {
    const blockUuid = node.operation === "CREATE" ? createdBlockUuids[node.nodeId] : node.sourceBlockUuid;
    if (!blockUuid || !UUID.test(blockUuid) || used.has(blockUuid)) throw creationPlanError("CREATION_SESSION_BLOCK_IDENTITY_INVALID", "每个 Draft 节点必须解析为唯一稳定的 Block UUID。");
    used.add(blockUuid);
    return {
      nodeId: node.nodeId,
      semanticKey: node.semanticKey,
      text: node.text,
      ...(node.parentNodeId ? { parentNodeId: node.parentNodeId } : {}),
      order: node.order,
      nodeType: node.nodeType,
      operation: node.operation,
      ...(node.sourceBlockUuid ? { sourceBlockUuid: node.sourceBlockUuid } : {}),
      blockUuid,
      contentHash: checksum(node.text),
    };
  });
}

function readableDraft(draft: CreationDraftRevision): string {
  const byParent = new Map<string | undefined, CreationDraftNode[]>();
  for (const node of draft.nodes) byParent.set(node.parentNodeId, [...(byParent.get(node.parentNodeId) ?? []), node]);
  const lines: string[] = [];
  const visit = (parentNodeId: string | undefined, depth: number): void => {
    for (const node of (byParent.get(parentNodeId) ?? []).sort((left, right) => left.order - right.order)) {
      lines.push(`${"  ".repeat(depth)}- ${node.text}`);
      visit(node.nodeId, depth + 1);
    }
  };
  visit(undefined, 0);
  return lines.join("\n");
}

export function buildCreationSessionProposal(input: CreationSessionProposalInput): V2Proposal {
  const session = validateCreationSession(input.session);
  if (session.status !== "PREVIEW_READY" || !session.placementPlan) throw creationPlanError("CREATION_SESSION_NOT_READY", "Creation Session 必须先采用 Draft 并明确 Placement。");
  if (!input.objectId.trim() || input.objectId.length > 128 || !Number.isFinite(Date.parse(input.createdAt))) throw creationPlanError("CREATION_SESSION_PROPOSAL_IDENTITY_INVALID", "正式对象 identity 或 Proposal 时间无效。");
  const draft = currentDraft(session);
  if (draft.maturity.level !== "READY" || draft.conflicts.length > 0 || draft.maturity.missing.length > 0) throw creationPlanError("CREATION_SESSION_DRAFT_NOT_FINAL", "只有无冲突、无缺口的 READY Draft 才能进入正式 Proposal。");
  const readTargets = graphSourceTargets(session);
  validatePlacement(session, draft);
  const target = placementTarget(session, readTargets);
  const nodes = commitNodes(draft, input.createdBlockUuids);
  const fingerprint = sourceFingerprint(session);
  return validateV2ProposalForSubmission({
    proposalId: input.proposalId,
    schemaVersion: "v2",
    title: `创建 ${session.targetType === "PROJECT" ? "Project" : "MiniProject"}：${session.suggestedObjectTitle ?? session.userTitle ?? nodes[0]!.text}`,
    context: `Creation Session ${session.sessionId} 的当前已采用 Draft。`,
    understanding: session.consensus.length ? session.consensus.map(({ text }) => text).join("；") : "用户已审阅当前 Draft Tree。",
    objective: "把已确认 Draft 通过既有 Proposal、Semantic Commit、Audit、Recovery 与 Undo 链路正式写入。",
    logic: "唯一 HIGH 组冻结 Session version、Draft revision、来源快照、Placement、Block identity 和完整树；接受不等于应用。",
    finalPreview: readableDraft(draft),
    unresolvedQuestions: [],
    source: { kind: "user", skillVersion: "creation-session@v1" },
    scope: { read: readTargets, modify: [target] },
    preconditions: ["Creation Session version 与 adopted Draft revision 未变化", "所有来源与 Placement 已按 PRE_COMMIT 证据重读", "正式应用必须经过现有 Semantic Commit 与恢复边界"],
    groups: [{
      groupId: "create-from-session",
      explanation: "Graph Tree、正式对象、Primary Anchor 和 Session 结果不可拆分接受。",
      risk: "HIGH",
      independentlyAcceptable: true,
      dependencies: [],
      textPatches: [],
      semanticOperations: [{
        operationId: "create-session-object",
        kind: "CREATE_OBJECT",
        target,
        summary: `创建正式 ${session.targetType === "PROJECT" ? "Project Page" : "MiniProject Tree"}`,
        payload: {
          schema: "CREATION_SESSION_V1",
          sessionId: session.sessionId,
          expectedSessionVersion: session.version,
          draftRevisionId: draft.revisionId,
          targetType: session.targetType,
          objectId: input.objectId,
          sourceFingerprint: fingerprint,
          placement: session.placementPlan,
          nodes,
          objectType: session.targetType,
          text: nodes[0]!.text,
        },
        preconditions: ["Proposal scope、Session version、来源 fingerprint 与 Placement 均仍有效"],
      }],
      disposition: "PENDING",
    }],
    status: "READY",
    createdAt: input.createdAt,
  });
}

export function planAcceptedCreationSession(proposal: V2Proposal): CreationSessionCommitPlan {
  validateV2ProposalForSubmission(proposal);
  const accepted = proposal.groups.filter(({ disposition }) => disposition === "ACCEPTED");
  if (!['ACCEPTED', 'APPLIED'].includes(proposal.status) || accepted.length !== 1 || proposal.groups.some((group) => group !== accepted[0] && group.disposition !== "REJECTED")) {
    throw creationPlanError("CREATION_SESSION_COMMIT_SHAPE_INVALID", "Creation Session 创建必须只有一个已接受语义组。");
  }
  const group = accepted[0]!;
  if (group.groupId !== "create-from-session" || group.risk !== "HIGH" || group.textPatches.length !== 0 || group.semanticOperations.length !== 1) throw creationPlanError("CREATION_SESSION_COMMIT_SHAPE_INVALID", "Creation Session 创建必须是唯一 HIGH CREATE_OBJECT 组。");
  const operation = group.semanticOperations[0]!;
  const payload = operation.payload;
  const expectedKeys = ["draftRevisionId", "expectedSessionVersion", "nodes", "objectId", "objectType", "placement", "schema", "sessionId", "sourceFingerprint", "targetType", "text"];
  if (operation.kind !== "CREATE_OBJECT" || Object.keys(payload).sort().join(",") !== expectedKeys.sort().join(",") || payload.schema !== "CREATION_SESSION_V1" || !Array.isArray(payload.nodes)) throw creationPlanError("CREATION_SESSION_COMMIT_PAYLOAD_INVALID", "Creation Session commit payload 不是受控 V1 shape。");
  if (typeof payload.sessionId !== "string" || typeof payload.expectedSessionVersion !== "number" || !Number.isSafeInteger(payload.expectedSessionVersion) || payload.expectedSessionVersion < 1
    || typeof payload.draftRevisionId !== "string" || !["MINI_PROJECT", "PROJECT"].includes(String(payload.targetType)) || payload.objectType !== payload.targetType
    || typeof payload.objectId !== "string" || !payload.objectId.trim() || typeof payload.sourceFingerprint !== "string" || !/^[0-9a-f]{8}$/.test(payload.sourceFingerprint)) {
    throw creationPlanError("CREATION_SESSION_COMMIT_PAYLOAD_INVALID", "Creation Session commit payload identity、version 或 fingerprint 无效。");
  }
  const placement = payload.placement as CreationPlacementPlan;
  const nodes = payload.nodes as CreationSessionCommitNode[];
  if (!placement || typeof placement !== "object" || !nodes.length || nodes.some((node) => !node || typeof node !== "object" || !UUID.test(node.blockUuid) || checksum(node.text) !== node.contentHash)) throw creationPlanError("CREATION_SESSION_COMMIT_PAYLOAD_INVALID", "Creation Session commit tree 或 Placement 无效。");
  return {
    proposalId: proposal.proposalId,
    groupId: group.groupId,
    sessionId: payload.sessionId,
    expectedSessionVersion: payload.expectedSessionVersion,
    draftRevisionId: payload.draftRevisionId,
    targetType: payload.targetType as CreationSession["targetType"],
    objectId: payload.objectId,
    sourceFingerprint: payload.sourceFingerprint,
    placement,
    nodes: structuredClone(nodes),
  };
}

export function verifyCreationSessionCommitPlan(sessionValue: CreationSession, plan: CreationSessionCommitPlan): CreationSession {
  const session = validateCreationSession(sessionValue);
  if (session.status !== "PREVIEW_READY" || session.sessionId !== plan.sessionId || session.version !== plan.expectedSessionVersion
    || session.currentDraftRevisionId !== plan.draftRevisionId || session.targetType !== plan.targetType
    || sourceFingerprint(session) !== plan.sourceFingerprint || checksum(session.placementPlan) !== checksum(plan.placement)) {
    throw creationPlanError("CREATION_SESSION_COMMIT_SESSION_STALE", "Creation Session、Draft、来源或 Placement 在审阅后已变化；没有准备正式 Commit。");
  }
  const draft = currentDraft(session);
  const createdBlockUuids = Object.fromEntries(plan.nodes.filter(({ operation }) => operation === "CREATE").map(({ nodeId, blockUuid }) => [nodeId, blockUuid]));
  if (checksum(commitNodes(draft, createdBlockUuids)) !== checksum(plan.nodes)) {
    throw creationPlanError("CREATION_SESSION_COMMIT_DRAFT_STALE", "Creation Session Draft Tree 与已审阅正式计划不一致；没有准备正式 Commit。");
  }
  validatePlacement(session, draft);
  return structuredClone(session);
}

export function creationSessionMiniTreeHash(rootBlockUuid: string, nodes: CreationSessionMiniTreeNode[]): string {
  return checksum({
    rootBlockUuid,
    nodes: [...nodes]
      .sort((left, right) => left.parentBlockUuid === right.parentBlockUuid ? left.order - right.order : left.blockUuid.localeCompare(right.blockUuid))
      .map(({ blockUuid, text, parentBlockUuid, order, contentHash }) => ({ blockUuid, text, ...(parentBlockUuid ? { parentBlockUuid } : {}), order, contentHash })),
  });
}

export function planCreationSessionMiniGraph(sessionValue: CreationSession, plan: CreationSessionCommitPlan): CreationSessionMiniGraphPlan {
  const session = validateCreationSession(sessionValue);
  if (session.status === "PREVIEW_READY") verifyCreationSessionCommitPlan(session, plan);
  else if (session.status !== "CREATED" || session.sessionId !== plan.sessionId || session.currentDraftRevisionId !== plan.draftRevisionId
    || session.targetType !== plan.targetType || sourceFingerprint(session) !== plan.sourceFingerprint || checksum(session.placementPlan) !== checksum(plan.placement)) {
    throw creationPlanError("CREATION_SESSION_COMMIT_SESSION_STALE", "Creation Session 结果不能重建已审阅的 MiniProject Graph 计划。");
  }
  if (plan.targetType !== "MINI_PROJECT" || plan.placement.kind === "NEW_PROJECT_PAGE") throw creationPlanError("CREATION_SESSION_MINI_GRAPH_PLAN_INVALID", "MiniProject Graph 计划的类型或 Placement 无效。");
  const root = plan.nodes.find(({ parentNodeId }) => !parentNodeId)!;
  const afterNodes = plan.nodes.map((node) => ({
    blockUuid: node.blockUuid,
    text: node.text,
    ...(node.parentNodeId ? { parentBlockUuid: plan.nodes.find(({ nodeId }) => nodeId === node.parentNodeId)!.blockUuid } : {}),
    order: node.order,
    contentHash: node.contentHash,
    operation: node.operation,
  }));
  let beforeNodes: CreationSessionMiniTreeNode[] = [];
  if (plan.placement.kind === "SOURCE_BLOCK_IN_PLACE") {
    const primary = session.sources.find(({ role }) => role === "PRIMARY")!;
    const capture = currentCapture(primary);
    const siblingOrders = new Map<string, number>();
    beforeNodes = capture.hierarchy.filter(({ relation }) => relation !== "PARENT").map((node) => {
      const parentKey = node.parentNodeId ?? "ROOT";
      const order = siblingOrders.get(parentKey) ?? 0;
      siblingOrders.set(parentKey, order + 1);
      return {
        blockUuid: node.nodeId,
        text: node.text,
        ...(node.relation === "CHILD" && node.parentNodeId ? { parentBlockUuid: node.parentNodeId } : {}),
        order,
        contentHash: checksum(node.text),
        operation: "KEEP" as const,
      };
    });
  }
  return {
    mode: plan.placement.kind === "SOURCE_BLOCK_IN_PLACE" ? "IN_PLACE" : "NEW_TREE",
    placement: structuredClone(plan.placement),
    rootBlockUuid: root.blockUuid,
    beforeNodes,
    afterNodes,
    beforeHash: plan.placement.kind === "SOURCE_BLOCK_IN_PLACE" ? creationSessionMiniTreeHash(root.blockUuid, beforeNodes) : checksum({ rootBlockUuid: root.blockUuid, exists: false }),
    afterHash: creationSessionMiniTreeHash(root.blockUuid, afterNodes),
  };
}
