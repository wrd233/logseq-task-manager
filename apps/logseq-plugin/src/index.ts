import { KernelClient, parseKernelDescriptor } from "@task-copilot/client/browser";
import { parseSemanticOperation, type GraphEffect } from "@task-copilot/contracts";
import { graphIdentity, LogseqGraphAdapter, logseqBlock } from "./graph-adapter.ts";

const descriptorKey = "task-copilot-vnext-kernel-descriptor";
const recentCommitKey = "task-copilot-vnext-recent-commit";

async function client(): Promise<KernelClient> {
  const stored = await logseq.FileStorage.getItem(descriptorKey);
  const configured = logseq.settings?.kernelDescriptorJson;
  const raw = typeof stored === "string" && stored.trim() ? stored : typeof configured === "string" ? configured : "";
  if (typeof raw !== "string" || !raw.trim()) throw new Error("请先运行“Task Copilot vNext：连接 Kernel”并导入 descriptor。");
  const descriptor = parseKernelDescriptor(JSON.parse(raw));
  if (raw !== stored) await logseq.FileStorage.setItem(descriptorKey, raw.trim());
  return new KernelClient(descriptor);
}

async function adapterForCurrentGraph(): Promise<{ adapter: LogseqGraphAdapter; graphId: string }> {
  const graphId = graphIdentity(await logseq.App.getCurrentGraph());
  return { graphId, adapter: new LogseqGraphAdapter({
    getBlock: (uuid, options) => logseq.Editor.getBlock(uuid, options),
    insertBlock: (target, content, options) => logseq.Editor.insertBlock(target, content, options),
    updateBlock: (uuid, content) => logseq.Editor.updateBlock(uuid, content),
    removeBlock: (uuid) => logseq.Editor.removeBlock(uuid),
  }, graphId) };
}

async function formalizeCurrentRecord(): Promise<void> {
  const current = logseqBlock(await logseq.Editor.getCurrentBlock());
  if (!current) throw new Error("请先把光标放在一条自然记录上。");
  const api = await client(); const { adapter, graphId } = await adapterForCurrentGraph();
  const snapshot = await adapter.readGraphSnapshot({ graphId, sourceBlockUuid: current.uuid });
  const operation = parseSemanticOperation({ operationId: `formalize-${crypto.randomUUID()}`, type: "CREATE_WORK_OBJECT", actor: { type: "USER", id: "local-user" }, input: { kind: "TASK", title: current.content.split("\n")[0], anchor: { graphId, blockUuid: current.uuid, sourceContentHash: snapshot.sourceContentHash } } });
  const pending = await api.prepare(operation, snapshot);
  const result = await adapter.applyGraphEffect(pending.graphEffect as GraphEffect);
  const committed = await api.complete(pending.commit.id, result, await adapter.readGraphSnapshot({ graphId, sourceBlockUuid: current.uuid }));
  await logseq.FileStorage.setItem(recentCommitKey, committed.commit.id);
  await logseq.UI.showMsg(`已正式化；Commit ${committed.commit.id}`, "success");
}

async function undoRecent(): Promise<void> {
  const commitId = await logseq.FileStorage.getItem(recentCommitKey);
  if (typeof commitId !== "string" || !commitId) throw new Error("没有可撤销的最近正式化 Commit。");
  const api = await client(); const original = (await api.showCommit(commitId)).commit;
  if (!original.targetId) throw new Error("Commit 没有 WorkObject target。");
  const anchor = (await api.showObject(original.targetId)).anchor as { graphId: string; externalId: string };
  const { adapter } = await adapterForCurrentGraph();
  const snapshot = await adapter.readGraphSnapshot({ graphId: anchor.graphId, sourceBlockUuid: anchor.externalId });
  const pending = await api.prepareUndo(commitId, { operationId: `undo-${crypto.randomUUID()}`, actor: { type: "USER", id: "local-user" }, snapshot });
  const result = await adapter.applyGraphEffect(pending.graphEffect as GraphEffect);
  const committed = await api.complete(pending.commit.id, result, await adapter.readGraphSnapshot({ graphId: anchor.graphId, sourceBlockUuid: anchor.externalId }));
  await logseq.UI.showMsg(`已安全撤销；补偿 Commit ${committed.commit.id}`, "success");
}

