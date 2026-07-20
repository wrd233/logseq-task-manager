import type { V2ManagedObject } from "@task-copilot/domain";
import type { ServiceDoctor, ServiceStatus } from "@task-copilot/service-client";
import { StructuredError } from "@task-copilot/shared";

export interface CliService {
  status(): Promise<ServiceStatus>;
  doctor(): Promise<ServiceDoctor>;
  listObjects(): Promise<V2ManagedObject[]>;
  getObject(objectId: string): Promise<V2ManagedObject | undefined>;
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

The CLI talks only to Task Copilot Local Service. It never opens SQLite directly.`;

function emit(io: CliIo, json: boolean, value: unknown, plain: string): void {
  io.stdout(json ? JSON.stringify({ schema_version: 1, data: value }) : plain);
}

function parse(args: string[]): { command: string[]; json: boolean; descriptorPath?: string } {
  const command: string[] = [];
  let json = false;
  let descriptorPath: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--json") json = true;
    else if (value === "--service-descriptor") {
      descriptorPath = args[index + 1];
      if (!descriptorPath) throw new Error("--service-descriptor requires a path");
      index += 1;
    } else if (value) command.push(value);
  }
  return { command, json, ...(descriptorPath ? { descriptorPath } : {}) };
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
  const [root, action, objectId] = parsed.command;
  if (!root || root === "help" || root === "--help" || root === "-h") {
    io.stdout(help);
    return 0;
  }
  if (!parsed.descriptorPath && !dependencies.descriptorPath) {
    io.stderr("Service descriptor path is required.");
    return 3;
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
    if (root === "object" && action === "list" && !objectId) {
      const objects = await service.listObjects();
      emit(io, parsed.json, { objects }, objects.map((object) => `${object.objectId}\t${object.objectType}\t${object.lifecycle}\t${object.text}`).join("\n"));
      return 0;
    }
    if (root === "object" && action === "show" && objectId) {
      const object = await service.getObject(objectId);
      if (!object) {
        io.stderr(`Object not found: ${objectId}`);
        return 6;
      }
      emit(io, parsed.json, { object }, `${object.objectId}\n${object.objectType} · ${object.lifecycle}\n${object.text}`);
      return 0;
    }
    io.stderr("Unknown or incomplete command. Run tc help.");
    return 2;
  } catch (error) {
    io.stderr(error instanceof Error ? error.message : String(error));
    return errorExit(error);
  }
}
