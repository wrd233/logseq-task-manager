import assert from "node:assert/strict";
import test from "node:test";

import { AgentGovernanceChangeQueue } from "../src/agent-governance-change-queue.ts";

test("Agent governance queue keeps only the latest value for one Source Root", async () => {
  const processed: string[] = [];
  const queue = new AgentGovernanceChangeQueue<string>({
    delayMs: 5_000,
    process: async (value) => { processed.push(value); },
  });
  queue.enqueue("source-1", "old");
  queue.enqueue("source-1", "latest");
  await queue.drainNow();
  assert.deepEqual(processed, ["latest"]);
  assert.deepEqual(queue.metrics(), { pendingRoots: 0, active: false, trackedRevisions: 0 });
  queue.dispose();
});

test("a newer observation aborts in-flight work and failure isolation continues other roots", async () => {
  const processed: string[] = [];
  const issues: string[] = [];
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const queue = new AgentGovernanceChangeQueue<string>({
    delayMs: 5_000,
    process: async (value, signal) => {
      if (value === "slow-old") {
        await Promise.race([firstGate, new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }))]);
        if (signal.aborted) return;
      }
      if (value === "broken") throw new Error("provider unavailable");
      processed.push(value);
    },
    onIssue: (issue) => { issues.push(issue.code); },
  });
  queue.enqueue("source-1", "slow-old");
  const firstDrain = queue.drainNow();
  await Promise.resolve();
  queue.enqueue("source-1", "newest");
  queue.enqueue("source-2", "broken");
  queue.enqueue("source-3", "healthy");
  releaseFirst();
  await firstDrain;
  await queue.drainNow();
  assert.deepEqual(processed, ["newest", "healthy"]);
  assert.deepEqual(issues, ["AGENT_GOVERNANCE_PROCESSING_FAILED"]);
  queue.dispose();
});

test("queue capacity is bounded without throwing into existing Graph consumers", async () => {
  const issues: string[] = [];
  const queue = new AgentGovernanceChangeQueue<number>({ delayMs: 5_000, maximumPendingRoots: 2, process: async () => undefined, onIssue: (issue) => { issues.push(issue.code); } });
  assert.equal(queue.enqueue("source-1", 1), true);
  assert.equal(queue.enqueue("source-2", 2), true);
  assert.equal(queue.enqueue("source-3", 3), false);
  assert.deepEqual(issues, ["AGENT_GOVERNANCE_QUEUE_CAPACITY_EXCEEDED"]);
  await queue.drainNow();
  queue.dispose();
});
