import assert from "node:assert/strict";
import test from "node:test";

import { V2ProposalApplication, type V2ProposalRepository, type V2StoredProposalRecord } from "@task-copilot/application";
import { checksum, type StructuredError } from "@task-copilot/shared";

import { LocalLlmProposalGenerator, assembleV2ProposalPrompt, type StructuredProposalProvider, type V2PromptBundle } from "../src/llm-proposal.ts";

const prompt: V2PromptBundle = {
  core: { version: "core-1", content: "只建议，不执行。" },
  domain: { version: "domain-6", content: "Task 是六类对象之一；Proposal 必须可审阅。" },
  skill: { version: "formalize-1", content: "识别明确承诺并给出低噪声正式化建议。" },
  userSemantics: { version: "profile-2", content: "使用简洁中文，不添加空模板。" },
  runtimeContext: { version: "ctx-9", content: "Block block-1 v1：明天确认发布范围。" },
};

function candidate(): Record<string, unknown> {
  const beforeText = "明天确认发布范围。";
  const afterText = "[任务] 明天确认发布范围";
  return {
    proposalId: "model-controlled-id",
    schemaVersion: "wrong",
    title: "正式化发布确认任务",
    context: beforeText,
    understanding: "这是一项有明确行动与时间的承诺。",
    objective: "将承诺整理为可审阅 Task。",
    logic: "保留原意，只增加显式对象标记。",
    finalPreview: afterText,
    unresolvedQuestions: [],
    source: { kind: "user", provider: "spoofed" },
    scope: { read: [{ kind: "BLOCK", id: "block-1", version: 1, hash: checksum(beforeText) }], modify: [{ kind: "BLOCK", id: "block-1", version: 1, hash: checksum(beforeText) }] },
    preconditions: ["Block v1 与 hash 未变化"],
    groups: [{
      groupId: "formalize-task", explanation: "优化表达并创建 Task", risk: "MEDIUM", independentlyAcceptable: true, dependencies: [],
      textPatches: [{ blockUuid: "block-1", beforeText, afterText, beforeHash: checksum(beforeText), afterHash: checksum(afterText) }],
      semanticOperations: [{ operationId: "create-task", kind: "CREATE_OBJECT", target: { kind: "BLOCK", id: "block-1", version: 1, hash: checksum(beforeText) }, summary: "创建 Task", payload: { objectType: "TASK", text: afterText }, preconditions: ["Block 未变化"] }],
      disposition: "PENDING",
    }],
    status: "APPLIED",
    createdAt: "2000-01-01T00:00:00.000Z",
  };
}

function provider(value: unknown): StructuredProposalProvider {
  return {
    providerId: "deepseek",
    providerVersion: "chat-completions-v1",
    completeStructured: async () => ({ value, metadata: { requestId: "req-1", model: "actual-v4-model", finishReason: "stop", totalTokens: 120, durationMs: 40, attempts: 1 } }),
  };
}

class MemoryRepository implements V2ProposalRepository {
  submitCount = 0;
  record?: V2StoredProposalRecord;
  submitProposal(proposal: V2StoredProposalRecord["proposal"], files: V2StoredProposalRecord["files"], at = new Date()): { proposal: V2StoredProposalRecord["proposal"]; replayed: boolean } {
    this.submitCount += 1;
    this.record = { proposal, files, updatedAt: at.toISOString() };
    return { proposal, replayed: false };
  }
  storedProposal(): V2StoredProposalRecord | undefined { return this.record; }
  listStoredProposals(): V2StoredProposalRecord[] { return this.record ? [this.record] : []; }
  updateStoredProposal(): V2StoredProposalRecord { throw new Error("not used"); }
}

test("five prompt layers are deterministic, versioned, and preserve the local-LLM authority boundary", () => {
  const first = assembleV2ProposalPrompt(prompt);
  const second = assembleV2ProposalPrompt(prompt);
  assert.equal(first.promptBundleVersion, second.promptBundleVersion);
  assert.match(first.system, /Core \[core-1\]/);
  assert.match(first.system, /Domain \[domain-6\]/);
  assert.match(first.system, /Skill \[formalize-1\]/);
  assert.match(first.system, /User Semantics \[profile-2\]/);
  assert.match(first.user, /Runtime Context \[ctx-9\]/);
  assert.match(first.system, /不得声称已写入 Logseq、SQLite/);
});

