import assert from "node:assert/strict";
import test from "node:test";

import type { FrozenEvidence, SkillPackage, WorkObject } from "@task-copilot/contracts";
import { DeterministicCurrentFocusAgent, DeterministicEngagementAgent } from "../src/index.ts";

const target: WorkObject = { id: "work-01", kind: "TASK", title: "上架服务器", lifecycle: "OPEN", engagement: "ACTIONABLE", waitingCondition: null, currentFocus: null, version: 1, createdAt: "now", updatedAt: "now" };
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

test("Fake Engagement Agent covers enter, leave, no-op, ambiguity, parking, and scope", async () => {
  const agent = new DeterministicEngagementAgent();
  assert.equal((await agent.propose({ target, skill, evidence: [evidence("网络组还没有分配 VLAN，需要等 VLAN 和网关信息确认后才能继续服务器网络配置。")] })).transition?.to, "WAITING");
  const waiting = { ...target, engagement: "WAITING" as const, waitingCondition: { workObjectId: target.id, description: "等待网络组分配 VLAN 和网关信息", since: "now", reviewAt: null, evidenceIds: ["evidence-01"] } };
  assert.equal((await agent.propose({ target: waiting, skill, evidence: [evidence("VLAN 310、网关和地址规划已经由网络组确认。")] })).transition?.to, "ACTIONABLE");
  assert.equal((await agent.propose({ target, skill, evidence: [evidence("明天继续写实施方案。")] })).outcome, "NO_PROPOSAL");
  assert.equal((await agent.propose({ target: waiting, skill, evidence: [evidence("对方应该快回复了。")] })).outcome, "NO_PROPOSAL");
  assert.equal((await agent.propose({ target, skill, evidence: [evidence("这个项目先放到下季度再做。")] })).reasonCode, "PARKING_REQUIRES_USER_DECISION");
  assert.equal((await agent.propose({ target, skill, evidence: [evidence("另一个项目还在等待审批。")] })).reasonCode, "SCOPE_UNCLEAR");
});
