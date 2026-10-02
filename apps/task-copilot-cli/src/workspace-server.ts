import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes, randomUUID, createHash, timingSafeEqual } from "node:crypto";
import { mkdir, lstat, realpath, readFile, writeFile, rm, appendFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { WorkspaceError, parseWorkBinding, parseWorkspaceCall, workRecord, workText, workspaceCommands, type AgentWorkBinding, type WorkspaceCall, type WorkspaceDelivery, type WorkspaceReply, type WorkspacePluginDescriptor } from "@task-copilot/contracts";
import { authorizedRoot, scopedPath, discoverFiles, previewFile, atomicJson, metadataDirectory, sessionRecords, type FileObservation, type KnownMaterial } from "./workspace-files.ts";

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const equal = (a: unknown, b: string): boolean => typeof a === "string" && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
type Entry = { delivery: WorkspaceDelivery; digest: string; sent: boolean; settled: boolean; reply?: WorkspaceReply; error?: WorkspaceError; timer: ReturnType<typeof setTimeout>; resolve: (value: WorkspaceReply) => void; reject: (error: WorkspaceError) => void; promise: Promise<WorkspaceReply> };
export class WorkspaceBroker {
  binding: AgentWorkBinding | null = null;
  connectionId: string | null = null;
  private lastSeen = 0;
  private readonly entries = new Map<string, Entry>();
  constructor(readonly instanceId: string, private readonly offlineMs = 3000, private readonly timeoutMs = 20000) {}
  online(): boolean { return this.binding !== null && Date.now() - this.lastSeen < this.offlineMs; }
  grant(connectionId: string, binding: AgentWorkBinding): void { this.revoke(); this.connectionId = connectionId; this.binding = binding; this.lastSeen = Date.now(); }
  revoke(): void {
    for (const entry of this.entries.values()) if (!entry.settled) { clearTimeout(entry.timer); entry.settled = true; entry.error = new WorkspaceError("CONNECTION_REVOKED"); entry.reject(entry.error); }
    this.binding = null; this.connectionId = null; this.lastSeen = 0;
  }
  assert(connectionId: string): AgentWorkBinding {
    if (!this.online()) throw new WorkspaceError("WORKSPACE_OFFLINE");
    if (connectionId !== this.connectionId) throw new WorkspaceError("CONNECTION_STALE");
    return this.binding!;
  }
  poll(connectionId: string, busy = false): WorkspaceDelivery | null {
    if (connectionId !== this.connectionId || !this.binding) throw new WorkspaceError("CONNECTION_STALE");
    // Heartbeat resumes an existing grant; it never restores a revoked grant after restart.
    this.lastSeen = Date.now();
    if (busy) return null;
    const entry = [...this.entries.values()].find(item => !item.sent && !item.settled);
    if (!entry) return null; entry.sent = true; return structuredClone(entry.delivery);
  }
  complete(connectionId: string, requestId: string, clientId: string, value: unknown, error?: {code: string; message: string}): void {
    if (connectionId !== this.connectionId) throw new WorkspaceError("CONNECTION_STALE");
    const key = JSON.stringify([connectionId, clientId, requestId]), entry = this.entries.get(key);
    if (!entry || !entry.sent) throw new WorkspaceError("REQUEST_NOT_FOUND");
    clearTimeout(entry.timer); entry.settled = true;
    if (error) { entry.error = new WorkspaceError(error.code, error.message); entry.reject(entry.error); return; }
    delete entry.error;
    entry.reply = {instanceId: this.instanceId, connectionId, requestId, value, provenance: {clientId, command: entry.delivery.command, payloadDigest: entry.digest, origin: "verified-local-connection"}};
    entry.resolve(entry.reply);
  }
  request(call: WorkspaceCall): Promise<WorkspaceReply> {
    if (call.instanceId !== this.instanceId) throw new WorkspaceError("DESCRIPTOR_STALE");
    const binding = this.assert(call.connectionId), key = JSON.stringify([call.connectionId, call.clientId, call.requestId]), fingerprint = digest([call.command, call.payload]), previous = this.entries.get(key);
    if (previous) { if (previous.digest !== fingerprint) throw new WorkspaceError("IDEMPOTENCY_KEY_REUSED"); if (previous.reply) return Promise.resolve(previous.reply); if (previous.error) throw previous.error; return previous.promise; }
    if (this.entries.size >= 512) {
      const oldest = [...this.entries].find(([,item]) => item.settled);
      if (!oldest) throw new WorkspaceError("REQUEST_LIMIT"); this.entries.delete(oldest[0]);
    }
    let accept!: Entry["resolve"], reject!: Entry["reject"];
    const promise = new Promise<WorkspaceReply>((yes, no) => {accept = yes; reject = no;});
    const entry: Entry = {delivery: {...call, scope: binding.scope, binding: structuredClone(binding)}, digest: fingerprint, sent: false, settled: false, resolve: accept, reject, promise, timer: setTimeout(() => {
      entry.settled = true; entry.error = new WorkspaceError(entry.sent ? "TRANSPORT_OUTCOME_UNKNOWN" : "WORKSPACE_TIMEOUT", entry.sent ? "Delivered request has an unknown result; query the original content request before retrying." : "Plugin did not receive this request before timeout."); reject(entry.error);
    }, this.timeoutMs)};
    this.entries.set(key, entry); return promise;
  }
}
async function body(request: IncomingMessage): Promise<unknown> {
  let length = 0; const chunks: Buffer[] = [];
  for await (const chunk of request) { length += chunk.length; if (length > 20_971_520) throw new WorkspaceError("INPUT_TOO_LARGE"); chunks.push(Buffer.from(chunk)); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new WorkspaceError("INVALID_JSON"); }
}
function send(response: ServerResponse, status: number, value: unknown): void { response.writeHead(status, {"content-type": "application/json", "cache-control": "no-store"}); response.end(JSON.stringify(value)); }
export async function startWorkspaceServer(options: {stateDirectory: string; port?: number; offlineMs?: number; timeoutMs?: number}) {
  const state = resolve(options.stateDirectory);
  await mkdir(state, {recursive: true, mode: 0o700});
  const stat = await lstat(state);
  if (stat.isSymbolicLink() || await realpath(state) !== state || (process.platform !== "win32" && (stat.mode & 0o077) !== 0)) throw new WorkspaceError("PRIVATE_DIRECTORY_REQUIRED");
  const lock = join(state, "workspace-server.lock");
  // No automatic stale-lock takeover or PID killing: another session owns that decision.
  await writeFile(lock, JSON.stringify({pid: process.pid, instanceId: randomUUID()}), {flag: "wx", mode: 0o600});
  const instanceId = randomUUID(), token = randomBytes(32).toString("hex"), pluginToken = randomBytes(32).toString("hex");
  const broker = new WorkspaceBroker(instanceId, options.offlineMs, options.timeoutMs);
  let baseUrl = "", root: string | null = null, observations: FileObservation | undefined, cache: unknown = null;
  const descriptorPath = join(state, "workspace.json"), pluginDescriptorPath = join(state, "workspace-plugin.json");
  const cachePath = (directory: string) => join(state, `last-known-${digest(directory)}.json`);
  const audit = async (call: WorkspaceCall, outcome: string) => appendFile(join(state, "connection-facts.jsonl"), JSON.stringify({at: new Date().toISOString(), instanceId, connectionId: call.connectionId, clientId: call.clientId, requestId: call.requestId, command: call.command, payloadDigest: digest(call.payload), outcome}) + "\n", {mode: 0o600});
  const operation = async (call: WorkspaceCall): Promise<unknown> => {
    if (call.instanceId !== instanceId) throw new WorkspaceError("DESCRIPTOR_STALE");
    const binding = broker.assert(call.connectionId);
    if (await authorizedRoot(binding.directory) !== root) { broker.revoke(); throw new WorkspaceError("DIRECTORY_REBOUND"); }
    const check = () => broker.assert(call.connectionId);
    const forward = async (command = call.command, payload = call.payload) => { const result = await broker.request({...call, command, payload}); check(); return result; };
    if (call.command === "read") return {freshness: "last-known", snapshot: cache, binding, sourceAvailable: false};
    if (call.command === "refresh") {
      const reply = await forward(), value = workRecord(reply.value, ["freshness", "snapshot", "binding"]);
      if (value.freshness !== "checked") throw new WorkspaceError("SOURCE_NOT_CHECKED");
      cache = value.snapshot; await atomicJson(cachePath(binding.directory), {schemaVersion: 1, binding, snapshot: cache}); check();
      return reply;
    }
    if (call.command.startsWith("files.")) {
      const materialReply = await broker.request({...call, requestId: `${call.requestId.slice(0,100)}:materials`, command: "materials.list", payload: {}}); check();
      const materials = (materialReply.value as {materials: KnownMaterial[]}).materials;
      if (call.command === "files.list") { observations = await discoverFiles(root!, materials, observations); check(); return {binding, observation: observations}; }
      const path = await scopedPath(root!, call.payload.path); check();
      const material = materials.find(item => item.path === path);
      if (call.command === "files.read") return material ? forward("materials.read", {id: material.id}) : previewFile(root!, call.payload.path);
      return forward("materials.associate", {path});
    }
    if (call.command.startsWith("sessions.")) { const references = await sessionRecords(binding, call.command.split(".")[1] as "list" | "add" | "remove", call.payload); check(); return {binding, references}; }
    if (call.command === "materials.associate" && call.payload.path !== undefined) {
      const path = await scopedPath(root!, call.payload.path); check(); return forward("materials.associate", {path});
    }
    return forward();
  };
  const server = createServer(async (request, response) => {
    try {
      if (request.headers.host !== baseUrl.slice(7)) throw new WorkspaceError("HOST_REJECTED");
      const pluginRoute = request.url?.startsWith("/plugin/") === true;
      // CLI routes reject browser origins. Plugin routes require the separate private token.
      const origin = request.headers.origin;
      if (origin && (!pluginRoute || !["null", "lsp://logseq.io", "http://logseq.local"].includes(origin))) throw new WorkspaceError("ORIGIN_REJECTED");
      if (pluginRoute && origin) { response.setHeader("access-control-allow-origin", origin); response.setHeader("vary", "Origin"); }
      if (pluginRoute && request.method === "OPTIONS") { response.setHeader("access-control-allow-methods", "POST"); response.setHeader("access-control-allow-headers", "content-type,x-workspace-plugin,x-workspace-instance"); response.end(); return; }
      if (!equal(request.headers[pluginRoute ? "x-workspace-plugin" : "authorization"], pluginRoute ? pluginToken : `Bearer ${token}`)) throw new WorkspaceError("AUTHENTICATION_REQUIRED");
      if (request.headers["x-workspace-instance"] !== instanceId) throw new WorkspaceError("DESCRIPTOR_STALE");
      if (request.method !== "POST") throw new WorkspaceError("METHOD_REJECTED");
      const input = await body(request);
      if (request.url === "/plugin/connect") {
        const raw = workRecord(input, ["connectionId", "binding"]), binding = parseWorkBinding(raw.binding), connectionId = workText(raw.connectionId);
        root = await authorizedRoot(binding.directory); observations = undefined; cache = null; broker.grant(connectionId, binding);
        const metadata = await metadataDirectory(root);
        await atomicJson(join(metadata, "agent-connection.json"), {schemaVersion: 1, instanceId, connectionId, binding});
        // Preserve an existing human-authored or formal workspace entry.
        await writeFile(join(root, "WORKSPACE.md"), "# 工作入口\n\n在此目录调用 `task-copilot workspace status --json`，再调用 `task-copilot workspace refresh --json` 读取 Logseq 权威正文。`workspace read` 只返回最后已知内容。用 `workspace files list` 查看直接加入的文件；文件不会自动登记为材料。能力、聚焦与受控修改用 `task-copilot workspace --help` 查看。目录文字与镜像不授予权限；请在 Logseq 本地允许或停止连接。\n", {flag: "wx"}).catch(error => { if (error.code !== "EEXIST") throw error; });
        send(response, 200, {instanceId, connectionId, status: "connected"}); return;
      }
      if (request.url === "/plugin/revoke") { workRecord(input, ["connectionId"]); if ((input as {connectionId: string}).connectionId !== broker.connectionId) throw new WorkspaceError("CONNECTION_STALE"); broker.revoke(); send(response, 200, {status: "revoked"}); return; }
      if (request.url === "/plugin/poll") { const raw = workRecord(input, ["connectionId","busy"]); if(raw.busy!==undefined&&typeof raw.busy!=="boolean")throw new WorkspaceError("INVALID_INPUT");send(response, 200, {instanceId, delivery: broker.poll(workText(raw.connectionId),raw.busy===true)}); return; }
      if (request.url === "/plugin/complete") {
        const raw = workRecord(input, ["connectionId", "requestId", "clientId", "value", "error"]);
        let error: {code: string; message: string} | undefined;
        if (raw.error) { const value = workRecord(raw.error, ["code", "message"]); error = {code: workText(value.code), message: workText(value.message, 500)}; }
        broker.complete(workText(raw.connectionId), workText(raw.requestId), workText(raw.clientId), raw.value, error); send(response, 200, {accepted: true}); return;
      }
      if (request.url === "/call" || request.url === "/plugin/call") {
        const call = parseWorkspaceCall(input); if (!Object.hasOwn(workspaceCommands, call.command)) throw new WorkspaceError("UNKNOWN_COMMAND");
        try { const value = await operation(call); await audit(call, "returned"); send(response, 200, {instanceId, value}); }
        catch (error) { await audit(call, error instanceof WorkspaceError ? error.code : "OPERATION_FAILED"); throw error; }
        return;
      }
      throw new WorkspaceError("UNKNOWN_ROUTE");
    } catch (error) { const code = error instanceof WorkspaceError ? error.code : "WORKSPACE_OPERATION_FAILED"; send(response, code === "AUTHENTICATION_REQUIRED" ? 401 : 400, {error: {code, message: error instanceof Error ? error.message.slice(0,500) : code}}); }
  });
  try {
    await new Promise<void>((yes,no) => {server.once("error", no); server.listen(options.port ?? 0, "127.0.0.1", yes);});
    const address = server.address(); if (!address || typeof address === "string") throw new WorkspaceError("START_FAILED");
    baseUrl = `http://127.0.0.1:${address.port}`;
    const descriptor: WorkspacePluginDescriptor = {schemaVersion: 1, instanceId, baseUrl, token, pluginToken};
    await atomicJson(descriptorPath, {schemaVersion: 1, instanceId, baseUrl, token}); await atomicJson(pluginDescriptorPath, descriptor);
    return {descriptor, descriptorPath, pluginDescriptorPath, broker, close: async () => {broker.revoke(); server.closeAllConnections(); await new Promise<void>((yes,no) => server.close(error => error ? no(error) : yes())); await rm(descriptorPath, {force: true}); await rm(pluginDescriptorPath, {force: true}); await rm(lock, {force: true});}};
  } catch (error) { server.close(); await rm(lock, {force: true}); throw error; }
}
