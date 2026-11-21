import { publishCatalog } from './work-catalog.ts';
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes, randomUUID, createHash, timingSafeEqual } from "node:crypto";
import { mkdir, lstat, realpath, writeFile, rm, appendFile } from "node:fs/promises";
import { basename, join, resolve, dirname } from "node:path";
import { WorkspaceError, sameWorkScope, parseWorkRef, parseWorkBinding, parseWorkspaceCall, workRecord, workText, workspaceCommands, type AgentWorkBinding, type WorkspaceCall, type WorkspaceDelivery, type WorkspaceReply, type WorkspacePluginDescriptor, type WorkRef } from "@task-copilot/contracts";
import { isSensitiveMaterialName, type ReadingMaterialInput } from "@task-copilot/reading-runtime";
import { authorizedRoot, materialWritePaths, scopedPath, discoverFiles, previewFile, atomicJson, metadataDirectory, sessionRecords, type FileObservation, type KnownMaterial } from "./workspace-files.ts";
import { createDshHandoff, dshReadingIntent, type DshMode } from "./dsh-handoff.ts";
import { isDshRunning, ReadingJobHub, type ReadingHubOptions, type StagedReadingJob } from "./reading-hub.ts";
import { createCollaborateHandoff, dismissWritebackProposal, isCollaborateTargetId, listCollaborateTargets, listWritebackProposals, resolveWorkPrivacy, saveCollaborateConfig, setWorkPrivacy, workKeyForScope } from "./collaborate.ts";
import { executeMcpTool, MCP_TOOLS, type ActiveConnectionMeta, type McpRuntimeContext } from "./mcp-handler.ts";
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const equal = (a: unknown, b: string): boolean => typeof a === "string" && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
type Entry = {
    delivery: WorkspaceDelivery;
    digest: string;
    sent: boolean;
    settled: boolean;
    reply?: WorkspaceReply;
    error?: WorkspaceError;
    timer: ReturnType<typeof setTimeout>;
    resolve: (value: WorkspaceReply) => void;
    reject: (error: WorkspaceError) => void;
    promise: Promise<WorkspaceReply>;
};
export class WorkspaceBroker {
    binding: AgentWorkBinding | null = null;
    connectionId: string | null = null;
    private lastSeen = 0;
    private readonly entries = new Map<string, Entry>();
    constructor(readonly instanceId: string, private readonly offlineMs = 3000, private readonly timeoutMs = 20000) { }
    online(): boolean { return this.binding !== null && Date.now() - this.lastSeen < this.offlineMs; }
    grant(connectionId: string, binding: AgentWorkBinding): void { this.revoke(); this.connectionId = connectionId; this.binding = binding; this.lastSeen = Date.now(); }
    revoke(): void {
        for (const entry of this.entries.values())
            if (!entry.settled) {
                clearTimeout(entry.timer);
                entry.settled = true;
                entry.error = new WorkspaceError("CONNECTION_REVOKED");
                entry.reject(entry.error);
            }
        this.binding = null;
        this.connectionId = null;
        this.lastSeen = 0;
    }
    assert(connectionId: string): AgentWorkBinding {
        if (!this.online())
            throw new WorkspaceError("WORKSPACE_OFFLINE");
        if (connectionId !== this.connectionId)
            throw new WorkspaceError("CONNECTION_STALE");
        return this.binding!;
    }
    poll(connectionId: string, busy = false): WorkspaceDelivery | null {
        if (connectionId !== this.connectionId || !this.binding)
            throw new WorkspaceError("CONNECTION_STALE");
        // Expired grants cannot revive old write authority through a heartbeat.
        if (!this.online()) throw new WorkspaceError("WORKSPACE_OFFLINE");
        this.lastSeen = Date.now();
        if (busy)
            return null;
        const entry = [...this.entries.values()].find(item => !item.sent && !item.settled);
        if (!entry)
            return null;
        entry.sent = true;
        return structuredClone(entry.delivery);
    }
    complete(connectionId: string, requestId: string, clientId: string, value: unknown, error?: {
        code: string;
        message: string;
    }): void {
        if (connectionId !== this.connectionId)
            throw new WorkspaceError("CONNECTION_STALE");
        const key = JSON.stringify([connectionId, clientId, requestId]), entry = this.entries.get(key);
        if (!entry || !entry.sent)
            throw new WorkspaceError("REQUEST_NOT_FOUND");
        if (entry.reply) {
            if (digest(entry.reply.value) !== digest(value) || error)
                throw new WorkspaceError("RESULT_ALREADY_COMPLETED");
            return;
        }
        if (entry.error && entry.error.code !== "TRANSPORT_OUTCOME_UNKNOWN") {
            if (error?.code === entry.error.code && error.message === entry.error.message)
                return;
            throw new WorkspaceError("RESULT_ALREADY_COMPLETED");
        }
        clearTimeout(entry.timer);
        entry.settled = true;
        if (error) {
            entry.error = new WorkspaceError(error.code, error.message);
            entry.reject(entry.error);
            return;
        }
        delete entry.error;
        entry.reply = { instanceId: this.instanceId, connectionId, requestId, value, provenance: { clientId, command: entry.delivery.command, payloadDigest: entry.digest, origin: "verified-local-connection" } };
        entry.resolve(entry.reply);
    }
    request(call: WorkspaceCall): Promise<WorkspaceReply> {
        if (call.instanceId !== this.instanceId)
            throw new WorkspaceError("DESCRIPTOR_STALE");
        const binding = this.assert(call.connectionId), key = JSON.stringify([call.connectionId, call.clientId, call.requestId]), fingerprint = digest([call.command, call.payload, call.readTarget]), previous = this.entries.get(key);
        if (previous) {
            if (previous.digest !== fingerprint)
                throw new WorkspaceError("IDEMPOTENCY_KEY_REUSED");
            if (previous.reply)
                return Promise.resolve(previous.reply);
            if (previous.error)
                throw previous.error;
            return previous.promise;
        }
        if (this.entries.size >= 512) {
            const oldest = [...this.entries].find(([, item]) => item.settled);
            if (!oldest)
                throw new WorkspaceError("REQUEST_LIMIT");
            this.entries.delete(oldest[0]);
        }
        let accept!: Entry["resolve"], reject!: Entry["reject"];
        const promise = new Promise<WorkspaceReply>((yes, no) => { accept = yes; reject = no; });
        const entry: Entry = { delivery: { ...call, scope: binding.scope, binding: structuredClone(binding) }, digest: fingerprint, sent: false, settled: false, resolve: accept, reject, promise, timer: setTimeout(() => {
                entry.settled = true;
                entry.error = new WorkspaceError(entry.sent ? "TRANSPORT_OUTCOME_UNKNOWN" : "WORKSPACE_TIMEOUT", entry.sent ? "Delivered request has an unknown result; query the original content request before retrying." : "Plugin did not receive this request before timeout.");
                reject(entry.error);
            }, this.timeoutMs) };
        this.entries.set(key, entry);
        return promise;
    }
}
async function body(request: IncomingMessage): Promise<unknown> {
    let length = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
        length += chunk.length;
        if (length > 20971520)
            throw new WorkspaceError("INPUT_TOO_LARGE");
        chunks.push(Buffer.from(chunk));
    }
    try {
        return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    }
    catch {
        throw new WorkspaceError("INVALID_JSON");
    }
}
function send(response: ServerResponse, status: number, value: unknown): void { response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" }); response.end(JSON.stringify(value)); }
export async function startWorkspaceServer(options: {
    stateDirectory: string;
    port?: number;
    offlineMs?: number;
    timeoutMs?: number;
    reading?: Omit<ReadingHubOptions, "stateDirectory">;
}) {
    const state = resolve(options.stateDirectory);
    await mkdir(state, { recursive: true, mode: 0o700 });
    const stat = await lstat(state);
    if (stat.isSymbolicLink() || await realpath(state) !== state || (process.platform !== "win32" && ((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.())))
        throw new WorkspaceError("PRIVATE_DIRECTORY_REQUIRED");
    const lock = join(state, "workspace-server.lock");
    // No automatic stale-lock takeover or PID killing: another session owns that decision.
    await writeFile(lock, JSON.stringify({ pid: process.pid, instanceId: randomUUID() }), { flag: "wx", mode: 0o600 });
    const instanceId = randomUUID(), token = randomBytes(32).toString("hex"), pluginToken = randomBytes(32).toString("hex");
    const broker = new WorkspaceBroker(instanceId, options.offlineMs, options.timeoutMs);
    const readingHub = new ReadingJobHub({ stateDirectory: state, ...options.reading });
    let baseUrl = "", root: string | null = null, observations: FileObservation | undefined, cache: unknown = null;
    let activeMeta: { workKey?: string; title?: string; workRef?: WorkRef } = {};
    let operationQueue: Promise<unknown> = Promise.resolve(), queued = 0;
    const receipts = new Map<string, {
        digest: string;
        promise: Promise<unknown>;
        settled: boolean;
    }>();
    const descriptorPath = join(state, "workspace.json"), pluginDescriptorPath = join(state, "workspace-plugin.json");
    const cachePath = (directory: string) => join(state, `last-known-${digest(directory)}.json`);
    const auditFact = async (entry: { connectionId: string; clientId: string; requestId: string; command: string; payload: unknown; outcome: string }) =>
        appendFile(
            join(state, "connection-facts.jsonl"),
            JSON.stringify({
                at: new Date().toISOString(),
                instanceId,
                connectionId: entry.connectionId,
                clientId: entry.clientId,
                requestId: entry.requestId,
                command: entry.command,
                payloadDigest: digest(entry.payload),
                outcome: entry.outcome,
            }) + "\n",
            { mode: 0o600 }
        );
    const audit = async (call: WorkspaceCall, outcome: string) =>
        auditFact({ connectionId: call.connectionId, clientId: call.clientId, requestId: call.requestId, command: call.command, payload: call.payload, outcome });
    const checkDsh = options.reading?.dshAvailable ?? (() => isDshRunning(state));
    let connectionQueue: Promise<unknown> = Promise.resolve();
    const operation = async (call: WorkspaceCall): Promise<unknown> => {
        if (call.instanceId !== instanceId)
            throw new WorkspaceError("DESCRIPTOR_STALE");
        const binding = broker.assert(call.connectionId);
        if (call.readTarget && !sameWorkScope(call.readTarget.scope, binding.scope)) throw new WorkspaceError("SCOPE_MISMATCH");
        if (await authorizedRoot(binding.directory) !== root) {
            broker.revoke();
            throw new WorkspaceError("DIRECTORY_REBOUND");
        }
        const check = () => broker.assert(call.connectionId);
        const forward = async (command = call.command, payload = call.payload) => { const result = await broker.request({ ...call, command, payload }); check(); return result; };
        if(["materials.capture","materials.associate","materials.resolve","materials.save","files.associate"].includes(call.command)){
            const status=await broker.request({...call,requestId:`file-permission:${digest([call.command,call.requestId])}`,command:"status",payload:{}});check();
            if((status.value as {capabilities?:{fileWrite?:boolean}}).capabilities?.fileWrite!==true)throw new WorkspaceError("FILE_WRITE_AUTHORIZATION_REQUIRED");
        }
        if(call.command==="collaboration.read"||call.command==="collaboration.refresh"){
            const reply=await forward(),packet=reply.value as {scene?:{materials:KnownMaterial[]};materials?:KnownMaterial[]};
            const materials=packet.scene?.materials??packet.materials;
            if(!Array.isArray(materials)||materials.length>2000||materials.some(m=>typeof m.id!=="string"||typeof m.path!=="string"))throw new WorkspaceError("COLLABORATION_MATERIALS_INVALID");
            observations=await discoverFiles(root!,materials,observations);check();
            const references=await sessionRecords(binding,"list",{});check();
            return {...reply,value:{...packet,files:{binding,observation:observations},sessions:{binding,references}}};
        }
        if (call.command === "read") {
            if (call.readTarget) await forward("status", {});
            return { freshness: "last-known", snapshot: cache, binding, sourceAvailable: false };
        }
        if (call.command === "refresh") {
            const reply = await forward(), value = workRecord(reply.value, ["freshness", "snapshot", "binding", "workspace"]);
            if (value.freshness !== "checked")
                throw new WorkspaceError("SOURCE_NOT_CHECKED");
            cache = value.snapshot;
            await atomicJson(cachePath(binding.directory), { schemaVersion: 1, binding, snapshot: cache, workspace: value.workspace ?? null });
            check();
            return reply;
        }
        if (call.command.startsWith("files.")) {
            const materialReply = await broker.request({ ...call, requestId: `materials:${digest([call.command, call.requestId])}`, command: "materials.list", payload: {} });
            check();
            const materials = (materialReply.value as {
                materials: KnownMaterial[];
            }).materials;
            if (call.command === "files.list") {
                observations = await discoverFiles(root!, materials, observations);
                check();
                return { binding, observation: observations, materials };
            }
            const path = await scopedPath(root!, call.payload.path);
            check();
            const material = materials.find(item => item.path === path);
            if (call.command === "files.read")
                return material ? forward("materials.read", { id: material.id }) : previewFile(root!, call.payload.path);
            await materialWritePaths(root!, [join(root!, ".longdoc/history")]);
            check();
            return forward("materials.associate", { path });
        }
        if (call.command.startsWith("sessions.")) {
            await forward("status", {});
            check();
            const references = await sessionRecords(binding, call.command.split(".")[1] as "list" | "add" | "remove", call.payload);
            check();
            return { binding, references };
        }
        if (call.command === "materials.capture" || call.command === "files.associate" || call.command === "materials.associate" || call.command === "materials.resolve") {
            await materialWritePaths(root!, [join(root!, ".longdoc/history")]);
            check();
            if (call.command === "materials.capture" && binding.organization === "project") {
                await materialWritePaths(root!, ["成果", "outputs", "output", "工作记录", "notes", "work", "材料", "materials", "references"].map(name => join(root!, name, ".longdoc/history")));
                check();
            }
        }
        if (call.command === "materials.save") {
            const reply = await broker.request({ ...call, requestId: `materials:${digest([call.command, call.requestId])}`, command: "materials.list", payload: {} });
            check();
            const material = (reply.value as {
                materials: Array<KnownMaterial & {
                    recordRoot: string;
                    capabilities: {
                        edit: {
                            agent: boolean;
                        };
                    };
                }>;
            }).materials.find(item => item.id === call.payload.id);
            if (!material || !material.capabilities.edit.agent)
                throw new WorkspaceError("MATERIAL_AGENT_WRITE_FORBIDDEN");
            const recordRoot = await authorizedRoot(material.recordRoot), bodyRoot = await authorizedRoot(dirname(material.path));
            await materialWritePaths(recordRoot, [join(recordRoot, ".longdoc/history")]);
            await materialWritePaths(bodyRoot, [material.path]);
            check();
        }
        if (["materials.associate", "materials.resolve"].includes(call.command) && call.payload.path !== undefined) {
            const path = await scopedPath(root!, call.payload.path);
            check();
            return forward(call.command, { path });
        }
        return forward();
    };
    const enqueueOperation = async (call: WorkspaceCall): Promise<unknown> => {
        if (queued >= 128)
            throw new WorkspaceError("REQUEST_LIMIT");
        queued++;
        const running = operationQueue.then(() => operation(call));
        operationQueue = running.catch(() => undefined);
        try {
            return await running;
        } finally {
            queued--;
        }
    };
    const getActiveConnection = (): ActiveConnectionMeta | null => {
        if (!broker.online() || !broker.binding || !broker.connectionId) return null;
        return {
            connectionId: broker.connectionId,
            binding: structuredClone(broker.binding),
            workKey: activeMeta.workKey ?? workKeyForScope(broker.binding.scope),
            ...(activeMeta.title ? { title: activeMeta.title } : {}),
            ...(activeMeta.workRef ? { workRef: structuredClone(activeMeta.workRef) } : {}),
        };
    };
    const mcpContext: McpRuntimeContext = {
        stateDirectory: state,
        instanceId,
        readingHub,
        getActiveConnection,
        dispatch: enqueueOperation,
        audit: auditFact,
    };
    let catalogQueue = Promise.resolve();
    const server = createServer(async (request, response) => {
        try {
            if (request.headers.host !== baseUrl.slice(7))
                throw new WorkspaceError("HOST_REJECTED");
            const pluginRoute = request.url?.startsWith("/plugin/") === true;
            // CLI routes reject browser origins. Plugin routes require the separate private token.
            const origin = request.headers.origin;
            if (origin && (!pluginRoute || !["null", "lsp://logseq.io", "http://logseq.local"].includes(origin)))
                throw new WorkspaceError("ORIGIN_REJECTED");
            if (pluginRoute && origin) {
                response.setHeader("access-control-allow-origin", origin);
                response.setHeader("vary", "Origin");
            }
            if (pluginRoute && request.method === "OPTIONS") {
                response.setHeader("access-control-allow-methods", "POST");
                response.setHeader("access-control-allow-headers", "content-type,x-workspace-plugin,x-workspace-instance");
                response.end();
                return;
            }
            if (!equal(request.headers[pluginRoute ? "x-workspace-plugin" : "authorization"], pluginRoute ? pluginToken : `Bearer ${token}`))
                throw new WorkspaceError("AUTHENTICATION_REQUIRED");
            if (request.headers["x-workspace-instance"] !== instanceId)
                throw new WorkspaceError("DESCRIPTOR_STALE");
            if (request.method !== "POST")
                throw new WorkspaceError("METHOD_REJECTED");
            const input = await body(request);
            if (request.url === "/plugin/catalog") {
                const pending = catalogQueue.then(() => publishCatalog(state, input));
                catalogQueue = pending.catch(() => {});
                await pending;
                send(response, 200, {published: true}); return;
            }
            if (request.url === "/plugin/reading-model") {
                const cancellation=new AbortController();
                response.once("close",()=>{if(!response.writableEnded)cancellation.abort();});
                const value=await readingHub.runSync(input,cancellation.signal);
                if(!response.destroyed)send(response,200,{value});return;
            }
            if (request.url === "/plugin/note-tidy") {
                const cancellation=new AbortController();
                response.once("close",()=>{if(!response.writableEnded)cancellation.abort();});
                const value=await readingHub.runNoteTidy(input,cancellation.signal);
                if(!response.destroyed)send(response,200,{value});return;
            }
            if (request.url === "/plugin/reading-providers") {
                const value = await readingHub.providers();
                send(response, 200, { value }); return;
            }
            if (request.url === "/plugin/reading-providers/route") {
                const value = await readingHub.setRoute(input);
                send(response, 200, { value }); return;
            }
            if (request.url === "/plugin/reading-jobs/start") {
                const value = await readingHub.startJob(input);
                send(response, 200, { value }); return;
            }
            if (request.url === "/plugin/reading-jobs/status") {
                const value = await readingHub.jobStatus(input);
                send(response, 200, { value }); return;
            }
            if (request.url === "/plugin/reading-jobs/ack") {
                const value = await readingHub.ackJob(input);
                send(response, 200, { value }); return;
            }
            if (request.url === "/plugin/reading-jobs/cancel") {
                const value = await readingHub.cancelJob(input);
                send(response, 200, { value }); return;
            }
            if (request.url === "/plugin/dsh") {
                const raw = workRecord(input, ["connectionId", "mode", "title", "workRef", "newTab", "intent"]), connectionId = workText(raw.connectionId);
                const binding = broker.assert(connectionId);
                if (!["continue", "new"].includes(String(raw.mode))) throw new WorkspaceError("INVALID_INPUT");
                const result = await createDshHandoff(state, {mode: raw.mode as DshMode, ...(raw.workRef ? {workRef: parseWorkRef(raw.workRef)} : {}), title: workText(raw.title, 800),
                    entry: {instanceId, connectionId, binding, directory: binding.directory},...(raw.intent?{intent:dshReadingIntent(raw.intent)}:{})}, raw.newTab === true);
                broker.assert(connectionId);
                send(response, 200, result); return;
            }
            if (request.url === "/plugin/collaborate/targets") {
                const raw = workRecord(input, ["defaultTarget"]);
                if (raw.defaultTarget !== undefined) {
                    if (!isCollaborateTargetId(raw.defaultTarget)) throw new WorkspaceError("COLLABORATE_TARGET_INVALID", "不支持的协作目标。");
                    await saveCollaborateConfig(state, { schemaVersion: 1, defaultTarget: raw.defaultTarget });
                }
                const value = await listCollaborateTargets(state, await checkDsh());
                send(response, 200, { value }); return;
            }
            if (request.url === "/plugin/collaborate") {
                const raw = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
                const connectionId = workText(raw.connectionId);
                const binding = broker.assert(connectionId);
                const { result, record } = await createCollaborateHandoff(state, { instanceId, connectionId, binding, input });
                broker.assert(connectionId);
                activeMeta = {
                    ...activeMeta,
                    workKey: record.workKey,
                    title: record.title,
                    ...(record.workRef ? { workRef: record.workRef } : {}),
                };
                await auditFact({
                    connectionId,
                    clientId: "logseq-plugin",
                    requestId: record.handoffId,
                    command: "collaborate.handoff",
                    payload: { target: result.target, mode: record.mode, workKey: record.workKey, privacyMode: record.privacyMode },
                    outcome: "returned",
                });
                send(response, 200, { value: result }); return;
            }
            if (request.url === "/plugin/work-privacy") {
                const raw = workRecord(input, ["workKey", "privacyMode", "scope"]);
                const workKey = workText(raw.workKey, 512);
                if (raw.privacyMode !== "local-only" && raw.privacyMode !== "default") throw new WorkspaceError("INVALID_INPUT");
                const keys = [workKey];
                if (raw.scope !== undefined) {
                    const parsedScope = parseWorkBinding({ scope: raw.scope, directory: "/", organization: "flat", provider: "workspace", workspaceId: null }).scope;
                    keys.push(workKeyForScope(parsedScope));
                }
                const privacyMode = await setWorkPrivacy(state, keys, raw.privacyMode);
                send(response, 200, { value: { workKey, privacyMode } }); return;
            }
            if (request.url === "/plugin/writeback-proposals") {
                const raw = workRecord(input, ["action", "workKey", "proposalId"]);
                if (raw.action === "dismiss" || raw.action === "consume") {
                    const dismissed = await dismissWritebackProposal(state, workText(raw.proposalId, 128));
                    send(response, 200, { value: { dismissed, action: raw.action } }); return;
                }
                const workKey = raw.workKey !== undefined ? workText(raw.workKey, 512) : undefined;
                const proposals = await listWritebackProposals(state, workKey);
                send(response, 200, { value: { proposals } }); return;
            }
            if (request.url === "/plugin/connect") {
                const raw = workRecord(input, ["connectionId", "binding", "recoverFrom", "workKey", "privacyMode", "title", "workRef"]), binding = parseWorkBinding(raw.binding), connectionId = workText(raw.connectionId);
                const recoverFrom = raw.recoverFrom === undefined ? undefined : workText(raw.recoverFrom);
                const workKey = raw.workKey === undefined ? workKeyForScope(binding.scope) : workText(raw.workKey, 512);
                const title = raw.title === undefined ? undefined : workText(raw.title, 800);
                const workRef = raw.workRef === undefined ? undefined : parseWorkRef(raw.workRef);
                const privacyMode = raw.privacyMode === undefined ? undefined : (raw.privacyMode === "local-only" || raw.privacyMode === "default" ? raw.privacyMode : (() => { throw new WorkspaceError("INVALID_INPUT"); })());
                const pending = connectionQueue.then(async () => {
                    if (recoverFrom && broker.connectionId && broker.connectionId !== recoverFrom)
                        throw new WorkspaceError("RECOVERY_SUPERSEDED");
                    const directory = await authorizedRoot(binding.directory);
                    const metadata = await metadataDirectory(directory);
                    await atomicJson(join(metadata, "agent-connection.json"), { schemaVersion: 1, instanceId, connectionId, binding });
                    if (privacyMode) {
                        await setWorkPrivacy(state, [workKey, workKeyForScope(binding.scope)], privacyMode);
                    }
                    // Only Registry owns the reading entry; the bridge publishes a derived locator.
                    root = directory;
                    observations = undefined;
                    cache = null;
                    activeMeta = { workKey, ...(title ? { title } : {}), ...(workRef ? { workRef } : {}) };
                    broker.grant(connectionId, binding);
                });
                connectionQueue = pending.catch(() => {});
                await pending;
                send(response, 200, { instanceId, connectionId, status: "connected" });
                return;
            }
            if (request.url === "/plugin/revoke") {
                workRecord(input, ["connectionId"]);
                if ((input as {
                    connectionId: string;
                }).connectionId !== broker.connectionId)
                    throw new WorkspaceError("CONNECTION_STALE");
                activeMeta = {};
                broker.revoke();
                send(response, 200, { status: "revoked" });
                return;
            }
            if (request.url === "/plugin/poll") {
                const raw = workRecord(input, ["connectionId", "busy"]);
                if (raw.busy !== undefined && typeof raw.busy !== "boolean")
                    throw new WorkspaceError("INVALID_INPUT");
                send(response, 200, { instanceId, delivery: broker.poll(workText(raw.connectionId), raw.busy === true) });
                return;
            }
            if (request.url === "/plugin/complete") {
                const raw = workRecord(input, ["connectionId", "requestId", "clientId", "value", "error"]);
                let error: {
                    code: string;
                    message: string;
                } | undefined;
                if (raw.error) {
                    const value = workRecord(raw.error, ["code", "message"]);
                    error = { code: workText(value.code), message: workText(value.message, 500) };
                }
                broker.complete(workText(raw.connectionId), workText(raw.requestId), workText(raw.clientId), raw.value, error);
                send(response, 200, { accepted: true });
                return;
            }
            if (request.url === "/mcp/tools") {
                workRecord(input, []);
                send(response, 200, { instanceId, value: { tools: MCP_TOOLS } });
                return;
            }
            if (request.url === "/mcp/call") {
                const raw = workRecord(input, ["name", "arguments", "clientId", "requestId"]);
                const value = await executeMcpTool(mcpContext, {
                    name: workText(raw.name, 128),
                    arguments: raw.arguments,
                    ...(raw.clientId !== undefined ? { clientId: workText(raw.clientId, 128) } : {}),
                    ...(raw.requestId !== undefined ? { requestId: workText(raw.requestId, 128) } : {}),
                });
                send(response, 200, { instanceId, value });
                return;
            }
            if (request.url?.startsWith("/dsh/") === true) {
                const unwrapReplyValue = (value: unknown): unknown =>
                    value && typeof value === "object" && "provenance" in value && "value" in value
                        ? (value as { value: unknown }).value
                        : value;
                const summarizeJob = (job: StagedReadingJob | null) =>
                    job
                        ? {
                              jobId: job.jobId,
                              workKey: job.workKey,
                              status: job.status,
                              origin: job.origin ?? "local-model",
                              requireReview: job.requireReview === true,
                              summary: job.summary ?? null,
                              sourceSetVersion: job.sourceSetVersion ?? null,
                              structureVersion: job.structureVersion ?? null,
                              createdAt: job.createdAt,
                              completedAt: job.completedAt ?? null,
                              providerId: job.result?.agentRun?.providerId ?? null,
                              error: job.error ?? null,
                          }
                        : null;
                const assertDshActive = (keys: string[]) => {
                    const raw = workRecord(input, keys);
                    const connectionId = workText(raw.connectionId);
                    const parsedScope = parseWorkBinding({
                        scope: raw.scope,
                        directory: "/",
                        organization: "flat",
                        provider: "workspace",
                        workspaceId: null,
                    }).scope;
                    const active = getActiveConnection();
                    if (!active) throw new WorkspaceError("WORKSPACE_OFFLINE");
                    if (active.connectionId !== connectionId) throw new WorkspaceError("CONNECTION_STALE");
                    if (!sameWorkScope(active.binding.scope, parsedScope)) throw new WorkspaceError("SCOPE_MISMATCH");
                    return { raw, active };
                };

                if (request.url === "/dsh/hub-status") {
                    const { active } = assertDshActive(["connectionId", "scope"]);
                    const [privacyMode, jobState, proposals, providers] = await Promise.all([
                        resolveWorkPrivacy(state, active.binding, active.workKey),
                        readingHub.jobStatus({ workKey: active.workKey }),
                        listWritebackProposals(state, active.workKey),
                        readingHub.providers(),
                    ]);
                    const localProfile = providers.routes.local
                        ? providers.profiles.find((p) => p.id === providers.routes.local) ?? null
                        : null;
                    const primaryId =
                        privacyMode === "local-only"
                            ? providers.routes.local
                            : providers.routes.deep ?? providers.routes.fast ?? providers.routes.local;
                    const primaryProfile = primaryId ? providers.profiles.find((p) => p.id === primaryId) ?? null : null;
                    send(response, 200, {
                        instanceId,
                        value: {
                            workKey: active.workKey,
                            privacyMode,
                            readingJob: summarizeJob(jobState.job),
                            proposals: proposals.map((item) => ({
                                proposalId: item.proposalId,
                                summary: item.summary,
                                clientId: item.clientId,
                                createdAt: item.createdAt,
                                sourceSetVersion: item.sourceSetVersion,
                                structureVersion: item.structureVersion,
                                operationCount: item.operations.length,
                            })),
                            providers: {
                                ready: Boolean(primaryProfile?.configured),
                                localReady: Boolean(localProfile?.configured),
                                activeLabel: primaryProfile?.label ?? null,
                                activeLocality: primaryProfile?.locality ?? null,
                            },
                        },
                    });
                    return;
                }
                if (request.url === "/dsh/writeback-dismiss") {
                    const { raw, active } = assertDshActive(["connectionId", "scope", "proposalId", "clientId"]);
                    const proposalId = workText(raw.proposalId, 128);
                    const clientId = raw.clientId !== undefined ? workText(raw.clientId, 128) : "dsh";
                    const scopedProposals = await listWritebackProposals(state, active.workKey);
                    const owned = scopedProposals.some((item) => item.proposalId === proposalId);
                    const dismissed = owned ? await dismissWritebackProposal(state, proposalId) : false;
                    await auditFact({
                        connectionId: active.connectionId,
                        clientId,
                        requestId: randomUUID(),
                        command: "dsh.writeback.dismiss",
                        payload: { proposalId, workKey: active.workKey, dismissed },
                        outcome: dismissed ? "returned" : "NOT_FOUND",
                    });
                    send(response, 200, { instanceId, value: { dismissed, proposalId } });
                    return;
                }
                if (request.url === "/dsh/reading-start") {
                    const { raw, active } = assertDshActive(["connectionId", "scope", "question", "profileId", "clientId"]);
                    const question =
                        raw.question !== undefined ? workText(raw.question, 600) : "整理当前工作以便快速恢复上下文";
                    const profileId = raw.profileId !== undefined ? workText(raw.profileId, 64) : undefined;
                    const clientId = raw.clientId !== undefined ? workText(raw.clientId, 128) : "dsh";
                    const privacyMode = await resolveWorkPrivacy(state, active.binding, active.workKey);
                    const dispatch = (command: WorkspaceCall["command"], payload: Record<string, unknown>) =>
                        enqueueOperation({
                            schemaVersion: 1,
                            instanceId,
                            connectionId: active.connectionId,
                            clientId,
                            requestId: randomUUID(),
                            command,
                            payload,
                        }).then(unwrapReplyValue);
                    const refreshed = (await dispatch("refresh", {})) as {
                        snapshot: {
                            scope: AgentWorkBinding["scope"];
                            structureVersion: string;
                            sourceSetVersion: string;
                            blocks: Array<{
                                sourceId: string;
                                target: { blockUuid: string };
                                parentUuid?: string | null;
                                depth?: number;
                                availability: string;
                                content?: string | null;
                            }>;
                        };
                        workspace?: {
                            observed?: {
                                sources?: Array<{
                                    association?: { id?: string; pageName?: string; blockUuid?: string; pageUuid?: string };
                                    availability?: string;
                                    snapshot?: {
                                        sourceSetVersion?: string;
                                        blocks?: Array<{ content?: string | null }>;
                                    };
                                }>;
                            };
                        };
                    };
                    const materials: ReadingMaterialInput[] = [];
                    const seenIds = new Set<string>();
                    let rawMaterials: { materials?: Array<{ id: string; path?: string; filename?: string; title?: string; version?: string | null; availability?: string; content?: string | null }> } = { materials: [] };
                    try {
                        rawMaterials = (await dispatch("materials.list", {})) as typeof rawMaterials;
                    } catch {
                        rawMaterials = { materials: [] };
                    }
                    let hydratedCount = 0;
                    for (const item of rawMaterials.materials ?? []) {
                        if (!item || typeof item.id !== "string" || seenIds.has(item.id)) continue;
                        seenIds.add(item.id);
                        const rawPath = typeof item.path === "string" ? item.path : undefined;
                        const filename =
                            typeof item.filename === "string" && item.filename.trim()
                                ? item.filename.trim()
                                : rawPath
                                  ? basename(rawPath)
                                  : item.title || item.id;
                        const sensitive = isSensitiveMaterialName(filename) || (rawPath !== undefined && isSensitiveMaterialName(rawPath));
                        let text: string | undefined = typeof item.content === "string" ? item.content : undefined;
                        if (!sensitive && !text && item.availability === "available" && hydratedCount < 8) {
                            hydratedCount++;
                            try {
                                const readRes = (await dispatch("materials.read", { id: item.id })) as { content?: string | null };
                                if (typeof readRes?.content === "string") text = readRes.content;
                            } catch {
                                // Keep metadata only if material cannot be read.
                            }
                        }
                        materials.push({
                            id: item.id,
                            filename,
                            ...(rawPath ? { path: rawPath } : {}),
                            ...(item.version ? { version: item.version } : {}),
                            availability: item.availability ?? "available",
                            ...(text && !sensitive ? { excerpt: text.slice(0, 4000), text: text.slice(0, 64000), truncated: text.length > 64000 } : {}),
                        });
                    }
                    for (const assoc of refreshed.workspace?.observed?.sources ?? []) {
                        const id = assoc.association?.id
                            ? `note:${assoc.association.id}`
                            : assoc.association?.pageUuid
                              ? `note:${assoc.association.pageUuid}`
                              : assoc.association?.blockUuid
                                ? `note:${assoc.association.blockUuid}`
                                : null;
                        if (!id || seenIds.has(id)) continue;
                        seenIds.add(id);
                        const noteText = (assoc.snapshot?.blocks ?? [])
                            .map((b) => (typeof b.content === "string" ? b.content : ""))
                            .filter(Boolean)
                            .join("\n");
                        materials.push({
                            id,
                            filename: assoc.association?.pageName ?? "关联笔记",
                            note: true,
                            availability: assoc.availability ?? "available",
                            ...(assoc.snapshot?.sourceSetVersion ? { version: assoc.snapshot.sourceSetVersion } : {}),
                            ...(noteText ? { excerpt: noteText.slice(0, 4000), text: noteText.slice(0, 64000), truncated: noteText.length > 64000 } : {}),
                        });
                    }
                    const started = await readingHub.startJob({
                        workKey: active.workKey,
                        trigger: "manual",
                        privacyMode,
                        requireReview: true,
                        origin: "external-mcp",
                        summary: "在 DSH 发起阅读简报整理",
                        ...(profileId ? { profileId } : {}),
                        input: {
                            mode: "organize",
                            question,
                            source: {
                                scope: refreshed.snapshot.scope,
                                structureVersion: refreshed.snapshot.structureVersion,
                                sourceSetVersion: refreshed.snapshot.sourceSetVersion,
                                blocks: refreshed.snapshot.blocks.map((block) => ({
                                    sourceId: block.sourceId,
                                    target: block.target,
                                    ...(block.parentUuid !== undefined ? { parentUuid: block.parentUuid } : {}),
                                    ...(block.depth !== undefined ? { depth: block.depth } : {}),
                                    availability: block.availability,
                                    ...(typeof block.content === "string" ? { content: block.content } : {}),
                                })),
                            },
                            materials,
                        },
                    });
                    await auditFact({
                        connectionId: active.connectionId,
                        clientId,
                        requestId: started.job.jobId,
                        command: "dsh.reading.start",
                        payload: { workKey: active.workKey, privacyMode, deduplicated: started.deduplicated },
                        outcome: "returned",
                    });
                    send(response, 200, {
                        instanceId,
                        value: { job: summarizeJob(started.job), deduplicated: started.deduplicated },
                    });
                    return;
                }
                if (request.url === "/dsh/mcp-call") {
                    const { raw, active } = assertDshActive([
                        "connectionId",
                        "scope",
                        "name",
                        "arguments",
                        "clientId",
                        "requestId",
                    ]);
                    const name = workText(raw.name, 128);
                    if (name !== "workbench_propose_writeback" && name !== "workbench_submit_reading_candidate") {
                        throw new WorkspaceError("UNKNOWN_MCP_TOOL", `DSH 受控回流接口不允许调用：${name}`);
                    }
                    const rawArgs =
                        raw.arguments !== undefined && raw.arguments !== null
                            ? typeof raw.arguments === "object" && !Array.isArray(raw.arguments)
                                ? (raw.arguments as Record<string, unknown>)
                                : (() => {
                                      throw new WorkspaceError("INVALID_INPUT", "Tool arguments must be a JSON object.");
                                  })()
                            : {};
                    if (rawArgs.workKey !== undefined) {
                        const requestedKey = workText(rawArgs.workKey, 512);
                        if (requestedKey !== active.workKey && requestedKey !== workKeyForScope(active.binding.scope)) {
                            throw new WorkspaceError("SCOPE_MISMATCH");
                        }
                    }
                    if (rawArgs.rootUuid !== undefined && workText(rawArgs.rootUuid, 128) !== active.binding.scope.rootUuid) {
                        throw new WorkspaceError("SCOPE_MISMATCH");
                    }
                    const clientId = raw.clientId !== undefined ? workText(raw.clientId, 128) : "dsh";
                    const value = await executeMcpTool(mcpContext, {
                        name,
                        arguments: {
                            ...rawArgs,
                            workKey: active.workKey,
                            rootUuid: active.binding.scope.rootUuid,
                        },
                        clientId,
                        ...(raw.requestId !== undefined ? { requestId: workText(raw.requestId, 128) } : {}),
                    });
                    send(response, 200, { instanceId, value });
                    return;
                }
                throw new WorkspaceError("UNKNOWN_ROUTE");
            }
            if (request.url === "/call" || request.url === "/plugin/call") {
                const call = parseWorkspaceCall(input);
                if (!Object.hasOwn(workspaceCommands, call.command))
                    throw new WorkspaceError("UNKNOWN_COMMAND");
                try {
                    if (call.instanceId !== instanceId)
                        throw new WorkspaceError("DESCRIPTOR_STALE");
                    broker.assert(call.connectionId);
                    const key = JSON.stringify([call.connectionId, call.clientId, call.requestId]), fingerprint = digest([call.command, call.payload, call.readTarget]);
                    let receipt = receipts.get(key);
                    if (receipt && receipt.digest !== fingerprint)
                        throw new WorkspaceError("IDEMPOTENCY_KEY_REUSED");
                    if (!receipt) {
                        if (queued >= 128)
                            throw new WorkspaceError("REQUEST_LIMIT");
                        if (receipts.size >= 512) {
                            const oldest = [...receipts].find(([, item]) => item.settled);
                            if (!oldest)
                                throw new WorkspaceError("REQUEST_LIMIT");
                            receipts.delete(oldest[0]);
                        }
                        queued++;
                        const running = operationQueue.then(() => operation(call));
                        operationQueue = running.catch(() => undefined);
                        receipt = { digest: fingerprint, promise: running, settled: false };
                        receipts.set(key, receipt);
                        const current = receipt;
                        void running.then(() => { queued--; current.settled = true; }, () => { queued--; current.settled = true; });
                    }
                    const value = await receipt.promise;
                    await audit(call, "returned");
                    send(response, 200, { instanceId, value });
                }
                catch (error) {
                    await audit(call, error instanceof WorkspaceError ? error.code : "OPERATION_FAILED");
                    throw error;
                }
                return;
            }
            throw new WorkspaceError("UNKNOWN_ROUTE");
        }
        catch (error) {
            const code = error instanceof WorkspaceError ? error.code : "WORKSPACE_OPERATION_FAILED";
            send(response, code === "AUTHENTICATION_REQUIRED" ? 401 : 400, { error: { code, message: error instanceof Error ? error.message.slice(0, 500) : code } });
        }
    });
    try {
        await new Promise<void>((yes, no) => { server.once("error", no); server.listen(options.port ?? 0, "127.0.0.1", yes); });
        const address = server.address();
        if (!address || typeof address === "string")
            throw new WorkspaceError("START_FAILED");
        baseUrl = `http://127.0.0.1:${address.port}`;
        const descriptor: WorkspacePluginDescriptor = { schemaVersion: 1, instanceId, baseUrl, token, pluginToken };
        await atomicJson(descriptorPath, { schemaVersion: 1, instanceId, baseUrl, token });
        await atomicJson(pluginDescriptorPath, descriptor);
        return { descriptor, descriptorPath, pluginDescriptorPath, broker, readingHub, close: async () => { readingHub.dispose(); broker.revoke(); server.closeAllConnections(); await new Promise<void>((yes, no) => server.close(error => error ? no(error) : yes())); await rm(descriptorPath, { force: true }); await rm(pluginDescriptorPath, { force: true }); await rm(lock, { force: true }); } };
    }
    catch (error) {
        server.close();
        await rm(lock, { force: true });
        throw error;
    }
}
