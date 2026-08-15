import { DeepSeekDiscoveryExecutor, FakeDiscoveryExecutor } from "@task-copilot/agent";
import type { DiscoveryExecutor, DiscoveryExistingObject, DiscoveryJudgeInput, DiscoveryJudgment, ExecutionProfile } from "@task-copilot/contracts";
import { DISCOVERY_EXISTING_OBJECTS, DISCOVERY_GOLD_SET } from "../packages/test-support/src/discovery-gold-set.ts";

const batchSize = 10;
const profile: ExecutionProfile = {
  id: "discovery-eval", executor: "DEEPSEEK", modelAlias: "deepseek-v4-flash", remoteEnabled: true,
  allowedDataScope: ["discovery_eval"], maxContextItems: 20, maxInputChars: 12_000, timeoutMs: 180_000,
  retryBudget: 1, credentialRef: "DEEPSEEK_API_KEY",
};

function existingObjects(): DiscoveryExistingObject[] {
  return DISCOVERY_EXISTING_OBJECTS.map((object, index) => ({
    handle: `O${index + 1}`, workObjectId: object.workObjectId, kind: object.kind, title: object.title,
    lifecycle: "OPEN", engagement: "ACTIONABLE", currentFocus: null, desiredOutcome: null,
  }));
}

function metrics(executorName: string, judgments: DiscoveryJudgment[]) {
  const byId = new Map(DISCOVERY_GOLD_SET.map((item) => [item.id, item]));
  const actual = new Map<string, DiscoveryJudgment>();
  let duplicateCoverage = 0;
  for (const judgment of judgments) {
    for (const handle of judgment.sourceHandles) {
      const id = handle.startsWith("D") ? DISCOVERY_GOLD_SET[Number(handle.slice(1)) - 1]?.id : handle;
      if (!id || !byId.has(id)) continue;
      if (actual.has(id)) duplicateCoverage += 1;
      actual.set(id, judgment);
    }
  }
  let associationTp = 0; let associationFp = 0; let associationFn = 0;
  let formalizationTp = 0; let formalizationFp = 0; let formalizationFn = 0;
  let unresolved = 0;
  let readyCandidates = 0;
  let boundaryTp = 0; let boundaryFp = 0; let boundaryFn = 0;
  let kindTp = 0; let kindTotal = 0;
  let maturityTp = 0; let maturityTotal = 0; let missedReady = 0; let prematureDecision = 0;
  for (const item of DISCOVERY_GOLD_SET) {
    const got = actual.get(item.id);
    if (!got) {
      unresolved += 1;
      if (item.expected.kind === "ASSOCIATE_EXISTING") associationFn += 1;
      if (item.expected.kind === "FORMALIZATION_CANDIDATE") { formalizationFn += 1; boundaryFn += 1; if (item.expected.expectedMaturity === "READY_FOR_DECISION") missedReady += 1; }
      continue;
    }
    if (item.expected.kind === "ASSOCIATE_EXISTING") {
      if (got.kind === "ASSOCIATE_EXISTING") {
        const expectedId = DISCOVERY_EXISTING_OBJECTS.find((object) => object.title === item.expected.targetTitle)?.workObjectId;
        if (expectedId && got.targetWorkObjectId === expectedId) associationTp += 1;
        else { associationFn += 1; associationFp += 1; }
      } else {
        associationFn += 1;
        if (got.kind === "FORMALIZATION_CANDIDATE") formalizationFp += 1;
      }
    } else if (item.expected.kind === "FORMALIZATION_CANDIDATE") {
      if (got.kind === "FORMALIZATION_CANDIDATE") {
        boundaryTp += 1; formalizationTp += 1; kindTotal += 1;
        if (item.expected.recommendedKind && got.recommendedKind === item.expected.recommendedKind) kindTp += 1;
        if (item.expected.expectedMaturity) {
          maturityTotal += 1;
          if (got.maturity === item.expected.expectedMaturity) maturityTp += 1;
          else if (item.expected.expectedMaturity === "READY_FOR_DECISION") missedReady += 1;
          else if (got.maturity === "READY_FOR_DECISION") prematureDecision += 1;
        }
      } else { formalizationFn += 1; boundaryFn += 1; if (item.expected.expectedMaturity === "READY_FOR_DECISION") missedReady += 1; }
      if (got.kind === "ASSOCIATE_EXISTING") associationFp += 1;
    } else {
      if (got.kind === "FORMALIZATION_CANDIDATE") {
        boundaryFp += 1; formalizationFp += 1;
        if (got.maturity === "READY_FOR_DECISION") prematureDecision += 1;
      }
      if (got.kind === "ASSOCIATE_EXISTING") associationFp += 1;
    }
    if (got.kind === "FORMALIZATION_CANDIDATE" && got.maturity === "READY_FOR_DECISION") readyCandidates += 1;
  }
  const precision = (tp: number, fp: number) => tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = (tp: number, fn: number) => tp + fn === 0 ? 1 : tp / (tp + fn);
  return {
    executor: executorName,
    total: DISCOVERY_GOLD_SET.length,
    unresolvedRate: unresolved / DISCOVERY_GOLD_SET.length,
    duplicateCoverageRate: duplicateCoverage / DISCOVERY_GOLD_SET.length,
    associationPrecision: precision(associationTp, associationFp),
    associationRecall: recall(associationTp, associationFn),
    formalizationPrecision: precision(formalizationTp, formalizationFp),
    formalizationRecall: recall(formalizationTp, formalizationFn),
    boundaryPrecision: precision(boundaryTp, boundaryFp),
    boundaryRecall: recall(boundaryTp, boundaryFn),
    kindAccuracy: kindTotal === 0 ? null : kindTp / kindTotal,
    maturityAccuracy: maturityTotal === 0 ? null : maturityTp / maturityTotal,
    prematureDecisionRate: readyCandidates === 0 ? 0 : prematureDecision / readyCandidates,
    missedReadyRate: DISCOVERY_GOLD_SET.filter((item) => item.expected.kind === "FORMALIZATION_CANDIDATE" && item.expected.expectedMaturity === "READY_FOR_DECISION").length === 0 ? null : missedReady / DISCOVERY_GOLD_SET.filter((item) => item.expected.kind === "FORMALIZATION_CANDIDATE" && item.expected.expectedMaturity === "READY_FOR_DECISION").length,
  };
}

