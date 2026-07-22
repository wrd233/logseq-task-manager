import { V2_LIFECYCLES, V2_OBJECT_TYPES, type LegacyMigrationReviewDecision, type V2ManagedObject, type V2ObjectType } from "@task-copilot/domain";
import type { ServiceBackupCreated, ServiceBackupRestored, ServiceBackupValidation, ServiceContextExportResult, ServiceDoctor, ServiceGraphReadQuery, ServiceGraphSnapshot, ServiceLegacyMigrationScanReport, ServiceMigrationBatch, ServiceMigrationRun, ServiceMigrationRunDetails, ServiceProposalValidationResult, ServiceSkillDocument, ServiceSkillSummary, ServiceStatus, ServiceStoredProposal } from "@task-copilot/service-client";
import { StructuredError } from "@task-copilot/shared";

export interface CliService {
  status(): Promise<ServiceStatus>;
  doctor(): Promise<ServiceDoctor>;
  listObjects(): Promise<V2ManagedObject[]>;
  getObject(objectId: string): Promise<V2ManagedObject | undefined>;
  listProposals(): Promise<ServiceStoredProposal[]>;
  getProposal(proposalId: string): Promise<ServiceStoredProposal | undefined>;
  validateProposal(proposal: unknown): Promise<ServiceProposalValidationResult>;
  submitProposal(proposal: unknown): Promise<{ record: ServiceStoredProposal; replayed: boolean }>;
  listSkills(): Promise<ServiceSkillSummary[]>;
  getSkill(name: string): Promise<ServiceSkillDocument | undefined>;
  exportContext(scope: "block" | "page" | "object" | "project", id: string): Promise<ServiceContextExportResult>;
  readGraph(query: ServiceGraphReadQuery): Promise<ServiceGraphSnapshot>;
  scanLegacyMigration(bundle: unknown): Promise<ServiceLegacyMigrationScanReport>;
  previewLegacyMigration(bundle: unknown, decisions: LegacyMigrationReviewDecision[]): Promise<{ run: ServiceMigrationRun; replayed: boolean }>;
  getMigrationRun(runId: string): Promise<ServiceMigrationRunDetails>;
  importLegacyMigration(runId: string, input: { bundle: unknown; backupId: string; objectIds: string[]; idempotencyKey: string; confirmation: "IMPORT_REVIEWED_V1_BATCH" }): Promise<{ batch: ServiceMigrationBatch; replayed: boolean }>;
  verifyLegacyMigrationBatch(runId: string, batchId: string): Promise<ServiceMigrationBatch>;
  undoLegacyMigrationBatch(runId: string, batchId: string, confirmation: "UNDO_MIGRATION_BATCH"): Promise<ServiceMigrationBatch>;
  activateLegacyMigration(runId: string, confirmation: "ACTIVATE_V2_SQLITE"): Promise<ServiceMigrationRun>;
  createBackup(): Promise<ServiceBackupCreated>;
  validateBackup(backupId: string): Promise<ServiceBackupValidation>;
  restoreBackup(backupId: string, confirmation: "RESTORE_AND_STOP_SERVICE"): Promise<ServiceBackupRestored>;
}

export interface CliIo {
  stdout(value: string): void;
  stderr(value: string): void;
}

export interface CliDependencies {
  loadService(descriptorPath: string): Promise<CliService>;
  loadProposal?(path: string): Promise<unknown>;
  loadMigrationBundle?(path: string): Promise<unknown>;
  writeContextPackage?(outPath: string, result: ServiceContextExportResult): Promise<void>;
  writeDiagnosticsArchive?(outPath: string, doctor: ServiceDoctor, status: ServiceStatus): Promise<void>;
  descriptorPath?: string;
}

