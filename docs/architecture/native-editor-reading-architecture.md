# 原生编辑与阅读的宿主和来源接口

后续 main 整合：2026-10-05 按用户授权，与最新全文、材料及协作界面组合；冲突处理、685 项门禁和重新采集的 Desktop 证据见[整合记录](../integration/native-editor-reading-main-2026-10-05.md)。以下保留原功能分支交付时点和固定基线，“未推送”不代表后续整合状态。

2026-10-05。基线为 `8529212296f0b65fb78ef7ccd2a2102474d9310a`。本分支沿用 [main 原生报告整合](../integration/native-editor-report-main-2026-10-04.md) 和 [书写兼容整合](../integration/writing-compatibility-main-2026-10-04.md) 已存在的入口与 owner。没有变更 SourceScope／Patch schema、来源 provider 所有权、Kernel／SQLite schema、agent 连接或材料 store。

## 端口与职责

| 实现 | 本轮职责 |
| --- | --- |
| `sidebar-layout.ts:readingLayoutSpec` | 以原生最小宽度和侧栏实际宽度计算可缩减的阅读区域；原通用布局函数保留 |
| `FeaturePanel` | open／close／exposeNative／layout、布局观察、宿主局部 style、请求寿命和注册释放 |
| `NativeEditorHost` | 原生组合态、SDK 编辑 UUID、真实 DOM 等待、同一输入焦点复用、单一返回按钮、受限 drop 观察 |
| `WorkViewReport` | 来源快照、默认报告、导航票据、版本／成员保护、原文对照、每个工作会话与 bookmark |
| `WorkViewLenses.navigationSource()` | 仅内部导航使用；让出面板后从同一个已安装 provider 读当前成员，不发布报告 |
| `WorkViewRenderer` | 稳定 UUID 节点、原句对照、无自动双击导航、bookmark／有效选区、删除来源清理 |
| `WorkView` | 当前 main 的实际消费；默认 report、持有工作根、材料和 ReviewPort 返回、dispose |

`index.ts` 已有的 `window.taskCopilotWorkbench.report = work?.reportAPI` 注册继续生效，无额外 provider 或空适配器。本轮增加的是被实际入口消费的行为及两个读／视图端口：

```ts
const report = window.taskCopilotWorkbench.report;
const view = report.read();
const fragment = view.fragments.find(f => f.target.blockUuid === actualUuid);
const request = {
  schemaVersion: 1,
  scope: view.scope,
  sourceId: fragment.sourceId,
  contentVersion: fragment.contentVersion,
  structureVersion: view.structureVersion,
  position: { kind: "block" },
};
report.compare(request);       // 同一捕获快照；不导航，不读取新正文
await report.openNative(request);
await report.showNative();     // 显示宿主区域；不选择另一个 block
await report.resume();         // 结束原生输入后恢复阅读；输入中拒绝
```

调用方必须先检查 scope／fragment 是否存在，并处理 `{ok:false,reason}`。`compare` 返回 `{target,content,status}`；stale 内容只用于对照。`showNative` 只处理视图，不能作为写入授权。`read`／`refresh`／`setMode`／`resolve`／`openNative`／`resume` 保持原端口风格。历史拒绝当前报告目标的 `resolve`、`compare` 和 `openNative`。

## 导航与输入保护

新导航顺序为：捕获目标 → 同来源 provider 的当前快照与成员校验 → Graph／root／revision 校验 → raw SDK content hash → 暴露宿主 → 等待原生 UUID block → 再读安装 provider／raw hash → `editBlock` → 验证真实输入框和 SDK UUID。`App.pushState` 在 SDK 0.3.4 声明为 void，确认不能替代 DOM 就绪；实现有界等待和最多一次无输入时重试。

来源读取和导航分别有 readTicket、navigation、lifetime；WorkView 的 epoch 和 PanelCoordinator revision 继续约束范围切换与面板竞争。所有异步阶段检查有效性；dispose／Graph 变化使旧请求失效。安装版路由 API 没有可取消句柄，已交给宿主的页面路由本身可能仍完成，但旧请求不能开始错误输入或覆盖新工作。

同一个已打开的原生输入是独立的焦点复用路径：先按旧捕获快照验证 request，再通过 `navigationSource()` 核对当前 UUID 仍属于同一工作／Graph、来源可用且 SDK 仍编辑该 UUID。它允许此输入的自动保存版本前进，绝不把新版本灌回 textarea。它不放宽新导航、drop 或 Patch 写入的版本规则。

