import { pluginRuntime } from "./plugin-runtime.ts";
import { startTaskCenter, openTaskCenter } from "./features/task-center/controller.ts";
import { WorkView } from "./features/work-view/controller.ts";
import { Materials } from "./features/materials/controller.ts";
import { installNavigation, installWorkbenchStyle } from "./host/panel-host.ts";
import { panels } from "./workspace/context.ts";

logseq.useSettingsSchema([
  { key: "kernelDescriptorJson", type: "string", default: "", title: "Kernel descriptor JSON", description: "连接正式任务管理使用的本地 Kernel。工作视图和材料可独立使用。" },
  { key: "workViewEnabled", type: "boolean", default: true, title: "启用工作视图", description: "从任意块进入工作范围，排列只保存在视图中。修改后重载插件。" },
  { key: "materialsEnabled", type: "boolean", default: true, title: "启用材料", description: "关联和编辑 Graph 外的 Markdown 文件。修改后重载插件。" },
  { key: "tasksEnabled", type: "boolean", default: true, title: "启用任务管理", description: "保留 vNext 的任务界面与正式操作，需要本地 Kernel。修改后重载插件。" },
  { key: "materialsDirectory", type: "string", default: "", title: "Graph 外的材料目录", description: "请选择独立的绝对目录，避免指向 Graph 的符号链接。保存收纳文档、关联记录和历史。" },
  { key: "materialsAutoCapture", type: "boolean", default: false, title: "自动收纳长文本", description: "配置材料目录后接管外部长文本粘贴，保留原文与原生撤销。默认关闭。" },
  { key: "materialsMinChars", type: "number", default: 2000, title: "收纳字符阈值", description: "单次粘贴达到此长度时收纳。" },
  { key: "materialsMinLines", type: "number", default: 30, title: "收纳非空行阈值", description: "单次粘贴达到此行数时收纳。" },
]);

async function main(): Promise<void> {
  installWorkbenchStyle();
  let materials: Materials | null = null, work: WorkView | null = null;
  let stopTasks: (() => Promise<void>) | null = null;
  let disposed = false;
  let removeNavigation: () => void = () => undefined;
  const dispose = async () => {
    if (disposed) return;
    disposed = true;
    work?.dispose(); materials?.dispose(); pluginRuntime.stop(); await stopTasks?.(); removeNavigation();
    delete (window as Window & {taskCopilotWorkbench?: unknown}).taskCopilotWorkbench;
  };
  logseq.beforeunload(dispose);
  const report = (error: unknown) => void logseq.UI.showMsg(error instanceof Error ? error.message : String(error), "warning");
  if (logseq.settings?.materialsEnabled !== false) {
    try { materials = new Materials(); } catch (error) { report(error); }
  }
  if (logseq.settings?.workViewEnabled !== false) {
    try { work = new WorkView((content, uuid) => {
      if (materials) void materials.library(uuid, content).catch(report); else report(new Error("材料模块未启用。"));
    }); } catch (error) { report(error); }
  }
  if (logseq.settings?.tasksEnabled !== false) {
    try { await pluginRuntime.start(); if (disposed) { pluginRuntime.stop(); return; } stopTasks = await startTaskCenter(); if (disposed) { await stopTasks(); return; } } catch (error) { pluginRuntime.stop(); report(error); }
  } else {
    logseq.provideStyle("body.tc-sidebar-docked #main-content-container{margin-right:var(--tc-sidebar-width)}body.tc-sidebar-compact #main-content-container{visibility:hidden}");
  }
  const actions: Record<string, () => void> = {};
  if (work) actions["工作视图"] = () => void work?.open().catch(report);
  if (materials) actions["材料"] = () => void materials?.library().catch(report);
  if (logseq.settings?.tasksEnabled !== false) actions["任务"] = () => void openTaskCenter().catch(report);
  if (disposed) return;
  removeNavigation = installNavigation(actions);
  logseq.provideModel({ workbenchOpen: () => { if (disposed) return; if (work) void work.open().catch(report); else if (materials) void materials.library().catch(report); else void openTaskCenter().catch(report); } });
  logseq.App.registerUIItem("toolbar", { key: "workbench-toolbar", template: '<a class="button" data-on-click="workbenchOpen" title="打开工作台" aria-label="打开工作台">工作台</a>' });
  const api = {
    read: () => work?.snapshot() ?? null,
    open: (uuid?: string) => work?.open(uuid),
    openMaterial: (id: string) => materials?.openDoc(id),
    close: () => panels.closeActive(),
    apply: (operation: unknown) => work?.apply(operation) ?? {ok: false, reason: "work-view-disabled"},
    readMaterials: (content: string) => materials?.linkedContext(content) ?? Promise.resolve([]),
  };
  (window as Window & {taskCopilotWorkbench?: typeof api}).taskCopilotWorkbench = api;
}

logseq.ready(main).catch(error => console.error("Workbench bootstrap failed", error));
