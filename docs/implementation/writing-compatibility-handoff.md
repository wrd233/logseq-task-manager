# 事务／任务书写兼容交接

2026-10-04。实际分支 `codex/writing-compatibility`，本地交付；未推送、建 PR、合入 main 或联系其他 session。

## 基线与提交

- origin：`https://github.com/wrd233/logseq-task-manager.git`。
- 共同基线：`e666e7be1367e97dabf5f787c7dcb944ac70e815`。启动时 fetch origin main 成功，确认提交可取且是 origin/main 祖先；未随远端增长更换基线。
- 核心兼容：`22ccb3c79cea963e5baef31896cb71294d84de05`，canonical owner 与行为回归。
- 消费接线：`c6faec80d2da24ed83de09074313b443d617a8f4`，注册命令、raw 来源保存、UUID 导航、正式保护及连续回归。
- 普通 legacy 标题提取补充：`1db965a051b0ab3ad3c0473a2b658f8f2f318db9`，保留 `[任务] TODO`／`[事务] TODO` 与 marker-first 非粗体来源的既有标题提取行为，不改变正式锚点资格。
- 文档提交位于以上提交之后，最终交付 HEAD 由 `git rev-parse codex/writing-compatibility` 获取。

按顺序 cherry-pick 以上三个不可变提交即可接入代码；文档提交可一并接入。第一份提交已经提供 `taskLabel`、完整来源格式化及导航／保护辅助函数，第二份提交给出实际消费点。不读取其他 session 未提交文件或活动目录。

独立目录由当前 chat 的 managed worktree 创建。OS／CPU 为 Darwin x86_64，启动时无适用 AGENTS.md。原 main 的未跟踪 prompts 未处理。安装与构建使用本 worktree 私有 Node 20.19.5／npm 10.8.2；系统 Node 22 未改变。node_modules、dist、缓存、Graph、app 副本、home、profile、SQLite、descriptor、端口和进程均独立。

## 已交付行为

支持 `TODO **[事务]** 名称` 和既有 `[任务]`，所有既有合法 marker 与 prefix-first 仍可读取。MiniProject 继续为 `**[MiniProject]** 名称 #MiniProject`。读取与导航不创建正式对象或改写标签；明确合法的正式化、标题／状态及规范化保留完整多行内容、属性、UUID、链接、局部 TODO 和子树。

无来源的新 Task 默认仍为 `[任务]`。格式化入口接收语义标题；装饰剥除在来源标题提取处完成，标题本身的 TODO／Markdown 不再被二次剥除。保护器和导航复用 canonical owner；识别事实不等于正式身份或授权。

Project／Area 保持页面，TASK／MiniProject 保持块对象。普通内部 TODO、同名嵌套根及自然标记不自动正式化。没有新 TASK 类型、Area kind、schema 迁移、全 Graph 扫描、报告分组或正文小标题。

## 自动验证

| 检查 | 结果 |
| --- | --- |
| 核心 canonical 行为 | 13/13 |
| canonical、adapter、protection、formal marker、identity、focus 定向组合 | 112/112 |
| 注册正式化 → 真实 Kernel → 真实 GraphAdapter 的合成 SDK 连续回归 | PASS；两种标签和 MiniProject，创建／完成／Undo／重新渲染 |
| 完整 `npm run check` | 退出码 0；563/563，0 fail、0 skip，其中插件 312/312 |
| 需求地图、全仓 typecheck／lint、构建及二进制核验 | PASS |
| Sandbox／边界 | 5/5、12/12；Dependency boundaries verified |
| Taste | PASS，KEEP_0.1.0_ACTIVE，未激活候选 |
| `git diff --check` | PASS |

完整检查日志为 worktree 忽略目录 `tmp/writing-compatibility-runtime/check-final.log`。最初的类型／lint 和新回归失败已修正，以上是修正后完整门禁，不能引用旧轮次数量。

