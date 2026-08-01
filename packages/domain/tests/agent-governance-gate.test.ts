import assert from "node:assert/strict";
import test from "node:test";

import { classifyAgentGovernanceChange, selectAgentSourceRoot, type AgentGateBlock } from "../src/agent-governance-gate.ts";

const block = (externalId: string, content: string, parentExternalId?: string): AgentGateBlock => ({
  externalId,
  content,
  ...(parentExternalId ? { parentExternalId } : {}),
});

test("format-only edits are suppressed before semantic analysis", () => {
  const result = classifyAgentGovernanceChange({
    changed: block("block-1", "  **准备周报**  "),
    previousContent: "准备周报",
    lineage: [block("block-1", "  **准备周报**  ")],
    changedBlockCount: 1,
    weakSignalOccurrences30d: 0,
    candidateTargetCount: 0,
    hasExistingDecisionThread: false,
    insideFormalObject: false,
  });
  assert.equal(result.action, "IGNORE_THIS_CHANGE");
  assert.equal(result.reason, "FORMAT_ONLY");
});

test("weak signals stay in Review Signal until a bounded repeated-signal threshold", () => {
  const input = {
    changed: block("weak-1", "以后可能需要整理监控告警。"),
    lineage: [block("weak-1", "以后可能需要整理监控告警。")],
    changedBlockCount: 1,
    candidateTargetCount: 0,
    hasExistingDecisionThread: false,
    insideFormalObject: false,
  };
  assert.equal(classifyAgentGovernanceChange({ ...input, weakSignalOccurrences30d: 1 }).action, "UPDATE_REVIEW_SIGNAL");
  assert.equal(classifyAgentGovernanceChange({ ...input, weakSignalOccurrences30d: 3 }).action, "RUN_EXPANDED");
});

test("nearest explicit marker owns ordinary descendants while a nested marker starts another Source Root", () => {
  const project = block("root-task", "[Task] 整理 RHCSA 资料");
  const ordinaryChild = block("child-context", "先整理容器部分", project.externalId);
  assert.equal(selectAgentSourceRoot([ordinaryChild, project]).externalId, project.externalId);

  const nested = block("nested-decision", "[决定] 不覆盖 RHEL10", ordinaryChild.externalId);
  assert.equal(selectAgentSourceRoot([nested, ordinaryChild, project]).externalId, nested.externalId);
});

test("strong signals and formal-object updates run LOCAL while event storms defer as one batch", () => {
  const strong = {
    changed: block("task-1", "TODO 整理验收记录"),
    lineage: [block("task-1", "TODO 整理验收记录")],
    changedBlockCount: 1,
    weakSignalOccurrences30d: 0,
    candidateTargetCount: 0,
    hasExistingDecisionThread: false,
    insideFormalObject: false,
  };
  assert.equal(classifyAgentGovernanceChange(strong).action, "RUN_LOCAL");
  assert.equal(classifyAgentGovernanceChange({ ...strong, changed: block("update-1", "已经完成一轮验收"), lineage: [block("update-1", "已经完成一轮验收")], insideFormalObject: true }).action, "RUN_LOCAL");
  assert.equal(classifyAgentGovernanceChange({ ...strong, changedBlockCount: 33 }).action, "DEFER_TO_BATCH");
});