async function recoverIncomplete(): Promise<void> {
  const api = await client(); const recovery = (await api.listRecovery()).recovery;
  if (!recovery.length) { await logseq.UI.showMsg("没有需要恢复的 Commit。", "success"); return; }
  const { adapter } = await adapterForCurrentGraph();
  for (const item of recovery) {
    const effect = item.commit.graphEffect as GraphEffect;
    if (item.action === "ABORT_PREPARED") await api.abortPrepared(item.commit.id);
    else if (item.action === "RESUME_GRAPH_APPLY") {
      const result = await adapter.applyGraphEffect(effect);
      const completed = await api.complete(item.commit.id, result, await adapter.readGraphSnapshot({ graphId: effect.graphId, sourceBlockUuid: effect.sourceBlockUuid }));
      if (completed.commit.operationType === "CREATE_WORK_OBJECT") await logseq.FileStorage.setItem(recentCommitKey, completed.commit.id);
    } else if (item.action === "VERIFY_GRAPH") {
      const completed = await api.verifyRecoveredGraph(item.commit.id, await adapter.readGraphSnapshot({ graphId: effect.graphId, sourceBlockUuid: effect.sourceBlockUuid }));
      if (completed.commit.operationType === "CREATE_WORK_OBJECT") await logseq.FileStorage.setItem(recentCommitKey, completed.commit.id);
    } else throw new Error(`Commit ${item.commit.id} 需要人工协调，未自动覆盖 Graph。`);
  }
  await logseq.UI.showMsg(`已处理 ${recovery.length} 个恢复项。`, "success");
}

async function guarded(label: string, action: () => Promise<void>): Promise<void> {
  try { await action(); } catch (error) { console.error(label, error); await logseq.UI.showMsg(error instanceof Error ? error.message : String(error), "error"); }
}

async function main(): Promise<void> {
  logseq.App.registerCommandPalette({ key: "task-copilot-vnext-connect", label: "Task Copilot vNext：连接 Kernel" }, () => void guarded("connect", async () => {
    const value = logseq.settings?.kernelDescriptorJson;
    if (typeof value !== "string" || !value.trim()) throw new Error("请在插件设置中填写 Kernel descriptor JSON，然后再次运行连接命令。");
    parseKernelDescriptor(JSON.parse(value)); await logseq.FileStorage.setItem(descriptorKey, value.trim()); await logseq.UI.showMsg("Kernel 已连接；descriptor 已复制到 Plugin 私有 FileStorage。", "success");
  }));
  logseq.App.registerCommandPalette({ key: "task-copilot-vnext-formalize", label: "Task Copilot vNext：正式化当前记录" }, () => void guarded("formalize", formalizeCurrentRecord));
  logseq.App.registerCommandPalette({ key: "task-copilot-vnext-undo", label: "Task Copilot vNext：撤销最近一次正式化" }, () => void guarded("undo", undoRecent));
  logseq.App.registerCommandPalette({ key: "task-copilot-vnext-recover", label: "Task Copilot vNext：恢复未完成提交" }, () => void guarded("recover", recoverIncomplete));
  await logseq.UI.showMsg("Task Copilot vNext 已就绪。", "success");
}

logseq.useSettingsSchema([{
  key: "kernelDescriptorJson",
  type: "string",
  default: "",
  title: "Kernel descriptor JSON",
  description: "从本机 kernel.json 复制；校验后写入 Plugin 私有 FileStorage，不进入 Graph 或日志。",
}]);
logseq.ready(main).catch((error) => console.error("Task Copilot vNext bootstrap failed", error));
