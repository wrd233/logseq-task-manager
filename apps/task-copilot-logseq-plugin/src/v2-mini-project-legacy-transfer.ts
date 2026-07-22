import type { V2ObjectType, V2Proposal } from "@task-copilot/domain";
import { checksum, stableJson } from "@task-copilot/shared";

type LegacyObjectType = Extract<V2ObjectType, "TASK" | "MINI_PROJECT" | "DECISION" | "OUTPUT">;

export interface MiniProjectLegacyTransferInput {
  closureProposalId: string;
  blockUuid: string;
  beforeText: string;
  remainingWork: string;
  objectType: LegacyObjectType;
  createdAt: string;
}

const syntax: Record<LegacyObjectType, string> = {
  TASK: "[任务]",
  MINI_PROJECT: "[MiniProject]",
  DECISION: "[决策]",
  OUTPUT: "[成果]",
};

export function buildMiniProjectLegacyTransferProposal(input: MiniProjectLegacyTransferInput): V2Proposal {
  const closureProposalId = input.closureProposalId.trim();
  const blockUuid = input.blockUuid.trim();
  const remainingWork = input.remainingWork.trim();
  if (!closureProposalId || !blockUuid || blockUuid.length > 512 || !Number.isFinite(Date.parse(input.createdAt))) throw new Error("遗留转移上下文无效；没有创建 Proposal。");
  if (input.beforeText.trim()) throw new Error("请新建并选中一个空 Block 承接遗留；不会覆盖现有正文。");
  if (!remainingWork || remainingWork.length > 4_000) throw new Error("请先填写有界的遗留或转移说明。");
  if (!(input.objectType in syntax)) throw new Error("遗留只能转为 Task、MiniProject、Decision 或 Output。");
  const beforeHash = checksum(input.beforeText);
  const afterText = `${syntax[input.objectType]} ${remainingWork}`;
  const afterHash = checksum(afterText);
  const identity = stableJson({ closureProposalId, blockUuid, beforeHash, objectType: input.objectType, remainingWork });
  const proposalId = `proposal_legacy_${checksum(identity)}_${checksum([...identity].reverse().join(""))}`;
  return {
    proposalId,
    schemaVersion: "v2",
    title: `将 MiniProject 遗留转为 ${input.objectType}`,
    context: `来自 Closure Proposal ${closureProposalId} 的遗留承接；关闭与新对象保持为两份独立 Proposal。`,
    understanding: "用户已选择一个空 Logseq Block 作为新对象候选正文。",
    objective: "把明确的遗留说明转为可独立审阅、提交和撤销的新对象。",
    logic: "只改写当前空 Block 并创建一个对象；本 Proposal 不修改原 MiniProject 的 Closure 或 Lifecycle。",
    finalPreview: afterText,
    unresolvedQuestions: [],
    source: { kind: "user" },
    scope: { read: [], modify: [{ kind: "BLOCK", id: blockUuid, hash: beforeHash }] },
    preconditions: ["目标 Block 仍为同一空正文"],
    groups: [{
      groupId: "formalize-mini-project-legacy",
      explanation: "遗留承接是独立的正式化变化，不与 MiniProject 关闭绑定提交。",
      risk: "MEDIUM",
      independentlyAcceptable: true,
      dependencies: [],
      textPatches: [{ blockUuid, beforeText: input.beforeText, afterText, beforeHash, afterHash }],
      semanticOperations: [{ operationId: "create-legacy-object", kind: "CREATE_OBJECT", target: { kind: "BLOCK", id: blockUuid, hash: beforeHash }, summary: `创建 ${input.objectType} 承接遗留`, payload: { objectType: input.objectType, text: remainingWork }, preconditions: ["目标 Block hash 未变"] }],
      disposition: "PENDING",
    }],
    status: "READY",
    createdAt: input.createdAt,
  };
}