可复现小夹具：`apps/logseq-plugin/tests/integration/writing-compatibility-entry.test.mjs`。它运行真实注册 controller、Kernel／SQLite 和 GraphAdapter，SDK／HTTP 是明确标注的合成替身；根含 `[注]`、`[目标]`、`[想法]`、条件、属性、链接、普通 TODO 和同名嵌套根。其余行为回归在 canonical-writing、graph-adapter、content-writeback 和 integration/focus 测试中。

## 本轮真实 Desktop 证据

应用由仓库 sandbox harness 从安装版副本建立，Logseq 0.10.9／SDK 0.3.4。Desktop 实测代码为 `c6faec8`；最后 `1db965a` 只补充非粗体 legacy 标题提取，其定向及最终门禁另行通过，未再跑 Desktop。连接前核验 owned PID、完整 app／profile 路径与 CDP page URL；CDP 仅使用本 worktree 的 `127.0.0.1:19333`。没有连接生产 Graph、试用实例或其他 session 的进程。

合成 Area 页面“个人工具”、Project 页面“资料工作台”，以及事务／MiniProject 使用真实 Desktop 原生编辑区。输入由 CDP `Input.insertText` 驱动，退出编辑后用实际 SDK 读取已提交内容。注册命令通过宿主 `App.invokeExternalPlugin` 调用，正式提交走真实本机 Kernel／Graph bridge，不用测试直接修改状态。

| 实机事实 | 结果 |
| --- | --- |
| 原生输入事务与 MiniProject，重新打开 MiniProject | 保留自然正文、标签及局部 TODO |
| 事务正式化、完成、正式 Undo | TASK OPEN → COMPLETED → OPEN；标签、根 UUID、自然正文顺序与属性值保留 |
| MiniProject 正式化／重新渲染 | MINI_PROJECT，干净标题，无新增语义提交 |
| 完整宿主窗口重载 | 两个持久根 UUID、两种对象写法和自然正文保留 |
| 同名嵌套根及普通子 TODO | Kernel 仅两个明确创建的对象，未自动纳入子记录 |
| Kernel 核验 | 四个投影义务均 VERIFIED，recovery 为 0 |
| Kernel 停止且 tasksEnabled=false 后重新装载 | 报告仍可读取，事务首行受 formal-title 保护；未知字段归属保守保护 |

真实 `updateBlock` 会移动属性行到首行之后。传给宿主的是完整来源，实机自然正文和属性值均保留；不能宣称属性行位置逐字节不变。自动回归同时验证传入适配器的 LF／CRLF 和完整 tail 字节不丢失。

本地证据位于 `tmp/logseq-sandbox/evidence/`：`isolation-runtime.json`、`writing-completed.json`、`writing-task-mini.json`、`writing-final.json`、`writing-native-before-reload.json`、`writing-native-after-reload.json`、`writing-offline-protection.json`。文件包含本机合成路径／UUID，仅保留在忽略目录。验证结束停止本分支 Kernel／Desktop；Desktop 优雅关闭超时后再次核验 PID 身份，仅强制关闭本分支应用副本。所有证据和合成 Graph 保留。

## 未验与最小后续步骤

CDP 输入是真实原生编辑区自动化，不是系统键盘、中文 IME 或人工视觉签收。未验系统 Undo、剪贴板、跨 OS、正式 Project 绑定 UI、正式标题修改的 Desktop UI；标题修改已有真实 adapter 合成回归。重载后新离线块的原生编辑挂载未可靠完成，截图采集超时，因此不把它们记录为通过。

最小后续步骤是在隔离 Desktop 的可见窗口手动点击原块，输入中文并提交／刷新，核对两种标签和全文；完成正式标题修改，核对属性与子树；关闭 Kernel 后点击普通记录继续输入，并试验系统 Undo。不得用模拟 composition 或 DOM 写值替代这些结果。

供 01 使用 canonical 根／标题／标签事实；供 03 接入兼容后的 protection。02 材料接口无变化。最终整合 session 统一处理共享 controller／adapter／focus／protection 的提交冲突，并更新使用手册和 PDF；本分支没有并发改写它们。

设计和实际架构分别见 [设计](../design/writing-compatibility-design.md) 与 [架构](../architecture/writing-compatibility-architecture.md)。
