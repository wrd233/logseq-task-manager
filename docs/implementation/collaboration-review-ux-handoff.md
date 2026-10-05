# 协作审阅与原文维护交接

2026-10-05。实现按需协作、准确版本审阅、现有受控纠正／建议与未知请求查询；已使用生产 CLI 和隔离 Logseq 验证。功能实现首先交付在独立功能分支；2026-10-05 用户随后明确授权合入最新 main 并推送，整合检查和最终远端 SHA 另记于本轮整合记录。

## 起点与范围

- 远端：<https://github.com/wrd233/logseq-task-manager.git>。
- 本轮 fetch main 与锁定 REMOTE_BASE_SHA：`8529212296f0b65fb78ef7ccd2a2102474d9310a`，可从远端获取并属于 main 历史。原文整理已经在该基线，不重复建设。
- 分支：`codex/collaboration-review-ux`；工作树：`/Users/wangrundong/.codex/worktrees/collaboration-review-ux/任务管理中心-logseq插件`。macOS 15.1 / arm64，Node 20.20.2、npm 10.8.2。没有适用 AGENTS.md，没有改变系统 Node 或 package/lock。
- 依赖、dist、合成 Graph、材料、home/profile、Journal、companion/descriptor、端口均在自己的工作树。没有写生产 Graph、其他活动 checkout 或 Kernel。
- 产品：[设计](../design/collaboration-review-ux-design.md)；实际边界、版本、恢复：[架构](../architecture/collaboration-review-ux-architecture.md)。

## 实现与共享接线

主体是 stage-workbench review / diff / collaboration-setup，work-view 的 ReviewPort / review-renderer / text-diff；renderer 只替换 review 分支的局部呈现调用，Markdown 的原安全规则保留。没有重写报告正文、bookmark、公共布局、材料、正式任务或历史 schema。

最小组合提交单列：stage installer 增加查询／恢复私有端口、协作命令、setCollaboration；agent installer 暴露给组合根的私有 local connect / stop；index 增加一行组合。CLI help 说明 stage.read 也要求 --input-file。现有外部 stages API 仍没有 accept、authorize 或 setCollaboration。

本地真实命令为「工作台：查看协作与这次改动」「工作台：开始有意义阶段」「工作台：记录当前阶段版本」「工作台：查看阶段历史」「工作台：认可当前所见阶段版本」。界面有「协作／查看这次改动」入口、「纠正」「原文建议」及显式未知结果查询。认可快捷键仍经所见版本门禁。

后续整合只需保留上述私有组合／dispose 和 ReviewPort 挂载。01/06 可以调整公共标题、布局与导航；不能把 local connect / accept 注册给外部 transport。workspace、content、materials、stage schema 没有新增 adapter 或迁移待办。

## 真实连续证据

Logseq 0.10.15 来自隔离复制 app，专用 CDP `127.0.0.1:19347` 已核验独占，app PID/home/profile/Graph 的隔离事实保存在私有 tmp；没有连接默认 19333 或其他实例。tasksEnabled=false，未启动 Kernel。Graph 初次打开之前 SDK ready 超时；打开自己的 Graph 后只 reload 自己的插件，再开始验证。

通过实际 SDK 创建 Area／Project 页面和 MiniProject、80 条混合记录，合计 87 块、5929 UTF-16 字符、四层子树；包括两个事务、子 MiniProject、普通 TODO、条件／反例和材料模块创建的真实 stable materialId。fixture 及复验片段见 [证据目录](assets/collaboration-review-ux/README.md)。

| 环节 | 本轮证据 |
| --- | --- |
| 无阶段默认阅读 | 一个协作入口，控制区隐藏，87/87 条来源；没有自动创建阶段或源写入 |
| 本地开始／许可 | 界面输入阶段目标并开始；点击明确的润色／原块整理许可，经私有安装端口使用真实 authority |
| 外部写入 | 独立 Node 生产 CLI 进程，真实 workspace companion/router/provider；文本润色 APPLIED_VERIFIED、move-block APPLIED_VERIFIED / move.verified=true |
| 查询与重试 | 同一 client 使用调用时的原 requestId 查询／recover；同 payload 重试返回同一 record，无第二次移动 |
| 身份与保护 | 三个移动子树 UUID、正文、链接保留；普通 TODO 不变，未新增报告标题 |
| 本地审阅 | 报告模式查看局部高亮与真实旧新位置；实际界面纠正一句、添加一个普通建议子块，同阶段记录 |
| 本地认可 | 展示 revision 与 acceptance.revisionId 完全一致，revisions 没有被认可动作改写 |
| 原生继续写作 | 从源行「编辑原文」进入 UUID 匹配的真正 Logseq textarea，用 CDP 输入文本并 Escape 保存；草稿被读到，已认可历史 JSON 完全不变 |
| 历史／材料往返 | 下拉明确选择已认可旧 revision，只读且原生编辑／报告切换禁用；返回当前能见后写文字；点击稳定材料链接打开真实文件阅读再返回 |
| 聚焦／全部变化 | 真实界面选择源行范围：3 条可见，明确提示 14 处范围外变化；看全部后 17 条，返回仍为原 focused 范围的 3 条 |
| 权限／冲突／部分 | CLI 批次一项 verified、一项 BLOCKED / PROTECTED_TODO；旧版本请求 CONFLICT / CONTENT_VERSION_CONFLICT；partial 经 stage.submit 保存并在 UI 显示写回问题 |
| 重载／离线 | reload 自己的插件，旧修订和认可逐项不变；重新本地记录当前版本，材料仍 available；断开连接后本地 88 块、材料与历史可用 |

