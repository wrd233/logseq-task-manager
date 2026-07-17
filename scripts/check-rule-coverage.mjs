import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const configPath = resolve(root, "docs/mvp/rules.json");
const config = JSON.parse(await readFile(configPath, "utf8"));
const ids = config.ruleIds;
assert.equal(ids.length, config.expectedRuleCount, `expected ${config.expectedRuleCount} rule IDs`);
assert.equal(new Set(ids).size, ids.length, "rule IDs must be unique");

const deferred = new Set(config.deferredNonGoal);
const runtime = new Set(config.runtimePending);
for (const id of [...deferred, ...runtime]) assert.equal(ids.includes(id), true, `unknown disposition rule ${id}`);
for (const id of deferred) assert.equal(runtime.has(id), false, `rule cannot be both deferred and runtime pending: ${id}`);

const rows = [];
for (const id of ids) {
  const prefix = id.split("-")[0];
  const evidence = config.evidenceByPrefix[prefix];
  assert.ok(Array.isArray(evidence) && evidence.length > 0, `missing evidence mapping for ${id}`);
  for (const path of evidence) await readFile(resolve(root, path), "utf8");
  const disposition = deferred.has(id) ? "DEFERRED_NON_GOAL" : runtime.has(id) ? "AUTOMATED_RUNTIME_PENDING" : "AUTOMATED";
  rows.push({ id, disposition, evidence: evidence.join("<br>") });
}

const markdown = [
  "# Rule Coverage",
  "",
  "> 由 `scripts/check-rule-coverage.mjs --write` 从 `rules.json` 生成。`AUTOMATED_RUNTIME_PENDING` 表示实现和自动证据已存在，但不能替代 Logseq Desktop 实测；`DEFERRED_NON_GOAL` 必须由 ADR-0004 约束。",
  "",
  `规则总数：${rows.length}；自动覆盖：${rows.filter((row) => row.disposition === "AUTOMATED").length}；待 Desktop：${rows.filter((row) => row.disposition === "AUTOMATED_RUNTIME_PENDING").length}；MVP 非目标延期：${rows.filter((row) => row.disposition === "DEFERRED_NON_GOAL").length}。`,
  "",
  "| Rule ID | Disposition | Evidence |",
  "|---|---|---|",
  ...rows.map((row) => `| ${row.id} | ${row.disposition} | ${row.evidence} |`),
  "",
].join("\n");

const outputPath = resolve(root, "docs/mvp/RULE_COVERAGE.md");
if (process.argv.includes("--write")) await writeFile(outputPath, markdown, "utf8");
else assert.equal(await readFile(outputPath, "utf8"), markdown, "RULE_COVERAGE.md is stale; run npm run check:rules -- --write");

console.log(`Rule coverage passed: ${rows.length} stable rules accounted for.`);
