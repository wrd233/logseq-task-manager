import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import type {
  LauncherRestoreRecoveryResult,
  LauncherRestoreRecoveryStatus,
} from "@task-copilot/service-client/launcher";

import type { EnsureServiceInput, EnsureServiceResult } from "./manager.ts";

export interface LauncherManager {
  ensure(input: EnsureServiceInput): Promise<EnsureServiceResult>;
  heartbeat(leaseId: string): void;
  release(leaseId: string): Promise<void>;
  restoreRecoveryStatus(graphKey: string): Promise<LauncherRestoreRecoveryStatus>;
  recoverRestore(graphKey: string, confirmation: "RESTORE_RETAINED_FORMAL_STATE"): Promise<LauncherRestoreRecoveryResult>;
  reapExpired(): Promise<void>;
  close(): Promise<void>;
}

interface StartLauncherServiceOptions {
  listenPort: number;
  token: string;
  leaseTtlMs: number;
  graphCount: number;
  manager: LauncherManager;
}

interface LauncherService {
  url: string;
  close(): Promise<void>;
}

class RequestError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

function headers(response: ServerResponse): void {
  response.setHeader("access-control-allow-origin", "*");
  response.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  response.setHeader("access-control-allow-headers", "authorization, content-type");
  response.setHeader("cache-control", "no-store");
}

function respond(response: ServerResponse, status: number, value?: unknown): void {
  headers(response);
  response.statusCode = status;
  if (value === undefined) {
    response.end();
    return;
  }
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(value));
}

function authorized(request: IncomingMessage, expected: string): boolean {
  const value = request.headers.authorization ?? "";
  const wanted = `Bearer ${expected}`;
  const left = Buffer.from(value);
  const right = Buffer.from(wanted);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const value of request) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    size += chunk.length;
    if (size > 16_384) throw new RequestError(413, "LAUNCHER_REQUEST_TOO_LARGE", "Launcher request exceeds the bounded size.");
    chunks.push(chunk);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new RequestError(400, "LAUNCHER_REQUEST_INVALID", "Launcher request must be valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new RequestError(400, "LAUNCHER_REQUEST_INVALID", "Launcher request must be an object.");
  }
  return parsed as Record<string, unknown>;
}

function boundedIdentifier(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(value)) {
    throw new RequestError(400, "LAUNCHER_REQUEST_INVALID", `${field} is invalid.`);
  }
  return value;
}

function errorCode(error: unknown): string {
  if (error instanceof RequestError) return error.code;
  if (error instanceof Error && /^[A-Z][A-Z0-9_]{2,127}$/.test(error.message)) return error.message;
  return "LAUNCHER_REQUEST_FAILED";
}

export async function startLauncherService(options: StartLauncherServiceOptions): Promise<LauncherService> {
  let closing = false;
  const server = createServer((request, response) => {
    void (async () => {
      if (request.method === "OPTIONS") {
        respond(response, 204);
        return;
      }
      if (!authorized(request, options.token)) throw new RequestError(401, "LAUNCHER_UNAUTHORIZED", "Launcher authorization failed.");
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (request.method === "GET" && url.pathname === "/health") {
        respond(response, 200, {
          status: "READY",
          protocolVersion: 1,
          capabilities: {
            graphServiceLifecycle: true,
            leaseHeartbeat: true,
            ownedShutdown: true,
            restoreRecoveryStatus: true,
            restoreRecoveryApply: true,
          },
          configuredGraphs: options.graphCount,
        });
        return;
      }
      if (request.method === "POST" && url.pathname === "/sessions/ensure") {
        const input = await body(request);
        const result = await options.manager.ensure({
          graphKey: boundedIdentifier(input.graphKey, "graphKey"),
          clientInstanceId: boundedIdentifier(input.clientInstanceId, "clientInstanceId"),
        });
        respond(response, 200, result);
        return;
      }
      if (request.method === "POST" && url.pathname === "/sessions/heartbeat") {
        const input = await body(request);
        options.manager.heartbeat(boundedIdentifier(input.leaseId, "leaseId"));
        respond(response, 204);
        return;
      }
      if (request.method === "POST" && url.pathname === "/sessions/release") {
        const input = await body(request);
        await options.manager.release(boundedIdentifier(input.leaseId, "leaseId"));
        respond(response, 204);
        return;
      }
      if (request.method === "POST" && url.pathname === "/restore-recovery/status") {
        const input = await body(request);
        const result = await options.manager.restoreRecoveryStatus(
          boundedIdentifier(input.graphKey, "graphKey"),
        );
        respond(response, 200, result);
        return;
      }
      if (request.method === "POST" && url.pathname === "/restore-recovery/apply") {
        const input = await body(request);
        if (input.confirmation !== "RESTORE_RETAINED_FORMAL_STATE") {
          throw new RequestError(400, "LAUNCHER_RESTORE_RECOVERY_CONFIRMATION_REQUIRED", "Restore recovery confirmation is required.");
        }
        const result = await options.manager.recoverRestore(
          boundedIdentifier(input.graphKey, "graphKey"),
          input.confirmation,
        );
        respond(response, 200, result);
        return;
      }
      throw new RequestError(404, "LAUNCHER_ROUTE_NOT_FOUND", "Launcher route does not exist.");
    })().catch((error: unknown) => {
      const status = error instanceof RequestError
        ? error.status
        : error instanceof Error && ["LAUNCHER_GRAPH_NOT_CONFIGURED", "LAUNCHER_RESTORE_RECOVERY_ARMED", "LAUNCHER_RESTORE_RECOVERY_REQUIRED", "LAUNCHER_RESTORE_RECOVERY_STATE_INVALID", "LAUNCHER_RESTORE_RECOVERY_POINT_UNCONFIRMED", "LAUNCHER_RESTORE_RECOVERY_SERVICE_ACTIVE", "LAUNCHER_RESTORE_RECOVERY_INCOMPLETE"].includes(error.message)
          ? 409
          : 500;
      respond(response, status, { error: { code: errorCode(error), message: status >= 500 ? "Launcher could not complete the request." : error instanceof Error ? error.message : "Launcher request failed." } });
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.listenPort, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string" || address.address !== "127.0.0.1") {
    server.close();
    throw new Error("LAUNCHER_LOOPBACK_BIND_FAILED");
  }
  const timer = setInterval(() => {
    void options.manager.reapExpired();
  }, Math.min(5_000, Math.max(1_000, Math.floor(options.leaseTtlMs / 3))));
  timer.unref();
  return {
    url: `http://127.0.0.1:${address.port}/`,
    async close(): Promise<void> {
      if (closing) return;
      closing = true;
      clearInterval(timer);
      await options.manager.close();
      if (server.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}
