# Capture / Inbox 交付与验证

日期：2026-10-22，Asia/Shanghai。当前实现可以运行；真实 Logseq Graph 的正向来源集成验收仍未完成，不能把下述 DSH 无绑定验收当作双宿主全量完成。

## 隔离与基线

- Worktree：`/Users/mac/Downloads/work/logseq-task-manager-capture-inbox`。
- 分支：`codex/capture-inbox-v1`，从已推送的 `fd68b83` 延续；共同产品文档祖先 `f992619025f5b4d086a2e8ee1729936d488ecc89`，已包含 `origin/main` 的 `2cb0ced7688b7af19ac5814b1f556ecae255f3c9`。
- 开始前核查根目录、status、当前分支、全部 Worktree，fetch 成功后确认分支无 Worktree 占用，才创建同级独立 Worktree。
- 原目录 `/Users/mac/Downloads/work/logseq-task-manager` 属于另一个 Goal，分支 `codex/one-click-dsh-collaboration`。只读其 Git 元数据；没有切换、清理、修改其文件或停止其服务。期间其 HEAD 从 `fe0ac21` 前进至 `f846316`，未提交清单也有变化，这是并行工作自身的进展，不能宣称快照逐字未变。本 Goal 所有代码、构建、配置和测试数据写入自己的 Worktree（临时文件测试使用独占系统临时目录）。

## 可用体验

DSH 现有会话标题栏提供“记一下”和“Inbox”。快速输入无需项目或标题，保存后反馈并返回原焦点；钉住后可连续输入。背景不关闭，Escape 保存草稿并返回，中文输入 composition 不触发保存快捷键。浮窗保留原生对话和阅读组件。

Inbox 支持全文与旧正文搜索、双击编辑、原文/版本查看与恢复、今天/结果多选、批量归档和撤销。版本冲突与未知回执保留输入，批量操作遇未知立即停止，同 key 重试，不跳过失败项。关闭重开恢复控制器内的选择和滚动；重启只保证可靠落盘的数据和草稿，不保证滚动。

“带去 DSH 草稿”同步捕获原生选区，最终插入前重新核对服务端 lease 和当前 session；原生输入修订或锁定由 DSH span 接口拒绝。引用含记录 ID、版本、原始正文、当前正文和真实 session 来源。只追加草稿，不发送、不改绑定、不归档、不创建 Task。已成功插入的本次引用不允许点重试造成重复。跨重启保留的引用文本仍需用户核对原草稿，不能保证跨宿主崩溃的 exactly-once 插入。

认证 RPC 不接受客户端指定存储路径或上下文。默认私有根为 bindingStateDirectory 下 capture-inbox，隔离 profile 显式指定独立根。按完整上下文和会话分区，不写 Journal 或 Graph。断连旧现场的内存正文保留，重开相同 session 可查看旧现场输入；不能自动搬进新绑定。

## 运行

需要本机 DSH CLI（本次 `0.2.1-rc.2`）、Node 与已安装仓库依赖。

```sh
cd /Users/mac/Downloads/work/logseq-task-manager-capture-inbox
npm run preview:capture -w apps/dsh-plugin
```

该命令构建并创建 `tmp/capture-preview` 的独立 DSH_HOME，系统分配空闲端口，终端输出带认证信息的本机地址。不会调用 install:dsh，也不修改日常 profile。新 profile 无模型凭据；Capture 入口在已建立的原生会话中显示，继续真实模型对话需自行配置该隔离 profile。已有会话与数据保存在独立根中。Ctrl+C 仅结束该启动器的子服务。

本次实际体验宿主在 `tmp/capture-host`，端口 53891，所有记录都是标明验收的合成文本。并行使用中的 3080、3081、19333 等监听未被本 Goal 占用或重启。

## 实际验证

