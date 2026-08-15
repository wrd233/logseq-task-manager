import { randomUUID } from "node:crypto";

import { ClientError, type KernelClient } from "@task-copilot/client";

export interface CliIO { out: (line: string) => void; err: (line: string) => void; readInput?: (path: string) => Promise<string> }

type CliClient = Pick<KernelClient,
  "status" | "agentBootstrap" | "listSkills" | "showSkill" | "listObjects" | "showObject" | "showClosure" | "showCommit" | "listRecovery" |
  "graphStatus" | "graphSearch" | "graphBlock" | "graphPage" | "freezeExternalEvidence" | "showEvidence" | "listEvidence" | "startExternalAgentRun" |
  "finishExternalAgentRun" | "showAgentRun" | "listAgentRunReads" | "showProposal" | "applyExternalProposal" | "listFeedback" |
  "listTasteProfiles" | "showTasteProfile" | "addReferenceCuration" | "listCurationReceipts" |
  "listContextAssociations" | "associateContext" | "invalidateContextAssociation" | "recordAssociationCorrection" |
  "listGovernanceIssues" | "showGovernanceIssue" | "resolveGovernanceIssue" | "supersedeGovernanceIssue" |
  "projectionHealth" | "listProjectionObligations" | "maintenanceStatus" | "setMaintenancePause" | "reconcileMaintenance" |
  "listDecisionPackages" | "listDecisionCandidates" | "compileUserDecision" | "executeUserDecision" | "listUserDecisions" |
  "runDiscovery" | "listDiscoveryRuns" | "showDiscoveryRun" | "listFormalizationCandidates" | "showFormalizationCandidate" | "matureFormalizationCandidate" | "dismissFormalizationCandidate" | "organizeToday">;

const rootHelp = `Task Copilot External Agent CLI

Commands:
  status
  agent bootstrap
  skill list | skill show <id>
  taste list | taste show <id>
  object list [--lifecycle OPEN] [--engagement ACTIONABLE|WAITING] | object show <id>
  graph status | graph search --query <text> [--limit N] [--run <runId>]
  graph block show <uuid> [--run <runId>] | graph page show <name> [--limit N] [--run <runId>]
  evidence freeze --object <id> --block <uuid> [--id <evidenceId>]
  evidence list [--object <id>] | evidence show <id>
  context list [--object <id>] | context show <id> | context remove <id>
  context add --object <id> --graph <graphId> --block <uuid> [--origin agent|user|system] [--version-hash <hash>]
  context correct --object <id> --graph <graphId> --block <uuid> --scope <snapshot> --decision <ref> [--affirmed <id>]
  issue list [--object <id>] [--status OPEN|RESOLVED|SUPERSEDED] | issue show <id> | issue resolve <id> | issue supersede <id>
  projection health | projection list [--status PENDING|FAILED|VERIFIED|APPLIED]
  maintenance status | maintenance pause --scope global|object --paused true|false [--object <id>] | maintenance reconcile --object <id>
  decision-package list [--status OPEN|ACCEPTED|REJECTED|STALE] | decision-package show <id>
  decision execute <id> | user-decision list [--package <id>]   # compile only via trusted Plugin user channel
  discovery run --today [--date <YYYY-MM-DD>] | discovery run --page <name> --graph <id>
  discovery run list | discovery run show <id>
  candidate list [--status OPEN|MATERIALIZED|DISMISSED|EXPIRED] | candidate show <id> | candidate mature <id> | candidate dismiss <id>
  organize today [--date <YYYY-MM-DD>]
  agent-run start --purpose current-focus|engagement|miniproject --object <id> --evidence <id>... [--executor-id codex] [--correlation <id>]
  agent-run finish <runId> --result-file <path|-> | agent-run show <id> | agent-run reads <id>
  proposal show <id> | proposal apply <id> --wait
  curation add-reference --run <id> --object <id> --reference <blockUuid> --section resources|deliverables [--existing-section <uuid>]
  curation receipt list [--object <id>]
  closure show <id> | commit show <id> | recovery list | evidence show <id> | feedback list

All commands support --json. Writes accept non-interactive JSON input; there is no raw Graph, USER impersonation, SQL, or generic mutation command.`;

