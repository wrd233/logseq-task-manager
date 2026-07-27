import type { ServiceProposalPromptBundle } from "@task-copilot/service-client";
import type { V2Proposal } from "@task-copilot/domain";
import { checksum, stableJson } from "@task-copilot/shared";

export interface SelectedBlockAnalysisInput {
  blockUuid: string;
  text: string;
  version?: number;
}

export function presentSelectedBlockAnalysisNotice(
  result: { kind: "NO_PROPOSAL"; reason: string } | { kind: "PROPOSAL_READY" },
): string {
  if (result.kind === "PROPOSAL_READY") {
    return "整理建议已放入“待我确认”。当前正文和正式状态还没有变化。";
  }
  const reason = result.reason
    .replace(/\bNO_PROPOSAL\b/gi, "暂不整理")
    .replace(/\bProposal\b/gi, "建议")
    .replace(/\bProvider\b/gi, "智能整理")
    .replace(/\bCommit\b/gi, "正式应用")
    .replace(/\bStore\b/gi, "正式状态")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  return reason
    ? `这条内容暂时不需要整理。${reason}`
    : "这条内容暂时不需要整理。当前材料还没有形成明确的任务、决定或成果。";
}

export function buildSelectedBlockProposalPrompt(input: SelectedBlockAnalysisInput): ServiceProposalPromptBundle {
  const blockUuid = input.blockUuid.trim();
  const text = input.text.trim();
  if (!blockUuid || blockUuid.length > 256 || !text || text.length > 8_000 || (input.version !== undefined && (!Number.isSafeInteger(input.version) || input.version < 0))) {
    throw new Error("当前 Block 缺少有界的 UUID、正文或版本；没有调用 Provider。");
  }
  const beforeHash = checksum(text);
  const target = { kind: "BLOCK", id: blockUuid, ...(input.version !== undefined ? { version: input.version } : {}), hash: beforeHash };
  const requiredTextPatchShape = {
    blockUuid,
    beforeText: text,
    afterText: "<使用既有显式语法开头的完整最终正文>",
  };
  const requiredSemanticOperationShape = {
    operationId: "create-object",
    kind: "CREATE_OBJECT",
    target,
    summary: "<人类可读说明>",
    payload: { objectType: "<TASK|MINI_PROJECT|DECISION|OUTPUT>", text: "<与 afterText 完全相同的完整最终正文>" },
    preconditions: ["Block 正文与 hash 未变化"],
  };
  const requiredScopeShape = { read: [], modify: [target] };
  const requiredGroupShape = {
    groupId: "formalize",
    explanation: "<人类可读说明>",
    risk: "MEDIUM",
    independentlyAcceptable: true,
    dependencies: [],
    textPatches: [requiredTextPatchShape],
    semanticOperations: [requiredSemanticOperationShape],
    disposition: "PENDING",
  };
  return {
    core: {
      version: "task-copilot-v2-core-1",
      content: "模型只生成建议。不得声称已经写入正文、对象、Anchor、Lifecycle、Condition 或 Focus；正式变化必须经过 Review、Commit 和 Undo。",
    },
    domain: {
      version: "task-copilot-v2-domain-7",
      content: [
        "六类对象固定为 AREA、PROJECT、MINI_PROJECT、TASK、DECISION、OUTPUT；当前局部正式化只允许创建 TASK、MINI_PROJECT、DECISION、OUTPUT，不得创建 AREA/PROJECT 或确认 Primary Ownership。",
        "最终正文必须使用既有显式语法开头：TASK 用 `[任务] `，MINI_PROJECT 用 `[MiniProject] `，DECISION 用 `[决策] `，OUTPUT 用 `[成果] `；禁止输出 `TASK:`、`MINI_PROJECT:` 等英文标签。",
        "TASK 是一个近期、可一次判断完成的承诺，可以包含为同一结果服务的相邻动作；不要只因一句话包含多个动词就升级为 MINI_PROJECT。MINI_PROJECT 必须有多个可独立跟踪的步骤，并以一个有限结果收口。DECISION 是已确认且持续影响后续行为的选择；OUTPUT 是已经产出的可复用成果。",
        "Marker 不决定对象身份。普通背景记录、信息不足、没有明确承诺或持续影响的选择时返回 NO_PROPOSAL。明确缺少可识别对象、责任人和时间时不得用 unresolvedQuestions 包装一个猜测 Proposal。",
        "输出 PROPOSAL 时必须严格包含 title/context/understanding/objective/logic/finalPreview/unresolvedQuestions/scope/preconditions/groups。unresolvedQuestions 和 preconditions 必须是字符串数组；不要输出 proposalId/schemaVersion/source/status/createdAt，这些字段由 Local Service 覆盖。",
        "只允许一个独立 MEDIUM group。group 必须包含 groupId/explanation/risk/independentlyAcceptable/dependencies/textPatches/semanticOperations/disposition，disposition 固定 PENDING。",
        "正式化必须有一个 REWRITE_BLOCK textPatch 和一个同目标 Block 的 CREATE_OBJECT operation。textPatch 的 beforeText 必须逐字复制 runtime 正文，afterText 是完整最终正文；不要输出 hash，机器会计算。",
        "finalPreview 必须与 textPatch.afterText 及 CREATE_OBJECT payload.text 三者逐字相同；不得把解释、类型判断过程或引号写入 finalPreview。",
        "CREATE_OBJECT payload 只包含 objectType 与完整最终正文 text。scope 必须逐字使用 runtime 的 requiredScopeShape；不得把 target 简写成 UUID 字符串。",
        "如果证据不足，输出且只输出 {\"decision\":\"NO_PROPOSAL\",\"reason\":\"简洁理由\"}。",
      ].join("\n"),
    },
    skill: {
      version: "analyze-selected-block-2",
      content: "分析一个当前选中 Block。保留原事实、日期和不确定性；只在存在清晰用户价值时给出一个低噪声 Proposal，不创建空模板、不猜测归属。",
    },
    userSemantics: {
      version: "default-writing-profile-2",
      content: "使用高密度、自然、克制的中文。优先保留用户原句，只做必要的显式化；不添加空洞管理术语。",
    },
    runtimeContext: {
      version: `block:${blockUuid}:${beforeHash}`,
      content: stableJson({
        selectedBlock: { uuid: blockUuid, text, beforeHash, ...(input.version !== undefined ? { version: input.version } : {}) },
        requiredModifyTarget: target,
        requiredScopeShape,
        requiredTextPatchShape,
        requiredSemanticOperationShape,
        requiredGroupShape,
        instruction: "逐字保留以上 key 与嵌套层级；scope 必须逐字使用 requiredScopeShape；groups 必须是只包含 requiredGroupShape 的数组。尖括号内容必须替换为当前 Block 的实际值，不得输出尖括号占位符。",
      }),
    },
  };
}

