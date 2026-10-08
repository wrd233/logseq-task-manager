import test from "node:test";
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir, readdir, stat, rename, realpath, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
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
                openPage: (name:string) => Promise<void>;
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
        const cli = async (words: string[], input?: unknown, client = "one",workDirectory=directory) => {
            const inputArgs: string[] = [];
            if (input !== undefined) {
                const path = join(root, `input-${crypto.randomUUID()}.json`);
                await writeFile(path, JSON.stringify(input));
                inputArgs.push("--input-file", path);
            }
            try {
                const result = await exec(process.execPath, ["--import", "tsx", join(repo, "apps/task-copilot-cli/src/main.ts"), "workspace", ...words, ...inputArgs, "--directory", workDirectory, "--state-dir", state, "--client", client, "--json"], { cwd: repo, timeout: 30000 });
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
        await f.commands.get("agent-workspace-read")!();
        const readStatus=await cli(["status"]);assert.equal(readStatus.capabilities.content,false);assert.equal(readStatus.capabilities.fileWrite,false);assert.equal(readStatus.contentProtocol.structureAuthorized,false);
        // Upgrade from the actual work menu, tied to its real root even if the
        // native selection changes. A new body connection cannot inherit files
        // or TODO and must not grant structure maintenance.
        await api.open(f.root);await f.commands.get("agent-workspace-files")!();assert.equal((await cli(["status"])).capabilities.fileWrite,true);
        const beforeUpgrade=f.counts(),bodyGrant=document.querySelector<HTMLButtonElement>('[data-action-label="允许 Agent 维护这里正文"]')!;assert.ok(bodyGrant);
        f.editing(f.a);bodyGrant.click();
        for(let i=0;i<500&&!(await cli(["status"])).capabilities.content;i++)await delay(10);
        const bodyStatus=await cli(["status"]);assert.equal(bodyStatus.binding.scope.rootUuid,f.root);assert.equal(bodyStatus.capabilities.content,true);assert.equal(bodyStatus.capabilities.fileWrite,false);assert.equal(bodyStatus.authorizesTodo,false);assert.equal(bodyStatus.contentProtocol.structureAuthorized,false);assert.deepEqual(f.counts().writes,beforeUpgrade.writes);
        f.editing(false);await f.commands.get("agent-workspace-read")!();
        const readonlyCounts=f.counts(),deniedPatch=f.patch([await f.text(f.a,"Alpha","must remain saved")]);
        await assert.rejects(cli(["content","apply"],deniedPatch),/CONTENT_WRITE_AUTHORIZATION_REQUIRED/);
        await assert.rejects(cli(["materials","capture"],{requestKey:"read-must-not-capture",text:"must not become a file"}),/FILE_WRITE_AUTHORIZATION_REQUIRED/);
        const firstGuide=await cli(["guidance","read"]);assert.equal(firstGuide.automaticAgentReload,false);
        await assert.rejects(cli(["collaboration","refresh"]),/COLLABORATION_CONTEXT_REQUIRED/);
        f.editing(f.a);await f.commands.get("agent-workspace-collaboration")!();
        const form=document.querySelector<HTMLElement>('[data-collaboration="true"]')!,request=form.querySelector<HTMLTextAreaElement>("textarea")!;
        request.value="先比较取消条款，保留尚未询问的条件。";request.dispatchEvent(new f.browser.Event("input") as unknown as Event);
        const prepare=Array.from(form.querySelectorAll<HTMLButtonElement>("button")).find(b=>b.textContent==="连接并准备协作现场")!;prepare.click();
        for(let i=0;i<500&&!form.textContent!.includes("现场已核验并保存");i++)await delay(10);
        assert.match(form.textContent!,/现场已核验并保存/);
        const packet=await cli(["collaboration","read"]);assert.equal(packet.scene.request,request.value);assert.equal(packet.scene.nativeDraft.included,false);assert.equal(packet.scene.nativeDraft.editing,true);
        assert.equal(packet.current.sourceMatches,true);assert.equal(packet.current.guidanceMatches,true);assert.equal(packet.scene.permissions.bodyWrite,false);assert.equal(packet.scene.permissions.fileWrite,false);assert.equal(packet.scene.permissions.ordinaryTodo,false);
        assert.equal(packet.files.binding.directory,directory);assert.deepEqual(packet.sessions.references,[]);assert.equal(JSON.stringify(packet).includes("uncommitted draft"),false);
        assert.deepEqual(f.counts().writes,readonlyCounts.writes);assert.equal(f.counts().identities,readonlyCounts.identities);
        const guideInputs=form.querySelectorAll<HTMLTextAreaElement>("details textarea"),common=guideInputs[0]!,project=guideInputs[1]!;
        common.value=firstGuide.common.text+"\n\n共同补充：保留问号。";project.value="只在这份报价工作中先核对取消条款。";
        Array.from(form.querySelectorAll<HTMLButtonElement>("button")).find(b=>b.textContent==="明确保存共同指导")!.click();
        for(let i=0;i<100&&!form.textContent!.includes("共同指导已保存");i++)await delay(10);
        assert.match(form.textContent!,/共同指导已保存/);
        Array.from(form.querySelectorAll<HTMLButtonElement>("button")).find(b=>b.textContent==="仅保存这份工作的差异")!.click();
        for(let i=0;i<100&&!form.textContent!.includes("项目差异已读回核验");i++)await delay(10);
        const newGuide=await cli(["guidance","read"]);assert.notEqual(newGuide.common.version,firstGuide.common.version);assert.equal(newGuide.project.text,project.value);
        const oldScene=await cli(["collaboration","read"]);assert.equal(oldScene.current.guidanceMatches,false);assert.equal(oldScene.scene.guidance.common.version,firstGuide.common.version);
        const newScene=await cli(["collaboration","refresh"]);assert.equal(newScene.guidance.common.version,newGuide.common.version);assert.equal(newScene.guidance.project.version,newGuide.project.version);
        f.editing(false);
        const formatNode=f.add("[想法] 可能去湖边，尚未询问。");
        const formatSource=await cli(["content","read"]),formatBlock=formatSource.blocks.find((b:{target:{blockUuid:string}})=>b.target.blockUuid===formatNode.uuid),beforeFormatWrites=f.counts().writes;
        const formatInput={requestId:"format-one",sourceIds:[formatBlock.sourceId]};
        assert.equal(readStatus.formattingProtocol.externalApply,false);assert.equal(readStatus.formattingProtocol.application,"local-user-exact-diff");
        await assert.rejects(cli(["formatting","preview"],{...formatInput,approved:true}),/UNSUPPORTED_FIELD/u);
        const formatProposal=await cli(["formatting","preview"],formatInput);assert.equal(formatProposal.writesSource,false);assert.equal(formatProposal.changes.length,1);assert.equal(formatProposal.proposedBy.guidance.common.version,newGuide.common.version);assert.equal(f.counts().writes,beforeFormatWrites);
        assert.deepEqual(await cli(["formatting","preview"],formatInput),formatProposal);assert.equal(await cli(["formatting","result","format-one"]),null);
        await f.commands.get("agent-workspace-format")!();const formatForm=document.querySelector<HTMLElement>('[data-writing-format="true"]')!;
        assert.equal(formatForm.hidden,false);Array.from(formatForm.querySelectorAll<HTMLButtonElement>("button")).find(b=>b.textContent==="查看已有提议")!.click();assert.match(formatForm.textContent!,/− \[想法\] 可能去湖边，尚未询问。/u);
        Array.from(formatForm.querySelectorAll<HTMLButtonElement>("button")).find(b=>b.textContent==="明确写入这份差异")!.click();
        for(let i=0;i<500&&!formatForm.textContent!.includes("日志已确认");i++)await delay(10);
        const formatted=await cli(["formatting","result","format-one"]);assert.equal(formatted.status,"complete");assert.equal(formatted.record.origin.kind,"local-user-command");assert.equal(formatted.record.formatting.proposedBy.kind,"verified-local-agent");assert.equal(f.counts().writes,beforeFormatWrites+1);assert.equal((await cli(["status"])).capabilities.content,false);
        assert.equal((await cli(["formatting","recover","format-one"])).record.digest,formatted.record.digest);
        await f.commands.get("agent-workspace-stop")!();await f.commands.get("agent-workspace-format")!();assert.equal(formatForm.hidden,false,"standalone formatting must survive trusted read-scope establishment");
        await f.commands.get("agent-workspace-allow")!();
        assert.equal((await cli(["status"])).capabilities.fileWrite,false);
        await f.commands.get("agent-workspace-files")!();assert.equal((await cli(["status"])).capabilities.fileWrite,true);
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
        const captureCounts=f.counts(),captureSource=await cli(["content","read"]);
        const captured = await cli(["materials", "capture"], { requestKey: "output-1", text: "# 草稿\n\n可修订" });
        assert.equal(f.counts().inserts,captureCounts.inserts);assert.equal(f.counts().identities,captureCounts.identities);assert.deepEqual((await cli(["content","read"])).blocks,captureSource.blocks);
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
        const writeGuide=await cli(["guidance","read"]);
        const applied = await cli(["content", "apply"], patch);
        assert.equal(applied.status, "complete");
        assert.equal(applied.durable, true);
        assert.equal(applied.record.origin.kind,"verified-local-agent");assert.equal(applied.record.origin.clientLabel,"one");assert.equal(applied.record.origin.command,"content.apply");assert.equal(applied.record.origin.guidance.common.version,writeGuide.common.version);
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
        const todoRequest={schemaVersion:1,requestId:"ordinary-complete",scope:todoSource.scope,action:"complete",target:{blockUuid:todo.uuid,expectedContentVersion:todoBlock.contentVersion,expectedParentUuid:todoBlock.parentUuid},evidence:{materialId:captured.material.id,expectedVersion:saved.material.version,verifiedText:"真实修订"}};
        await assert.rejects(cli(["todo","apply"],todoRequest),/TODO_AUTHORIZATION_REQUIRED/u);
        await f.commands.get("agent-workspace-todo")!();
        const todoForm=document.querySelector<HTMLElement>('[data-ordinary-todo="true"]')!;
        for(const label of Array.from(todoForm.querySelectorAll<HTMLLabelElement>("label"))){
            if(label.textContent?.trim().startsWith("工作现场")||["依据材料核验后完成","重新打开普通任务","新建明确要做的普通任务"].includes(label.textContent!.trim())){
                const checkbox=label.querySelector<HTMLInputElement>("input")!;checkbox.checked=true;checkbox.dispatchEvent(new f.browser.Event("change") as unknown as Event);
            }
        }
        Array.from(todoForm.querySelectorAll<HTMLButtonElement>("button")).find(b=>b.textContent==="明确允许所选范围和操作")!.click();
        for(let i=0;i<100&&!todoForm.textContent!.includes("已允许。");i++)await delay(10);assert.match(todoForm.textContent!,/已允许。/u);
        assert.equal((await cli(["status"])).authorizesTodo,true);
        const completed=await cli(["todo","apply"],todoRequest);assert.equal(completed.status,"complete");assert.match(todo.content,/^DONE 局部事项\n\*\*\[记录\]\*\*/u);
        assert.equal(completed.record.origin.guidance.common.version,writeGuide.common.version);assert.equal(completed.record.ordinaryTodo.evidence.reference,saved.material.reference);
        assert.equal((await cli(["todo","apply"],todoRequest)).record.digest,completed.record.digest);
        assert.equal((await cli(["todo","result","ordinary-complete"])).record.digest,completed.record.digest);
        const reopeningSource=await cli(["content","read"]),reopeningBlock=reopeningSource.blocks.find((b:{target:{blockUuid:string}})=>b.target.blockUuid===todo.uuid);
        const reopened=await cli(["todo","apply"],{schemaVersion:1,requestId:"ordinary-reopen",scope:todoSource.scope,action:"reopen",target:{blockUuid:todo.uuid,expectedContentVersion:reopeningBlock.contentVersion,expectedParentUuid:reopeningBlock.parentUuid}});assert.equal(reopened.status,"complete");assert.match(todo.content,/^TODO 局部事项/u);
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
        await api.open(f.b);
        await assert.rejects(cli(["status"]),/(CONNECTION_REVOKED|WORKSPACE_OFFLINE|CONNECTION_STALE)/);
        await api.open(f.root);
        await assert.rejects(cli(["status"]),/(CONNECTION_REVOKED|WORKSPACE_OFFLINE|CONNECTION_STALE)/);
        await f.commands.get("agent-workspace-read")!();
        assert.equal((await cli(["status"])).capabilities.content,false);
        assert.equal((await cli(["content","result","patch-1"])).record.digest,applied.record.digest);
        await f.commands.get("agent-workspace-allow")!();
        assert.equal((await cli(["stage", "submit"], stageInput)).stageRevision, stageResult.stageRevision);
        assert.equal(f.counts().writes, stageWrites + 1);
        const stageRead = await cli(["stage", "read"], { stageId: stage.start.id });
        assert.equal(stageRead.revisions.at(-1).facts.at(-1).record.digest, stageResult.record.digest);
        assert.equal(stageRead.acceptances.length, 0);
        assert.equal(stageRead.revisions.at(-1).facts.at(-1).record.origin.kind, "verified-local-agent");
        assert.equal(stageRead.revisions.at(-1).facts.at(-1).record.origin.command,"stage.submit");
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
        await f.commands.get("agent-workspace-stop")!();
        const pageUuid=crypto.randomUUID(),pageName="Project · 合成页面协作",pageDirectory=join(root,"page-work");await mkdir(pageDirectory);await writeFile(join(pageDirectory,"WORKSPACE.md"),"用户页面入口，不能覆盖\n");
        const serial=(id:string):unknown=>{const b=f.blocks.get(id)!;return {...b,children:b.children.map(serial)};};
        logseq.Editor.getPage=(async()=>({id:1,uuid:pageUuid,name:pageName.toLowerCase(),originalName:pageName})) as unknown as typeof logseq.Editor.getPage;
        logseq.Editor.getPageBlocksTree=(async()=>[serial(f.root)]) as unknown as typeof logseq.Editor.getPageBlocksTree;
        const pageScope={...f.scope,rootUuid:pageUuid,kind:"page",pageName},beforePage=f.counts(),originalBlocks=JSON.stringify([...f.blocks]);
        await api.workspace.bind({scope:pageScope,directory:pageDirectory});await api.openPage(pageName);await f.commands.get("agent-workspace-read")!();
        const pageCli=(words:string[],input?:unknown)=>cli(words,input,"page-one",pageDirectory),pageStatus=await pageCli(["status"]);
        assert.equal(pageStatus.binding.scope.kind,"page");assert.equal(pageStatus.binding.scope.pageName,pageName);assert.equal(pageStatus.capabilities.content,false);assert.equal(pageStatus.capabilities.stage,false);assert.equal(pageStatus.capabilities.focus,false);assert.equal(pageStatus.authorizesTodo,false);
        const pageRead=await pageCli(["content","read"]);assert.equal(pageRead.readOnly,true);assert.equal(pageRead.page.pageUuid,pageUuid);assert.equal(pageRead.blocks.some((b:{target:{blockUuid:string}})=>b.target.blockUuid===pageUuid),false);assert.equal(pageRead.blocks[0].target.blockUuid,f.root);
        await assert.rejects(pageCli(["content","apply"],patch),/BLOCK_SCOPE_REQUIRED/u);await assert.rejects(pageCli(["todo","read"]),/BLOCK_SCOPE_REQUIRED/u);await assert.rejects(pageCli(["formatting","preview"],{requestId:"page-format",sourceIds:[pageRead.blocks[0].sourceId]}),/BLOCK_SCOPE_REQUIRED/u);
        await f.commands.get("agent-workspace-collaboration")!();const pageForm=document.querySelector<HTMLElement>('[data-collaboration="true"]')!,pageRequest=pageForm.querySelector<HTMLTextAreaElement>("textarea")!;pageRequest.value="保留整个页面的原句和层级，先阅读与讨论。";pageRequest.dispatchEvent(new f.browser.Event("input") as unknown as Event);
        Array.from(pageForm.querySelectorAll<HTMLButtonElement>("button")).find(b=>b.textContent==="连接并准备协作现场")!.click();for(let i=0;i<500&&!pageForm.textContent!.includes("现场已核验并保存");i++)await delay(10);assert.match(pageForm.textContent!,/现场已核验并保存/u);
        const pageScene=await pageCli(["collaboration","read"]);assert.equal(pageScene.scene.savedSource.scope.kind,"page");assert.equal(pageScene.scene.request,pageRequest.value);assert.equal(pageScene.current.sourceMatches,true);
        const pageGuide=await pageCli(["guidance","read"]);assert.equal(pageGuide.common.version,writeGuide.common.version);
        await f.commands.get("agent-workspace-files")!();const pageCapture=await pageCli(["materials","capture"],{requestKey:"page-material",title:"页面比较",text:"# 页面比较\n\n保留可能与问号。"});assert.equal(pageCapture.status,"success");assert.ok(pageCapture.material.path.startsWith(pageDirectory+"/"));
        assert.equal(f.counts().writes,beforePage.writes);assert.equal(f.counts().inserts,beforePage.inserts);assert.equal(f.counts().identities,beforePage.identities);assert.equal(f.counts().moves,beforePage.moves);assert.equal(JSON.stringify([...f.blocks]),originalBlocks);assert.equal(await readFile(join(pageDirectory,"WORKSPACE.md"),"utf8"),"用户页面入口，不能覆盖\n");
        await api.open(f.root);await assert.rejects(pageCli(["status"]),/WORKSPACE_OFFLINE|CONNECTION_REVOKED/u);await assert.rejects(cli(["status"]),/WORKSPACE_OFFLINE|CONNECTION_REVOKED/u);
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
