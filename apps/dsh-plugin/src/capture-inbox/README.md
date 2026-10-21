# Capture / Inbox 模块

输入共同基线 `f992619025f5b4d086a2e8ee1729936d488ecc89`；已普通获取 main 的 G2 方案批准 `75c8c44982e7348413c8cdd207f3eb69cb47b904` 和共享原生草稿适配 `10238baf`，controller 消费其 sameWorkUiContext，不复制公共活跃比较逻辑。**真实 DSH 入口已在本分支接线：`index.mjs` 注册认证 RPC，`client.jsx` 注册快速记录和 Inbox。最新验收与宿主限制见 [交付记录](../../../../docs/implementation/2026-10-22-capture-inbox-delivery.md)。**

## 主代理接入

- Node 服务：`new FileCaptureStore(trustedPrivateRoot)`，导出于 `store.mjs`。root 必须绝对、由宿主选择，目录属当前用户且禁止 group/other 权限、无符号链接。仅单设备；不要放 Graph / Journal。目录创建使用 0700，文件 0600。
- 浏览器：`new CaptureInboxController({store, context, createPort, origin?})`。store 接可信 RPC adapter，实现 Logseq `features/capture-inbox/protocol.ts` 的 CaptureStore；不要把 Node store 打进浏览器。
- `context` 为创建时的不可变 WorkUiContext，允许无项目。`origin` 仅由宿主从已授权快照/材料核实后提供；store 的格式检查不是来源真实性证明。没有可靠来源只给 `{sessionId}`。来源正文从不当命令执行。
- `createPort` 是**同步**工厂，每次用户引用动作立刻捕获 `conversation.input.captureInsertion()` 的 span；适配 SharedUiPort 唯一原定义，用原 span `insertText()`，不覆盖、不发送。port.context() 返回当前实况，不只返回创建时快照；否则模块无法拦截变化。
- controller.open(mode, returnPort) 在读取前由宿主同步创建 returnPort 保存触发控件。使用 `useSyncExternalStore(controller.subscribe, controller.getSnapshot)`，渲染 `<CaptureInboxView state={state} actions={controller.actions}/>`；局部样式由 view 带入。
- `connectionChanged()` 使旧 controller 停止正式动作，保留原分区草稿；跨 session 新建 controller，不 mutate 原 context。突发断连若 RPC 已失效，则保持内存输入、明确 unknown，不绕过认证写入。保持旧实例可回访；`dispose()` 等待草稿队列后才销毁。
- 当前条目、选择、列表/正文滚动位置保存在该 controller 的模块内存视图状态；浮窗卸载重开后恢复，搜索更改时重置列表滚动。此状态不写入 CaptureStore，不建立公共返回数据库，也不承诺重启后恢复滚动位置。
- 关闭 await persist，只有草稿回执可靠才隐藏并 returnFocus。宿主强制卸载/进程被杀之前尚未确认的键入仍可能未落盘；不能声称逐键零损失。提示用户保留窗口、重查草稿状态。系统睡眠/断电仍需另验。

## 数据和恢复

存储 API：`list(context)`、`execute(context, command)`、`readDraft(context)`、`saveDraft(context, expectedVersion, draft)`。命令 create/edit/archive/restore，所有正式记录操作都有 requestKey；saved 只在 fsync + 目录 fsync + 读回后返回。未知回执保留原请求和输入，同 key 重试；同 key 不同参数 conflict；真正的新记录新 key。archive false 撤销归档，restore 追加正文版本且保留当前归档状态。

分区 key 的 canonical JSON 包含完整 scope/binding、稳定 workObjectId、sessionId；排除 generation / workObject.version。实际目录用 SHA-256，不把用户路径拼进文件名。

| 情况 | 行为 |
|---|---|
| 无项目 + session A | scope/binding/workObjectId=null，sessionId=A；不创建占位正式对象 |
| 全空上下文 | 本设备无来源分区；只在宿主明确提供该上下文时使用 |
| Graph A/B 同 rootUuid | scope.graphId 不同，隔离 |
| session A/B | sessionId 不同，隔离；首版不聚合跨会话 Inbox |
| block/page 或页面改名 | kind/pageName 不同，保留旧分区；不静默迁移 |
| 相同身份断线重连 | generation 改变仍可读回原分区；旧活跃调用被 host + controller 拒绝 |
| 对象版本递增 | workObjectId 相同，记录不消失；活跃上下文仍比较完整版本 |
| 绑定目录搬迁 | 完整 binding 改变，旧分区保留；宿主需提供明确回访入口，不自动迁移 |

不可变请求意图先落盘，再 CAS 发布版本。硬链接发布若目标已存在则比较，两个进程不能覆盖同一版本；临时 .pending 不进入正文。比较版本和生成 parent hash 使用同一不可变读取快照。同键重试返回该请求实际提交的版本，不能把后来版本当作该请求收据。hash 包裹和父版本 hash 校验损坏，失败关闭。草稿保留当前正文、编辑正文、待核对原保存/编辑请求和待引用文本；另一窗口冲突不覆盖当前输入。`onRecoverDraft` 只自动接纳原版本或本实例已尝试写入的确切快照，否则展示磁盘草稿，用户明确 `onKeepLocalDraft` 后把当前输入追加为新草稿版本，保留旧文件；再次变化须重新核对。

边界：每正文/引用最多 100 万 UTF-16 字符、每落盘文件最多 800 万字节、每分区最多 5000 条记录、每记录及草稿最多 10000 版本；达到上限报告未知/错误并保留输入，无自动删除/压缩/跨设备同步。草稿按变更追加，长时间使用需后续单独审查保留策略；首版不无限制读取磁盘。文件系统须支持 hard link 和目录 fsync，不支持时不宣称 saved。

## 可逆默认与验收边界

背景点击不关闭，Escape（非 IME composition）请求保存草稿并关闭；钉住仅限 DSH 内，默认 saved 后收起，钉住后清空正文继续。双击和“编辑正文”都可编辑，取消编辑仅收起并保留草稿。今天按宿主本地日期，在当前搜索结果内选择；全文搜索包含归档与旧版本。选中项可跨过滤条件保留，界面显示总选中数。这些是可逆默认，不是新增产品定案。

`FRONTEND-TASK.md` 是独立前端子任务提示词（合成 fixture / 固定 callbacks）。用户已于 2026-10-21 明确批准独立脱敏目录 `/Users/wangrundong/work/capture-inbox-flash-ui` 的 ui-input.md / view.jsx / styles.mjs 读写外发；仅该目录进入批准列表。hub Flash 前端复核任务 `a3c60d81084a68f8d2a0facc` 终态 failed/max-tokens，读取3个允许文件后未产生写入；Codex 用 git diff --no-index 独立核对 view/styles 差异为空，没有自动重试、升级或扩大目录。保留独立提示词并本地继续。真实仓库与 Graph 未进入外发根目录。新增 onRecoverDraft/onKeepLocalDraft/onRetryEdit/onRebaseEdit/onCancelConflictOperation 只发 controller 意图，不由 view 做 I/O。

行为与真实文件测试：`node --import tsx --test apps/dsh-plugin/tests/capture-inbox.*test.mjs`。真实文件/子进程证据与模拟 Store/port 证据在测试文件内分开标记。物理中文 IME、真实 Desktop/Logseq Graph、系统断电与跨设备均不能由这些测试推断；最终证据见后续 ACCEPTANCE.md。
