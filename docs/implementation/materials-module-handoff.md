# 材料模块开发：起点与 session 交接

日期：2026-10-02。本文确定材料功能开发的初始状态与实施顺序，不声明新功能已经实现，也不代替完整实现提示词。

## 代码与文档基线

- 仓库：`wrd233/logseq-task-manager`。
- GitHub `main` 本次拉取的提交：`85ef106`。
- 本地 `main` 已快进同步，无本地业务代码改动。
- 功能分支：`codex/materials-module`。
- 初始状态：上述 main，加上本提交保存的工作区详细设计、19 幅 SVG 图例与本交接文件。
- 本分支只建立文档基线；材料新功能由后续 session 实现。
- 分支与基线提交目前仅在本地。云端或另一个 clone 不会自动得到它们；使用其他 checkout 时须先明确同步方式。

本地工作目录为 `/Users/mac/Downloads/work/logseq-task-manager`。新 session 可以在该目录直接接续当前分支；同一目录不要同时由两个 session 切换分支或修改实现。需要并行工作时再使用独立 checkout / worktree。

## 必读入口

1. [整体使用设计](../design/2026-10-02-workspace-usage-and-interaction-design.md)，尤其第 2、3、5、12、16–23 章。
2. [当前整合说明](../integration/README.md)与[实际包边界](../architecture/target-package-map.md)。
3. [重构结果索引](../refactoring/README.md)与[第四轮结果](../refactoring/round-04-results.md)，区分交付行为和未验证范围。
4. 这次对话提供的完整材料模块实现提示词；若提示词中的旧路径或能力说明与重构后代码不同，以实际源码和当前权威文档核对。

重构结果文档中的“当时未推送”等语句是原执行记录；本次已从 GitHub main 拉取包含这些提交的代码，不据此判断它们仍未进入 main。

## 本轮交付边界

目标是日常可用的材料模块：

- 工作区内就近保存，无工作区则沿用全局材料目录。
- 保存目的地与旧材料定位分开，稳定 ID 与名称、路径分开。
- 跨已知目录找回材料，兼容旧 longdoc 链接与独立恢复记录。
- 复用长文本转换、保存、引用和恢复，提供显式及程序调用入口。
- Markdown 完整阅读与编辑；其他格式先关联并外部打开。
- 参考、原始输入、工作稿与 agent 产出的编辑边界清楚。
- 用户与 agent 共用核心能力；前端保持阅读优先、轻量导航和反馈。
- 保留草稿、异步作用域、冲突、历史和读回保护。

默认处理：尊重已有目录，简单任务允许平铺；新捕获文档采用可读名称并处理重名，旧文件不批量改名；自动收纳保留既有开关与阈值，提供显式入口。

不做完整 Workspace、阶段审阅、问题聚焦、Git 编排、全盘搜索、正式任务重构或主动行动建议。任务正文仍以 Logseq 为权威，材料正文在原文件；不把镜像或索引建成可编辑第二正文。

## 新基线必须复用的实现

| 落点 | 当前能力与边界 |
| --- | --- |
| `features/materials/controller.ts` | 单目录材料入口；已有 Graph 切换、异步源操作、编辑器复用、草稿与冲突保护 |
| `features/materials/store.ts` | 独立 `.longdoc` 记录、原文/HTML、历史、版本比较、临时文件和读回；不是跨进程原子比较交换 |
| `host/file-io.ts` / `host/desktop-files.ts` | 公共 FileIO 与真实桌面能力；host 不反向导入材料 feature |
| `workspace/context.ts` | 布局键与面板串行协调，孤立 SourceRef / WorkScope 已移除；不是完整工作区提供方 |
| `plugin-runtime.ts` / `block-identity.ts` | 共享运行时与按 Graph/generation 的只读身份查询，不依赖任务中心控制器 |
| `work-view/source.ts` / `renderer.ts` | 串行来源刷新、草稿保护与稳定 UUID 渲染；不在材料任务中重写 |

`agentContext`、`checkAgentPatch`、`continuingLayout` 等未接入原型已被删除。新材料接入不能依赖它们，也不要重新实现已经交付的重构。

## 建议实施顺序

1. 核对实际代码、Node/npm 要求、现有材料记录与必要基线测试；完成模块设计和接口边界。
2. 实现目录选择、稳定材料定位与旧格式兼容，保护独立记录的权威。
3. 接入收纳、关联、编辑权限、程序调用与失败恢复，保留所有草稿和范围保护。
4. 用小范围界面改动走通阅读、编辑、跨任务打开和返回；不改成复杂材料管理后台。
5. 完成回归、隔离环境的交互验证及独立文档，交付清晰的实际结果。

同步交付 `docs/design/materials-module-design.md` 与 `docs/architecture/materials-module-architecture.md`。这两份目标文件在初始状态尚未创建，由实现 session 按最终行为编写。

提交按可审查的真实成果划分，不把未验证实现标为完成。阶段系统和成果认可不在本轮实现范围；这里的 Git 提交也不等于用户认可。

## 验证与后续 main 更新

本次准备只同步代码和文档，不重新宣称已通过整仓运行或 UI 验收。开发 session 先按真实环境执行必要基线；上游重构结果的验证属于其原环境，不能替代本轮检查。

至少覆盖目录选择、旧链接、跨任务定位、权限、引用插入失败、Graph 切换、重复调用、冲突草稿与恢复。隔离环境走通：项目 A 收纳 → 他处打开 → 编辑工作稿 → 切换 B → 再开 A 的引用 → 外部冲突 → 保留并恢复 → 返回任务。

如果 main 后续继续更新，先保存本分支成果，fetch 后检查实际 diff，再在本功能分支合并需要的 main 更新。避免用强制重置覆盖文档或实现，不为保持“最新”反复打断一个可验证的改动。最终合入 main、推送或部署按用户后续指令执行。

## 新 session 可使用的开场补充

> 当前已在 `codex/materials-module`，起点是 GitHub main 的 `85ef106` 加已提交的设计文档。请先读 `docs/implementation/materials-module-handoff.md`，然后执行下面的完整材料模块提示词。直接在此分支推进；保留已落地的四轮重构，不另起 main，也不自行推送或部署。
