import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile, chmod } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname } from "node:path";

import { parseSemanticOperation } from "@task-copilot/contracts";
import { Kernel, KernelError } from "@task-copilot/kernel";
import { SqliteStore } from "@task-copilot/sqlite";

export interface StartKernelOptions { databasePath: string; descriptorPath: string; token?: string; now?: () => string }

async function body(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new KernelError("JSON_INVALID", "Request body must be valid JSON."); }
}

function send(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(value));
}

export async function startKernelServer(options: StartKernelOptions): Promise<{ baseUrl: string; token: string; close: () => Promise<void>; store: SqliteStore }> {
  const token = options.token ?? randomBytes(32).toString("hex");
  await mkdir(dirname(options.databasePath), { recursive: true });
  const store = new SqliteStore(options.databasePath);
  const kernel = new Kernel(store, options.now ? { now: options.now } : {});
  const server = createServer(async (request, response) => {
    response.setHeader("x-content-type-options", "nosniff");
    if (request.headers.authorization !== `Bearer ${token}`) { send(response, 401, { error: { code: "AUTH_REQUIRED", message: "A valid local capability token is required." } }); return; }
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    try {
      if (request.method === "GET" && url.pathname === "/v1/status") { send(response, 200, { status: "ok", schemaVersion: store.schemaVersion(), pid: process.pid }); return; }
      if (request.method === "GET" && url.pathname === "/v1/objects") { send(response, 200, { objects: store.listWorkObjects() }); return; }
      const objectMatch = /^\/v1\/objects\/([^/]+)$/u.exec(url.pathname);
      if (request.method === "GET" && objectMatch) {
        const object = store.getWorkObject(decodeURIComponent(objectMatch[1]!));
        if (!object) { send(response, 404, { error: { code: "WORK_OBJECT_NOT_FOUND", message: "WorkObject not found." } }); return; }
        send(response, 200, { object, anchor: store.getAnchorForWorkObject(object.id) }); return;
      }
      const commitMatch = /^\/v1\/commits\/([^/]+)$/u.exec(url.pathname);
      if (request.method === "GET" && commitMatch) {
        const commit = store.getCommit(decodeURIComponent(commitMatch[1]!));
        if (!commit) { send(response, 404, { error: { code: "COMMIT_NOT_FOUND", message: "Commit not found." } }); return; }
        send(response, 200, { commit }); return;
      }
      if (request.method === "GET" && url.pathname === "/v1/recovery") { send(response, 200, { recovery: kernel.recoveryList() }); return; }
      if (request.method === "POST" && url.pathname === "/v1/commits/prepare") {
        const value = await body(request) as { operation: unknown; snapshot: Parameters<Kernel["prepare"]>[1] };
        send(response, 202, kernel.prepare(parseSemanticOperation(value.operation), value.snapshot)); return;
      }
      const completeMatch = /^\/v1\/commits\/([^/]+)\/complete$/u.exec(url.pathname);
      if (request.method === "POST" && completeMatch) {
        const value = await body(request) as { result: Parameters<Kernel["complete"]>[1]; snapshot: Parameters<Kernel["complete"]>[2] };
        send(response, 200, { commit: kernel.complete(decodeURIComponent(completeMatch[1]!), value.result, value.snapshot) }); return;
      }
      const undoMatch = /^\/v1\/commits\/([^/]+)\/undo\/prepare$/u.exec(url.pathname);
      if (request.method === "POST" && undoMatch) {
        const value = await body(request) as { operationId: string; actor: Parameters<Kernel["prepareUndo"]>[0]["actor"]; snapshot: Parameters<Kernel["prepareUndo"]>[1] };
        send(response, 202, kernel.prepareUndo({ operationId: value.operationId, actor: value.actor, commitId: decodeURIComponent(undoMatch[1]!) }, value.snapshot)); return;
      }
      const recoveryMatch = /^\/v1\/recovery\/([^/]+)\/(abort|verify)$/u.exec(url.pathname);
      if (request.method === "POST" && recoveryMatch) {
        const commitId = decodeURIComponent(recoveryMatch[1]!);
        if (recoveryMatch[2] === "abort") send(response, 200, { commit: kernel.abortPrepared(commitId) });
        else {
          const value = await body(request) as { snapshot: Parameters<Kernel["verifyRecoveredGraph"]>[1] };
          send(response, 200, { commit: kernel.verifyRecoveredGraph(commitId, value.snapshot) });
        }
        return;
      }
      send(response, 404, { error: { code: "ROUTE_NOT_FOUND", message: "Route not found." } });
    } catch (error) {
      const code = error instanceof KernelError ? error.code : error instanceof Error && "code" in error ? String(error.code) : "INTERNAL_ERROR";
      const message = error instanceof Error ? error.message : "Internal error.";
      send(response, code === "INTERNAL_ERROR" ? 500 : 409, { error: { code, message } });
    }
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("KERNEL_ADDRESS_INVALID");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const descriptor = { schemaVersion: 1, baseUrl, token, pid: process.pid, startedAt: (options.now ?? (() => new Date().toISOString()))() } as const;
  await mkdir(dirname(options.descriptorPath), { recursive: true });
  const temporary = `${options.descriptorPath}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(descriptor, null, 2)}\n`, { mode: 0o600 });
  await chmod(temporary, 0o600);
  await rename(temporary, options.descriptorPath);
  return {
    baseUrl, token, store,
    close: async () => {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      store.close();
      try {
        const current = JSON.parse(await readFile(options.descriptorPath, "utf8")) as { token?: string };
        if (current.token === token) await rm(options.descriptorPath);
      } catch (error) { if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error; }
    },
  };
}