const help = `Task Copilot CLI

Usage:
  tc [--service-descriptor <path>] [--json] status
  tc [--service-descriptor <path>] [--json] doctor [--export <diagnostics.zip>]
  tc [--service-descriptor <path>] [--json] object list [--type <type>] [--lifecycle <lifecycle>]
  tc [--service-descriptor <path>] [--json] object show <object_id>
  tc [--service-descriptor <path>] [--json] object search <keyword> [--type <type>] [--lifecycle <lifecycle>]
  tc [--service-descriptor <path>] [--json] graph page <name-or-uuid> [--depth <0..5>]
  tc [--service-descriptor <path>] [--json] graph block <uuid> [--children] [--parents <0..8>]
  tc [--service-descriptor <path>] [--json] graph resolve <block-ref-or-page-name>
  tc [--service-descriptor <path>] [--json] proposal list
  tc [--service-descriptor <path>] [--json] proposal show <proposal_id>
  tc [--service-descriptor <path>] [--json] proposal validate <proposal.json>
  tc [--service-descriptor <path>] [--json] proposal submit <proposal.json>
  tc [--service-descriptor <path>] [--json] skill list
  tc [--service-descriptor <path>] [--json] skill show <name>
  tc [--service-descriptor <path>] [--json] context export --scope block --block <uuid> --out <directory>
  tc [--service-descriptor <path>] [--json] context export --scope page --page <name> --out <directory>
  tc [--service-descriptor <path>] [--json] context export --scope object --object <object_id> --out <directory>
  tc [--service-descriptor <path>] [--json] context export --scope project --project <project_id> --out <directory>
  tc [--service-descriptor <path>] [--json] migration scan <v1-recovery-bundle.json>
  tc [--service-descriptor <path>] [--json] migration preview <v1-recovery-bundle.json> --decisions <decisions.json>
  tc [--service-descriptor <path>] [--json] migration show <run_id>
  tc [--service-descriptor <path>] [--json] migration import <run_id> --bundle <bundle.json> --batch <batch.json> --backup <backup_id> --confirm IMPORT_REVIEWED_V1_BATCH
  tc [--service-descriptor <path>] [--json] migration verify <run_id> --batch <batch_id>
  tc [--service-descriptor <path>] [--json] migration undo <run_id> --batch <batch_id> --confirm UNDO_MIGRATION_BATCH
  tc [--service-descriptor <path>] [--json] migration activate <run_id> --confirm ACTIVATE_V2_SQLITE
  tc [--service-descriptor <path>] [--json] backup create
  tc [--service-descriptor <path>] [--json] backup validate <backup_id>
  tc [--service-descriptor <path>] [--json] backup restore <backup_id> --confirm RESTORE_AND_STOP_SERVICE

The CLI talks only to Task Copilot Local Service. It never opens SQLite directly.
Proposal submit only enters the review queue; it never commits or applies a change.`;

function emit(io: CliIo, json: boolean, value: unknown, plain: string): void {
  io.stdout(json ? JSON.stringify({ schema_version: 1, data: value }) : plain);
}

