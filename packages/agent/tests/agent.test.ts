import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";

import type { ExecutionProfile, FrozenEvidence, SkillPackage, WorkObject } from "@task-copilot/contracts";
import { DeepSeekV4FlashExecutor, DeterministicCurrentFocusAgent, DeterministicEngagementAgent, extractStructuredJudgmentText, loadEngagementReconciliationSkill, loadMiniProjectGovernanceSkill, loadMiniProjectTaste, loadWorkIntentMaintenanceSkill, parseDeepSeekJudgmentText, parseSemanticJudgment } from "../src/index.ts";

const target: WorkObject = { id: "work-01", kind: "TASK", title: "上架服务器", lifecycle: "OPEN", engagement: "ACTIONABLE", waitingCondition: null, currentFocus: null, desiredOutcome: null, completionChecks: [], version: 1, createdAt: "now", updatedAt: "now" };
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

test("MiniProject composite Skill and provisional Taste are immutable hashed packages with all restraint evals", async () => {
  const governance = await loadMiniProjectGovernanceSkill(); const workIntent = await loadWorkIntentMaintenanceSkill(); const taste = await loadMiniProjectTaste();
  assert.match(governance.contentHash, /^[0-9a-f]{64}$/u); assert.equal((governance.manifest as { authority: string }).authority, "READ_ONLY_COMPOSITE");
  assert.equal((governance.manifest as { delegatedMutationSkills: string[] }).delegatedMutationSkills.includes("work-intent-maintenance@0.1.0"), true);
  assert.equal((workIntent.manifest as { operation: string }).operation, "UPDATE_WORK_INTENT"); assert.match(workIntent.contentHash, /^[0-9a-f]{64}$/u);
  assert.deepEqual((governance.eval as Array<{ id: string }>).map((item) => item.id), ["healthy_miniproject_no_change", "early_sparse_no_overgovernance", "outcome_ambiguity_grill", "completion_not_yet_needed", "two_outputs_split_candidate", "historical_vs_current_fact", "ambiguous_user_commitment", "rich_context_sparse_surface", "overstructured_miniproject", "taste_conflict_user_override"]);
  assert.equal(taste.status, "PROVISIONAL"); assert.equal(taste.preferences.every((item) => item.confidence === "HIGH"), true); assert.match(taste.contentHash, /^[0-9a-f]{64}$/u);
});

test("Fake Engagement Agent covers enter, leave, no-op, ambiguity, parking, and scope", async () => {
  const agent = new DeterministicEngagementAgent();
  assert.equal((await agent.propose({ target, skill, evidence: [evidence("网络组还没有分配 VLAN，需要等 VLAN 和网关信息确认后才能继续服务器网络配置。")] })).transition?.to, "WAITING");
  assert.equal((await agent.propose({ target, skill, evidence: [evidence("网络组还没有分配 VLAN，需要等 VLAN 和网关信息确认后才能继续；复查：2026-08-15。")] })).transition?.waiting?.reviewAt, "2026-08-15");
  assert.equal((await agent.propose({ target, skill, evidence: [evidence("网络组还没有分配 VLAN，需要等 VLAN 和网关信息确认后才能继续；复查：2026-02-30。")] })).transition?.waiting?.reviewAt, null);
  const waiting = { ...target, engagement: "WAITING" as const, waitingCondition: { workObjectId: target.id, description: "等待网络组分配 VLAN 和网关信息", since: "now", reviewAt: null, evidenceIds: ["evidence-01"] } };
  assert.equal((await agent.propose({ target: waiting, skill, evidence: [evidence("VLAN 310、网关和地址规划已经由网络组确认。")] })).transition?.to, "ACTIONABLE");
  assert.equal((await agent.propose({ target: waiting, skill, evidence: [evidence("VLAN 已分配，但网关仍未确认，不能继续。")] })).reasonCode, "WAITING_NOT_PROVEN_RESOLVED");
  const waitingForProcurement = { ...waiting, waitingCondition: { ...waiting.waitingCondition, description: "等待采购流程审批完成" } };
  assert.equal((await agent.propose({ target: waitingForProcurement, skill, evidence: [evidence("VLAN 310、网关和地址规划已经由网络组确认。")] })).reasonCode, "WAITING_NOT_PROVEN_RESOLVED");
  assert.equal((await agent.propose({ target: waitingForProcurement, skill, evidence: [evidence("采购流程审批已通过，可以下单。")] })).transition?.to, "ACTIONABLE");
  assert.equal((await agent.propose({ target, skill, evidence: [evidence("明天继续写实施方案。")] })).outcome, "NO_PROPOSAL");
  assert.equal((await agent.propose({ target: waiting, skill, evidence: [evidence("对方应该快回复了。")] })).outcome, "NO_PROPOSAL");
  assert.equal((await agent.propose({ target, skill, evidence: [evidence("这个项目先放到下季度再做。")] })).reasonCode, "PARKING_REQUIRES_USER_DECISION");
  assert.equal((await agent.propose({ target, skill, evidence: [evidence("另一个项目还在等待审批。")] })).reasonCode, "SCOPE_UNCLEAR");
});