function option(args: string[], name: string): string | undefined { const index = args.lastIndexOf(name); return index >= 0 ? args[index + 1] : undefined; }
function options(args: string[], name: string): string[] { const values: string[] = []; for (let index = 0; index < args.length; index += 1) if (args[index] === name && args[index + 1]) values.push(args[index + 1]!); return values; }
function required(args: string[], name: string): string { const value = option(args, name); if (!value || value.startsWith("--")) throw new ClientError("CLI_USAGE", `${name} is required.`, 2); return value; }
function integer(args: string[], name: string, fallback: number): number { const raw = option(args, name); if (raw === undefined) return fallback; const value = Number(raw); if (!Number.isSafeInteger(value) || value < 1) throw new ClientError("CLI_USAGE", `${name} must be a positive integer.`, 2); return value; }
function positional(args: string[]): string[] {
  const flagsWithValues = new Set(["--query", "--limit", "--run", "--object", "--block", "--id", "--purpose", "--evidence", "--executor-id", "--result-file", "--input-file", "--lifecycle", "--engagement", "--correlation", "--reference", "--section", "--existing-section", "--graph", "--origin", "--version-hash", "--scope", "--decision", "--affirmed", "--status", "--paused", "--utterance", "--date", "--page"]); const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) { const item = args[index]!; if (flagsWithValues.has(item)) { index += 1; continue; } if (!item.startsWith("--")) values.push(item); } return values;
}
function usage(message: string): never { throw new ClientError("CLI_USAGE", message, 2); }