function parse(args: string[]): { command: string[]; json: boolean; descriptorPath?: string; confirmation?: string; scope?: string; contextBlockId?: string; contextPageId?: string; contextObjectId?: string; contextProjectId?: string; objectType?: string; lifecycle?: string; graphDepth?: number; graphParents?: number; graphChildren: boolean; outPath?: string; exportPath?: string; decisionsPath?: string; bundlePath?: string; batchValue?: string; backupId?: string } {
  const command: string[] = [];
  let json = false;
  let descriptorPath: string | undefined;
  let confirmation: string | undefined;
  let scope: string | undefined;
  let contextBlockId: string | undefined;
  let contextPageId: string | undefined;
  let contextObjectId: string | undefined;
  let contextProjectId: string | undefined;
  let objectType: string | undefined;
  let lifecycle: string | undefined;
  let graphDepth: number | undefined;
  let graphParents: number | undefined;
  let graphChildren = false;
  let outPath: string | undefined;
  let exportPath: string | undefined;
  let decisionsPath: string | undefined;
  let bundlePath: string | undefined;
  let batchValue: string | undefined;
  let backupId: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--json") json = true;
    else if (value === "--service-descriptor") {
      descriptorPath = args[index + 1];
      if (!descriptorPath) throw new Error("--service-descriptor requires a path");
      index += 1;
    } else if (value === "--confirm") {
      confirmation = args[index + 1];
      if (!confirmation) throw new Error("--confirm requires the exact confirmation phrase");
      index += 1;
    } else if (value === "--children") graphChildren = true;
    else if (["--scope", "--block", "--page", "--object", "--project", "--type", "--lifecycle", "--depth", "--parents", "--out", "--export", "--decisions", "--bundle", "--batch", "--backup"].includes(value ?? "")) {
      const optionValue = args[index + 1];
      if (!optionValue) throw new Error(`${value} requires a value`);
      if (value === "--scope") scope = optionValue;
      else if (value === "--block") contextBlockId = optionValue;
      else if (value === "--page") contextPageId = optionValue;
      else if (value === "--object") contextObjectId = optionValue;
      else if (value === "--project") contextProjectId = optionValue;
      else if (value === "--type") objectType = optionValue;
      else if (value === "--lifecycle") lifecycle = optionValue;
      else if (value === "--depth") graphDepth = Number(optionValue);
      else if (value === "--parents") graphParents = Number(optionValue);
      else if (value === "--out") outPath = optionValue;
      else if (value === "--export") exportPath = optionValue;
      else if (value === "--decisions") decisionsPath = optionValue;
      else if (value === "--bundle") bundlePath = optionValue;
      else if (value === "--batch") batchValue = optionValue;
      else backupId = optionValue;
      index += 1;
    } else if (value) command.push(value);
  }
  return { command, json, graphChildren, ...(descriptorPath ? { descriptorPath } : {}), ...(confirmation ? { confirmation } : {}), ...(scope ? { scope } : {}), ...(contextBlockId ? { contextBlockId } : {}), ...(contextPageId ? { contextPageId } : {}), ...(contextObjectId ? { contextObjectId } : {}), ...(contextProjectId ? { contextProjectId } : {}), ...(objectType ? { objectType } : {}), ...(lifecycle ? { lifecycle } : {}), ...(graphDepth !== undefined ? { graphDepth } : {}), ...(graphParents !== undefined ? { graphParents } : {}), ...(outPath ? { outPath } : {}), ...(exportPath ? { exportPath } : {}), ...(decisionsPath ? { decisionsPath } : {}), ...(bundlePath ? { bundlePath } : {}), ...(batchValue ? { batchValue } : {}), ...(backupId ? { backupId } : {}) };
}

function objectFilters(parsed: ReturnType<typeof parse>): { objectType?: V2ObjectType; lifecycle?: V2ManagedObject["lifecycle"] } | undefined {
  const objectType = parsed.objectType?.toUpperCase();
  const lifecycle = parsed.lifecycle?.toUpperCase();
  if (objectType && !V2_OBJECT_TYPES.includes(objectType as V2ObjectType)) return undefined;
  if (lifecycle && !V2_LIFECYCLES.includes(lifecycle as V2ManagedObject["lifecycle"])) return undefined;
  return {
    ...(objectType ? { objectType: objectType as V2ObjectType } : {}),
    ...(lifecycle ? { lifecycle: lifecycle as V2ManagedObject["lifecycle"] } : {}),
  };
}

function filterObjects(objects: V2ManagedObject[], filters: NonNullable<ReturnType<typeof objectFilters>>): V2ManagedObject[] {
  return objects.filter((object) => (!filters.objectType || object.objectType === filters.objectType) && (!filters.lifecycle || object.lifecycle === filters.lifecycle));
}

function errorExit(error: unknown): number {
  if (!(error instanceof StructuredError)) return 8;
  const remoteCode = typeof error.details?.remoteCode === "string" ? error.details.remoteCode : undefined;
  if (remoteCode === "GRAPH_READ_NOT_FOUND") return 6;
  if (["GRAPH_READ_BRIDGE_UNAVAILABLE", "GRAPH_READ_BRIDGE_CLOSED", "GRAPH_READ_TIMEOUT"].includes(remoteCode ?? "")) return 4;
  if (["GRAPH_READ_REQUEST_INVALID", "GRAPH_READ_RESULT_INVALID"].includes(remoteCode ?? "")) return 2;
  if (error.code.startsWith("SERVICE_DESCRIPTOR")) return 3;
  if (error.code === "SERVICE_UNAVAILABLE" || error.code === "SERVICE_TIMEOUT") return 4;
  if (error.code === "SERVICE_UNAUTHORIZED" || error.code === "SERVICE_PROTOCOL_MISMATCH") return 5;
  return 8;
}

