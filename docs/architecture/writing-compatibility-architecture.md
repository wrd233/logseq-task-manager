# 书写兼容实际架构

2026-10-04。基于已有 canonical owner 和单一 workspace source provider，无 schema、Kernel、SQLite、材料身份或权限协议变化。

## 单一语法拥有者

`apps/logseq-plugin/src/canonical-writing.ts`：

- `TaskLabel` 是 `任务 | 事务`，`ParsedFormalAnchor.taskLabel` 保留来源标签；kind 仍为 TASK。
- `parseFormalAnchor` 只读首行，接受两种标签的 marker-first／legacy prefix-first 与既有 MiniProject。普通 TODO、正文中标签、引用及代码不成为锚点。
- `formatFormalAnchor` 接受语义标题及可选 `taskLabel`；不再次剥除标题自身的 TODO、Markdown 或标签文字。
- `formatFormalSource(content, input)` 按来源保留标签，只替换首行，保留后续 LF／CRLF、属性和正文。用于明确正式化与规范化。
- `canonicalizeFormalSource` 仅处理已符合锚点语法的来源，复用完整来源格式化。`replaceTaskMarker` 同样保留后续内容。
- `extractObjectNavigationLabel` 消费同一锚点解析，并集中保留工作视图已有的无状态粗体标签、`事项` 导航别名及带 tag 的 MiniProject 习惯。这些导航形式不增加正式化语法或权限。
- `hasFormalAnchorSyntax` 集中保守保护规则，包括不完整／非粗体的可能正式根与既有 Project 语法。它不是身份判断。

`normalizeFormalTitle`／`extractTitleFromSourceLine` 去掉正确的来源装饰；已解析标题保留自身文字、链接、Markdown 和空白。UUID 才是同名对象的定位依据。

## 消费链

1. `features/task-center/controller.ts`：注册的正式化入口先沿用原有持久身份核验，再重新读取完整 `rawContent` 并核对当前来源，调用 `formatFormalSource`；Kernel 收到干净标题。失败回退只在完整来源仍匹配时发生，不覆盖较新的正文。重新渲染同样保留完整来源和标签，OPEN 保留既有 marker。
2. `graph-adapter.ts`：投影收敛、upsert 和重试读取 raw 来源用于格式化；正式比较／hash 继续沿用 `canonicalizeGraphContent`，没有替换 workspace 的完整内容版本。状态更新经原有受控 effect 和 marker 前置条件，完整正文经 SDK `updateBlock` 更新。
3. `features/work-view/focus.mjs`：消费 canonical 导航标题，不再维护独立根解析正则。祖先遍历、最近根、范围和同名对象仍按源 UUID；未改 report composer、模型分类或布局。
4. `features/content-writeback/protection.ts`：`formalSyntax` 委托 canonical 的保守规则。原 adapter 的 Kernel 归属、缓存身份、ambiguous／managed 传播、TODO 和属性保护保持。离线识别不创建正式身份。

Controller 的 `logseqBlock` 改为消费已有 `projection-reader.ts` 的完整读取结果；没有新建 block reader。`currentTaskContext` 的 Task 限制只在既有状态命令中保持，重新渲染可到达已有 MiniProject／Project 处理逻辑，且不重试语义 closure 请求。

## 边界与接入

01 消费根类型、干净标题与 `taskLabel`；不要用标签替代 source target/version。03 继续消费原 protection／identity，其 executor、Journal、EditingGuard 和权限表没有复制。02 无材料接口或存储变更。

共享适配集中在第二个提交：task-center controller、graph adapter、work-view focus、content-writeback protection 及相应回归。未改 `index.ts`、source provider、panel host、stage schema、agent transport、依赖锁文件或整套使用手册。

宿主 API 核对依据为锁定 SDK 0.3.4 与 [Logseq 官方 Editor API](https://logseq.github.io/plugins/interfaces/IEditorProxy.html)。SDK 定义只用于接口核对；实机结果与限制见交接。
