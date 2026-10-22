# Capture 来源正向接线：串行交付接口

起点：`6c83bdb167dbb6c1fcf3e61bddf13bfadc35e9a2`，分支 `codex/capture-inbox-v1`，独立 Worktree `/Users/mac/Downloads/work/logseq-task-manager-capture-inbox`。未修改共享 `client.jsx`、`index.mjs`、公共 SharedUiPort 或来源适配器；未读取其他 Goal 未提交实现。当前为模块与 RPC 交付，**不是完整双宿主验收通过**。

## 给共享入口所有者的最小串行接入

继续使用已有 `installCaptureInbox(ctx, rpc)` 返回的组件（现入口名 `CaptureEntry`）。组件增加静态方法 `CaptureEntry.captureSource({sessionId, selection, lease, returnTarget})`，只在明确用户“从此来源捕获”动作中调用。不在挂载、选择变化、刷新、模型输出时自动调用。

1. 使用已授权阅读/材料列表中的既有身份，不从正文解析或推断。`selection` 必须且只能是 `{block: SourceSelection}` 或 `{material: {materialId, version, reference}}`。不传客户端正文。
2. 阅读现场建立时，通过已有 `capture/context` RPC 取得该现场的 lease；保留到来源按钮交互，不在点击后的异步步骤中另取新现场 lease 替代旧值。现场变化时刷新显示与令牌，并拒绝旧动作。
3. pointer-down 时同步保存原仍有效焦点控件，在 click 时将其作为 returnTarget 调静态方法；键盘动作可回到按钮本身。来源身份和 lease 使用同一显示现场的快照。公共端口不需复制或修改。
4. 新增来源菜单按钮属于共享入口所有者串行改动；本次没有擅自接管。原 `index.mjs` 已将 `capture/context` 输入原样交给 CaptureHost，因此新增 selection/lease 参数无需增 RPC 路由或模型工具。

服务端 `context({sessionId, selection?, lease?})` 在有 selection 时先核对 lease，再通过现有 `source.read` 或 `materials.list`＋`materials.read` 核验当前授权范围、身份、版本与可用性；材料正文读取后再次比较版本/reference，最后复核上下文 lease。正文完全来自该宿主读取，返回 `{context,lease,origin,text,availability}`。无 selection 的既有会话来源捕获保持兼容。

客户端读回原分区草稿后，`seedSource` 只在空白且无未确认请求/编辑时填入来源正文。已有草稿不覆盖，提示处理现有草稿后重试。来源 origin 作为 CaptureDraft 可选字段落盘，兼容旧草稿；重开/重启恢复，不因默认 session origin 丢失来源。保存时再次核验，来源变化、删除、离线或换绑拒绝新保存但不清空正文与请求。可靠保存并清空后 origin 回到 session，钉住窗口下一条记录不自动继承上条来源。

## 回执、引用和容量

FileCaptureStore 增加可选只读 `replay(context,command)`：仅在请求指纹完全相同且对应版本已发布时返回当次原版本回执，绝不补写未完成意图。同 key 不同内容 conflict。CaptureHost 在当前 lease 内先读取确切已提交回执，再核验新提交来源，解决原保存已成功但回执丢失、来源后来变化或删除后的确认；不绕过新保存的来源核验，不迁移分区。

引用继续使用记录 original 与不可变 origin（SourceSelection contentVersion 或材料 version/reference），编辑只新增正文版本。原生 span 在交互同步捕获；插入前查 lease，session/binding/原生修订保护保持原接口。成功插入后清除待恢复引用并可靠保存，不自动发送、归档或正式化。

容量提示覆盖单正文100万 UTF-16 字符、合计文件800万字节、传输上限、草稿10000版本、记录历史与数量上限。未知/失败输入保留，关闭被阻止，不自动删除历史。未实施轮换、压缩或清理；如需解决长期容量，须另交独立方案与保留决定。

## 返回与恢复范围

复用现有 SharedUiPort：只恢复仍有效的原焦点，不改 cwd 或绑定。Capture controller 内保存 Inbox 选择、activeId、列表/正文滚动；关闭/重开恢复。浮窗不卸载原生对话或阅读组件。重启只恢复可靠落盘正文、来源、请求与编辑草稿，**不保证阅读位置、选区或 Inbox 滚动跨重启恢复**。物理中文输入法及真实 Logseq 阅读现场仍须下述宿主验证。

## 测试与真实宿主边界

新 `capture-inbox.source.test.mjs`：真实磁盘＋生产 CaptureHost/controller，来源服务明确合成，覆盖块/材料正向准备、来源草稿重开、忙时不覆盖、来源变化拒绝、丢回执后重启回执恢复、引用包含来源版本；合计容量故障保留旧草稿；10000个哈希校验链完整真实文件达到草稿上限后仍保留本地正文和全部旧版本。

扩展 `capture-inbox.rpc.test.mjs`：原生产路由、WorkbenchService、CaptureHost、真实 FileCaptureStore；仅 companion transport 与 DSH 注入服务合成。路由完成 bind、两种来源准备、模拟丢回执、宿主重启、来源变化后同 key 去重及新 key拒绝。不能据此宣称真实 Graph 已验。

实际运行命令及最终结果在本节后续记录；没有将未完成检查写成成功。

