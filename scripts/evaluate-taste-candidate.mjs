import { createHash } from "node:crypto";
import console from "node:console";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";

const root = process.cwd();
const versionIndex = process.argv.indexOf("--candidate");
const candidateVersion = versionIndex >= 0 ? process.argv[versionIndex + 1] : "0.1.1";
if (!candidateVersion || !/^0\.\d+\.\d+$/u.test(candidateVersion)) throw new Error("TASTE_CANDIDATE_VERSION_INVALID");

const registry = JSON.parse(await readFile(join(root, "taste", "registry.json"), "utf8"));
const activeVersion = registry.active?.["miniproject-governance"];
if (!activeVersion || activeVersion === candidateVersion) throw new Error("TASTE_ACTIVE_VERSION_MUST_REMAIN_DISTINCT");

async function load(version, names) {
  const directory = join(root, "taste", "miniproject-governance", version);
  const contents = await Promise.all(names.map((name) => readFile(join(directory, name), "utf8")));
  return {
    values: Object.fromEntries(names.map((name, index) => [name, JSON.parse(contents[index])])),
    contentHash: createHash("sha256").update(names.map((name, index) => `${name}\n${contents[index]}`).join("\n")).digest("hex"),
  };
}

const active = await load(activeVersion, ["profile.json", "eval.json"]);
const candidate = await load(candidateVersion, ["profile.json", "eval.json", "decision.json"]);
const candidateProfile = candidate.values["profile.json"];
const evaluation = candidate.values["eval.json"];
const decision = candidate.values["decision.json"];

if (candidateProfile.status !== "CANDIDATE" || candidateProfile.basedOn !== activeVersion) throw new Error("TASTE_CANDIDATE_LINEAGE_INVALID");
if (!Array.isArray(evaluation.pairwiseCases) || evaluation.pairwiseCases.length < 5) throw new Error("TASTE_PAIRWISE_EVAL_INSUFFICIENT");
if (!evaluation.humanSpotCheckRequired || evaluation.autoActivate !== false) throw new Error("TASTE_EVAL_GUARDRAIL_INVALID");
if (decision.automatedRegression !== "PASS" || decision.pairwiseComparison !== "PASS" || decision.humanSpotCheck !== "PASS" || decision.explicit !== true) throw new Error("TASTE_EVAL_INCOMPLETE");
if (decision.activationDecision !== `KEEP_${activeVersion}_ACTIVE`) throw new Error("TASTE_ACTIVATION_DECISION_MISSING");

console.log(JSON.stringify({
  profile: "miniproject-governance",
  active: { version: activeVersion, contentHash: active.contentHash },
  candidate: { version: candidateVersion, contentHash: candidate.contentHash },
  pairwiseCases: evaluation.pairwiseCases.length,
  regressionCases: evaluation.regressionMustPass.length,
  result: "PASS",
  activationDecision: decision.activationDecision,
  autoActivated: false,
}));
