import { randomUUID } from "node:crypto";

import { ClientError, type KernelClient } from "@task-copilot/client";

export interface CliIO { out: (line: string) => void; err: (line: string) => void; readInput?: (path: string) => Promise<string> }

type CliClient = Pick<KernelClient,
  "status" | "agentBootstrap" | "listSkills" | "showSkill" | "listObjects" | "showObject" | "showClosure" | "showCommit" | "listRecovery" |
  "graphStatus" | "graphSearch" | "graphBlock" | "graphPage" | "freezeExternalEvidence" | "showEvidence" | "startExternalAgentRun" |
  "finishExternalAgentRun" | "showAgentRun" | "listAgentRunReads" | "showProposal" | "applyExternalProposal" | "listFeedback" |
  "listTasteProfiles" | "showTasteProfile" | "addReferenceCuration" | "listCurationReceipts">;

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
  const flagsWithValues = new Set(["--query", "--limit", "--run", "--object", "--block", "--id", "--purpose", "--evidence", "--executor-id", "--result-file", "--input-file", "--lifecycle", "--engagement", "--correlation", "--reference", "--section", "--existing-section"]); const values: string[] = [];
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
