import { WorkspaceError, sameWorkScope, parseWorkspaceDescriptor, parseWorkspaceCall, parseWorkBinding, type AgentWorkBinding, type WorkspacePluginDescriptor, type WorkspaceDelivery } from "@task-copilot/contracts";
import { desktopBridge, desktopFiles } from "../../host/desktop-files.ts";
import type { ContentInstallation } from "../content-writeback/installer.ts";
import type { ScopeLease } from "../content-writeback/protocol.ts";
import type { Materials } from "../materials/controller.ts";
import type { MaterialResult } from "../materials/service.ts";
import type { WorkView } from "../work-view/controller.ts";
import { graphIdentity } from "../../graph-adapter.ts";
import { AgentWorkspaceRouter, type WorkspaceBindingPort, type OptionalStagePort, type WorkspaceSourcePort } from "./router.ts";
import type { WorkspaceContextService } from "../../workspace/context-service.ts";
import { GuidanceService } from "./guidance.ts";
import { CollaborationService } from "./collaboration.ts";
import { CollaborationUI } from "./collaboration-ui.ts";
import { OrdinaryTodoService } from "../ordinary-todo/service.ts";
import { OrdinaryTodoUI } from "../ordinary-todo/ui.ts";
import { WritingFormatService } from "../writing-format/service.ts";
import { WritingFormatUI } from "../writing-format/ui.ts";
export function workspaceBindingPort(service: WorkspaceContextService): WorkspaceBindingPort {
    const witnesses=new WeakMap<AgentWorkBinding,()=>boolean>();
    const read = async (rootUuid: string,pageScope?:ScopeLease["scope"]): Promise<AgentWorkBinding> => {
        const graph = await logseq.App.getCurrentGraph(), scope = pageScope??{ graphId: graphIdentity(graph), rootUuid };
        if(scope.graphId!==graphIdentity(graph)||scope.rootUuid!==rootUuid)throw new WorkspaceError("SCOPE_MISMATCH");
        const binding = await service.resolve(scope);
        if (!binding)
            throw new WorkspaceError("WORKSPACE_BINDING_REQUIRED", "请先关联这份工作的目录，并选择它的工作入口块。");
        return { scope, directory: binding.directory, organization: binding.manifest.organization, workspaceId: binding.manifest.workspaceId, provider: "workspace" };
    };
    return { selected: async (root,page) => { const value = await read(root,page); witnesses.set(value,service.observeScope(value.scope)); return value; }, valid: async (binding) => {
        const witness=witnesses.get(binding);return !!witness&&witness()&&JSON.stringify(await read(binding.scope.rootUuid,binding.scope.kind==="page"?binding.scope:undefined))===JSON.stringify(binding)&&witness();
    }, materialIds: async (binding) => {
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
        fileWrite: boolean;
        descriptorPath:string;
    } | null = null;
    const binding = options.binding;
    const todo=new OrdinaryTodoService({...options.content.trustedTodo,valid:options.content.valid});
    const formatting=new WritingFormatService({...options.content.trustedFormatting,valid:options.content.valid});
    const guidance=new GuidanceService(logseq.FileStorage);
    const permissions=()=>({read:connection!==null,bodyWrite:connection!==null&&options.content.api.capabilities().bodyAuthorized,structureWrite:connection!==null&&options.content.api.capabilities().structureAuthorized,fileWrite:connection?.fileWrite??false,ordinaryTodo:connection!==null&&todo.status(connection.lease).authorized,formalApproval:false as const});
    const collaboration=options.source?new CollaborationService({storage:logseq.FileStorage,guidance,refresh:scope=>options.source!.refresh(scope),materials:async selected=>router!.sceneMaterials(selected),reading:()=>options.work?.readingAPI.read()??null,permissions,editing:async()=>!!await logseq.Editor.checkEditing()}):undefined;
    const router:AgentWorkspaceRouter|null = options.materials && binding ? new AgentWorkspaceRouter({ content: options.content, materials: options.materials, work: options.work, binding, guidance,todo,formatting,...(collaboration?{collaboration}:{}),allowsFileWrite:lease=>connection?.lease===lease&&connection.fileWrite, ...(options.source ? { source: options.source } : {}), ...(options.stage ? { stage: options.stage } : {}) }) : null;
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
    const revoke = (closeUI=true, preserveFormatUI=false) => {
        const previous = connection;
        connection = null;
        generation++;
        router?.clear();
        todo.revoke();if(!preserveFormatUI)todoUI?.close();
        formatting.clear();if(!preserveFormatUI)formatUI?.close();
        if(closeUI&&!preserveFormatUI)ui?.close();
        if(previous&&options.content.valid(previous.lease))options.content.api.revoke();
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
            await valid(value);
            router!.delivered({...parsed,scope:value.binding.scope,binding:value.binding},result);
        }
        catch (error) {
            const uncertain = returned && ["content.apply", "content.retry", "content.recover", "todo.apply", "todo.retry", "todo.resumeIdentity", "stage.submit", "materials.capture", "materials.associate", "materials.save"].includes(delivery.command);
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
    const targetFor=async(explicitTarget?:string|ScopeLease["scope"])=>{
        const epoch=generation;
        const scope=(options.work?.snapshot() as {readingScope?:ScopeLease["scope"]}|undefined)?.readingScope;
        const target=explicitTarget??(scope?.kind==="page"?scope:(await logseq.Editor.getCurrentBlock())?.uuid);
        if(disposed||epoch!==generation)throw new WorkspaceError("CONNECTION_REVOKED");return target;
    };
    const allow = async (explicitTarget?: string|ScopeLease["scope"], organize=false, readOnly=false, preserveUI=false) => {
        if (!router || !binding)
            throw new WorkspaceError("MATERIALS_UNAVAILABLE");
        const targetValue=await targetFor(explicitTarget);
        if(typeof targetValue!=="string"&&targetValue?.kind==="page"&&(!readOnly||organize))throw new WorkspaceError("BLOCK_SCOPE_REQUIRED","页面连接提供读取与读法；写作需另选真实块范围。");
        revoke(!preserveUI);
        const epoch = generation;
        const target=typeof targetValue==="string"?targetValue:targetValue?.rootUuid;
        if (!target)
            throw new WorkspaceError("SOURCE_REQUIRED");
        const selected = await binding.selected(target,typeof targetValue!=="string"?targetValue:undefined);
        let path = String(logseq.settings?.agentWorkspaceDescriptor ?? "").trim();
        if (!path) {
          const dot=await desktopBridge().doAction(["getLogseqDotDirRoot"]);
          if(typeof dot === "string" && dot.endsWith("/.logseq"))path=`${dot.slice(0,-8)}/.task-copilot-workspace/workspace-plugin.json`;
        }
        if (!path.startsWith("/"))
            throw new WorkspaceError("PLUGIN_DESCRIPTOR_REQUIRED", "请先运行安装包中的协作启动器，再允许连接这份工作。已有自定义连接位置继续有效。");
        const files = desktopFiles(() => selected.scope.graphId);
        let descriptorText: string;
        try { descriptorText=await files.read(path); }
        catch(error) { throw new WorkspaceError("PLUGIN_DESCRIPTOR_REQUIRED", `请先运行安装包中的协作启动器，再允许连接这份工作。连接文件暂不可读：${error instanceof Error ? error.message : String(error)}`); }
        const descriptor = parseWorkspaceDescriptor(JSON.parse(descriptorText), true) as WorkspacePluginDescriptor;
        if (disposed || epoch !== generation)
            throw new WorkspaceError("CONNECTION_REVOKED");
        if(selected.scope.kind==="page")await options.content.establishPageRead(selected.scope);
        else if(readOnly)await options.content.establishRead(target);
        else await options.content.establish(target,organize);
        const lease = options.content.capture(selected.scope);
        if (!lease)
            throw new WorkspaceError("SCOPE_MISMATCH");
        options.content.restrict(lease,()=>{
            const scope=(options.work?.snapshot() as {readingScope?:AgentWorkBinding["scope"]&{kind?:string}}|undefined)?.readingScope;
            return !scope||sameWorkScope(scope,selected.scope);
        });
        if(disposed||epoch!==generation){if(options.content.valid(lease))options.content.api.revoke();throw new WorkspaceError("CONNECTION_REVOKED");}
        const value = { descriptor, descriptorPath:path, id: crypto.randomUUID(), binding: selected, lease, epoch, fileWrite:false };
        try{
            await router.assert(selected, lease);
            await post(descriptor, "/plugin/connect", { connectionId: value.id, binding: selected });
            if (disposed || epoch !== generation || !options.content.valid(lease)) throw new WorkspaceError("CONNECTION_REVOKED");
        }catch(error){
            void post(descriptor, "/plugin/revoke", { connectionId: value.id }).catch(() => undefined);
            if(options.content.valid(lease))options.content.api.revoke();throw error;
        }
        connection = value;
        failures = 0;
        void tick(value);
        await logseq.UI.showMsg(readOnly?"已连接这份工作，可读取和设计读法。正文、文件写作及 TODO 需分别授权。":organize?"已连接，允许润色正文及同一对象内整理原块位置；TODO 文本及材料权限保持。":"已连接这份工作，允许维护此处正文。材料权限与 TODO 保护继续有效。", "success");
    };
    const localCall = async (command: "files.list" | "files.read" | "files.associate" | "collaboration.refresh", payload: Record<string, unknown>): Promise<unknown> => {
        const value = connection;
        if (!value)
            throw new WorkspaceError("CHANNEL_UNAVAILABLE");
        await valid(value);
        const response = await post(value.descriptor, "/plugin/call", { schemaVersion: 1, instanceId: value.descriptor.instanceId, connectionId: value.id, clientId: "local-files-ui", requestId: crypto.randomUUID(), command, payload });
        await valid(value);
        const result = response.value;
        return result && typeof result === "object" && "provenance" in result && "value" in result ? result.value : result;
    };
    const ui=new CollaborationUI({guidance,report,stateDirectory:()=>connection?.descriptorPath.slice(0,connection.descriptorPath.lastIndexOf("/"))??null,context:async explicitTarget=>{
        const targetValue=await targetFor(explicitTarget),target=typeof targetValue==="string"?targetValue:targetValue?.rootUuid;
        if(!target||!options.source)throw new WorkspaceError("SOURCE_REQUIRED");
        const selected=await binding.selected(target,typeof targetValue!=="string"?targetValue:undefined);
        const check=async()=>{if(disposed||!await binding.valid(selected))throw new WorkspaceError("CONNECTION_REVOKED");};
        const workspace=await options.source.refresh(selected.scope);await check();
        if(workspace.freshness!=="checked"||!workspace.observed)throw new WorkspaceError("SOURCE_UNAVAILABLE");
        const sources=[...workspace.observed.primary.blocks,...workspace.observed.sources.flatMap(s=>s.snapshot?.blocks??[])];
        const backgroundSources=[...new Map(sources.map(b=>[b.sourceId,b])).values()];
        return {binding:selected,source:workspace.observed.primary,backgroundSources,guidance:await guidance.read(selected,check),check};
    },prepare:async(root,request,backgroundSourceIds)=>{
        // Preserve an existing explicit grant for this same work. A fresh entry
        // establishes only read/presentation authority.
        if(!connection||(typeof root==="string"?connection.binding.scope.rootUuid!==root||connection.binding.scope.kind!==undefined:!sameWorkScope(connection.binding.scope,root)))await allow(root,false,true,true);
        const value=connection;if(!value||!collaboration)throw new WorkspaceError("CHANNEL_UNAVAILABLE");
        const check=()=>valid(value);await check();
        await collaboration.prepare(value.binding,{request,backgroundSourceIds},check);
        return localCall("collaboration.refresh",{});
    }});
    const allowFiles=async()=>{
        const value=connection;if(!value)throw new WorkspaceError("CHANNEL_UNAVAILABLE","先连接这份工作，再明确允许它的文件写作。");
        await valid(value);value.fileWrite=true;await logseq.UI.showMsg("已允许 Agent 在这份工作的目录中写材料；正文和普通 TODO 许可独立保持。","success");
    };
    const todoUI=new OrdinaryTodoUI({service:todo,valid:options.content.valid,context:async()=>{
        const value=connection;if(!value)throw new WorkspaceError("CHANNEL_UNAVAILABLE","先连接这份工作，再选择普通 TODO 的范围和操作。");
        await valid(value);if(value.lease.scope.kind==="page")throw new WorkspaceError("BLOCK_SCOPE_REQUIRED");const read=await options.content.trustedTodo.read(value.lease.scope);await valid(value);return {lease:value.lease,read};
    }});
    const formatUI=new WritingFormatUI({service:formatting,valid:options.content.valid,context:async root=>{
        const workScope=(options.work?.snapshot() as {readingScope?:AgentWorkBinding["scope"]&{kind?:string}}|undefined)?.readingScope;
        if(workScope?.kind==="page")throw new WorkspaceError("BLOCK_SCOPE_REQUIRED","页面的行首整理需要选定真实块范围。");
        const target=root??connection?.binding.scope.rootUuid??workScope?.rootUuid??(await logseq.Editor.getCurrentBlock())?.uuid;
        if(!target)throw new WorkspaceError("SOURCE_REQUIRED");
        let lease:ScopeLease;
        if(connection&&connection.binding.scope.rootUuid===target){await valid(connection);lease=connection.lease;}
        else {
            revoke(true,true);await options.content.establishRead(target,true);const current=options.content.local.lifetime();if(!current)throw new WorkspaceError("SCOPE_REVOKED");lease=current;
            options.content.restrict(lease,()=>{const scope=(options.work?.snapshot() as {readingScope?:AgentWorkBinding["scope"]&{kind?:string}}|undefined)?.readingScope;return !scope||scope.kind!=="page"&&sameWorkScope(scope,lease.scope);});
        }
        const read=await options.content.trustedFormatting.read(lease.scope);if(disposed||!options.content.valid(lease))throw new WorkspaceError("SCOPE_REVOKED");return {lease,read};
    }});
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
    const menu = logseq.App.registerCommand("block-context-menu-item", { key: "agent-workspace-allow-block", label: "工作台：允许 Agent 维护此块范围正文" }, ({ uuid }: {
        uuid: string;
    }) => {
        if (!disposed)
            return allow(uuid).catch(report);
    });
    const organizeMenu=logseq.App.registerCommand("block-context-menu-item",{key:"agent-workspace-organize-block",label:"工作台：允许 agent 润色并整理此工作原块"},({uuid}:{uuid:string})=>{if(!disposed)return allow(uuid,true).catch(report);});
    const offGraph = logseq.App.onCurrentGraphChanged(()=>revoke()), disposers: Array<() => void> = [offGraph];
    if(typeof organizeMenu==="function")disposers.push(organizeMenu);
    if (typeof menu === "function")
        disposers.push(menu);
    for (const [key, label, action] of [["agent-workspace-collaboration","工作台：带当前工作去协作",async()=>ui.open()],["agent-workspace-guidance","工作台：编辑共同指导与项目差异",async()=>ui.open(undefined,true)],["agent-workspace-read","工作台：允许 agent 只读当前工作",async()=>allow(undefined,false,true)],["agent-workspace-files","工作台：允许 agent 写当前工作文件",allowFiles],["agent-workspace-organize", "工作台：允许 agent 润色并整理当前工作原块", async()=>allow(undefined,true)], ["agent-workspace-allow", "工作台：允许 Agent 维护当前块范围正文", allow], ["agent-workspace-stop", "工作台：停止 agent 工作连接", async () => { revoke(); }]] as const) {
        const off = logseq.App.registerCommandPalette({ key, label }, () => {
            if (!disposed)
                return action().catch(report);
        });
        if (typeof off === "function")
            disposers.push(off);
    }
    const connectRead=(target?:string|ScopeLease["scope"])=>allow(target,false,true);
    const todoCommand=logseq.App.registerCommandPalette({key:"agent-workspace-todo",label:"工作台：允许 agent 维护普通 TODO"},()=>{if(!disposed)return todoUI.open().catch(report);});
    if(typeof todoCommand==="function")disposers.push(todoCommand);
    const formatCommand=logseq.App.registerCommandPalette({key:"agent-workspace-format",label:"工作台：查看并整理行首格式"},()=>{if(!disposed)return formatUI.open().catch(report);});
    if(typeof formatCommand==="function")disposers.push(formatCommand);
    return { api: { status: () => ({ connected: connection !== null, binding: connection?.binding ?? null, formalWorkspace: connection?.binding.provider === "workspace" ? "connected" : "unavailable", permissions:permissions() }) }, local: {connect:allow,connectRead,allowFiles,allowTodo:()=>todoUI.open(),format:(root?:string)=>formatUI.open(root),collaborate:(root?:string|ScopeLease["scope"])=>ui.open(root),designReading:(root?:string|ScopeLease["scope"])=>ui.open(root,false,true),guidance:(root?:string|ScopeLease["scope"])=>ui.open(root,true),stop:()=>revoke()}, dispose: () => {
            if (disposed)
                return;
            disposed = true;
            revoke();
            ui.dispose();guidance.dispose();collaboration?.dispose();
            todoUI.dispose();
            formatUI.dispose();
            options.materials?.setDirectoryObserver(null);
            for (const off of disposers)
                off();
        } };
}
