import test from "node:test";
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir, readdir, stat, rename, realpath, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { startWorkspaceServer } from "../../task-copilot-cli/src/workspace-server.ts";
import { contentFixture, deferred } from "./fixtures/content-writeback.ts";
import type { StageInstallation } from "../src/features/stage-workbench/installer.ts";
const exec = promisify(execFile), repo = resolve(import.meta.dirname, "../../..");
test("independent CLI processes use installed plugin data, real filesystem and persistent content Journal with Kernel disabled", async () => {
    const f = await contentFixture(), root = await realpath(await mkdtemp(join(tmpdir(), "agent-entry-"))), directory = join(root, "work"), state = join(root, "private");
    await mkdir(directory);
    let server = await startWorkspaceServer({ stateDirectory: state }), unloaded = false;
    try {
        (f.browser as unknown as {
            apis: unknown;
        }).apis = { doAction: async (args: unknown[]) => {
                const [command, ...values] = args;
                if (command === "readFile")
                    return readFile(String(values[0]), "utf8");
                if (command === "writeFile")
                    return writeFile(String(values[1]), String(values[2]));
                if (command === "mkdir-recur")
                    return mkdir(String(values[0]), { recursive: true });
                if (command === "rename")
                    return rename(String(values[0]), String(values[1]));
                if (command === "stat") {
                    try {
                        const info = await stat(String(values[0]));
                        return { mode: info.mode, size: info.size };
                    }
                    catch (error) {
                        if ((error as {
                            code: string;
                        }).code === "ENOENT")
                            return null;
                        throw error;
                    }
                }
                if (command === "listdir") {
                    try {
                        return (await readdir(String(values[0]))).map(name => join(String(values[0]), name));
                    }
                    catch (error) {
                        if ((error as {
                            code: string;
                        }).code === "ENOENT")
                            return null;
                        throw error;
                    }
                }
                throw Error(`unsupported host action ${String(command)}`);
            }, openPath: async () => { } };
        logseq.settings = { disabled: false, tasksEnabled: false, materialsEnabled: true, workViewEnabled: true, materialsAutoCapture: false, agentWorkspaceDescriptor: server.pluginDescriptorPath };
        const insert = logseq.Editor.insertBlock.bind(logseq.Editor);
        logseq.Editor.insertBlock = ((target: string, text: string, options: Record<string, unknown> = {}) => { assert.equal(options.focus, false); return insert(target, text, { ...options, customUUID: options.customUUID ?? crypto.randomUUID() } as never); }) as typeof logseq.Editor.insertBlock;
        logseq.Editor.getPage = (async () => ({ id: 1, name: "synthetic page", originalName: "synthetic page" })) as unknown as typeof logseq.Editor.getPage;
        await import(`../src/index.ts?agent-workspace=${Date.now()}`);
        await f.boot();
        const api = (f.browser as unknown as {
            taskCopilotWorkbench: {
                workspace: {
                    bind: (input: unknown) => Promise<unknown>;
                    unbind: (input: unknown) => Promise<void>;
                    associate: (input: unknown) => Promise<unknown>;
                };
                agentWorkspace: {
                    status: () => {
                        connected: boolean;
                    };
                };
                content: {
                    scope: () => unknown;
                };
                stages: StageInstallation["api"];
                open: (id: string) => Promise<void>;
                openMaterial: (id: string) => Promise<void>;
                materials: {
                    read: (id: string) => Promise<{
                        content: string;
                    }>;
                    capture: (input: unknown) => Promise<{
                        material: {
                            id: string;
                        };
                    }>;
                };
            };
        }).taskCopilotWorkbench;
        // The production Registry owns identity and binding; the external CLI cannot bind.
        await api.workspace.bind({ scope: f.scope, directory });
        await f.commands.get("agent-workspace-allow")!();
        assert.equal(api.agentWorkspace.status().connected, true, JSON.stringify(f.messages));
        const cli = async (words: string[], input?: unknown, client = "one") => {
            const inputArgs: string[] = [];
            if (input !== undefined) {
                const path = join(root, `input-${crypto.randomUUID()}.json`);
                await writeFile(path, JSON.stringify(input));
                inputArgs.push("--input-file", path);
            }
            try {
                const result = await exec(process.execPath, ["--import", "tsx", join(repo, "apps/task-copilot-cli/src/main.ts"), "workspace", ...words, ...inputArgs, "--directory", directory, "--state-dir", state, "--client", client, "--json"], { cwd: repo, timeout: 30000 });
                return JSON.parse(result.stdout);
            }
            catch (error) {
                const failure = error as {
                    stderr: string;
                };
                throw new Error(failure.stderr || String(error), { cause: error });
            }
        };
        const status = await cli(["status"]);
        assert.equal(status.formalKernelRequired, false);
        assert.equal(status.formalWorkspace, "connected");
        assert.equal(status.capabilities.content, true);
        assert.equal(status.capabilities.stage, true);
        assert.deepEqual(await cli(["stage", "read"], {}), { status: "unavailable", reason: "STAGE_CURRENT_UNAVAILABLE" });
        const refreshed = await cli(["refresh"]);
        assert.equal(refreshed.freshness, "checked");
        const block = refreshed.snapshot.blocks.find((item: {
            target: {
                blockUuid: string;
            };
        }) => item.target.blockUuid === f.a);
        assert.equal(block.content, f.blocks.get(f.a)!.content);
        assert.equal(block.contentVersion, createHash("sha256").update(block.content).digest("hex"));
        assert.equal((await cli(["read"])).freshness, "last-known");
        const retainedRoot = f.blocks.get(f.root)!;
        f.blocks.delete(f.root);
        await assert.rejects(cli(["refresh"]), /SOURCE_UNAVAILABLE/);
        assert.equal((await cli(["read"])).snapshot.blocks.find((item: {
            target: {
                blockUuid: string;
            };
        }) => item.target.blockUuid === f.a).contentVersion, block.contentVersion);
        f.blocks.set(f.root, retainedRoot);
        assert.equal((await cli(["refresh"])).freshness, "checked");
        await writeFile(join(directory, "added.txt"), "直接加入的文本");
        await writeFile(join(directory, "binary.pdf"), Buffer.from([0, 255, 32]));
        await symlink(root, join(directory, "link"));
        const observed = await cli(["files", "list"]);
        assert.ok(observed.observation.files.some((file: {
            path: string;
        }) => file.path === "added.txt"));
        assert.equal((await cli(["files", "read", "binary.pdf"])).read, "metadata");
        assert.equal((await cli(["files", "read", "added.txt"])).content, "直接加入的文本");
        await assert.rejects(cli(["files", "read", "link/input.json"]), /SYMLINK_RESTRICTED/);
        await assert.rejects(cli(["files", "read", "../escape"]), /PATH_OUTSIDE_SCOPE/);
        const associated = await cli(["files", "associate", "added.txt"]);
        assert.equal(await readFile(join(directory, "added.txt"), "utf8"), "直接加入的文本");
        assert.equal((await cli(["files", "list"])).observation.files.find((item: {
            path: string;
        }) => item.path === "added.txt").materialId, associated.material.id);
        await assert.rejects(cli(["materials", "save"], { id: associated.material.id, expectedVersion: "0".repeat(64), expectedContent: "直接加入的文本", next: "agent change" }), /MATERIAL_AGENT_WRITE_FORBIDDEN/);
        const captured = await cli(["materials", "capture"], { requestKey: "output-1", text: "# 草稿\n\n可修订" });
        assert.equal(captured.material.capabilities.edit.agent, true);
        const saved = await cli(["materials", "save"], { id: captured.material.id, expectedVersion: captured.material.version, expectedContent: captured.material.content, next: "# 草稿\n\n真实修订" });
        assert.equal(saved.status, "success");
        assert.equal((await api.materials.read(captured.material.id)).content, "# 草稿\n\n真实修订");
        const makePatch = (snapshot: typeof refreshed.snapshot, requestId: string, text: string) => {
            const a = snapshot.blocks.find((item: {
                target: {
                    blockUuid: string;
                };
            }) => item.target.blockUuid === f.a), start = a.content.indexOf("Alpha");
            return { schemaVersion: 1, requestId, scope: snapshot.scope, operations: [{ operationId: "replace", type: "replace-text", target: a.target, expectedContentVersion: a.contentVersion, expectedParentUuid: a.parentUuid, range: { start, end: start + 5 }, expectedText: "Alpha", text }] };
        };
        const before = await cli(["content", "read"]), patch = makePatch(before, "patch-1", "Omega"), writes = f.counts().writes;
        const applied = await cli(["content", "apply"], patch);
        assert.equal(applied.status, "complete");
        assert.equal(applied.durable, true);
        assert.ok(f.blocks.get(f.a)!.content.startsWith("Omega"));
        assert.equal((await cli(["content", "result", "patch-1"])).record.digest, applied.record.digest);
        assert.equal((await cli(["content", "apply"], patch)).status, "complete");
        assert.equal(f.counts().writes, writes + 1);
        assert.equal(await cli(["content", "result", "patch-1"], undefined, "two"), null);
        const conflict = await cli(["content", "apply"], { ...patch, requestId: "conflict-1" });
        assert.equal(conflict.record.items[0].status, "CONFLICT");
        assert.equal(conflict.record.patch.operations[0].text, "Omega");
        assert.ok(f.blocks.get(f.a)!.content.startsWith("Omega"));
        await assert.rejects(cli(["content", "apply"], { ...patch, requestId: "forged", actor: "user" }), /UNSUPPORTED_FIELD/);
        const todo = f.add("TODO 局部事项");
        const todoSource = await cli(["content", "read"]), todoBlock = todoSource.blocks.find((item: {
            target: {
                blockUuid: string;
            };
        }) => item.target.blockUuid === todo.uuid);
        const blocked = await cli(["content", "apply"], { schemaVersion: 1, requestId: "todo", scope: todoSource.scope, operations: [{ operationId: "todo", type: "replace-text", target: todoBlock.target, expectedContentVersion: todoBlock.contentVersion, expectedParentUuid: todoBlock.parentUuid, range: { start: 0, end: 4 }, expectedText: "TODO", text: "DONE" }] });
        assert.equal(blocked.record.items[0].status, "BLOCKED");
        assert.equal(todo.content, "TODO 局部事项");
        const guardSource = await cli(["content", "read"]), guardBlock = guardSource.blocks.find((item: {
            target: {
                blockUuid: string;
            };
        }) => item.target.blockUuid === f.b);
        const bodyPatch = { schemaVersion: 1, requestId: "lost-reply", scope: guardSource.scope, operations: [{ operationId: "replace", type: "replace-text", target: guardBlock.target, expectedContentVersion: guardBlock.contentVersion, expectedParentUuid: guardBlock.parentUuid, range: { start: 0, end: 3 }, expectedText: "另一个", text: "新的" }] };
        await assert.rejects(cli(["content", "apply"], { ...bodyPatch, requestId: "wrong-scope", scope: { ...guardSource.scope, rootUuid: f.b } }), /SCOPE_MISMATCH/);
        f.editing(f.b);
        const guarded = await cli(["content", "apply"], { ...bodyPatch, requestId: "native-draft" });
        assert.equal(guarded.record.items[0].status, "BLOCKED");
        f.editing(false);
        const entered = deferred<void>(), release = deferred<void>();
        f.onWrite(async (uuid, text) => { entered.resolve(); await release.promise; f.blocks.get(uuid)!.content = text; });
        const lostPath = join(root, "lost-reply.json");
        await writeFile(lostPath, JSON.stringify(bodyPatch));
        const child = spawn(process.execPath, ["--import", "tsx", join(repo, "apps/task-copilot-cli/src/main.ts"), "workspace", "content", "apply", "--input-file", lostPath, "--directory", directory, "--state-dir", state, "--client", "one", "--json"], { cwd: repo, stdio: "ignore" });
        const closed = new Promise<void>(yes => child.once("close", () => yes()));
        await entered.promise;
        child.kill("SIGTERM");
        await closed;
        release.resolve();
        const recovered = await cli(["content", "result", "lost-reply"]);
        assert.equal(recovered.status, "complete");
        assert.equal(recovered.durable, true);
        const afterLostWrites = f.counts().writes;
        assert.equal((await cli(["content", "apply"], bodyPatch)).record.digest, recovered.record.digest);
        assert.equal(f.counts().writes, afterLostWrites);
        f.onWrite(null);
        await api.open(f.root);
        const readingRequest=await cli(["reading","request","--purpose","同一原文先连续读，再做对照"]);
        assert.equal(readingRequest.ok,true);
        const readingSource=readingRequest.value.source,readingIds=readingSource.blocks.map((item:{sourceId:string})=>item.sourceId);
        const readingPlan={schemaVersion:1,requestId:readingRequest.value.requestId,planId:"cli-continuous",name:"CLI 连续读原句",scope:readingSource.scope,
            structureVersion:readingSource.structureVersion,sourceSetVersion:readingSource.sourceSetVersion,
            sourceVersions:readingSource.blocks.map((item:{sourceId:string;contentVersion:string})=>({sourceId:item.sourceId,contentVersion:item.contentVersion})),
            layout:[{kind:"paragraphs",key:"all",sourceIds:readingIds}]};
        const beforeReading=f.counts().writes;
        await assert.rejects(cli(["reading","submit"],readingPlan,"two"),/READING_REQUEST_NOT_OWNED/);
        assert.equal((await cli(["reading","submit"],readingPlan)).value.status,"selected");
        assert.equal((await cli(["reading","submit"],readingPlan)).value.status,"already-selected");
        assert.equal((await cli(["reading","read"])).capabilities.writesSource,false);
        assert.equal((await cli(["reading","read"])).capabilities.authorizesTodo,false);
        assert.equal(f.browser.document.querySelectorAll(".wb-reading-paragraphs").length,1);
        const comparison={...readingPlan,planId:"cli-comparison",name:"CLI 分段对照",layout:[
            {kind:"sequence",key:"root",sourceIds:readingIds.slice(0,1)},
            {kind:"comparison",key:"compare",title:"两部分原句",columns:[
                {key:"first",title:"先读",children:[{kind:"paragraphs",key:"first-body",sourceIds:readingIds.slice(1,2)}]},
                {key:"rest",title:"再读",children:[{kind:"sequence",key:"rest-body",sourceIds:readingIds.slice(2)}]}
            ]}]};
        assert.equal((await cli(["reading","submit"],comparison)).ok,true);
        assert.equal(f.browser.document.querySelectorAll(".wb-reading-column").length,2);
        await assert.rejects(cli(["reading","select","cli-comparison"],undefined,"two"),/READING_PLAN_NOT_OWNED/);
        assert.equal((await cli(["reading","original"])).ok,true);
        assert.equal((await cli(["reading","read"])).activePlanId,null);
        assert.equal((await cli(["reading","select","cli-continuous"])).ok,true);
        assert.equal(f.counts().writes,beforeReading,"reading CLI calls must not invoke Graph writes");
        assert.equal((await cli(["reading","cancel",readingRequest.value.requestId])).ok,true);
        await assert.rejects(cli(["reading","submit"],comparison),/READING_REQUEST_NOT_OWNED/);
        const requested = await cli(["focus", "request", "--question", "保留条件与反证"]), source = await cli(["focus", "source"]);
        assert.equal(requested.ok, true);
        assert.equal(source.ok, true);
        const selected = source.value.blocks.find((item: {
            target: {
                blockUuid: string;
            };
        }) => item.target.blockUuid === f.a), parent = source.value.blocks[0];
        const plan = { ...requested.value, structureVersion: source.value.structureVersion, sourceVersions: [parent, selected].map(item => ({ sourceId: item.sourceId, contentVersion: item.contentVersion })), visibleRanges: [{ unit: "block", sourceId: selected.sourceId, contentVersion: selected.contentVersion }] };
        assert.equal((await cli(["focus", "apply"], plan)).ok, true);
        assert.equal((f.browser.document.querySelector(`.wb-row[data-uuid="${f.b}"]`) as unknown as HTMLElement).hidden, true);
        assert.equal((f.browser.document.querySelector(`.wb-row[data-uuid="${f.root}"]`) as unknown as HTMLElement).hidden, false);
        await api.openMaterial(captured.material.id);
        await api.open(f.root);
        assert.equal((await cli(["focus", "read"])).plan.question, "保留条件与反证");
        await cli(["focus", "request", "--question", "新问题"]);
        assert.equal((await cli(["focus", "apply"], plan)).reason, "superseded-request");
        await assert.rejects(cli(["focus", "apply"], plan, "two"), /FOCUS_REQUEST_NOT_OWNED/);
        const changedRequest = await cli(["focus", "request", "--question", "来源变化"]), changedSource = (await cli(["focus", "source"])).value;
        f.blocks.get(f.a)!.content += "\n用户改变了条件";
        assert.equal((await cli(["focus", "apply"], { ...plan, ...changedRequest.value, structureVersion: changedSource.structureVersion })).ok, false);
        // A local user starts the stage; external clients consume only its formal
        // read/submit port, preserving immutable facts and private acceptance.
        const stage = await api.stages.begin({ goal: "核验三分支整合", requestKey: crypto.randomUUID(), expectedStageId: null });
        assert.equal((await cli(["stage", "read"], { stageId: stage.start.id })).start.id, stage.start.id);
        assert.equal((await cli(["stage", "read"], {})).start.id, stage.start.id);
        const stageSnapshot = await cli(["content", "read"]), stageBlock = stageSnapshot.blocks.find((item: {target: {blockUuid: string}}) => item.target.blockUuid === f.a);
        const stagePatch = { schemaVersion: 1, requestId: "stage-patch", scope: stageSnapshot.scope, metadata: { stageId: stage.start.id, runId: "explicit-run" }, operations: [{ operationId: "replace", type: "replace-text", target: stageBlock.target, expectedContentVersion: stageBlock.contentVersion, expectedParentUuid: stageBlock.parentUuid, range: { start: 0, end: 5 }, expectedText: "Omega", text: "Sigma" }] };
        const stageInput = { stageId: stage.start.id, expectedRevision: stage.start.id, patch: stagePatch };
        const stageWrites = f.counts().writes, stageResult = await cli(["stage", "submit"], stageInput);
        assert.equal(stageResult.status, "complete");
        assert.equal(stageResult.durable, true);
        assert.equal(stageResult.stageProblem, null);
        assert.ok(stageResult.stageRevision);
        assert.ok(f.blocks.get(f.a)!.content.startsWith("Sigma"));
        assert.equal((await cli(["content", "result", "stage-patch"])).record.digest, stageResult.record.digest);
        assert.equal((await cli(["stage", "submit"], stageInput)).stageRevision, stageResult.stageRevision);
        assert.equal(f.counts().writes, stageWrites + 1);
        const stageRead = await cli(["stage", "read"], { stageId: stage.start.id });
        assert.equal(stageRead.revisions.at(-1).facts.at(-1).record.digest, stageResult.record.digest);
        assert.equal(stageRead.acceptances.length, 0);
        assert.equal(stageRead.revisions.at(-1).facts.at(-1).record.origin.kind, "local-capability");
        assert.equal(await cli(["content", "result", "stage-patch"], undefined, "two"), null);
        await assert.rejects(cli(["stage", "submit"], { ...stageInput, actor: "user", accepted: true }), /UNSUPPORTED_FIELD/);
        await assert.rejects(cli(["stage", "submit"], { ...stageInput, patch: { ...stagePatch, scope: { ...stageSnapshot.scope, rootUuid: f.b } } }), /SCOPE_MISMATCH/);
        await assert.rejects(cli(["stage", "accept"], { stageId: stage.start.id }), /CLI_USAGE/);
        // New structure operations go through the same independent CLI, private
        // companion, installed content executor and formal stage provider.
        assert.equal((await cli(["capabilities"])).contentProtocol.structureAuthorized,false);
        const makeMove=async(id:string)=>{
            const read=await cli(["content","read"]),a=read.blocks.find((b:{target:{blockUuid:string}})=>b.target.blockUuid===f.a),b=read.blocks.find((b:{target:{blockUuid:string}})=>b.target.blockUuid===f.b);
            return {schemaVersion:2,requestId:id,scope:read.scope,metadata:{stageId:stage.start.id,runId:null},operations:[{operationId:"move",type:"move-block",target:a.target,expectedContentVersion:a.contentVersion,expectedParentUuid:a.parentUuid,destination:b.target,expectedDestinationVersion:b.contentVersion,expectedDestinationParentUuid:b.parentUuid,position:"after",expectedStructureVersion:read.structureVersion}]};
        };
        const deniedMove=await cli(["content","apply"],await makeMove("text-only-move"));
        assert.equal(deniedMove.record.items[0].reason,"STRUCTURE_AUTHORIZATION_REQUIRED");
        await f.commands.get("agent-workspace-organize")!();
        assert.equal((await cli(["capabilities"])).contentProtocol.structureAuthorized,true);
        const movePatch=await makeMove("pure-move"),moveInput={stageId:stage.start.id,expectedRevision:stageResult.stageRevision,patch:movePatch},beforeMove=f.counts().moves;
        const moved=await cli(["stage","submit"],moveInput);
        assert.equal(moved.status,"complete",JSON.stringify(moved));assert.equal(moved.stageProblem,null);assert.equal(moved.record.items[0].move.verified,true);
        const movedStage=await cli(["stage","read"],{stageId:stage.start.id});
        assert.notEqual(movedStage.revisions.at(-1).source.structureVersion,stageRead.revisions.at(-1).source.structureVersion);
        assert.equal((await cli(["content","result","pure-move"])).record.digest,moved.record.digest);
        assert.equal((await cli(["content","recover","pure-move"])).status,"complete");
        assert.equal((await cli(["stage","submit"],moveInput)).stageRevision,moved.stageRevision);assert.equal(f.counts().moves,beforeMove+1);
        // Historical source facts survive a later native move with unchanged text.
        const history=JSON.stringify(movedStage);f.nativeMove(f.a,f.b,{before:true});
        assert.equal(JSON.stringify(await cli(["stage","read"],{stageId:stage.start.id})),history);
        assert.equal((await cli(["content","apply"],movePatch)).record.digest,moved.record.digest);assert.equal(f.counts().moves,beforeMove+1);
        await cli(["sessions", "add", "--platform", "codex", "--session-id", "chosen"]);
        assert.equal((await cli(["sessions", "list"])).references[0].url, null);
        // A full bridge restart rotates descriptors and requires a fresh local grant.
        await server.close();
        assert.equal((await cli(["read"])).freshness, "last-known");
        server = await startWorkspaceServer({ stateDirectory: state });
        await assert.rejects(cli(["status"]), /DESCRIPTOR_STALE/);
        await f.commands.get("agent-workspace-allow")!();
        assert.equal((await cli(["content", "result", "patch-1"])).record.digest, applied.record.digest);
        assert.equal((await cli(["content", "result", "stage-patch"])).record.digest, stageResult.record.digest);
        assert.equal((await cli(["stage", "read"], {})).revisions.at(-1).id, moved.stageRevision);
        await api.workspace.bind({ scope: f.scope, directory });
        await assert.rejects(cli(["refresh"]), /WORKSPACE_OFFLINE|CONNECTION_REVOKED/);
        await f.commands.get("agent-workspace-allow")!();
        await api.workspace.unbind(f.scope);
        await assert.rejects(cli(["refresh"]), /WORKSPACE_OFFLINE|CONNECTION_REVOKED/);
        await api.workspace.bind({ scope: f.scope, directory });
        await f.commands.get("agent-workspace-allow")!();
        const externalDirectory = join(root, "explicit-materials");
        await mkdir(externalDirectory);
        const externalRoot = f.add("明确关联的另一份材料工作", "");
        await api.workspace.bind({ scope: { ...f.scope, rootUuid: externalRoot.uuid }, directory: externalDirectory });
        const externalMaterial = await api.materials.capture({ requestKey: "explicit-material", text: "# 外部材料\n\n明确选取", sourceUuid: externalRoot.uuid });
        await api.workspace.associate({ scope: f.scope, source: { kind: "material", id: externalMaterial.material.id } });
        await f.commands.get("agent-workspace-allow")!();
        assert.ok((await cli(["materials", "list"])).materials.some((item: {
            id: string;
        }) => item.id === externalMaterial.material.id));
        assert.equal((await cli(["materials", "read", externalMaterial.material.id])).content, "# 外部材料\n\n明确选取");
        f.graph("B");
        await assert.rejects(cli(["refresh"]), /WORKSPACE_OFFLINE|CONNECTION_REVOKED/);
        assert.equal(api.agentWorkspace.status().connected, false);
        await f.unload();
        unloaded = true;
        assert.equal((f.browser as unknown as {
            taskCopilotWorkbench?: unknown;
        }).taskCopilotWorkbench, undefined);
    }
    finally {
        if (!unloaded)
            await f.unload();
        await server.close();
        await f.cleanup();
        await rm(root, { recursive: true, force: true });
    }
});