async function run(executor: DiscoveryExecutor, name: string) {
  const started = Date.now();
  const judgments: DiscoveryJudgment[] = [];
  let batchErrors = 0;
  let inputTokens = 0; let outputTokens = 0; let lastInput = 0; let lastOutput = 0; let remoteCalls = 0;
  for (let offset = 0; offset < DISCOVERY_GOLD_SET.length; offset += batchSize) {
    const cases = DISCOVERY_GOLD_SET.slice(offset, offset + batchSize);
    const contextPack = cases.map((item, index) => ({
      handle: `D${offset + index + 1}`, sourceRef: { graphId: "eval", blockUuid: item.id }, content: item.content, sourceHash: String(offset + index), observedAt: "2026-08-15T00:00:00.000Z",
    }));
    const input: DiscoveryJudgeInput = {
      scope: { kind: "EXPLICIT_SOURCE_SET", sources: contextPack.map((item) => item.sourceRef) },
      contextPack, existingObjects: existingObjects(), openCandidates: [], profile: name === "fake" ? { ...profile, executor: "FAKE", remoteEnabled: false } : profile,
    };
    try {
      const batch = await executor.judge(input);
      judgments.push(...batch);
      const usage = executor.tokenUsage;
      if (usage) {
        remoteCalls += 1;
        const inNow = usage.inputTokens ?? 0; const outNow = usage.outputTokens ?? 0;
        inputTokens += Math.max(0, inNow - lastInput); outputTokens += Math.max(0, outNow - lastOutput);
        lastInput = inNow; lastOutput = outNow;
      }
    }
    catch { batchErrors += 1; }
  }
  const latencyMs = Date.now() - started;
  return { ...metrics(name, judgments), batchErrors, remoteCalls, inputTokens, outputTokens, latencyMs };
}

const fake = await run(new FakeDiscoveryExecutor(), "fake");
console.log(JSON.stringify({ fake }, null, 2));
if (process.env.DEEPSEEK_API_KEY && process.env.DEEPSEEK_API_KEY.trim()) {
  try {
    const deepseek = await run(new DeepSeekDiscoveryExecutor(), "deepseek-v4-flash");
    console.log(JSON.stringify({ deepseek }, null, 2));
    console.log(JSON.stringify({ fake, deepseek }, null, 2));
  } catch (error) {
    console.log(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }, null, 2));
    process.exitCode = 1;
  }
} else {
  console.log(JSON.stringify({ note: "DEEPSEEK_API_KEY not set; fake-only evaluation" }, null, 2));
}
