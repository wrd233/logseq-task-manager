import type { V2ManagedObject } from "@task-copilot/domain";
import type { ServiceBackupCreated, ServiceBackupRestored, ServiceBackupValidation, ServiceContextExportResult, ServiceDoctor, ServiceLegacyMigrationScanReport, ServiceProposalValidationResult, ServiceSkillDocument, ServiceSkillSummary, ServiceStatus, ServiceStoredProposal } from "@task-copilot/service-client";
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
  exportContext(scope: "object" | "project", id: string): Promise<ServiceContextExportResult>;
  scanLegacyMigration(bundle: unknown): Promise<ServiceLegacyMigrationScanReport>;
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
  descriptorPath?: string;
}

const help = `Task Copilot CLI

Usage:
  tc [--service-descriptor <path>] [--json] status
  tc [--service-descriptor <path>] [--json] doctor
  tc [--service-descriptor <path>] [--json] object list
  tc [--service-descriptor <path>] [--json] object show <object_id>
  tc [--service-descriptor <path>] [--json] proposal list
  tc [--service-descriptor <path>] [--json] proposal show <proposal_id>
  tc [--service-descriptor <path>] [--json] proposal validate <proposal.json>
  tc [--service-descriptor <path>] [--json] proposal submit <proposal.json>
  tc [--service-descriptor <path>] [--json] skill list
  tc [--service-descriptor <path>] [--json] skill show <name>
  tc [--service-descriptor <path>] [--json] context export --scope object --object <object_id> --out <directory>
  tc [--service-descriptor <path>] [--json] context export --scope project --project <project_id> --out <directory>
  tc [--service-descriptor <path>] [--json] migration scan <v1-recovery-bundle.json>
  tc [--service-descriptor <path>] [--json] backup create
  tc [--service-descriptor <path>] [--json] backup validate <backup_id>
  tc [--service-descriptor <path>] [--json] backup restore <backup_id> --confirm RESTORE_AND_STOP_SERVICE

The CLI talks only to Task Copilot Local Service. It never opens SQLite directly.
Proposal submit only enters the review queue; it never commits or applies a change.`;

function emit(io: CliIo, json: boolean, value: unknown, plain: string): void {
  io.stdout(json ? JSON.stringify({ schema_version: 1, data: value }) : plain);
}

function parse(args: string[]): { command: string[]; json: boolean; descriptorPath?: string; confirmation?: string; scope?: string; contextObjectId?: string; contextProjectId?: string; outPath?: string } {
  const command: string[] = [];
  let json = false;
  let descriptorPath: string | undefined;
  let confirmation: string | undefined;
  let scope: string | undefined;
  let contextObjectId: string | undefined;
  let contextProjectId: string | undefined;
  let outPath: string | undefined;
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
    } else if (["--scope", "--object", "--project", "--out"].includes(value ?? "")) {
      const optionValue = args[index + 1];
      if (!optionValue) throw new Error(`${value} requires a value`);
      if (value === "--scope") scope = optionValue;
      else if (value === "--object") contextObjectId = optionValue;
      else if (value === "--project") contextProjectId = optionValue;
      else outPath = optionValue;
      index += 1;
    } else if (value) command.push(value);
  }
  return { command, json, ...(descriptorPath ? { descriptorPath } : {}), ...(confirmation ? { confirmation } : {}), ...(scope ? { scope } : {}), ...(contextObjectId ? { contextObjectId } : {}), ...(contextProjectId ? { contextProjectId } : {}), ...(outPath ? { outPath } : {}) };
}

function errorExit(error: unknown): number {
  if (!(error instanceof StructuredError)) return 8;
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
  if (root === "backup" && action === "restore" && target && parsed.confirmation !== "RESTORE_AND_STOP_SERVICE") {
    io.stderr("Restore requires --confirm RESTORE_AND_STOP_SERVICE. No request was sent.");
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
      const doctor = await service.doctor();
      emit(io, parsed.json, doctor, `${doctor.status} · schema ${doctor.schemaVersion} · integrity ${doctor.integrity}`);
      return doctor.status === "PASS" ? 0 : 7;
    }
    if (root === "object" && action === "list" && !target) {
      const objects = await service.listObjects();
      emit(io, parsed.json, { objects }, objects.map((object) => `${object.objectId}\t${object.objectType}\t${object.lifecycle}\t${object.text}`).join("\n"));
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
      const scope = parsed.scope === "object" || parsed.scope === "project" ? parsed.scope : undefined;
      const id = scope === "object" ? parsed.contextObjectId : scope === "project" ? parsed.contextProjectId : undefined;
      const exclusiveId = scope === "object" ? !parsed.contextProjectId : scope === "project" ? !parsed.contextObjectId : false;
      if (!scope || !id || !exclusiveId || !parsed.outPath || !dependencies.writeContextPackage) {
        io.stderr("Context export requires exactly one object/project scope, matching ID, and --out directory.");
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