export async function runCli(argv: string[], client: CliClient, io: CliIO): Promise<number> {
  const json = argv.includes("--json"); const args = argv.filter((argument) => argument !== "--json"); const words = positional(args); let value: unknown;
  try {
    if (!args.length || args.includes("--help") || args.includes("-h")) { io.out(rootHelp); return 0; }
    if (words.length === 1 && words[0] === "status") value = await client.status();
    else if (words.join(" ") === "agent bootstrap") value = await client.agentBootstrap();
    else if (words.join(" ") === "skill list") value = await client.listSkills();
    else if (words.length === 3 && words[0] === "skill" && words[1] === "show") value = await client.showSkill(words[2]!);
    else if (words.join(" ") === "taste list") value = await client.listTasteProfiles();
    else if (words.length === 3 && words[0] === "taste" && words[1] === "show") value = await client.showTasteProfile(words[2]!);
    else if (words.join(" ") === "object list") { const lifecycle = option(args, "--lifecycle"); const engagement = option(args, "--engagement"); if (lifecycle && !["OPEN", "COMPLETED", "CANCELLED"].includes(lifecycle)) usage("--lifecycle must be OPEN, COMPLETED, or CANCELLED."); if (engagement && !["ACTIONABLE", "WAITING", "PARKED"].includes(engagement)) usage("--engagement must be ACTIONABLE, WAITING, or PARKED."); const listed = await client.listObjects(); value = { objects: listed.objects.filter((item) => (!lifecycle || item.lifecycle === lifecycle) && (!engagement || item.engagement === engagement)) }; }
    else if (words.length === 3 && words[0] === "object" && words[1] === "show") value = await client.showObject(words[2]!);
    else if (words.length === 3 && words[0] === "closure" && words[1] === "show") value = await client.showClosure(words[2]!);
    else if (words.length === 3 && words[0] === "commit" && words[1] === "show") value = await client.showCommit(words[2]!);
    else if (words.join(" ") === "recovery list") value = await client.listRecovery();
    else if (words.join(" ") === "graph status") value = await client.graphStatus();
    else if (words.join(" ") === "graph search") { const runId = option(args, "--run"); value = await client.graphSearch({ query: required(args, "--query"), limit: integer(args, "--limit", 20), ...(runId ? { runId } : {}) }); }
    else if (words.length === 4 && words[0] === "graph" && words[1] === "block" && words[2] === "show") value = await client.graphBlock(words[3]!, option(args, "--run"));
    else if (words.length === 4 && words[0] === "graph" && words[1] === "page" && words[2] === "show") { const runId = option(args, "--run"); value = await client.graphPage(words[3]!, { limit: integer(args, "--limit", 50), ...(runId ? { runId } : {}) }); }
    else if (words.join(" ") === "evidence freeze") value = await client.freezeExternalEvidence({ evidenceId: option(args, "--id") ?? `evidence-${randomUUID()}`, workObjectId: required(args, "--object"), blockUuid: required(args, "--block") });
    else if (words.join(" ") === "evidence list") value = await client.listEvidence(option(args, "--object"));
    else if (words.join(" ") === "context list") value = await client.listContextAssociations(option(args, "--object"));
    else if (words.length === 3 && words[0] === "context" && words[1] === "show") { const found = (await client.listContextAssociations()).associations.find((item) => item.id === words[2]!); if (!found) usage("Context association not found."); value = { association: found }; }
    else if (words.length === 3 && words[0] === "context" && words[1] === "remove") value = await client.invalidateContextAssociation(words[2]!);
    else if (words.join(" ") === "context add") { const origin = option(args, "--origin") ?? "agent"; if (origin !== "agent" && origin !== "user" && origin !== "system") usage("--origin must be agent, user, or system."); value = await client.associateContext({ workObjectId: required(args, "--object"), sourceRef: { graphId: required(args, "--graph"), blockUuid: required(args, "--block") }, sourceVersionHash: option(args, "--version-hash") ?? "", origin: origin === "user" ? "USER_EXPLICIT" : origin === "system" ? "SYSTEM_STRUCTURAL" : "AGENT_INFERRED" }); }
    else if (words.join(" ") === "context correct") value = await client.recordAssociationCorrection({ sourceRef: { graphId: required(args, "--graph"), blockUuid: required(args, "--block") }, scopeSnapshot: required(args, "--scope"), rejectedWorkObjectId: required(args, "--object"), affirmedWorkObjectId: option(args, "--affirmed") ?? null, userDecisionRef: required(args, "--decision") });
    else if (words.join(" ") === "issue list") { const status = option(args, "--status"); if (status && !["OPEN", "RESOLVED", "SUPERSEDED"].includes(status)) usage("--status must be OPEN, RESOLVED, or SUPERSEDED."); value = await client.listGovernanceIssues(option(args, "--object"), status as "OPEN" | "RESOLVED" | "SUPERSEDED" | undefined); }
    else if (words.length === 3 && words[0] === "issue" && words[1] === "show") value = await client.showGovernanceIssue(words[2]!);
    else if (words.length === 3 && words[0] === "issue" && words[1] === "resolve") value = await client.resolveGovernanceIssue(words[2]!);
    else if (words.length === 3 && words[0] === "issue" && words[1] === "supersede") value = await client.supersedeGovernanceIssue(words[2]!);
    else if (words.join(" ") === "projection health") value = await client.projectionHealth();
    else if (words.join(" ") === "projection list") { const status = option(args, "--status"); if (status && !["PENDING", "APPLIED", "VERIFIED", "FAILED"].includes(status)) usage("--status must be PENDING, APPLIED, VERIFIED, or FAILED."); value = await client.listProjectionObligations(status as "PENDING" | "APPLIED" | "VERIFIED" | "FAILED" | undefined); }
    else if (words.join(" ") === "maintenance status") value = await client.maintenanceStatus();
    else if (words.join(" ") === "maintenance pause") { const scope = required(args, "--scope"); if (scope !== "global" && scope !== "object") usage("--scope must be global or object."); const paused = required(args, "--paused"); if (paused !== "true" && paused !== "false") usage("--paused must be true or false."); value = await client.setMaintenancePause(scope, paused === "true", scope === "object" ? required(args, "--object") : null); }
    else if (words.join(" ") === "maintenance reconcile") value = await client.reconcileMaintenance(required(args, "--object"), "INTERACTIVE");
    else if (words.join(" ") === "decision-package list") { const status = option(args, "--status"); if (status && !["OPEN", "ACCEPTED", "REJECTED", "STALE"].includes(status)) usage("--status must be OPEN, ACCEPTED, REJECTED, or STALE."); value = await client.listDecisionPackages(status as "OPEN" | "ACCEPTED" | "REJECTED" | "STALE" | undefined); }
    else if (words.length === 3 && words[0] === "decision-package" && words[1] === "show") { const found = (await client.listDecisionPackages()).packages.find((item) => item.id === words[2]!); if (!found) usage("Decision Package not found."); value = { package: found, candidates: await client.listDecisionCandidates(found.id) }; }
    else if (words.join(" ") === "discovery run list") value = await client.listDiscoveryRuns();
    else if (words.length === 4 && words[0] === "discovery" && words[1] === "run" && words[2] === "show") value = await client.showDiscoveryRun(words[3]!);
    else if (words.length >= 3 && words[0] === "discovery" && words[1] === "run") {
      if (args.includes("--today")) value = await client.runDiscovery({ kind: "TODAY", date: option(args, "--date") ?? new Date().toISOString().slice(0, 10) });
      else if (args.includes("--page")) value = await client.runDiscovery({ kind: "PAGE", graphId: required(args, "--graph"), pageName: required(args, "--page") });
      else usage("discovery run requires --today or --page <name> --graph <id>.");
    }
    else if (words.join(" ") === "candidate list") { const status = option(args, "--status"); if (status && !["OPEN", "MATERIALIZED", "DISMISSED", "EXPIRED"].includes(status)) usage("--status must be OPEN, MATERIALIZED, DISMISSED, or EXPIRED."); value = await client.listFormalizationCandidates(status as "OPEN" | "MATERIALIZED" | "DISMISSED" | "EXPIRED" | undefined); }
    else if (words.length === 3 && words[0] === "candidate" && words[1] === "show") value = await client.showFormalizationCandidate(words[2]!);
    else if (words.length === 3 && words[0] === "candidate" && words[1] === "mature") value = await client.matureFormalizationCandidate(words[2]!);
    else if (words.length === 3 && words[0] === "candidate" && words[1] === "dismiss") value = await client.dismissFormalizationCandidate(words[2]!);
    else if (words.join(" ") === "organize today") value = await client.organizeToday(option(args, "--date") ? { date: option(args, "--date")! } : {});
    else if (words.join(" ") === "decision compile") usage("decision compile is available only through the trusted Plugin USER channel; External Agents cannot impersonate USER.");
    else if (words.length === 3 && words[0] === "decision" && words[1] === "execute") value = await client.executeUserDecision(words[2]!);
    else if (words.join(" ") === "user-decision list") value = await client.listUserDecisions(option(args, "--package"));
    else if (words.join(" ") === "agent-run start") {
      const purpose = required(args, "--purpose"); if (purpose !== "current-focus" && purpose !== "engagement" && purpose !== "miniproject") usage("--purpose must be current-focus, engagement, or miniproject."); const evidenceIds = options(args, "--evidence"); if (!evidenceIds.length) usage("At least one --evidence is required.");
      const correlation = option(args, "--correlation");
      value = await client.startExternalAgentRun({ runId: option(args, "--id") ?? `agent-run-${randomUUID()}`, purpose: purpose === "current-focus" ? "CURRENT_FOCUS_MAINTENANCE" : purpose === "engagement" ? "ENGAGEMENT_RECONCILIATION" : "MINI_PROJECT_GOVERNANCE", workObjectId: required(args, "--object"), evidenceIds, executorId: option(args, "--executor-id") ?? "codex", ...(correlation ? { governanceCorrelationId: correlation } : {}) });
    } else if (words.length === 3 && words[0] === "agent-run" && words[1] === "finish") {
      const path = option(args, "--result-file") ?? option(args, "--input-file"); if (!path || !io.readInput) usage("--result-file <path|-> is required."); let result: unknown;
      try { result = JSON.parse(await io.readInput(path)); } catch { throw new ClientError("CLI_RESULT_JSON_INVALID", "Agent result file must contain valid JSON.", 2); } value = await client.finishExternalAgentRun(words[2]!, result);
    } else if (words.length === 3 && words[0] === "agent-run" && words[1] === "show") value = await client.showAgentRun(words[2]!);
    else if (words.length === 3 && words[0] === "agent-run" && words[1] === "reads") value = await client.listAgentRunReads(words[2]!);
    else if (words.length === 3 && words[0] === "proposal" && words[1] === "show") value = await client.showProposal(words[2]!);
    else if (words.length === 3 && words[0] === "proposal" && words[1] === "apply") { if (!args.includes("--wait")) usage("proposal apply requires --wait so pending Graph work is never reported as success."); value = await client.applyExternalProposal(words[2]!); }
    else if (words.join(" ") === "curation add-reference") { const section = required(args, "--section"); if (section !== "resources" && section !== "deliverables") usage("--section must be resources or deliverables."); const existingSectionUuid = option(args, "--existing-section"); value = await client.addReferenceCuration({ receiptId: option(args, "--id") ?? `curation-${randomUUID()}`, runId: required(args, "--run"), workObjectId: required(args, "--object"), referenceBlockUuid: required(args, "--reference"), section: section === "resources" ? "资源" : "支撑交付物", ...(existingSectionUuid ? { existingSectionUuid } : {}) }); }
    else if (words.join(" ") === "curation receipt list") value = await client.listCurationReceipts(option(args, "--object"));
    else if (words.length === 3 && words[0] === "evidence" && words[1] === "show") value = await client.showEvidence(words[2]!);
    else if (words.join(" ") === "feedback list") value = await client.listFeedback();
    else usage("Unknown command. Run task-copilot --help.");
    if (json) io.out(JSON.stringify(value)); else if (words[0] === "status") io.out(`Kernel: ${(value as { status: string }).status}`); else io.out(JSON.stringify(value, null, 2)); return 0;
  } catch (error) {
    const code = error instanceof ClientError ? error.code : error instanceof Error && "code" in error ? String(error.code) : "OPERATIONAL_FAILURE"; const message = error instanceof Error ? error.message.replace(new RegExp(`^${code}:\\s*`, "u"), "") : String(error); const exit = error instanceof ClientError && (error.status === 2 || error.code.startsWith("CLI_")) ? 2 : 1;
    io.err(json ? JSON.stringify({ error: { code, message } }) : `${code}: ${message}`); return exit;
  }
}
