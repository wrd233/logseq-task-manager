# Final UX Polish & Acceptance Closure v1

验收：2026-11-07～08，macOS，真实 DSH 0.2.1-rc.2 + Logseq Desktop 0.10.9。独立 Profile、Graph、工作目录和端口；未使用日常 Graph，未发送对话或调用外部模型。

## 交付范围与基线

- 新分支：`codex/final-work-experience-polish-v1`，独立 Worktree。
- 从已推送最终整合 `bdd08ac8f7f83aa6a9ab253e8e303573ea00ca3f` 开始；收尾 fetch 后原分支仍在该提交。
- `origin/main`：`4acc2699a5740e54b6875b30ad3052a8aa89d625`，未修改。
- 继承链包含 `12d694d7` → `0037c8f3` → Core `526f2a16` / `ee3798d9` → UX `8d3a5f31` / `4b53591a` → 最终整合 `bdd08ac8`；本轮没有重复合并、cherry-pick 或 Git 冲突。
- 保留 Work Context / Session、Reader、Companion、当前结构、Structure History、Git 回顾、Planner。没有重建 Workspace、数据库或 Session。

## 实际问题与修复

### 引用 JSON

全新独立 DSH Profile、空白草稿中重新引用仍出现 JSON，确认不是历史草稿残留。旧逻辑直接将来源身份序列化后插入普通草稿文本。

改用 DSH 已有的 `inputTriggers` codec 和会话作用域 `slash/input-insert-reference`。用户看到原文摘要、Logseq 和所属工作；复制得到可读引文。完整来源快照保存在原生引用 `ref`，由 codec 投影到模型上下文，未删除 sourceId、Graph、块 UUID、WorkRef、版本或选区。快照是引用数据，不是写授权。

真实单块引用，以及表格行内代码选段 `inline` + 另一整块组成的多块引用均通过。原生编辑器状态保留 3 份完整来源快照；选段映射到表格源块的 UTF-16 `35..41`，重载后仍一致。草稿“保留我的原有草稿。”保留，未点击发送。见 [原生引用证据](evidence/native-reference.json)。

### Planner 物理拖动

旧 HTML Drag and Drop 在真实指针操作下触发 dragstart，但目标没有可靠收到 dragover/drop。以现有把手的 pointer capture 替换该段事件处理，沿用原移动接口、排序和存储，没有引入 DnD 包。

通过真实鼠标指针完成：

1. “核对交付方案”从上午拖至午休后。
2. 将“验证历史回看”拖至它前面。
3. 重载后：上午仅“检查来源引用”；午休后依次“验证历史回看”“核对交付方案”。

测试数据准备使用生产接口；上述拖动动作没有通过脚本派发事件或直接改存储冒充。固定评审会议没有把手，拖动未改变它；通过明确编辑将结束时间 22:30 改为 22:31，保存后保留。见 [拖动前](evidence/planner-before.json)、[最终数据](evidence/planner-after.json)。

### 新 Stage 历史

使用正常 Logseq 编辑完成新增任务、修改结论、移动既有 MiniProject，再通过现有 Stage UI 记录当前版本。没有手写 StageStore JSON。

- Stage：`27985876-5cf0-424e-90c1-31597e51422d`。
- 新修订：`6a64f21e-3b85-4051-983e-d9fa6b8a7fd4`，父修订正确。
- 来源为 `StageStore.history`：8 → 9 节点；差异包含新增 1、正文/标题变化 1、顺序变化 2。

发现仅打开历史列表不会同步刚录制的 Stage，之前依赖模型上下文装配等触发观察。本轮令 `history-list` 先调用既有 `observe`，再读取列表；仍按原 requestId 去重，不额外录制 Stage。真实界面新记录与差异通过。之后继续修改当前正文并删除风险块，历史仍保留原文和原节点；当前结构没有冒充历史。Git 观察仍在独立 track。见 [真实 Stage 与差异](evidence/real-stage.json)。

### 系统级原文跳转

未发现可复用的隔离 Link Bridge，先报告限制并获得用户明确许可“允许临时切换，验收后立即恢复”。临时将 `logseq://` 指向本轮隔离 Logseq。实际点击 DSH 来源链接并接受浏览器外部应用提示，激活隔离 Desktop，定位测试 Graph 的任务块 `22222222-2222-4222-8222-222222222222`，不是只校验 URL。

完成后立即恢复原 handler `com.electron.logseq`（日常 `/Applications/Logseq.app`），收尾再次核对一致。已变化的来源显示核对提示；已删除来源不提供原文跳转，未用历史内容代替当前内容。见 [实际目标](evidence/system-navigation.json)、[界面证据](screenshots/10-system-logseq-source-navigation.png)、[删除来源](screenshots/07-deleted-source-no-navigation.png)。

