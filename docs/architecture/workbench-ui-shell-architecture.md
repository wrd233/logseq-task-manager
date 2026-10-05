# 工作级 UI 组合架构

基线 `8529212296f0b65fb78ef7ccd2a2102474d9310a`。公共 UI 与领域实现分开：host 不导入 feature，shell 不持有来源、写回权限或阶段记录。

## 主要路径

- `host/panel-host.ts`：公共局部样式、主题变量同步、全局入口和小型 disclosure menu。FeaturePanel 布局/open/close/exposeNative 的实现保持基线。
- `features/work-view/shell.ts`：工作身份、正文／材料入口、原生写作、按需审阅、重要状态、分组工作选项。只消费描述和动作。
- `features/work-view/controller.ts`：已有 SourceScope、来源保护、报告、lens、renderer、ReviewPort 的组合；工作切换与材料书签生命周期。
- `features/work-view/report-controller.ts`：新增可配置初始模式，WorkView 选择 report。报告解析、原生导航与来源映射保持原实现。
- `features/materials/controller.ts`：两项 shell 生命周期回调和返回按钮标记；材料读写／引用／草稿／目录仍归该模块。
- `features/stage-workbench/review.ts`：ReviewPort 的导航描述与安全离开薄适配。版本、认可、历史、草稿归原 owner。
- `index.ts`：实例化后连接真实模块和 scope 受限的本地动作。
- `host/native-editor.ts`：仅统一返回按钮为「返回正文」，不改输入恢复、定位或宽窄宿主行为。

## 最小组合接口

```ts
work.setContextActions(() => {
  const root = currentWorkRoot(); // index.ts 中已有的当前 root getter
  return root ? [{ group: "工作目录", label: "关联工作目录",
    run: () => workspace.local.bind(root) }] : [];
});
materials.setWorkChrome(
  (surface, scope) => work.mountMaterialChrome(surface, scope),
  scope => work.rememberMaterials(scope),
  uuid => work.materialContext(uuid)
);
// 材料返回实际构造回调：uuid => work.returnToBody(uuid)
await work.setReviewOpen(true);
```

示例仅说明端口形状；实际 `index.ts` 在每次动作前读取当前 root，并保留各模块的 Graph/许可核验。Workspace、AgentWorkspace 和 ContentWriteback 的 `.local` 适配器是可信 installer 接线，不加入公开 namespace，不放大 agent API 权限。

`WorkShellIdentity` 带 SourceScope、title、kind、sourceId、contentVersion。`WorkShellState` 描述当前内容位、原结构、原生可见性、输入、历史、审阅、提示及动作。shell 移动同一 DOM header 到实际工作／材料 surface，材料区没有第二套工作状态。

`ReadingBookmark` 仍由 renderer capture/restore。切材料前在面板尚有真实几何尺寸时捕获；关闭后的 mount 不覆盖该书签。返回使用既有 work.open 流程，只有 Graph 和 root 全匹配才能 restore。原生材料链接通过现有 readTrace 核对祖先：当前工作子块保留 root，明确其他来源按其真实工作返回；过期祖先读取返回 null，不打开旧材料。材料不另建 source provider。新工作、Graph 切换或失效结果不能复活旧身份或书签。

最新 main 组合增加可选 `enter()`，由工作级入口展开 review owner 的控件；bridge.closeReview 将原模块的收起动作交回同一入口，`leave()` 仍可拒绝。替换 review owner 时重新收起，保留草稿由原 owner 显式恢复。

ReviewPort 可选 `navigation()` 返回 attention/busy/historical/notice；`leave()` 可以拒绝。`compose()` 仍持续更新 owner 的来源事实，但只有展开审阅才把 changes/view 叠到正文。历史 frame 强制审阅展开。bridge.openReview 只负责入口，认可仍绑定 owner 已显示的 revision。

## 并行整合点

02 接管报告正文时保留 shell 的初始 report、根标题对应与 SourceScope。03 接管宿主布局和输入恢复时保留本分支公共样式／navigation 与「返回正文」语义。04 保留 `setWorkChrome` 的 before/mount 顺序和真实范围；05 保留 ReviewPort 可选导航、安全离开及 bridge.openReview。renderer 没有本分支的领域重写。

以上为原固定基线实现；后续 main 合并保留已交付的完整报告、材料阅读 UI 和协作 owner，具体组合见[整合记录](../integration/workbench-ui-shell-main-2026-10-05.md)。原始分支全部入口可操作且挂载基线真实能力。没有静态占位页、空回调、通用 UI 框架、额外 source provider 或状态库。