- `npm ci` 首次因证书无法下载 native headers 失败；使用本机头文件 `npm_config_nodedir=/usr/local/opt/node@22 npm ci --no-audit --no-fund` 成功。Node 22.23.2/npm 10.9.8；根 engine 指定 Node 20，因此保留环境差异，没有修改 engine/lock。
- 首次 `npm run check` 的 Kernel Console 测试 404，原因是干净 Worktree 未先构建 console 网页。先 `npm run build` 成功，再 `npm run check` **退出 0**，包含类型、lint、全部 workspace 测试、sandbox、构建、边界、taste。
- 最后增补的 DSH 插件回归：`node --import tsx --test apps/dsh-plugin/tests/*.test.mjs`，**63/63 通过**。其中新 RPC 用例使用生产入口、CaptureHost、真实 FileStore，DSH 注入服务明确为替身；验证重启读回、同键去重、拒绝伪造字段和没有 Capture 模型工具。
- 修改的启动器、客户端与测试 ESLint 通过；DSH build、git diff --check 通过。`preview:capture` 实际启动在系统分配的 58026。
- `node --import tsx apps/dsh-plugin/tests/host-proof.mjs` **退出 0**：真实 Cordis、HTTP companion 和插件工具；Logseq SDK 为合成 fixture，不能算真实 Logseq。
- 真实 DSH Web / 原生 React slots / 原生输入框 / 认证连接 / 真实文件：保存、收起、重开、钉住连续保存、双击编辑、旧正文搜索、两条多选引用、保留原有草稿、批量归档及撤销，均实际操作通过。关闭后焦点返回原生输入框通过。
- 真实故障注入：仅将自己的 captures 目录暂改 0755，私有存储拒绝写入；界面保留正文并报告未知。恢复 0700、重查草稿并重试，最后总共只有 3 条（此前 2 条＋故障恢复 1 条），未重复。
- 构建触发 DSH 客户端重新加载后，同会话再次打开仍有 3 条、编辑历史和原引用。服务端重启去重另由真实磁盘 RPC 用例验证。

截图：[真实 Inbox](assets/capture-inbox/dsh-inbox.png)、[保存失败保留正文](assets/capture-inbox/save-failure.png)。截图中“处理失败”来自隔离会话没有模型 API Key，不是 Capture 保存失败；没有外部模型调用成功。

## 未验证与人工待决

真实 Logseq Desktop 当前由另一个 Goal 使用，本 Goal 没有替换其插件、接入其 Graph 或操作其进程。尚无可独占的真实 Logseq Graph/宿主验证窗口，正向 block/material 来源、真实 Graph 断连/换绑、物理中文 IME、长阅读滚动现场、系统断电未验。当前只能交付实现与上述验证，完整双宿主验收仍待这项外部条件；不得标记完整 Goal 已完成。

Journal 与 Inbox 的最终同步、跨会话历史聚合、绑定搬迁后的回访入口、跨设备同步、版本保留/压缩策略及正式化映射仍需产品决定。现版不自动写 Journal，不把归档解释成正式完成；用户可在另行确认正式事务后手动归档原记录，并从归档历史追溯。未实现系统级置顶或 AI 分类。

## 修改文件

- `apps/dsh-plugin/package.json`
- `apps/dsh-plugin/scripts/preview-capture.mjs`
- `apps/dsh-plugin/src/index.mjs`
- `apps/dsh-plugin/src/client.jsx`
- `apps/dsh-plugin/src/capture-inbox/host-client.jsx`
- `apps/dsh-plugin/src/capture-inbox/controller.mjs`
- `apps/dsh-plugin/src/capture-inbox/view.jsx`
- `apps/dsh-plugin/src/capture-inbox/README.md`
- `apps/dsh-plugin/tests/capture-inbox.controller.test.mjs`
- `apps/dsh-plugin/tests/capture-inbox.rpc.test.mjs`
- 本交付记录及两张真实 DSH 截图。

提交 SHA 从本记录所在分支 `git log -1` 获取；不把自引用 SHA 写入提交自身。仅推送独立开发分支，不推 main，不强推。