## UI 精修与截图

Reader 正文 14px / 1.75 行高，弱化语义标签底色；工作对象和 Planner 标题提高权重，收短技术状态文字；History / Git 使用工作名称而非目录 UUID；Git 缩小巨大标题与留白。保留各模块布局，没有新增卡片、统计或装饰。

| 页面 | 精修前基线 | 浅色精修后 | 深色精修后 |
| --- | --- | --- | --- |
| 当前工作 | [之前](../final-work-experience-v1/screenshots/01-current-light.png) | [当前](screenshots/12-after-current-light.png) | [当前](screenshots/08-after-current-dark.png) |
| Reader / 草稿 | [本轮 JSON 复现](screenshots/01-before-reader-json.png) | [正常原生引用](screenshots/13-after-reader-light.png) | [正常原生引用](screenshots/09-after-reader-quote-dark.png) |
| Planner | [拖动前](screenshots/02-before-planner-drag.png) | [当前](screenshots/11-after-planner-light.png) | [跨时段](screenshots/03-after-cross-slot-drag.png) / [排序与重载](screenshots/04-after-reorder-reload.png) |
| Structure History | [之前](../final-work-experience-v1/screenshots/04-history-light.png) | [真实新 Stage](screenshots/14-after-stage-history-light.png) | [真实新 Stage](screenshots/17-after-stage-history-dark.png) |
| Git 回顾 | [之前](../final-work-experience-v1/screenshots/05-git-light.png) | [实际文件 Diff](screenshots/15-after-git-review-light.png) | [当前](screenshots/16-after-git-review-dark.png) |

原始截图未加工。前基线来自此前最终整合，表中明确区分本轮新复现。原生引用的长标签会由 DSH 根据宽度截断，完整数据仍保留。

## 关键回归与边界

- 真实工作 A/B 具有不同 WorkRef、工作目录和 Session。B 只展示 B_ONLY 正文，初始草稿为空；添加 B 草稿与引用，切回 A 未串入 B 草稿，再回 B 均恢复。见 [工作 A](screenshots/21-work-a-after-b.png)、[B 恢复](screenshots/22-work-b-draft-restored.png)。
- 停止本轮 Companion，界面显示离线；重启后同一工作自动恢复，无需重新关联。见 [离线](screenshots/19-companion-disconnected.png)、[恢复](screenshots/20-companion-restored-readonly.png)。
- 恢复后真实 CLI 状态：`fileWrite=false`、`content=false`、`authorizesTodo=false`，读授权没有扩大。见 [权限证据](evidence/readonly-recovery.json)。DSH 原生输入栏的通用“工作区内修改”模式不代表获得 Logseq 写授权。
- 当前结构保存后刷新；子对象进入/返回、Planner 到已有工作定位、重复工作入口复用，沿用既有实现。未新增 Session 系统。
- 源连接已切换时旧连接按 `CONNECTION_STALE` 失效，旧工作不读取新工作正文；进入对应 Logseq 工作重新建立其活动连接。保存的历史仍可只读浏览。
- Git 回顾使用隔离材料目录的真实 Git baseline + README 改动，不混入 Logseq 历史线；未调用 Agent 解释服务。

## 工程验证

Node 20.20.2：必要回归 **97/97 通过，0 失败、0 跳过**，包括 DSH 77、Logseq 入口/阅读/集成 18、CLI 来源路由 2。覆盖引用身份、草稿插入位置、工作隔离、历史可信来源及固定时间保护。保留 [TAP](evidence/regression.tap)。

DSH 源码与测试 ESLint、`git diff --check` 通过。DSH 与 Logseq 插件构建通过；没有运行整个仓库的大型矩阵。真实宿主操作由本轮隔离环境完成；11 月 7 日完成主要 Chrome 操作，锁屏/进程恢复后的 11 月 8 日用 Safari 补充工作隔离与 Companion 恢复。

## 保留限制

- 当前工作结构仍仅树模式；历史保留树/图。当前结构图作为后续小增强，不阻塞整合。
- 浏览器节流、系统外部应用提示及窗口前置行为仍受平台控制，不增加窗口管理系统。
- 表格精确选段已验证；无法可靠映射的转义管道单元格仍提示整块引用。
- 隔离 Chrome 副本在隔夜恢复后出现空白页，补充验收改用 Safari；未将它记为产品通过项，未改动浏览器安全设置。
- 尚未做长期连续运行、跨平台或触屏验收。自动发送及真实模型调用不在本轮范围。

本轮只推送新的 polish 分支，等待审查，不合并 main。