真实宿主仍缺独占 Graph/profile 与可操作 Logseq 原生连接。不得使用另一 Goal 的19333实例、替换其插件或操作日常 Graph。共享入口来源按钮尚须其所有者串行接入。最终需独立验证：有来源捕获与多选引用、已有原生草稿保留、断连重连、换绑拒绝、焦点/阅读/Inbox滚动返回、物理中文IME。Journal同步、AI分类、正式化、跨设备、系统置顶不在本次范围。

## 本次实际运行结果

- `node --import tsx --test apps/dsh-plugin/tests/*.test.mjs apps/logseq-plugin/tests/workspace-context.test.ts apps/logseq-plugin/tests/workspace-reading.test.ts apps/logseq-plugin/tests/agent-workspace-entry.test.ts`：**89/89 通过，退出0**，包含全部 Capture、端口、service及指定入口/阅读/上下文回归。
- 随后加强边界：`node --import tsx --test apps/dsh-plugin/tests/capture-host.test.mjs apps/dsh-plugin/tests/capture-inbox.rpc.test.mjs apps/dsh-plugin/tests/capture-inbox.store.test.mjs`：**25/25 通过**。RPC新增旧lease、伪造材料reference、单正文超限稳定错误码、编辑版本冲突断言。
- 来源标记显示后 `node --import tsx --test apps/dsh-plugin/tests/capture-inbox.controller.test.mjs apps/dsh-plugin/tests/capture-inbox.source.test.mjs`：**31/31 通过**，其中包括10000真实草稿版本的容量测试。
- 最后优化旧session草稿兼容性：无来源时不强制新增origin字段/版本；controller回归 **26/26 通过**；块/材料正向来源定向重跑结果另见末尾记录。
- `npm run typecheck -w apps/logseq-plugin`、`npm run build -w apps/dsh-plugin`、受影响Capture文件与模块协议ESLint均退出0；`git diff --check`通过。

原生宿主能力复核：工具表面apps为空，没有Logseq connector；19333仍为原Logseq PID41708占用。没有启动固定占用该端口的沙箱，没有替换其插件或变更其Graph。**实际有来源的双宿主验证、共享来源按钮接入、物理IME仍未完成**。此前真实DSH的无来源捕获/引用与返回证据不能充当本次有来源宿主验收。

增量文件：`capture-host.mjs`；Capture模块内`host-client.jsx`、`controller.mjs`、`store.mjs`、`view.jsx`、新增`problems.mjs`；模块独有`capture-inbox/protocol.ts`；`capture-inbox.rpc.test.mjs`及新增`capture-inbox.source.test.mjs`；本文。无共享client/index或公共端口变更。固定SHA由本提交后的Git日志给出，实际diff可用`git diff 6c83bdb..HEAD`复核。

最后定向验证：`node --import tsx --test --test-name-pattern='verified' apps/dsh-plugin/tests/capture-inbox.source.test.mjs`，**2/2通过，退出0**；随后DSH构建、Capture及模块协议ESLint、diff空白检查退出0。上述分组结果按实际修订分别记录，不把较早89项冒充最后微调后的再次完整重跑。

## 来源误标复核修复

在 `a0490b3` 后进一步发现：旧session-only磁盘草稿没有origin字段时，来源入口若在构造控制器时预先传入新来源，读回旧草稿后拒绝seed仍会残留这个新来源。正文虽未覆盖，随后保存可能错误标注来源。

修复：host-client构造控制器使用session默认来源，来源只由成功seed加入；读回旧草稿时明确使用其origin、既有待确认create请求origin，或session默认值，绝不从新来源动作继承。既有记录不迁移或改写。新来源遇旧草稿继续拒绝覆盖。

新增两项真实FileCaptureStore测试：普通旧草稿遇块来源动作仍以session来源保存；旧块来源待确认请求遇新材料动作仍保持旧块来源和原请求。均校验最终保存记录，而不只检查界面标签。

本回合仍只读取其他Worktree的Git元数据，包括新登记的`/Users/mac/.codex/worktrees/work-structure-history-v1/logseq-task-manager`（分支`codex/work-structure-history-v1`、有未提交工作），未读取其实现或消费其未推送提交；原共享目录`codex/one-click-dsh-collaboration`也未写入。当前工具apps仍为空，没有可操作Logseq连接。已请求共享入口所有者的已发布接入提交与独占宿主连接，不将异步请求未回复视为授权或验收通过。

本修复固定代码实际复跑：`node --import tsx --test apps/dsh-plugin/tests/*.test.mjs apps/logseq-plugin/tests/workspace-context.test.ts apps/logseq-plugin/tests/workspace-reading.test.ts apps/logseq-plugin/tests/agent-workspace-entry.test.ts`，**91/91通过，退出0**；随后Logseq typecheck、DSH build、受影响文件ESLint均退出0，diff检查通过。测试中的独立CLI/HTTP companion是真实运行，但Logseq SDK来源仍为合成fixture，不提升为真实桌面宿主证明。

用户询问Computer Use路径后已明确说明：本聊天工具声明原生应用操作禁用，仅浏览器开放；实际apps清单为空。根本限制是桌面操作通道，非Graph名称、授权不足或固定端口不可更换。独占Graph和空闲端口可自行准备，但不能用脚本绕过当前工具限制控制真实桌面。共享来源按钮仍按原任务要求由入口所有者串行接入。