test("versioned Engagement Skill eval cases execute every frozen semantic boundary", async () => {
  const agent = new DeterministicEngagementAgent();
  const packageSkill = await loadEngagementReconciliationSkill();
  const cases = packageSkill.eval as Array<{ name: string; engagement: "ACTIONABLE" | "WAITING"; waitingDescription?: string; evidence: string; expected: { outcome: "PROPOSAL" | "NO_PROPOSAL"; to?: "ACTIONABLE" | "WAITING"; reasonCode?: string } }>;
  assert.equal(cases.length, 8);
  for (const item of cases) {
    const caseTarget: WorkObject = item.engagement === "WAITING"
      ? { ...target, engagement: "WAITING", waitingCondition: { workObjectId: target.id, description: item.waitingDescription!, since: "now", reviewAt: null, evidenceIds: ["evidence-01"] } }
      : target;
    const result = await agent.propose({ target: caseTarget, skill: packageSkill, evidence: [evidence(item.evidence)] });
    assert.equal(result.outcome, item.expected.outcome, item.name);
    assert.equal(result.transition?.to, item.expected.to, item.name);
    if (item.expected.reasonCode) assert.equal(result.reasonCode, item.expected.reasonCode, item.name);
  }
});

test("DeepSeek parsing is syntax-only extraction with no semantic repair", () => {
  const wrapped = '前置说明 {"kind":"NO_CHANGE","dimension":"engagement","rationaleSummary":"无变化"} 尾部说明';
  const extracted = extractStructuredJudgmentText(wrapped);
  assert.deepEqual(JSON.parse(extracted), { kind: "NO_CHANGE", dimension: "engagement", rationaleSummary: "无变化" });
  assert.equal(parseDeepSeekJudgmentText(wrapped).kind, "NO_CHANGE");
  // An unbalanced object is never auto-closed.
  assert.throws(() => extractStructuredJudgmentText('{"kind":"NO_CHANGE","dimension":"engagement","rationaleSummary":"无变化"'), /DEEPSEEK_JSON_NOT_FOUND/u);
  // A CONFIRMED_CHANGE without supporting handles is never semantically repaired.
  const incomplete = '{"kind":"CONFIRMED_CHANGE","dimension":"engagement","proposedOperation":{"type":"CHANGE_ENGAGEMENT","transition":{"from":"ACTIONABLE","to":"WAITING","waiting":{"description":"等待","reviewAt":null}}},"rationaleSummary":"缺 handles"}';
  assert.throws(() => parseDeepSeekJudgmentText(incomplete), /DEEPSEEK_RESULT_HANDLES_INVALID/u);
  assert.throws(() => parseSemanticJudgment(JSON.parse(incomplete)), /DEEPSEEK_RESULT_HANDLES_INVALID/u);
});

test("DeepSeek executor enforces profile fields and bounded retries without silent fallback", async () => {
  const requests: Array<{ model: string; reasoning?: { effort: string } }> = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      requests.push(JSON.parse(Buffer.concat(chunks).toString("utf8")) as { model: string; reasoning?: { effort: string } });
      if (requests.length < 3) {
        response.writeHead(500, { "content-type": "application/json" }); response.end('{"error":"temporary"}'); return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: '{"kind":"NO_CHANGE","dimension":"engagement","rationaleSummary":"稳定"}' }] }] }));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("TEST_SERVER_ADDRESS_INVALID");
  try {
    const executor = new DeepSeekV4FlashExecutor({ apiKey: "test-key-not-a-secret", baseUrl: `http://127.0.0.1:${address.port}/v1/responses` });
    const profile: ExecutionProfile = {
      id: "deepseek-profile-test", executor: "DEEPSEEK", modelAlias: "deepseek-v4-flash-test", remoteEnabled: true,
      allowedDataScope: ["formal_state"], maxContextItems: 4, maxInputChars: 10_000, reasoningEffort: "high",
      timeoutMs: 5_000, retryBudget: 2, credentialRef: "DEEPSEEK_API_KEY",
    };
    const result = await executor.judge({ object: target, contextPack: [], openIssues: [], profile });
    assert.equal(result.kind, "NO_CHANGE");
    assert.equal(requests.length, 3);
    assert.equal(requests.every((item) => item.model === "deepseek-v4-flash-test" && item.reasoning?.effort === "high"), true);
    await assert.rejects(executor.judge({ object: target, contextPack: [], openIssues: [], profile: { ...profile, executor: "FAKE" as const } }), /PROFILE_EXECUTOR_MISMATCH/u);
    await assert.rejects(executor.judge({ object: target, contextPack: [], openIssues: [], profile: { ...profile, remoteEnabled: false } }), /REMOTE_EXECUTOR_NOT_ENABLED/u);
    await assert.rejects(executor.judge({ object: target, contextPack: [], openIssues: [], profile: { ...profile, credentialRef: null } }), /DEEPSEEK_CREDENTIAL_REF_REQUIRED/u);
  } finally {
    server.close();
    await once(server, "close");
  }
});
