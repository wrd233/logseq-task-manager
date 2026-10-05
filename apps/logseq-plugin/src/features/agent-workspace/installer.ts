import { WorkspaceError, parseWorkspaceDescriptor, parseWorkspaceCall, parseWorkBinding, type AgentWorkBinding, type WorkspacePluginDescriptor, type WorkspaceDelivery } from "@task-copilot/contracts";
import { desktopBridge, desktopFiles } from "../../host/desktop-files.ts";
import type { ContentInstallation } from "../content-writeback/installer.ts";
import type { ScopeLease } from "../content-writeback/protocol.ts";
import type { Materials } from "../materials/controller.ts";
import type { MaterialResult } from "../materials/service.ts";
import type { WorkView } from "../work-view/controller.ts";
import { graphIdentity } from "../../graph-adapter.ts";
import { AgentWorkspaceRouter, type WorkspaceBindingPort, type OptionalStagePort, type WorkspaceSourcePort } from "./router.ts";
import type { WorkspaceContextService } from "../../workspace/context-service.ts";
export function workspaceBindingPort(service: WorkspaceContextService): WorkspaceBindingPort {
    let witness: (() => boolean) | null = null;
    const read = async (rootUuid: string): Promise<AgentWorkBinding> => {
        const graph = await logseq.App.getCurrentGraph(), scope = { graphId: graphIdentity(graph), rootUuid }, binding = await service.resolve(scope);
        if (!binding)
            throw new WorkspaceError("WORKSPACE_BINDING_REQUIRED", "请先关联这份工作的目录，并选择它的工作入口块。");
        return { scope, directory: binding.directory, organization: binding.manifest.organization, workspaceId: binding.manifest.workspaceId, provider: "workspace" };
    };
    return { selected: async (root) => { const value = await read(root); witness = service.observeScope(value.scope); return value; }, valid: async (binding) => !!witness && witness() && JSON.stringify(await read(binding.scope.rootUuid)) === JSON.stringify(binding) && witness(), materialIds: async (binding) => {
            const resolved = await service.resolve(binding.scope);
            if (!resolved || resolved.manifest.workspaceId !== binding.workspaceId || resolved.directory !== binding.directory)
                throw new WorkspaceError("CONNECTION_REVOKED");
            return resolved.manifest.associations.flatMap(item => item.kind === "material" ? [item.id] : []);
        } };
}
export function installAgentWorkspace(options: {
    content: ContentInstallation;
    materials: Materials | null;
    work: WorkView | null;
    binding: WorkspaceBindingPort;
    source?: WorkspaceSourcePort;
    stage?: OptionalStagePort;
    intervalMs?: number;
}) {
    let disposed = false, generation = 0, timer: ReturnType<typeof setTimeout> | null = null, busy = false, failures = 0;
    let connection: {
        descriptor: WorkspacePluginDescriptor;
        id: string;
        binding: AgentWorkBinding;
        lease: ScopeLease;
        epoch: number;
    } | null = null;
    const binding = options.binding;
    const router = options.materials && binding ? new AgentWorkspaceRouter({ content: options.content, materials: options.materials, work: options.work, binding, ...(options.source ? { source: options.source } : {}), ...(options.stage ? { stage: options.stage } : {}) }) : null;
    const report = (error: unknown) => {
        if (!disposed)
            void logseq.UI.showMsg(error instanceof Error ? error.message : String(error), "warning");
    };
    const post = async (descriptor: WorkspacePluginDescriptor, path: string, input: unknown) => {
        const response = await fetch(`${descriptor.baseUrl}${path}`, { method: "POST", headers: { "content-type": "application/json", "x-workspace-plugin": descriptor.pluginToken, "x-workspace-instance": descriptor.instanceId }, body: JSON.stringify(input), signal: AbortSignal.timeout(30000) });
        const result = await response.json() as {
            error?: {
                code: string;
                message: string;
            };
            delivery?: WorkspaceDelivery;
            instanceId?: string;
            value?: unknown;
        };
        if (!response.ok)
            throw new WorkspaceError(result.error?.code ?? "CHANNEL_FAILED", result.error?.message);
        return result;
    };
    const revoke = () => {
        const previous = connection;
        connection = null;
        generation++;
        router?.clear();
        if (timer)
            clearTimeout(timer);
        timer = null;
        if (previous)
            void post(previous.descriptor, "/plugin/revoke", { connectionId: previous.id }).catch(() => undefined);
    };
    const valid = async (value: NonNullable<typeof connection>) => {
        if (disposed || connection !== value || generation !== value.epoch || !router)
            throw new WorkspaceError("CONNECTION_REVOKED");
        await router.assert(value.binding, value.lease);
        if (disposed || connection !== value)
            throw new WorkspaceError("CONNECTION_REVOKED");
    };
    const processDelivery = async (value: NonNullable<typeof connection>, delivery: WorkspaceDelivery) => {
        busy = true;
        let returned = false;
        try {
            await valid(value);
            const parsed = parseWorkspaceCall({ schemaVersion: delivery.schemaVersion, instanceId: delivery.instanceId, connectionId: delivery.connectionId, clientId: delivery.clientId, requestId: delivery.requestId, command: delivery.command, payload: delivery.payload });
            if (parsed.instanceId !== value.descriptor.instanceId || parsed.connectionId !== value.id || JSON.stringify(parseWorkBinding(delivery.binding)) !== JSON.stringify(parseWorkBinding(value.binding)))
                throw new WorkspaceError("CONNECTION_STALE");
            const result = await router!.handle({ ...parsed, scope: value.binding.scope, binding: value.binding }, value.lease);
            returned = true;
            await valid(value);
            await post(value.descriptor, "/plugin/complete", { connectionId: value.id, clientId: parsed.clientId, requestId: parsed.requestId, value: result });
        }
        catch (error) {
            const uncertain = returned && ["content.apply", "content.retry", "content.recover", "stage.submit", "materials.capture", "materials.associate", "materials.save"].includes(delivery.command);
            const code = uncertain ? "TRANSPORT_OUTCOME_UNKNOWN" : error instanceof WorkspaceError ? error.code : error instanceof Error ? error.message.split(":")[0]! : "CAPABILITY_FAILED";
            await post(value.descriptor, "/plugin/complete", { connectionId: value.id, clientId: delivery.clientId, requestId: delivery.requestId, error: { code: code.slice(0, 128), message: uncertain ? "Local operation returned, but delivery/lifetime confirmation failed; query the original Journal request or material version before retrying." : error instanceof Error ? error.message.slice(0, 500) : code } }).catch(() => undefined);
        }
        finally {
            busy = false;
        }
    };
    const tick = async (value: NonNullable<typeof connection>) => {
        try {
            await valid(value);
            // Poll keeps the lease online while an SDK operation is in flight. Busy polls
            // intentionally do not pick up another delivery.
            const result = await post(value.descriptor, "/plugin/poll", { connectionId: value.id, busy });
            failures = 0;
            if (result.delivery && !busy)
                void processDelivery(value, result.delivery);
        }
        catch (error) {
            if (disposed || connection !== value)
                return;
            if (error instanceof WorkspaceError && ["CONNECTION_REVOKED", "CONNECTION_STALE", "DESCRIPTOR_STALE"].includes(error.code) || ++failures >= 3) {
                revoke();
                report(new Error("外部连接已停止；本地阅读、材料与历史仍可使用。"));
                return;
            }
        }
        if (connection === value && !disposed)
            timer = setTimeout(() => void tick(value), options.intervalMs ?? 250);
    };
    const allow = async (explicitTarget?: string, organize=false) => {
        if (!router || !binding)
            throw new WorkspaceError("MATERIALS_UNAVAILABLE");
        revoke();
        const epoch = generation;
        const target = explicitTarget ?? (await logseq.Editor.getCurrentBlock())?.uuid;
        if (!target)
            throw new WorkspaceError("SOURCE_REQUIRED");
        const selected = await binding.selected(target);
        let path = String(logseq.settings?.agentWorkspaceDescriptor ?? "").trim();
        if (!path) {
          const dot=await desktopBridge().doAction(["getLogseqDotDirRoot"]);
          if(typeof dot === "string" && dot.endsWith("/.logseq"))path=`${dot.slice(0,-8)}/.task-copilot-workspace/workspace-plugin.json`;
        }
        if (!path.startsWith("/"))
            throw new WorkspaceError("PLUGIN_DESCRIPTOR_REQUIRED", "请先运行安装包中的协作启动器，再允许连接这份工作。已有自定义连接位置继续有效。");
        const files = desktopFiles(() => selected.scope.graphId), descriptor = parseWorkspaceDescriptor(JSON.parse(await files.read(path)), true) as WorkspacePluginDescriptor;
        if (disposed || epoch !== generation)
            throw new WorkspaceError("CONNECTION_REVOKED");
        await options.content.establish(target,organize);
        const lease = options.content.capture(selected.scope);
        if (!lease)
            throw new WorkspaceError("SCOPE_MISMATCH");
        const value = { descriptor, id: crypto.randomUUID(), binding: selected, lease, epoch };
        await router.assert(selected, lease);
        await post(descriptor, "/plugin/connect", { connectionId: value.id, binding: selected });
        if (disposed || epoch !== generation || !options.content.valid(lease)) {
            void post(descriptor, "/plugin/revoke", { connectionId: value.id }).catch(() => undefined);
            throw new WorkspaceError("CONNECTION_REVOKED");
        }
        connection = value;
        failures = 0;
        void tick(value);
        await logseq.UI.showMsg(organize?"已连接，允许润色正文及同一对象内整理原块位置；TODO 文本及材料权限保持。":"已连接这份工作，允许维护此处正文。材料权限与 TODO 保护继续有效。", "success");
    };
    const localCall = async (command: "files.list" | "files.read" | "files.associate", payload: Record<string, unknown>): Promise<unknown> => {
        const value = connection;
        if (!value)
            throw new WorkspaceError("CHANNEL_UNAVAILABLE");
        await valid(value);
        const response = await post(value.descriptor, "/plugin/call", { schemaVersion: 1, instanceId: value.descriptor.instanceId, connectionId: value.id, clientId: "local-files-ui", requestId: crypto.randomUUID(), command, payload });
        await valid(value);
        const result = response.value;
        return result && typeof result === "object" && "provenance" in result && "value" in result ? result.value : result;
    };
    options.materials?.setDirectoryObserver({
        stop: revoke,
        available: context => !!connection && context.directory === connection.binding.directory && context.sourceUuid === connection.binding.scope.rootUuid,
        list: async () => {
            const value = await localCall("files.list", {}) as {
                observation: {
                    files: Array<{
                        path: string;
                        kind: string;
                        availability: string;
                        materialId: string | null;
                    }>;
                    truncated: unknown[];
                };
            };
            return { files: value.observation.files, truncated: value.observation.truncated.length > 0 };
        },
        read: async (path) => await localCall("files.read", { path }) as {
            content?: string | null;
            reason?: string;
            read?: string;
        },
        associate: async (path) => await localCall("files.associate", { path }) as MaterialResult,
    });
    const menu = logseq.App.registerCommand("block-context-menu-item", { key: "agent-workspace-allow-block", label: "工作台：允许 agent 连接此工作" }, ({ uuid }: {
        uuid: string;
    }) => {
        if (!disposed)
            return allow(uuid).catch(report);
    });
    const organizeMenu=logseq.App.registerCommand("block-context-menu-item",{key:"agent-workspace-organize-block",label:"工作台：允许 agent 润色并整理此工作原块"},({uuid}:{uuid:string})=>{if(!disposed)return allow(uuid,true).catch(report);});
    const offGraph = logseq.App.onCurrentGraphChanged(revoke), disposers: Array<() => void> = [offGraph];
    if(typeof organizeMenu==="function")disposers.push(organizeMenu);
    if (typeof menu === "function")
        disposers.push(menu);
    for (const [key, label, action] of [["agent-workspace-organize", "工作台：允许 agent 润色并整理当前工作原块", async()=>allow(undefined,true)], ["agent-workspace-allow", "工作台：允许 agent 连接当前工作", allow], ["agent-workspace-stop", "工作台：停止 agent 工作连接", async () => { revoke(); }]] as const) {
        const off = logseq.App.registerCommandPalette({ key, label }, () => {
            if (!disposed)
                return action().catch(report);
        });
        if (typeof off === "function")
            disposers.push(off);
    }
    return { api: { status: () => ({ connected: connection !== null, binding: connection?.binding ?? null, formalWorkspace: connection?.binding.provider === "workspace" ? "connected" : "unavailable" }) }, local: {connect:allow,stop:revoke}, dispose: () => {
            if (disposed)
                return;
            disposed = true;
            revoke();
            options.materials?.setDirectoryObserver(null);
            for (const off of disposers)
                off();
        } };
}
