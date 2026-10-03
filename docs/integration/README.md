# 工作台整合说明

一个仓库、一个 Logseq 插件，内部保留工作视图、材料和任务三个入口。本地 Kernel、CLI 与诊断 Console 继续作为独立运行组件。

2026-10-03：阶段记录与原位审阅已接入既有工作视图，支持显式开始阶段、同阶段纠正与原文建议、具体修订认可、材料成果及不可变历史。来源来自已发布的 workspace-context，正文与文件继续通过 content 和材料模块保存。API、权限和未验范围见[阶段交接](../implementation/stage-workbench-handoff.md)；本次 main 整合的基线及验证见[整合记录](stage-workbench-main-2026-10-03.md)。

整合起点为本地 `vnext` 的 `07e9f0e`，迁入来源为工作视图 `88a3d10` 与长文档 `171fa66`。两个原型没有共同祖先，采用按能力移植；保留原型分支和来源记录。用户确认没有真实原型数据需要迁移，原文排列同步不进入首版。

## 使用

使用 Node 20，执行 `npm ci`、`npm run build`。在 Logseq 加载 `apps/logseq-plugin`，插件 ID 仍为 `task-copilot-vnext`。

- 工作视图：块右键“工作台：从此块打开工作视图”，或在当前块运行“工作台：从当前块打开工作视图”。快捷键 `Cmd/Ctrl+Alt+P`。原文继续在 Logseq 编辑，拖动、Tab 缩进、折叠和展示级别保存为本地视图状态。
- 材料：从工作视图内进入当前工作材料，绑定已有 Graph 外工作目录；没有绑定才用 `materialsDirectory`。可显式收纳文本、当前块，或关联 Markdown、PDF、图片等普通文件。点击 `longdoc://` 先阅读 Markdown，选择编辑才加载编辑器；其他文件仅外部打开。原文件不搬迁，多任务关联不复制正文。详见[产品设计](../design/materials-module-design.md)。
- 长文本自动收纳默认关闭，配置目录后通过 `materialsAutoCapture` 开启。原始粘贴、捕获记录和保存历史分别保留；原生撤销移除引用和本次插入的来源 id，外部文件继续保留。
- 任务：使用原有 TC 入口或共同面板的“任务”。填写 Kernel descriptor 后使用原有正式化、今天、事项详情、Closure、Undo 和恢复操作。

三个模块的启用设置修改后重载插件。tasksEnabled=false 不启动共享 Worker、来源观察和身份刷新；面板切换不重启插件运行时。工作视图与材料不依赖 Kernel 在线。材料目录没有个人路径默认值，未配置目录时仍能使用其他入口。内嵌编辑器资源随构建打包，首次打开文档时加载。

粘贴收纳失败且编辑位置仍未改变时，回退到原文粘贴并保留恢复记录。已保存材料的引用插入失败时，可从材料库打开并补关联；同请求重试使用原身份。未完成收纳的原文与待写正文保留在独立记录/本地缓存中，清缓存前应恢复。

## 代码安排

```text
apps/logseq-plugin/src/
  index.ts                         # 设置、模块组合与统一入口
  host/                            # 面板与桌面文件桥接
  workspace/context.ts             # Graph/root 布局键与面板切换协调
  plugin-runtime.ts                # tasksEnabled 控制的插件级 Graph 运行时
  features/
    work-view/                     # 导航、状态、来源调度及按 UUID 渲染
    materials/                     # 文件记录、编辑、收纳、冲突
    task-center/controller.ts      # 正式标记、任务 UI 与用户命令
  block-identity.ts                # Graph/generation 身份状态；Runtime 负责刷新
  graph-adapter.ts, source-identity.ts, ...  # 原有正式投影适配
```

纯展示模型保留当前使用的排列与标记解析；未接入的 Agent patch 和自动排序原型已在[第一轮](../refactoring/round-01-results.md)移除。类型声明提供 TypeScript 接口。正式投影及 closure 转换统一由 `packages/contracts` 的纯函数构造，异步 closure 读取仍在调用侧。Marked 15.0.12 的原型分发文件与许可证保留在 `work-view/vendor/`；DOMPurify、Vditor 和富文本转换器统一进入 workspace lockfile。无需第二个插件或原型 relay 服务。

## 数据安排与边界

- 原文在 Graph 或原来的 Markdown 文件。关联文件的位置不变。
- 收纳文件、关联与捕获记录、历史按工作目录选择或全局默认保存。`.longdoc/<id>.json` 是每篇材料的独立记录；文档库从这些记录扫描，不使用原型的共享可覆盖 catalog。整个目录连同隐藏目录应一起备份。
- 正式任务状态仍在 Kernel SQLite；视图布局与未保存草稿按 Graph 和范围保存于插件本地存储。
- 文件写入使用前后版本比较、历史备份、临时文件与读回核对。Web Locks 协调同源插件窗口；外部程序的极端并发写入没有跨进程原子比较交换保证。
- 目前材料目标是 macOS 文件 Graph。Markdown 可读并按授权编辑，其他普通文件仅登记和外部打开；支持已知多目录定位与显式失联重定位。完整工作区、二进制正文提取/预览、自动移动识别和 Kernel 外部文件 Evidence 仍为后续需求。
- 普通块仅打开视图时不会写入 `id::`；因此索引重建后其恢复能力仍有限。显式关联文件或收纳时才保存来源身份。

## 本地协作接口

插件上下文中 `window.taskCopilotWorkbench` 提供 `read()`、`open(uuid)`、`openMaterial(id)`、`close()`、`readMaterials(content)` 和 `apply(operation)`。材料读取返回实际路径、能力、正文与 SHA-256 或不可用结果。另有 `materials.list/read/capture/associate/save` 共用材料核心；Agent 保存检查编辑边界、预期旧文与版本，引用失败返回部分成功。真实调用例子与本地上下文限制见[材料架构](../architecture/materials-module-architecture.md)。它不是新增的远端 Agent 服务，vNext 的正式 Agent 接口继续使用 Kernel/CLI。

展示 `apply` 只接受 `layout/reorder/indent/collapse/display/focus`，请求必须携带当前 `graph/root/expectedSeq`。来源写入、原文同步、Git、删块与任意样式探针均无此入口。read/apply 返回独立快照；有效来源、草稿、展示或范围变化使 seq 递增，重复检查与重绘不递增，成功的无变化操作不重新保存布局。

## 需求地图与验证

[交互 HTML](requirements.html)从本质需求展开到叶子能力，分别标注实现状态与默认启用条件。搜索、状态筛选、展开、详情和导出只作用于此设计快照。更新 `requirements.json` 后运行 `npm run docs:requirements`；生成器校验 ID、状态与实现路径，生成不依赖网络的 HTML。

`npm run check` 包含全仓类型、lint、测试、构建、依赖边界、Taste 与需求地图检查。新增回归覆盖多实例材料创建、来源不被展示操作修改、模块切换后的冲突草稿、禁用写探针、未来 schema 不被修改、恢复前 WAL 快照与 Console 跨站凭证读取。

实机验证使用 [隔离环境](../rc/LOGSEQ_SANDBOX.md)，应用、home、profile、Graph、Kernel 和材料目录均在 `tmp/logseq-sandbox/`。生产 Logseq 不参与装载或验收。

首版历史验收见 [验证记录](VALIDATION.md)。当前职责、刷新机制、工作量测量与验证边界见[第二、三轮结果](../refactoring/round-02-03-results.md)。
