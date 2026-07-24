# P1-E Block 轻标记隔离原型自动证据（2026-07-24）

结论：`PROTOTYPE_AUTOMATED_PASS / DEFAULT_OFF / DESKTOP_OPEN / NOT_RELEASED`

## 宿主能力结论

Logseq 0.10.15 对应本地 `@logseq/libs@0.0.17` 与官方 API 文档均表明：

- `App.onBlockRendererSlotted(blockUuid, callback)` 只为指定 Block UUID 提供 condition slot；
- `logseq.provideUI({slot, ...})` 只向宿主给出的 slot 注入 HTML；
- macro renderer 需要正文中的 `{{renderer ...}}`，会违反“关闭 Plugin 后正文仍干净”；
- 本原型不使用未标准化 Markdown postprocessor、MutationObserver 或全局 DOM selector。

官方入口：

- https://logseq.github.io/plugins/interfaces/IAppProxy.html
- https://plugins-doc.logseq.com/logseq/provideUI

## 原型边界

Plugin setting 默认 `off`；可手动比较 `line / dot / icon / tint / phrase`。只从 Local Service
读取 active primary Anchor 的精确 external UUID，并用 Object Lifecycle/Condition 和正式
Focus 物化 `blocked / waiting / paused / focus / open / closed`。marker：

- 无 button、data-action 或正式写入入口；
- `pointer-events: none`、`user-select: none`；
- 不保存正文、对象文本、Block UUID 或额外派生状态；
- 不修改 Markdown、Graph、SQLite、Focus、Condition、Lifecycle、Ownership 或 Audit；
- off、Service restricted、Graph switch、unload、invalid slot、identity mismatch 与容量异常
  均清除/隐藏，历史 hook 只存当前 Plugin session，reload 由宿主卸载；
- marker setting 变化只刷新读投影，不重新发现 Service 或 churn Launcher lease。

## 自动证据

- 五种 template 均无动作与正文；
- 同一 UUID 的 main/query 等多个 slot 可独立注入与清理；
- inactive/missing/conflict/无对象 Anchor 不进入注册候选；
- 100 个正式 Block registration/injection harness PASS；
- focused 4/4、Plugin 231/231、typecheck/build PASS。

## 仍需真实 Desktop

当前没有把 prototype 当作真实截图或发布能力。集中 Gate 必须比较 TODO/DOING/DONE、编辑态
和光标、长文、连续/父子 Block、Query、Block reference、Linked References、right sidebar、
Zoom、Light/Dark、窄栏、100 Block 滚动、renderer reload 与 Plugin off 后 DOM/正文。只有这些
通过后才选择一个方案并讨论是否改变默认值。
