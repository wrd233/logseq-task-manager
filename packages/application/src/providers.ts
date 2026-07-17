import type { Proposal, SemanticOperation } from "@task-copilot/domain";
import { StructuredError } from "@task-copilot/shared";

import type { AgentProvider, ProposalContext } from "./ports.ts";

export class NoAgentProvider implements AgentProvider {
  readonly providerId = "no-agent";
  readonly providerVersion = "1";
  readonly enabled = false;

  async generateProposal(): Promise<Proposal> {
    throw new StructuredError({
      code: "AGENT_DISABLED",
      message: "Agent 已关闭；捕获、手工正式化、对象编辑、状态流转、视图、导出和恢复仍可使用。",
      ruleRefs: ["AGT-AUTH-001", "TST-MVP-010"],
    });
  }
}

function operation(
  context: ProposalContext,
  operationType: SemanticOperation["operationType"],
  payload: Record<string, unknown>,
  options: {
    target?: SemanticOperation["target"];
    dependencies?: string[];
    riskLevel?: SemanticOperation["riskLevel"];
    ruleRefs: string[];
    rationale: string;
  },
): SemanticOperation {
  return {
    operationId: context.createId("op"),
    operationType,
    target: options.target ?? { kind: "CAPTURE", id: context.capture.captureId },
    payload,
    preconditions: [],
    dependencies: options.dependencies ?? [],
    riskLevel: options.riskLevel ?? "MEDIUM",
    ruleRefs: options.ruleRefs,
    rationale: options.rationale,
    confidence: 1,
    status: "PROPOSED",
  };
}

export class DeterministicDemoProvider implements AgentProvider {
  readonly providerId = "deterministic-demo";
  readonly providerVersion = "1";
  readonly enabled = true;

  async generateProposal(context: ProposalContext): Promise<Proposal> {
    const objectId = context.createId("obj");
    const formalText =
      "需要在下周前完成告警生成、中间处理和外部推送链路的整体梳理。现有脚本可继续作为基础，并需选择一条真实事件验证完整链路。";
    const rewrite = operation(
      context,
      "rewrite_content",
      { text: formalText },
      {
        ruleRefs: ["PRI-004", "MAP-RWT-001", "REV-PART-002"],
        rationale: "忠实保留截止、现有脚本和真实验证要求，并改为可直接阅读的正式正文。",
      },
    );
    const create = operation(
      context,
      "create_object",
      {
        captureId: context.capture.captureId,
        input: {
          objectId,
          objectType: "MINI_PROJECT",
          text: formalText,
          targetOutcome: "形成完整链路说明和真实事件验证证据",
          completionCriteria: "告警链路说明和真实事件验证证据均已保存",
          nextAction: "选择一条非 Test 真实事件",
          sourceOrCreationEvent: `event_created_${objectId}`,
        },
      },
      {
        ruleRefs: ["SEM-MINI-001", "SEM-COMMON-001"],
        rationale: "该输入包含静态梳理与真实验证两个步骤，并形成有限结果。",
      },
    );
    const owner = operation(
      context,
      "set_primary_ownership",
      { objectId, ownerObjectId: "candidate_unconfirmed" },
      {
        target: { kind: "OBJECT", id: objectId },
        dependencies: [create.operationId],
        riskLevel: "HIGH",
        ruleRefs: ["REL-OWN-001", "REV-PART-003"],
        rationale: "演示主归属必须单独审查；候选未确认时不得静默选择。",
      },
    );
    const move = operation(
      context,
      "move_content",
      { pageRef: "Task Copilot/待确认归属" },
      {
        target: { kind: "ANCHOR", id: context.anchor.anchorId },
        riskLevel: "HIGH",
        ruleRefs: ["REL-PLC-002", "REV-PART-002"],
        rationale: "物理移动是高影响独立操作，Demo 默认不应接受。",
      },
    );
    const resolve = operation(
      context,
      "resolve_capture",
      { captureId: context.capture.captureId, objectIds: [objectId] },
      {
        dependencies: [rewrite.operationId, create.operationId],
        ruleRefs: ["CAP-FRM-001"],
        rationale: "只有正式内容与对象均成功提交后 Capture 才可解决。",
      },
    );
    return {
      proposalId: context.createId("prop"),
      sourceAnchorIds: [context.anchor.anchorId],
      sourceObjectIds: [],
      summary: "Demo：改写正文并建立有限结果对象；归属与移动保持独立。",
      facts: [context.capture.originalText],
      assumptions: [],
      uncertainties: ["主归属尚未确认"],
      operations: [rewrite, create, owner, move, resolve],
      generatedAt: context.now.toISOString(),
      providerId: this.providerId,
      providerVersion: this.providerVersion,
      ruleVersion: "visual-spec-v1.0",
      status: "OPEN",
    };
  }
}
