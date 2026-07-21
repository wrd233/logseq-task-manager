import type { ServiceProposalPromptBundle } from "@task-copilot/service-client";
import { checksum, stableJson } from "@task-copilot/shared";

export interface SelectedBlockAnalysisInput {
  blockUuid: string;
  text: string;
  version?: number;
}

export function buildSelectedBlockProposalPrompt(input: SelectedBlockAnalysisInput): ServiceProposalPromptBundle {
  const blockUuid = input.blockUuid.trim();
  const text = input.text.trim();
  if (!blockUuid || blockUuid.length > 256 || !text || text.length > 8_000 || (input.version !== undefined && (!Number.isSafeInteger(input.version) || input.version < 0))) {
    throw new Error("当前 Block 缺少有界的 UUID、正文或版本；没有调用 Provider。");
  }
  const beforeHash = checksum(text);
  const target = { kind: "BLOCK", id: blockUuid, ...(input.version !== undefined ? { version: input.version } : {}), hash: beforeHash };
  return {
    core: {
      version: "task-copilot-v2-core-1",
      content: "模型只生成建议。不得声称已经写入正文、对象、Anchor、Lifecycle、Condition 或 Focus；正式变化必须经过 Review、Commit 和 Undo。",
    },
    domain: {
      version: "task-copilot-v2-domain-6",
      content: [
        "六类对象为 AREA、PROJECT、MINI_PROJECT、TASK、DECISION、OUTPUT；当前局部正式化只允许 TASK、MINI_PROJECT、DECISION、OUTPUT。",
        "Marker 不决定对象身份。普通背景记录、信息不足、没有明确承诺或持续影响的选择时返回 NO_PROPOSAL。",
        "Proposal 必须包含 title/context/understanding/objective/logic/finalPreview/unresolvedQuestions/scope/preconditions/groups。",
        "每个 group 包含 groupId/explanation/risk/independentlyAcceptable/dependencies/textPatches/semanticOperations/disposition。",
        "正式化组使用一个 REWRITE_BLOCK textPatch 和同一 Block 上一个 CREATE_OBJECT operation；payload 必须含 objectType 与最终对象正文 text。",
        "textPatch 提供 blockUuid/beforeText/afterText；hash 由机器计算。scope.modify 必须包含目标 Block；disposition 必须为 PENDING。",
        "不要输出 proposalId/schemaVersion/source/status/createdAt 的权威值；这些字段由 Local Service 覆盖。",
      ].join("\n"),
    },
    skill: {
      version: "analyze-selected-block-1",
      content: "分析一个当前选中 Block。保留原事实、日期和不确定性；只在存在清晰用户价值时给出一个低噪声 Proposal，不创建空模板、不猜测归属。",
    },
    userSemantics: {
      version: "default-writing-profile-1",
      content: "使用高密度、自然、克制的中文。优先保留用户原句，只做必要的显式化；不添加空洞管理术语。",
    },
    runtimeContext: {
      version: `block:${blockUuid}:${beforeHash}`,
      content: stableJson({ selectedBlock: { uuid: blockUuid, text, beforeHash, ...(input.version !== undefined ? { version: input.version } : {}) }, requiredModifyTarget: target }),
    },
  };
}