test("model source, ID, status, and timestamps are replaced by machine-owned Proposal metadata", async () => {
  const raw = candidate();
  raw.untrustedExtra = "must-not-persist";
  const rawGroup = (raw.groups as Array<Record<string, unknown>>)[0]!;
  delete ((rawGroup.textPatches as Array<Record<string, unknown>>)[0]!).beforeHash;
  delete ((rawGroup.textPatches as Array<Record<string, unknown>>)[0]!).afterHash;
  const generated = await new LocalLlmProposalGenerator(provider(raw)).generate({
    proposalId: "prop_issued_1", createdAt: "2026-07-21T10:00:00.000Z", prompt,
  });
  assert.equal(generated.kind, "PROPOSAL");
  if (generated.kind !== "PROPOSAL") throw new Error("expected Proposal");
  assert.equal(generated.proposal.proposalId, "prop_issued_1");
  assert.equal(generated.proposal.status, "READY");
  assert.equal(generated.proposal.createdAt, "2026-07-21T10:00:00.000Z");
  assert.deepEqual(generated.proposal.source, {
    kind: "local_llm", provider: "deepseek", model: "actual-v4-model", skillVersion: "formalize-1",
    writingProfileVersion: "profile-2", promptBundleVersion: generated.promptBundleVersion,
  });
  assert.equal(generated.proposal.groups[0]?.textPatches[0]?.beforeHash, checksum("明天确认发布范围。"));
  assert.match(generated.files.proposalMd, /最终可读预览/);
  assert.match(generated.files.proposalJson, /"kind":"local_llm"/);
  assert.doesNotMatch(generated.files.proposalJson, /untrustedExtra|must-not-persist/);
});

test("invalid model output never reaches Proposal persistence", async () => {
  const repository = new MemoryRepository();
  const application = new V2ProposalApplication(repository);
  const outsideScope = candidate();
  const group = (outsideScope.groups as Array<Record<string, unknown>>)[0]!;
  const patches = group.textPatches as Array<Record<string, unknown>>;
  patches[0] = { ...patches[0], blockUuid: "outside-block" };
  await assert.rejects(
    () => new LocalLlmProposalGenerator(provider(outsideScope)).generateAndSubmit({ proposalId: "prop_issued_2", createdAt: "2026-07-21T10:00:00.000Z", prompt }, application),
    (error: unknown) => typeof error === "object" && error !== null && (error as StructuredError).code === "V2_PROPOSAL_SCOPE_VIOLATION",
  );
  assert.equal(repository.submitCount, 0);
  assert.equal(repository.record, undefined);
});

test("ordinary notes can return a bounded NO_PROPOSAL result with zero persistence", async () => {
  const repository = new MemoryRepository();
  const application = new V2ProposalApplication(repository);
  const result = await new LocalLlmProposalGenerator(provider({ decision: "NO_PROPOSAL", reason: "这是背景记录，没有明确承诺或持续影响的决定。" })).generateAndSubmit(
    { proposalId: "prop_unused", createdAt: "2026-07-21T10:00:00.000Z", prompt }, application,
  );
  assert.equal(result.generated.kind, "NO_PROPOSAL");
  assert.equal(repository.submitCount, 0);
  assert.equal("record" in result, false);
});

test("a validated local-LLM result enters only the Proposal review queue", async () => {
  const repository = new MemoryRepository();
  const application = new V2ProposalApplication(repository);
  const result = await new LocalLlmProposalGenerator(provider(candidate())).generateAndSubmit(
    { proposalId: "prop_issued_3", createdAt: "2026-07-21T10:00:00.000Z", prompt }, application,
  );
  assert.equal(result.generated.kind, "PROPOSAL");
  if (result.generated.kind !== "PROPOSAL" || !("record" in result)) throw new Error("expected submitted Proposal");
  assert.equal(repository.submitCount, 1);
  assert.equal(result.record.proposal.status, "READY");
  assert.equal(result.record.proposal.groups[0]?.disposition, "PENDING");
});