export function buildSelectedBlockProposalRevisionPrompt(
  input: SelectedBlockAnalysisInput,
  current: V2Proposal,
  revisionInstruction: string,
): ServiceProposalPromptBundle {
  const instruction = revisionInstruction.trim();
  const base = buildSelectedBlockProposalPrompt(input);
  const group = current.groups.length === 1 ? current.groups[0] : undefined;
  const patch = group?.textPatches.length === 1 ? group.textPatches[0] : undefined;
  const operation = group?.semanticOperations.length === 1 ? group.semanticOperations[0] : undefined;
  const beforeHash = checksum(input.text.trim());
  if (!instruction || instruction.length > 2_000
    || current.source.kind !== "local_llm"
    || !["READY", "IN_REVIEW", "PARTIALLY_ACCEPTED", "ACCEPTED"].includes(current.status)
    || !group || !patch || operation?.kind !== "CREATE_OBJECT"
    || patch.blockUuid !== input.blockUuid.trim() || patch.beforeText !== input.text.trim() || patch.beforeHash !== beforeHash
    || operation.target.kind !== "BLOCK" || operation.target.id !== patch.blockUuid || operation.target.hash !== beforeHash) {
    throw new Error("当前 Proposal、Block 证据或调整说明无效；没有调用 Provider，也没有修改机器表示。");
  }
  const runtime = JSON.parse(base.runtimeContext.content) as Record<string, unknown>;
  return {
    ...base,
    domain: {
      ...base.domain,
      content: `${base.domain.content}\n当前是同一 Proposal 的一句话调整：必须保留原 proposal 的 Block 目标、beforeText、scope、groupId、operationId、创建类型边界和单组结构；只按 revisionInstruction 调整人类可读内容、最终正文或对象类型。不要创建第二意图、第二目标或额外 group。`,
    },
    skill: {
      version: "analyze-selected-block-revise-1",
      content: "根据用户的一句话反馈修订当前局部正式化建议。保留原事实与机器意图，只改变用户明确要求调整的部分；输出完整替代 Proposal，不输出补丁说明。",
    },
    runtimeContext: {
      version: `${base.runtimeContext.version}:revise:${checksum(instruction)}`,
      content: stableJson({
        ...runtime,
        currentProposal: current,
        revisionInstruction: instruction,
        instruction: "输出同一 Proposal 的完整替代内容；逐字保留 requiredScopeShape 及原 Block before evidence，groups 仍只含 requiredGroupShape。把 revisionInstruction 应用到最终可读建议，不得返回第二 Proposal 或修改目标。",
      }),
    },
  };
}