export async function runCli(args: string[], dependencies: CliDependencies, io: CliIo): Promise<number> {
  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse(args);
  } catch (error) {
    io.stderr(error instanceof Error ? error.message : String(error));
    return 2;
  }
  const [root, action, target] = parsed.command;
  if (!root || root === "help" || root === "--help" || root === "-h") {
    io.stdout(help);
    return 0;
  }
  if (!parsed.descriptorPath && !dependencies.descriptorPath) {
    io.stderr("Service descriptor path is required.");
    return 3;
  }
  if (parsed.exportPath && (root !== "doctor" || action !== undefined)) {
    io.stderr("--export is supported only by tc doctor.");
    return 2;
  }
  const exactObjectFilterCommand = root === "object" && ((action === "list" && parsed.command.length === 2) || (action === "search" && parsed.command.length === 3));
  if ((parsed.objectType || parsed.lifecycle) && !exactObjectFilterCommand) {
    io.stderr("--type and --lifecycle are supported only by exact object list/search commands. No request was sent.");
    return 2;
  }
  if ((parsed.graphDepth !== undefined || parsed.graphParents !== undefined || parsed.graphChildren) && root !== "graph") {
    io.stderr("--depth, --parents, and --children are supported only by tc graph. No request was sent.");
    return 2;
  }
  if ((parsed.scope || parsed.contextBlockId || parsed.contextPageId || parsed.contextObjectId || parsed.contextProjectId || parsed.outPath) && !(root === "context" && action === "export" && parsed.command.length === 2)) {
    io.stderr("--scope, matching context target, and --out are supported only by exact context export. No request was sent.");
    return 2;
  }
  if (root === "object" && ((action === "list" && parsed.command.length !== 2) || (action === "search" && parsed.command.length !== 3))) {
    io.stderr("Object list accepts no positional value; object search requires exactly one keyword. No request was sent.");
    return 2;
  }
  if (root === "backup" && action === "restore" && target && parsed.confirmation !== "RESTORE_AND_STOP_SERVICE") {
    io.stderr("Restore requires --confirm RESTORE_AND_STOP_SERVICE. No request was sent.");
    return 2;
  }
  const migrationConfirmation = action === "import" ? "IMPORT_REVIEWED_V1_BATCH" : action === "undo" ? "UNDO_MIGRATION_BATCH" : action === "activate" ? "ACTIVATE_V2_SQLITE" : undefined;
  if (root === "migration" && migrationConfirmation && parsed.confirmation !== migrationConfirmation) {
    io.stderr(`Migration ${action} requires --confirm ${migrationConfirmation}. No request was sent.`);
    return 2;
  }
  const filters = objectFilters(parsed);
  if (root === "object" && (action === "list" || action === "search") && !filters) {
    io.stderr(`Object filters must use a supported type (${V2_OBJECT_TYPES.join(", ")}) and lifecycle (${V2_LIFECYCLES.join(", ")}). No request was sent.`);
    return 2;
  }

  let service: CliService;
  try {
    service = await dependencies.loadService(parsed.descriptorPath ?? dependencies.descriptorPath ?? "");
    if (root === "status" && !action) {
      const status = await service.status();
      emit(io, parsed.json, status, `${status.status} · protocol ${status.protocolVersion} · objects ${status.objectCount}`);
      return 0;
    }
    if (root === "doctor" && !action) {
      const [doctor, status] = parsed.exportPath ? await Promise.all([service.doctor(), service.status()]) : [await service.doctor(), undefined];
      if (parsed.exportPath) {
        if (!dependencies.writeDiagnosticsArchive || !status) throw new Error("Diagnostic archive writer is unavailable.");
        await dependencies.writeDiagnosticsArchive(parsed.exportPath, doctor, status);
      }
      const checkLines = doctor.checks?.map(({ component, status, code, count }) => `${status}\t${component}\t${code}${count === undefined ? "" : `\t${count}`}`) ?? [];
      const output = parsed.exportPath ? { ...doctor, diagnosticArchive: parsed.exportPath } : doctor;
      emit(io, parsed.json, output, [`${doctor.status} · schema ${doctor.schemaVersion} · integrity ${doctor.integrity}`, ...checkLines, ...(doctor.limitations?.map((value) => `INFO\tLIMITATION\t${value}`) ?? []), ...(parsed.exportPath ? [`EXPORTED\t${parsed.exportPath}`] : [])].join("\n"));
      return doctor.status === "PASS" ? 0 : 7;
    }
    if (root === "object" && action === "list" && !target) {
      const objects = filterObjects(await service.listObjects(), filters ?? {});
      emit(io, parsed.json, { objects }, objects.map((object) => `${object.objectId}\t${object.objectType}\t${object.lifecycle}\t${object.text}`).join("\n"));
      return 0;
    }
    if (root === "object" && action === "search" && target) {
      const query = target.trim().toLowerCase();
      if (!query) {
        io.stderr("Object search requires a non-empty keyword.");
        return 2;
      }
      const objects = filterObjects(await service.listObjects(), filters ?? {}).filter((object) => `${object.objectId}\n${object.text}`.toLowerCase().includes(query));
      emit(io, parsed.json, { query: target, objects }, objects.map((object) => `${object.objectId}\t${object.objectType}\t${object.lifecycle}\t${object.text}`).join("\n"));
      return 0;
    }
    if (root === "object" && action === "show" && target) {
      const object = await service.getObject(target);
      if (!object) {
        io.stderr(`Object not found: ${target}`);
        return 6;
      }
      emit(io, parsed.json, { object }, `${object.objectId}\n${object.objectType} · ${object.lifecycle}\n${object.text}`);
      return 0;
    }
    if (root === "graph" && action === "page" && target && parsed.command.length === 3) {
      if (parsed.graphParents !== undefined || parsed.graphChildren || (parsed.graphDepth !== undefined && (!Number.isSafeInteger(parsed.graphDepth) || parsed.graphDepth < 0 || parsed.graphDepth > 5))) {
        io.stderr("Graph page accepts only --depth 0..5. No request was sent.");
        return 2;
      }
      const snapshot = await service.readGraph({ kind: "PAGE", target, depth: parsed.graphDepth ?? 2 });
      emit(io, parsed.json, { snapshot }, `${snapshot.resolved.name ?? snapshot.resolved.id}\n${snapshot.blocks.length} blocks${snapshot.truncated ? " · bounded/truncated" : ""}\nRead-only Logseq snapshot.`);
      return 0;
    }
    if (root === "graph" && action === "block" && target && parsed.command.length === 3) {
      if (parsed.graphDepth !== undefined || (parsed.graphParents !== undefined && (!Number.isSafeInteger(parsed.graphParents) || parsed.graphParents < 0 || parsed.graphParents > 8))) {
        io.stderr("Graph block accepts only --children and --parents 0..8. No request was sent.");
        return 2;
      }
      const snapshot = await service.readGraph({ kind: "BLOCK", target, includeChildren: parsed.graphChildren, parents: parsed.graphParents ?? 0 });
      emit(io, parsed.json, { snapshot }, `${snapshot.resolved.id}\n${snapshot.blocks.length} blocks${snapshot.truncated ? " · bounded/truncated" : ""}\nRead-only Logseq snapshot.`);
      return 0;
    }
    if (root === "graph" && action === "resolve" && target && parsed.command.length === 3 && parsed.graphDepth === undefined && parsed.graphParents === undefined && !parsed.graphChildren) {
      const snapshot = await service.readGraph({ kind: "RESOLVE", target });
      emit(io, parsed.json, { resolved: snapshot.resolved, scopeHash: snapshot.scopeHash, readAt: snapshot.readAt }, `${snapshot.resolved.kind}\t${snapshot.resolved.id}${snapshot.resolved.name ? `\t${snapshot.resolved.name}` : ""}`);
      return 0;
    }
    if (root === "proposal" && action === "list" && !target) {
      const proposals = await service.listProposals();
      emit(io, parsed.json, { proposals }, proposals.map(({ proposal, updatedAt }) => `${proposal.proposalId}\t${proposal.status}\t${updatedAt}\t${proposal.title}`).join("\n"));
      return 0;
    }
    if (root === "proposal" && action === "show" && target) {
      const record = await service.getProposal(target);
      if (!record) {
        io.stderr(`Proposal not found: ${target}`);
        return 6;
      }
      emit(io, parsed.json, { record }, `${record.proposal.proposalId}\n${record.proposal.status} · ${record.proposal.title}\nupdated ${record.updatedAt}`);
      return 0;
    }
    if (root === "proposal" && ["validate", "submit"].includes(action ?? "") && target) {
      if (!dependencies.loadProposal) {
        io.stderr("Proposal file loading is unavailable.");
        return 2;
      }
      let proposal: unknown;
      try {
        proposal = await dependencies.loadProposal(target);
      } catch (error) {
        io.stderr(error instanceof Error ? error.message : String(error));
        return 2;
      }
      if (action === "validate") {
        const validated = await service.validateProposal(proposal);
        const output = { ...validated, effects: { proposalStored: false, formalWritesExecuted: false } };
        emit(io, parsed.json, output, `${validated.status}\n${validated.proposal.proposalId}\nNo Proposal or formal state was written.`);
        return 0;
      }
      const submitted = await service.submitProposal(proposal);
      const output = { ...submitted, effects: { proposalStored: true, formalWritesExecuted: false } };
      emit(io, parsed.json, output, `${submitted.record.proposal.proposalId}\n${submitted.record.proposal.status} · submitted for review${submitted.replayed ? " (replayed)" : ""}\nNo formal change was committed.`);
      return 0;
    }
    if (root === "skill" && action === "list" && !target) {
      const skills = await service.listSkills();
      emit(io, parsed.json, { skills }, skills.map((skill) => `${skill.name}\t${skill.version}\t${skill.sha256}\t${skill.description}`).join("\n"));
      return 0;
    }
    if (root === "skill" && action === "show" && target) {
      const skill = await service.getSkill(target);
      if (!skill) {
        io.stderr(`Skill not found: ${target}`);
        return 6;
      }
      emit(io, parsed.json, { skill }, skill.content);
      return 0;
    }
    if (root === "context" && action === "export" && !target) {
      const scope = ["block", "page", "object", "project"].includes(parsed.scope ?? "") ? parsed.scope as "block" | "page" | "object" | "project" : undefined;
      const ids = { block: parsed.contextBlockId, page: parsed.contextPageId, object: parsed.contextObjectId, project: parsed.contextProjectId };
      const id = scope ? ids[scope] : undefined;
      const exclusiveId = Object.values(ids).filter(Boolean).length === 1;
      if (!scope || !id || !exclusiveId || !parsed.outPath || !dependencies.writeContextPackage) {
        io.stderr("Context export requires exactly one block/page/object/project scope, matching target, and --out directory.");
        return 2;
      }
      const result = await service.exportContext(scope, id);
      await dependencies.writeContextPackage(parsed.outPath, result);
      emit(io, parsed.json, { path: parsed.outPath, fingerprint: result.fingerprint, manifest: result.contextPackage.manifest }, `${parsed.outPath}\n${result.contextPackage.manifest.includedObjectCount} objects · ${result.fingerprint}\nRead-only Context Package written.`);
      return 0;
    }
    if (root === "migration" && action === "scan" && target) {
      if (!dependencies.loadMigrationBundle) {
        io.stderr("Migration bundle loading is unavailable.");
        return 2;
      }
      let bundle: unknown;
      try { bundle = await dependencies.loadMigrationBundle(target); } catch (error) {
        io.stderr(error instanceof Error ? error.message : String(error));
        return 2;
      }
      const report = await service.scanLegacyMigration(bundle);
      emit(io, parsed.json, { report }, `${report.status}\n${report.sourceBundleSha256}\n${report.counts.total} records · ${report.counts.directBind} direct · ${report.counts.needsConfirmation} review · ${report.counts.structuralError} errors\nNo formal state was written.`);
      return 0;
    }
    if (root === "migration" && action === "preview" && target && parsed.decisionsPath && dependencies.loadMigrationBundle) {
      try {
        const [bundle, decisionsValue] = await Promise.all([dependencies.loadMigrationBundle(target), dependencies.loadMigrationBundle(parsed.decisionsPath)]);
        if (!Array.isArray(decisionsValue)) throw new Error("Migration decisions must be a JSON array.");
        const result = await service.previewLegacyMigration(bundle, decisionsValue as LegacyMigrationReviewDecision[]);
        emit(io, parsed.json, result, `${result.run.runId}\n${result.run.status} · ${result.run.summary.import} import · ${result.run.summary.defer} defer${result.replayed ? " · replayed" : ""}`);
        return 0;
      } catch (error) { io.stderr(error instanceof Error ? error.message : String(error)); return 2; }
    }
    if (root === "migration" && action === "show" && target) {
      const details = await service.getMigrationRun(target);
      emit(io, parsed.json, details, `${details.run.runId}\n${details.run.status} · ${details.run.summary.total} reviewed\n${details.evidence.filter(({ targetObjectId }) => targetObjectId).length} imported`);
      return 0;
    }
    if (root === "migration" && action === "import" && target && parsed.bundlePath && parsed.batchValue && parsed.backupId && dependencies.loadMigrationBundle) {
      let bundle: unknown; let batch: unknown;
      try { [bundle, batch] = await Promise.all([dependencies.loadMigrationBundle(parsed.bundlePath), dependencies.loadMigrationBundle(parsed.batchValue)]); }
      catch (error) { io.stderr(error instanceof Error ? error.message : String(error)); return 2; }
      const record = batch && typeof batch === "object" && !Array.isArray(batch) ? batch as Record<string, unknown> : {};
      if (!Array.isArray(record.objectIds) || record.objectIds.some((id) => typeof id !== "string") || typeof record.idempotencyKey !== "string") { io.stderr("Migration batch file must contain objectIds and idempotencyKey."); return 2; }
      const result = await service.importLegacyMigration(target, { bundle, backupId: parsed.backupId, objectIds: record.objectIds as string[], idempotencyKey: record.idempotencyKey, confirmation: "IMPORT_REVIEWED_V1_BATCH" });
      emit(io, parsed.json, result, `${result.batch.batchId}\n${result.batch.status} · ${result.batch.importedCount} objects${result.replayed ? " · replayed" : ""}`);
      return 0;
    }
    if (root === "migration" && action === "verify" && target && parsed.batchValue) {
      const batch = await service.verifyLegacyMigrationBatch(target, parsed.batchValue);
      emit(io, parsed.json, { batch }, `${batch.batchId}\n${batch.status} · ${batch.validation?.checksum ?? "no checksum"}`);
      return 0;
    }
    if (root === "migration" && action === "undo" && target && parsed.batchValue) {
      const batch = await service.undoLegacyMigrationBatch(target, parsed.batchValue, "UNDO_MIGRATION_BATCH");
      emit(io, parsed.json, { batch }, `${batch.batchId}\n${batch.status}`);
      return 0;
    }
    if (root === "migration" && action === "activate" && target) {
      const run = await service.activateLegacyMigration(target, "ACTIVATE_V2_SQLITE");
      emit(io, parsed.json, { run }, `${run.runId}\n${run.status}`);
      return 0;
    }
    if (root === "backup" && action === "create" && !target && !parsed.confirmation) {
      const created = await service.createBackup();
      emit(io, parsed.json, created, `${created.backupId}\n${created.validation.status} · objects ${created.validation.objectCount}`);
      return 0;
    }
    if (root === "backup" && action === "validate" && target && !parsed.confirmation) {
      const validated = await service.validateBackup(target);
      emit(io, parsed.json, validated, `${validated.backupId}\n${validated.validation.status} · schema ${validated.validation.schemaVersion}`);
      return validated.validation.status === "PASS" ? 0 : 7;
    }
    if (root === "backup" && action === "restore" && target) {
      const restored = await service.restoreBackup(target, "RESTORE_AND_STOP_SERVICE");
      emit(io, parsed.json, restored, `${restored.status}\nrecovery backup ${restored.recoveryBackupId}\nRestart Service, then run tc doctor.`);
      return 0;
    }
    io.stderr("Unknown or incomplete command. Run tc help.");
    return 2;
  } catch (error) {
    io.stderr(error instanceof Error ? error.message : String(error));
    return errorExit(error);
  }
}
