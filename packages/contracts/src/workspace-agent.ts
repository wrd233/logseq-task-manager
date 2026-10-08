/** Natural-work transport only. These capabilities never authorize Formal operations. */
export type AgentWorkScope = {
    graphId: string;
    rootUuid: string;
};
export type AgentWorkBinding = {
    scope: AgentWorkScope;
    directory: string;
    organization: "flat" | "project";
    provider: "material-binding" | "workspace";
    workspaceId: string | null;
};
export const workspaceCommands = {
    "status": [], "refresh": [], "read": [], "source.read": ["sourceId"],
    "guidance.read": [], "collaboration.read": [], "collaboration.refresh": [],
    "materials.list": [], "materials.read": ["id"],
    "materials.capture": ["requestKey", "text", "html", "title", "role"],
    "materials.associate": ["id", "path"],
    "materials.save": ["id", "expectedVersion", "expectedContent", "next"],
    "files.list": [], "files.read": ["path"], "files.associate": ["path"],
    "sessions.list": [], "sessions.add": ["platform", "externalId", "url", "description"], "sessions.remove": ["platform", "externalId"],
    "focus.request": ["question"], "focus.source": [], "focus.apply": ["plan"],
    "focus.read": [], "focus.cancel": [], "focus.exit": [], "focus.back": [],
    "reading.request": ["purpose"], "reading.read": [], "reading.submit": ["plan"],
    "reading.select": ["planId"], "reading.original": [], "reading.cancel": ["requestId"],
    "reading.highlight": ["input"], "reading.clear": [],
    "content.read": [], "content.apply": ["patch"], "content.result": ["requestId"],
    "content.pending": [], "content.recover": ["requestId"], "content.retry": ["previousRequestId", "patch"],
    "todo.read": [], "todo.apply": ["request"], "todo.result": ["requestId"], "todo.recover": ["requestId"], "todo.resumeIdentity": ["requestId"], "todo.retry": ["previousRequestId", "request"],
    "stage.read": ["input"], "stage.submit": ["input"],
} as const;
export type WorkspaceCommand = keyof typeof workspaceCommands;
export type WorkspaceCall = {
    schemaVersion: 1;
    instanceId: string;
    connectionId: string;
    clientId: string;
    requestId: string;
    command: WorkspaceCommand;
    payload: Record<string, unknown>;
};
export type WorkspaceDelivery = WorkspaceCall & {
    scope: AgentWorkScope;
    binding: AgentWorkBinding;
};
export type WorkspaceReply = {
    instanceId: string;
    connectionId: string;
    requestId: string;
    value: unknown;
    provenance: {
        clientId: string;
        command: WorkspaceCommand;
        payloadDigest: string;
        origin: "verified-local-connection";
    };
};
export type WorkspaceDescriptor = {
    schemaVersion: 1;
    instanceId: string;
    baseUrl: string;
    token: string;
};
export type WorkspacePluginDescriptor = WorkspaceDescriptor & {
    pluginToken: string;
};
export class WorkspaceError extends Error {
    constructor(readonly code: string, message = code) { super(message); this.name = "WorkspaceError"; }
}
export function workRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
        throw new WorkspaceError("INVALID_INPUT");
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(value).some(key => typeof key !== "string" || !keys.includes(key)) || Object.values(descriptors).some(field => !("value" in field)))
        throw new WorkspaceError("UNSUPPORTED_FIELD");
    return value as Record<string, unknown>;
}
export function workText(value: unknown, limit = 128): string {
    if (typeof value !== "string" || !value.trim() || value.length > limit || Array.from(value).some(char => char.charCodeAt(0) < 32))
        throw new WorkspaceError("INVALID_IDENTIFIER");
    return value;
}
export function sameWorkScope(a: AgentWorkScope, b: AgentWorkScope): boolean { return a.graphId === b.graphId && a.rootUuid === b.rootUuid; }
export function parseWorkspaceCall(input: unknown): WorkspaceCall {
    const raw = workRecord(input, ["schemaVersion", "instanceId", "connectionId", "clientId", "requestId", "command", "payload"]);
    if (raw.schemaVersion !== 1)
        throw new WorkspaceError("UNSUPPORTED_SCHEMA");
    if (typeof raw.command !== "string" || !Object.hasOwn(workspaceCommands, raw.command))
        throw new WorkspaceError("UNKNOWN_COMMAND");
    const command = raw.command as WorkspaceCommand;
    const payload = workRecord(raw.payload, workspaceCommands[command]);
    if (new TextEncoder().encode(JSON.stringify(payload)).length > 1048576)
        throw new WorkspaceError("INPUT_TOO_LARGE");
    return { schemaVersion: 1, instanceId: workText(raw.instanceId), connectionId: workText(raw.connectionId), clientId: workText(raw.clientId), requestId: workText(raw.requestId), command, payload };
}
export function parseWorkBinding(input: unknown): AgentWorkBinding {
    const raw = workRecord(input, ["scope", "directory", "organization", "provider", "workspaceId"]), scope = workRecord(raw.scope, ["graphId", "rootUuid"]);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(String(scope.rootUuid)))
        throw new WorkspaceError("INVALID_SCOPE");
    if (!["flat", "project"].includes(String(raw.organization)) || !["material-binding", "workspace"].includes(String(raw.provider)))
        throw new WorkspaceError("INVALID_BINDING");
    return { scope: { graphId: workText(scope.graphId, 2048), rootUuid: scope.rootUuid as string }, directory: workText(raw.directory, 4096), organization: raw.organization as AgentWorkBinding["organization"], provider: raw.provider as AgentWorkBinding["provider"], workspaceId: raw.workspaceId === null ? null : workText(raw.workspaceId) };
}
export function parseWorkspaceDescriptor(input: unknown, plugin = false): WorkspaceDescriptor | WorkspacePluginDescriptor {
    const raw = workRecord(input, plugin ? ["schemaVersion", "instanceId", "baseUrl", "token", "pluginToken"] : ["schemaVersion", "instanceId", "baseUrl", "token"]);
    if (raw.schemaVersion !== 1 || typeof raw.baseUrl !== "string" || !/^http:\/\/127\.0\.0\.1:\d{1,5}$/u.test(raw.baseUrl))
        throw new WorkspaceError("DESCRIPTOR_INVALID");
    const value: WorkspaceDescriptor = { schemaVersion: 1, instanceId: workText(raw.instanceId), baseUrl: raw.baseUrl, token: workText(raw.token) };
    return plugin ? { ...value, pluginToken: workText(raw.pluginToken) } : value;
}
