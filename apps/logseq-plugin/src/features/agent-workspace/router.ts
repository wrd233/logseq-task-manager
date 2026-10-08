import { WorkspaceError, workRecord, workText, sameWorkScope, type AgentWorkBinding, type WorkspaceDelivery } from "@task-copilot/contracts";
import type { ContentInstallation } from "../content-writeback/installer.ts";
import type { ScopeLease, CallOrigin, LoadedGuidanceBasis } from "../content-writeback/protocol.ts";
import { parsePatch } from "../content-writeback/validation.ts";
import type { Materials } from "../materials/controller.ts";
import type { WorkView } from "../work-view/controller.ts";
import { sourceHash } from "../work-view/lens-source.ts";
import type { ContextReading } from "../../workspace/context-service.ts";
import type { GuidanceReading, GuidanceService } from "./guidance.ts";
import type { CollaborationService } from "./collaboration.ts";
import { parseTodoRequest, type OrdinaryTodoService } from "../ordinary-todo/service.ts";
import { naturalLabels, type WritingFormatService } from "../writing-format/service.ts";
export interface OptionalStagePort {
    read(input: unknown, binding: AgentWorkBinding): Promise<unknown>;
    submit(input: unknown, binding: AgentWorkBinding,origin?:CallOrigin): Promise<unknown>;
}
export interface WorkspaceBindingPort {
    selected(rootUuid: string): Promise<AgentWorkBinding>;
    valid(binding: AgentWorkBinding): Promise<boolean>;
    materialIds?(binding: AgentWorkBinding): Promise<string[]>;
}
export interface WorkspaceSourcePort {
    refresh(scope: AgentWorkBinding["scope"]): Promise<ContextReading>;
}
type MaterialPort = Pick<Materials, "listMaterials" | "readMaterial" | "capture" | "associateMaterial" | "saveMaterial">;
type WorkPort = Pick<WorkView, "open" | "snapshot" | "lensesAPI" | "readingAPI" | "reportAPI">;
/** Routes capabilities, without implementing source algorithms, protections or Stage. */
export class AgentWorkspaceRouter {
    private readonly questions = new Map<string, string>();
    private readonly readingRequests=new Map<string,string>();
    private readonly readingPlans=new Map<string,string>();
    private generation=0;
    private readonly loadedGuidance=new Map<string,LoadedGuidanceBasis>();
    constructor(private readonly ports: {
        content: ContentInstallation;
        materials: MaterialPort;
        work: WorkPort | null;
        binding: WorkspaceBindingPort;
        source?: WorkspaceSourcePort;
        stage?: OptionalStagePort;
        allowsFileWrite?(lease:ScopeLease):boolean;
        guidance?:GuidanceService;
        collaboration?:CollaborationService;
        todo?:OrdinaryTodoService;
        formatting?:WritingFormatService;
    }) { }
    clear(): void {
        this.generation++;this.questions.clear();
        this.loadedGuidance.clear();
        // Cancel the presentation controller's pending generation too: a select
        // already awaiting a source read must not take effect after disconnect.
        this.ports.work?.readingAPI.cancel();
        this.readingRequests.clear();this.readingPlans.clear();this.ports.work?.reportAPI.clearHighlight();
    }
    async assert(binding: AgentWorkBinding, lease: ScopeLease): Promise<void> {
        if (!this.ports.content.valid(lease) || !sameWorkScope(binding.scope, lease.scope) || !await this.ports.binding.valid(binding))
            throw new WorkspaceError("CONNECTION_REVOKED");
        if (!this.ports.content.valid(lease))
            throw new WorkspaceError("CONNECTION_REVOKED");
    }
    private async materialList(binding: AgentWorkBinding) {
        const list = await this.ports.materials.listMaterials(binding.scope.rootUuid);
        const explicit = await this.ports.binding.materialIds?.(binding) ?? [];
        for (const id of explicit)
            if (!list.materials.some(item => item.id === id))
                list.materials.push(await this.ports.materials.readMaterial(id));
        if (list.materials.length > 2000)
            throw new WorkspaceError("MATERIAL_LIST_LIMIT");
        return list;
    }
    private async material(id: unknown, binding: AgentWorkBinding) {
        const list = await this.materialList(binding);
        const selected = workText(id);
        if (!list.materials.some(item => item.id === selected))
            throw new WorkspaceError("MATERIAL_OUTSIDE_SCOPE");
        return this.ports.materials.readMaterial(selected);
    }
    async sceneMaterials(binding:AgentWorkBinding){return (await this.materialList(binding)).materials;}
    private owner(call:WorkspaceDelivery):string{return JSON.stringify([call.instanceId,call.connectionId,call.clientId]);}
    private rememberGuide(call:WorkspaceDelivery,reading:GuidanceReading):void{
        this.loadedGuidance.set(this.owner(call),{loading:"explicit-read",sourceLoadedAt:reading.loadedAt,returnedAt:new Date().toISOString(),common:{key:reading.common.source.key,version:reading.common.version},project:{key:reading.project.source.key,version:reading.project.version}});
        if(this.loadedGuidance.size>128)this.loadedGuidance.delete(this.loadedGuidance.keys().next().value!);
    }
    /** Called only after the companion acknowledges the actual reply. A failed
     * delivery must not become a claimed loaded basis for the next write. */
    delivered(call:WorkspaceDelivery,value:unknown):void{
        if(call.command==="guidance.read")this.rememberGuide(call,value as GuidanceReading);
        else if(call.command==="collaboration.read")this.rememberGuide(call,(value as {scene:{guidance:GuidanceReading}}).scene.guidance);
        else if(call.command==="collaboration.refresh")this.rememberGuide(call,(value as {guidance:GuidanceReading}).guidance);
    }
    private origin(call:WorkspaceDelivery):CallOrigin{return {kind:"verified-local-agent",instanceId:call.instanceId,connectionId:call.connectionId,clientLabel:call.clientId,transportRequestId:call.requestId,command:call.command,guidance:this.loadedGuidance.get(this.owner(call))??null};}
    private async contentId(call: WorkspaceDelivery, id: unknown): Promise<string> {
        return `external-${await sourceHash(JSON.stringify(["agent-workspace", call.scope, call.clientId, workText(id)]))}`;
    }
    private async patch(call: WorkspaceDelivery, input: unknown) {
        const patch = parsePatch(input);
        if (!sameWorkScope(patch.scope, call.scope))
            throw new WorkspaceError("SCOPE_MISMATCH");
        return { ...patch, requestId: await this.contentId(call, patch.requestId) };
    }
    async handle(call: WorkspaceDelivery, lease: ScopeLease): Promise<unknown> {
        const { binding, payload, command } = call;
        await this.assert(binding, lease);
        if (!sameWorkScope(call.scope, binding.scope))
            throw new WorkspaceError("SCOPE_MISMATCH");
        const content = this.ports.content.api;
        const check = () => this.assert(binding, lease);
        if(command.startsWith("formatting.")){
            const formatting=this.ports.formatting;if(!formatting)throw new WorkspaceError("FORMATTING_UNAVAILABLE");
            const id=await this.contentId(call,payload.requestId);await check();
            if(command==="formatting.preview")return formatting.preview(lease,{requestId:id,sourceIds:payload.sourceIds,...(payload.labels!==undefined?{labels:payload.labels}:{})},this.origin(call));
            if(command==="formatting.result"||command==="formatting.recover")return formatting.result(lease,id,command==="formatting.recover");
        }
        if(command.startsWith("todo.")){
            const todo=this.ports.todo;if(!todo)throw new WorkspaceError("TODO_UNAVAILABLE");
            const material=async(id:string)=>{const value=await this.material(id,binding);await check();return value;};
            if(command==="todo.read")return {permission:todo.status(lease),source:await content.read(binding.scope),capabilities:{schemaVersion:1,actions:["create","complete","reopen"],completionEvidence:"current-material-version-and-exact-text",formalOperations:false}};
            if(command==="todo.result"||command==="todo.recover")return todo.result(lease,await this.contentId(call,payload.requestId),command==="todo.recover");
            if(command==="todo.resumeIdentity")return todo.resumeIdentity(lease,await this.contentId(call,payload.requestId),material);
            const request=parseTodoRequest(payload.request);if(!sameWorkScope(request.scope,binding.scope))throw new WorkspaceError("SCOPE_MISMATCH");
            const normalized={...request,requestId:await this.contentId(call,request.requestId)};await check();
            if(command==="todo.apply")return todo.apply(lease,normalized,material,this.origin(call));
            if(command==="todo.retry")return todo.retry(lease,await this.contentId(call,payload.previousRequestId),normalized,material,this.origin(call));
        }
        if(command==="guidance.read"){
            if(!this.ports.guidance)throw new WorkspaceError("GUIDANCE_UNAVAILABLE");
            const reading=await this.ports.guidance.read(binding,check);await check();return reading;
        }
        if(command==="collaboration.read"||command==="collaboration.refresh"){
            if(!this.ports.collaboration)throw new WorkspaceError("COLLABORATION_UNAVAILABLE");
            const packet=await this.ports.collaboration[command==="collaboration.read"?"read":"refresh"](binding,check);await check();
            return packet;
        }
        if (command === "status")
            return { channel: "online", binding, capabilities: { read: true, files: true, fileWrite:this.ports.allowsFileWrite?.(lease)??true, materials: true, focus: this.ports.work !== null, reading: this.ports.work !== null, content: content.capabilities().bodyAuthorized, stage: this.ports.stage !== undefined }, readingProtocol:this.ports.work?.readingAPI.read().capabilities??null, formattingProtocol:this.ports.formatting?{schemaVersion:1,preview:true,externalApply:false,application:"local-user-exact-diff",defaultLabels:[...naturalLabels],maxChanges:64,formalOperations:false}:null, formalWorkspace: binding.provider === "workspace" ? "connected" : "unavailable", formalKernelRequired: false, authorizesTodo: this.ports.todo?.status(lease).authorized??false, todoProtocol:this.ports.todo?.status(lease)??null, contentProtocol: content.capabilities() };
        if ((command === "refresh" || command === "source.read") && this.ports.source) {
            const reading = await this.ports.source.refresh(binding.scope);
            await check();
            if (reading.freshness !== "checked" || !reading.observed)
                throw new WorkspaceError("SOURCE_UNAVAILABLE", reading.problem ?? "Authority could not be refreshed; last-known content remains available.");
            if (command === "source.read") {
                const id = workText(payload.sourceId, 4096), sources = [reading.observed.primary, ...reading.observed.sources.flatMap(item => item.snapshot ? [item.snapshot] : [])];
                const source = sources.flatMap(item => item.blocks).find(item => item.sourceId === id);
                if (!source)
                    throw new WorkspaceError("SOURCE_OUTSIDE_SCOPE");
                return { freshness: source.availability === "available" ? "checked" : "unavailable", source };
            }
            return { freshness: "checked", snapshot: reading.observed.primary, binding, workspace: reading };
        }
        if (command === "refresh" || command === "content.read" || command === "source.read") {
            const snapshot = await content.read(binding.scope);
            await check();
            if (!snapshot.blocks.length || snapshot.blocks.some(block => block.availability !== "available"))
                throw new WorkspaceError("SOURCE_UNAVAILABLE");
            if (command === "source.read") {
                const source = snapshot.blocks.find(item => item.sourceId === workText(payload.sourceId, 4096));
                if (!source)
                    throw new WorkspaceError("SOURCE_OUTSIDE_SCOPE");
                return { freshness: "checked", source };
            }
            return command === "refresh" ? { freshness: "checked", snapshot, binding } : snapshot;
        }
        if (command === "materials.list") {
            const list = await this.materialList(binding);
            await check();
            if (list.materials.length > 2000)
                throw new WorkspaceError("MATERIAL_LIST_LIMIT");
            return list;
        }
        if (command === "materials.read") {
            const value = await this.material(payload.id, binding);
            await check();
            return value;
        }
        if (command === "materials.save") {
            if(this.ports.allowsFileWrite?.(lease)===false)throw new WorkspaceError("FILE_WRITE_AUTHORIZATION_REQUIRED");
            await content.read(binding.scope);await check();
            if (typeof payload.expectedContent !== "string" || typeof payload.next !== "string")
                throw new WorkspaceError("INVALID_MATERIAL_SAVE");
            const material = await this.material(payload.id, binding);
            await check();
            if (!material.capabilities.edit.agent)
                throw new WorkspaceError("MATERIAL_AGENT_WRITE_FORBIDDEN");
            // Actor is chosen by the trusted operation, never supplied by the caller.
            return this.ports.materials.saveMaterial(material.id, workText(payload.expectedVersion), payload.expectedContent, payload.next);
        }
        if (command === "materials.capture") {
            if(this.ports.allowsFileWrite?.(lease)===false)throw new WorkspaceError("FILE_WRITE_AUTHORIZATION_REQUIRED");
            await content.read(binding.scope);await check();
            if (typeof payload.text !== "string" || payload.text.length > 262144 || payload.html !== undefined && typeof payload.html !== "string" || payload.title !== undefined && typeof payload.title !== "string")
                throw new WorkspaceError("INVALID_CAPTURE");
            if (payload.role !== undefined && !["input", "reference", "draft", "output"].includes(String(payload.role)))
                throw new WorkspaceError("INVALID_CAPTURE_ROLE");
            const requestKey = await this.contentId(call, payload.requestKey);
            await check();
            return this.ports.materials.capture({ requestKey, text: payload.text, sourceUuid: binding.scope.rootUuid, ...(payload.html !== undefined ? { html: payload.html as string } : {}), ...(payload.title !== undefined ? { title: payload.title as string } : {}), ...(payload.role !== undefined ? { role: payload.role as "input" | "reference" | "draft" | "output" } : {}) }, "agent",false);
        }
        if (command === "materials.associate") {
            if(this.ports.allowsFileWrite?.(lease)===false)throw new WorkspaceError("FILE_WRITE_AUTHORIZATION_REQUIRED");
            await content.read(binding.scope);await check();
            if (payload.id !== undefined && payload.path !== undefined)
                throw new WorkspaceError("AMBIGUOUS_MATERIAL");
            if (payload.id !== undefined) {
                const material = await this.material(payload.id, binding);
                await check();
                return this.ports.materials.associateMaterial({ id: material.id, sourceUuid: binding.scope.rootUuid });
            }
            // Absolute path is supplied only by the authenticated Node adapter after confinement.
            const path = workText(payload.path, 4096);
            if (!path.startsWith(`${binding.directory}/`))
                throw new WorkspaceError("PATH_OUTSIDE_SCOPE");
            return this.ports.materials.associateMaterial({ path, sourceUuid: binding.scope.rootUuid });
        }
        if(command.startsWith("reading.")) {
            const work=this.ports.work;if(!work)throw new WorkspaceError("READING_UNAVAILABLE");
            const state=work.readingAPI.read();
            if(!state.scope||!sameWorkScope(state.scope,binding.scope))throw new WorkspaceError("VIEW_SCOPE_MISMATCH");
            const generation=this.generation,owner=JSON.stringify([call.instanceId,call.connectionId,call.clientId]);
            const checked=async()=>{await check();if(generation!==this.generation)throw new WorkspaceError("CONNECTION_REVOKED");};
            if(command==="reading.read")return state;
            if(command==="reading.request") {
                const result=await work.readingAPI.request({schemaVersion:1,purpose:workText(payload.purpose,240)});
                try {await checked();}catch(error){if(result.ok)work.readingAPI.cancel(result.value.requestId);throw error;}
                if(result.ok) {
                    this.readingRequests.set(result.value.requestId,owner);
                    const active=new Set(work.readingAPI.read().pendingRequests);
                    for(const id of this.readingRequests.keys())if(!active.has(id))this.readingRequests.delete(id);
                }
                return result;
            }
            if(command==="reading.submit") {
                // These two fields are inspected without accessing a caller getter;
                // the reading controller owns the complete closed schema validation.
                const raw=workRecord(payload.plan,["schemaVersion","requestId","planId","name","scope","structureVersion","sourceSetVersion","sourceVersions","layout"]);
                if(this.readingRequests.get(workText(raw.requestId))!==owner)throw new WorkspaceError("READING_REQUEST_NOT_OWNED");
                await checked();const result=await work.readingAPI.submit(payload.plan);await checked();
                if(result.ok) {this.readingPlans.set(result.value.planId,owner);
                    const active=new Set(work.readingAPI.read().plans.map(plan=>plan.planId));
                    for(const id of this.readingPlans.keys())if(!active.has(id))this.readingPlans.delete(id);
                }
                return result;
            }
            if(command==="reading.cancel") {
                const id=workText(payload.requestId);if(this.readingRequests.get(id)!==owner)throw new WorkspaceError("READING_REQUEST_NOT_OWNED");
                const result=work.readingAPI.cancel(id);this.readingRequests.delete(id);return result;
            }
            if(command==="reading.select") {
                const id=workText(payload.planId);if(this.readingPlans.get(id)!==owner)throw new WorkspaceError("READING_PLAN_NOT_OWNED");
                const result=await work.readingAPI.select(id);await checked();return result;
            }
            if(command==="reading.original") {const result=await work.readingAPI.select(null);await checked();return result;}
            if(command==="reading.highlight") {const result=await work.reportAPI.highlight(payload.input);await checked();return result;}
            if(command==="reading.clear") {work.reportAPI.clearHighlight();return {ok:true,value:null};}
        }
        if (command.startsWith("focus.")) {
            const work = this.ports.work;
            if (!work)
                throw new WorkspaceError("FOCUS_UNAVAILABLE");
            if (command === "focus.request") {
                await work.open(binding.scope.rootUuid);
                await check();
                const read = work.lensesAPI.read();
                if (!read.scope || !sameWorkScope(read.scope, binding.scope))
                    throw new WorkspaceError("VIEW_SCOPE_MISMATCH");
                const request = work.lensesAPI.request({ schemaVersion: 1, question: workText(payload.question, 240) });
                if (request.ok) {
                    this.questions.set(request.value.requestId, call.clientId);
                    if (this.questions.size > 64)
                        this.questions.delete(this.questions.keys().next().value!);
                }
                return request;
            }
            const state = work.lensesAPI.read();
            if (!state.scope || !sameWorkScope(state.scope, binding.scope))
                throw new WorkspaceError("VIEW_SCOPE_MISMATCH");
            if (command === "focus.source")
                return work.lensesAPI.source();
            if (command === "focus.read")
                return state;
            if (command === "focus.apply") {
                const plan = workRecord(payload.plan, ["schemaVersion", "requestId", "scope", "question", "structureVersion", "sourceSetVersion", "sourceVersions", "visibleRanges", "emphasisRanges", "gaps", "temporaryInference"]);
                if (this.questions.get(workText(plan.requestId)) !== call.clientId)
                    throw new WorkspaceError("FOCUS_REQUEST_NOT_OWNED");
                return work.lensesAPI.apply(payload.plan);
            }
            if (state.pending && this.questions.get(state.pending.requestId) !== call.clientId)
                throw new WorkspaceError("FOCUS_REQUEST_NOT_OWNED");
            if (command === "focus.cancel")
                return work.lensesAPI.cancel();
            if (command === "focus.exit")
                return work.lensesAPI.exit();
            return work.lensesAPI.back();
        }
        if (command === "content.apply") {
            const patch = await this.patch(call, payload.patch);
            await check();
            return this.ports.content.trustedAgent.apply(patch,this.origin(call));
        }
        if (command === "content.result")
            return content.result(await this.contentId(call, payload.requestId));
        if (command === "content.recover")
            return content.recover(await this.contentId(call, payload.requestId));
        if (command === "content.pending")
            return content.pending();
        if (command === "content.retry") {
            const input = { previousRequestId: await this.contentId(call, payload.previousRequestId), patch: await this.patch(call, payload.patch) };
            await check();
            return this.ports.content.trustedAgent.retry(binding.scope,input.previousRequestId,input.patch,this.origin(call));
        }
        if (command === "stage.read" || command === "stage.submit") {
            if (!this.ports.stage)
                return { status: "unavailable", reason: "STAGE_PROVIDER_UNAVAILABLE" };
            let input = payload.input;
            if (command === "stage.submit") {
                const value = workRecord(input, ["stageId", "expectedRevision", "patch", "correctionOf"]);
                input = { ...value, patch: await this.patch(call, value.patch) };
            }
            await check();
            try {
                const result = command==="stage.read"?await this.ports.stage.read(input,binding):await this.ports.stage.submit(input,binding,this.origin(call));
                await check();
                return result;
            }
            catch (error) {
                // A stage lifetime failure after dispatch does not prove the source
                // remained unchanged. The same client can query its content Journal.
                if (command === "stage.submit" && error instanceof Error && /(?:SCOPE|CONNECTION)_REVOKED/u.test(error.message))
                    throw new WorkspaceError("TRANSPORT_OUTCOME_UNKNOWN", "Stage submission lost its scope confirmation; query the original content request before retrying.");
                throw error;
            }
        }
        throw new WorkspaceError("UNKNOWN_COMMAND");
    }
}