native 或报告组合态、普通原生输入、其他 block 的草稿存在时，刷新保留旧报告。来源变化只排队，安全结束输入后再发布。provider 丢失／根被删除时，旧快照仍显示为 unavailable；它不能继续导航。`navigationSource()` 的 hidden 读能力不暴露在公共 API，也不能由调用方输入 hidden 标志绕过可见性。

## 宿主生命周期

`FeaturePanel.exposeNative(onSwitch?)` 返回 `beside | switch`。可选 callback 在已暴露的并排布局缩窄后执行，NativeEditorHost 消费它生成唯一返回按钮。宽窗不创建按钮；关闭、换工作／Graph、历史重开与 dispose 清理旧按钮。

关闭原生让出路径时，如果宿主真实 textarea 正聚焦，SDK style 的 `display:none` 隐藏面板；下一次 `open` 清空 display 并以 `autoFocus:false` 显示。这样绕开安装版 `hideMainUI` 的无条件 blur，并保护组合态。其他关闭继续使用现有 SDK hide 流程。展示状态以 `panel.visible` 为准，不依赖这段期间 SDK 的 `isMainUIVisible`。

宿主 style 元素只在本 panel 可见时存在；关闭断开 resize／mutation observer 和窗口监听。仅当前 owner 移除 host class／隐藏 UI，旧 close 不影响后来打开的 panel。`PanelCoordinator.register` 返回只删除自身 closer 的 unregister；`FeaturePanel.dispose` 消费它并移除 root。NativeEditorHost.dispose 移除组合态／drop 监听及返回控件。

## 阅读状态

`ReadingBookmark` 记录可见来源 UUID、它的相对偏移、真实祖先 fallback、有效 focus 和文本 Range；selection 同时记录其跨过的每个正文及内容。刷新不拆卸未变化节点。选择中的任意来源变更或隐藏后，旧 Range 不恢复到错误正文。

报告默认折叠集合为空。用户报告折叠、模式和 bookmark 按 `[graphId,rootUuid]` 缓存，最多 12 份，只在插件会话中存活。旧结构的持久个人排列仍归原 owner；普通结构测试显式选择 `readingMode:"structure"`，生产构造无该选项时为 report。

scope 重置前保存该工作展示，重开时先恢复来源再恢复 bookmark；原生仍在输入时不把焦点还给阅读。材料返回消费同一 WorkView.open；历史由现有 ReviewPort 记住和恢复 bookmark。历史 raw 对照没有当前 report fragment 时清除 sourceId／contentVersion DOM 标签，防止把当前版本标在旧文本上。

## 给 01／04／05／06 的具体接法

01／06：公共接线提交只涉及 `FeaturePanel`、`readingLayoutSpec`、`PanelCoordinator.register` 和布局测试；`installWorkbenchStyle`／`installNavigation`／`markNavigation` 函数保持不变。复用 `panel.exposeNative(callback)`，不要在 navigation 再加宿主返回栏。材料等调用方可以忽略 register 的返回值保持兼容，拥有生命周期的调用方应消费 unregister／dispose。

04：`work.resolveBodyDrop(element,"child" | "before" | "after")` 仅接受当前报告真实 `.wb-body`。报告标题、未知 DOM 和 block 位置被拒绝；返回同一 SourceScope、SourceId、BlockTarget 和版本。现有报告实际落点以原块子块为主。`work.observeNativeDrops((event,resolve)=>...)` 返回 stop 函数；consumer 必须自己拥有 preventDefault、文件验证、事务和卸载，不能从屏幕像素或原生 caret 猜落点。

原生观察只接受 trusted、未被消费的 event，并找宿主主区 `.block-content/.block-editor` 所属真实 UUID。`resolve` 重新核验 scope、Graph、输入状态及版本。窄窗已让出 panel 时返回 `view-not-visible`，正在输入／组合时返回 `editing-in-progress`；本分支不扩大这两个限制。BASE 的 `index.ts` 没有注册该 consumer，须在 04 自身实现接入后再验证系统文件拖放。无法确认时返回明确 reason，并使用材料 list 返回的完整 `reference` 文本作为复制链接降级路径，不伪造光标范围。

05：继续用 `attachReview` 返回的 repaint／bookmark／restore／refresh；历史 frame 负责旧正文，当前来源导航始终拒绝 historical-view。这里没有复制阶段编辑桥接、授权、acceptLocal 或 executor。

生产路径和真实验证见 [实施交接](../implementation/native-editor-reading-handoff.md)。