对未知回复／重启提议、composition、原生编辑拒绝、聚焦／全部变化、缺失块、准确所见修订和私有权限端口有本轮 DOM/逻辑回归。宿主超时、Journal 故障、Graph/scope 晚到失效和正式边界继续由整理／既有写回回归验证。本轮没有把模拟 composition 事件、DOM 或 SDK 类型当作物理中文 IME、系统 Undo、拖放或跨 OS 验收；这些不是新功能范围，仍需现场复验。

## 生产 CLI 片段

先在本地关联测试工作的目录，启动现有 CLI serve，将输出的 workspace-plugin.json 私有路径填入设置；在协作说明中点击文本或明确结构许可，在本地开始阶段。以下 WORK_DIRECTORY / PRIVATE_STATE / CLI 均由当前机器实际目录决定，不使用生产凭据。

```sh
node "$CLI" workspace serve --state-dir "$PRIVATE_STATE"
node "$CLI" workspace refresh --directory "$WORK_DIRECTORY" --state-dir "$PRIVATE_STATE" --client review-demo --json
node "$CLI" workspace content read --directory "$WORK_DIRECTORY" --state-dir "$PRIVATE_STATE" --client review-demo --json
node "$CLI" workspace capabilities --directory "$WORK_DIRECTORY" --state-dir "$PRIVATE_STATE" --client review-demo --json
node "$CLI" workspace stage read --input-file stage-read.json --directory "$WORK_DIRECTORY" --state-dir "$PRIVATE_STATE" --client review-demo --json
node "$CLI" workspace stage submit --input-file stage-submit.json --directory "$WORK_DIRECTORY" --state-dir "$PRIVATE_STATE" --client review-demo --json
node "$CLI" workspace content result "$ORIGINAL_REQUEST_ID" --directory "$WORK_DIRECTORY" --state-dir "$PRIVATE_STATE" --client review-demo --json
node "$CLI" workspace content recover "$ORIGINAL_REQUEST_ID" --directory "$WORK_DIRECTORY" --state-dir "$PRIVATE_STATE" --client review-demo --json
```

stage-read.json 为 `{stageId}`（组合根也支持空对象读取当前阶段）；stage-submit.json 为既有 `{stageId,expectedRevision,patch}`，Patch 的 metadata.stageId 必须一致。结构操作使用 schemaVersion:2。补丁必须由实际 source facts 生成；[复验脚本](assets/collaboration-review-ux/production-cli.mjs) 展示文本／移动与逐项查询，不能把 fixture 或例子的 UUID 当真实来源。

router 会将 caller requestId 命名空间化；查询必须使用原 caller requestId 与同一 client，不能把返回 record.patch.requestId 的内部 external-* ID 再送入 router。本轮初次复验用内部 ID 得到 REQUEST_NOT_FOUND，改回原 ID 后查询／恢复／幂等全部通过，没有因此再写一次。

## 验证与交付状态

针对性 58 项通过（包含本轮 12 项协作专项、原审阅／移动／材料组合回归）。完整 `npm run check` 通过：629 项工作区业务测试、5 项 sandbox、12 项边界测试，共 646 项，零失败／跳过；typecheck、lint、build、requirements map、边界检查、taste 均通过。`git diff --check` 通过。复验资产的 Node 语法／lint 单独通过。

最终审计补强了两个实际边界：源已验证但最终 Journal 未持久时，保留原请求、查询后仍尊重既有 executor 的保守未知归责；源 durable 成功但阶段保存失败时，查询可证明结果后用同一请求补记，测试确认写次数不增加。确定版本冲突后禁用旧请求保存，先显式重新读取；现场同时保留读取基础文、结果中的当前文和提议；实际 TODO 拒绝的紧凑入口见 conflict-proposal.png。

主体提交 `af2da08`，最小共享组合提交 `9b27a3c`；文档／证据另行提交，完整 HEAD 见交付回复和 `git log`，功能阶段未修改 main／推送分支；本轮后续发布按用户的明确授权推进。截图和精简事实为本轮生成；完整正文、Journal、private descriptor 留在隔离目录，不放公开资产。

物理中文 IME / Undo、系统拖放和其他 OS 没有新增实机通过声明。已运行的生产 transport 不等于 UI 自动启动 agent；本轮不发送消息、不配置模型、不开外部认可权限，也不要求本地阅读持续在线。
