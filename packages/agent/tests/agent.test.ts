import assert from "node:assert/strict";
import test from "node:test";

import type { FrozenEvidence, SkillPackage, WorkObject } from "@task-copilot/contracts";
import { DeterministicCurrentFocusAgent } from "../src/index.ts";

const target: WorkObject = { id: "work-01", kind: "TASK", title: "上架服务器", lifecycle: "OPEN", engagement: "ACTIONABLE", currentFocus: null, version: 1, createdAt: "now", updatedAt: "now" };
const skill = { id: "current-focus-maintenance", version: "0.1.0", contentHash: "a".repeat(64) } as SkillPackage;
const evidence = (content: string): FrozenEvidence => ({ id: "evidence-01", workObjectId: target.id, sourceType: "LOGSEQ_BLOCK", graphId: "graph", externalId: "block", frozenContent: content, contentHash: "b".repeat(64), frozenAt: "now", locator: { graphId: "graph", blockUuid: "block" } });

test("Fake Agent deterministically covers proposal, no-op, ambiguity, scope expansion, and waiting", async () => {
  const agent = new DeterministicCurrentFocusAgent();
  assert.equal((await agent.propose({ target, skill, evidence: [evidence("下一步：准备服务器上架并完成管理口网络配置")] })).outcome, "PROPOSAL");
  assert.equal((await agent.propose({ target: { ...target, currentFocus: "准备服务器上架并完成管理口网络配置" }, skill, evidence: [evidence("下一步：准备服务器上架并完成管理口网络配置")] })).reasonCode, "ALREADY_ACCURATE");
  assert.equal((await agent.propose({ target, skill, evidence: [evidence("下一步可能配置网络或者等待确认")] })).reasonCode, "OUT_OF_SCOPE_WAITING");
  assert.equal((await agent.propose({ target, skill, evidence: [evidence("完成项目并关闭")] })).reasonCode, "SCOPE_EXPANSION");
  assert.equal((await agent.propose({ target, skill, evidence: [evidence("可能先做 A，也许先做 B")] })).reasonCode, "AMBIGUOUS");
});
