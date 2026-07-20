import type { V2ManagedObject } from "@task-copilot/domain";
import type { ServiceBackupCreated, ServiceBackupRestored, ServiceBackupValidation, ServiceDoctor, ServiceStatus } from "@task-copilot/service-client";
import { StructuredError } from "@task-copilot/shared";

export interface CliService {
  status(): Promise<ServiceStatus>;
  doctor(): Promise<ServiceDoctor>;
  listObjects(): Promise<V2ManagedObject[]>;
  getObject(objectId: string): Promise<V2ManagedObject | undefined>;
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
  descriptorPath?: string;
}

const help = `Task Copilot CLI

Usage:
  tc [--service-descriptor <path>] [--json] status
  tc [--service-descriptor <path>] [--json] doctor
  tc [--service-descriptor <path>] [--json] object list
  tc [--service-descriptor <path>] [--json] object show <object_id>
  tc [--service-descriptor <path>] [--json] backup create
  tc [--service-descriptor <path>] [--json] backup validate <backup_id>
  tc [--service-descriptor <path>] [--json] backup restore <backup_id> --confirm RESTORE_AND_STOP_SERVICE

The CLI talks only to Task Copilot Local Service. It never opens SQLite directly.`;

function emit(io: CliIo, json: boolean, value: unknown, plain: string): void {
  io.stdout(json ? JSON.stringify({ schema_version: 1, data: value }) : plain);
}

function parse(args: string[]): { command: string[]; json: boolean; descriptorPath?: string; confirmation?: string } {
  const command: string[] = [];
  let json = false;
  let descriptorPath: string | undefined;
  let confirmation: string | undefined;
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
    } else if (value) command.push(value);
  }
  return { command, json, ...(descriptorPath ? { descriptorPath } : {}), ...(confirmation ? { confirmation } : {}) };
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
