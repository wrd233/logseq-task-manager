# 协作审阅与最新 main 整合

2026-10-05，用户明确授权合入最新 main 并推送。远端核验为 https://github.com/wrd233/logseq-task-manager.git；实现与整合在本 session 的独立工作树，不读取其他 session 活动文件，不触碰生产 Graph。

## 基线与提交

| 内容 | SHA |
| --- | --- |
| 实现固定 BASE | `8529212296f0b65fb78ef7ccd2a2102474d9310a` |
| 本次 fetch 最新 origin/main、整合起点 | `c1e59b33f44eb089d800a1500fac761d7f710de4` |
| 协作 UI、局部 Markdown diff、草稿与未知请求恢复 | `af2da08` |
| 最小 installer / index 私有接线、CLI help | `9b27a3c` |
| 设计、架构、交接与生产 CLI / Desktop 证据 | `e944c33b68d8215c36f74ba9911971808314be2d` |
| 普通 --no-ff 合并与 renderer 兼容、交叉回归 | `670076ead5c3c24ed95abbcd7cf2cf0cc9099b19` |

实现分支 codex/collaboration-review-ux；整合分支 codex/merge-collaboration-review-main。实现工作树为 `/Users/wangrundong/.codex/worktrees/collaboration-review-ux/任务管理中心-logseq插件`；整合工作树为 `/Users/wangrundong/.codex/worktrees/merge-collaboration-review-main/任务管理中心-logseq插件`。macOS 15.1 / arm64，Node 20.20.2、npm 10.8.2。各自独立 node_modules / dist；没有改变 package / lock、Kernel 或正式权限。

最新 main 已含完整长报告。唯一冲突在 renderer：保留完整来源、原结构／报告、覆盖计数、Markdown 和原生导航；审阅由独立 helper 渲染，局部 mark 保留链接与代码。共用 main 的 reportMarkdown 清理真实身份属性，保留代码／引用中的 id:: 示例；点击报告正文保持阅读，纠正需明确按钮，历史只读。新增交叉回归同时验证完整报告、变化高亮和历史状态。

共享改动是 stage installer、agent installer、index 一行私有端口组合、CLI help、renderer 与 ReviewPort；最小组合已单独提交，没有暴露外部 accept / authorize，没有替代 content executor、materials 或 stage schema。

## 本轮检查

| 检查 | 结果 |
| --- | --- |
| 针对性审阅／原生报告／长报告／材料／整理 | 67/67 |
| 完整 workspace 测试 | 637/637；其中 plugin 403/403 |
| sandbox / boundaries | 5/5、12/12 |
| 完整总计 | 654/654，零失败／跳过／取消 |
| npm run check | exit 0；requirements、typecheck、lint、test、build、boundaries、taste 全部通过 |
| git diff --check | 通过 |

第一次整合检查发现新增测试使用 NodeList 展开，与项目未启用 DOM.Iterable 的类型配置不兼容；改为 Array.from 后重跑完整检查通过，没有改变断言或源权限。源码分支的 646 项门禁和此处整合的 654 项分别记录，不混用旧验收数。

## 真实宿主与接入证据

最终代码构建复制到本 session 自己的隔离 Logseq 插件目录，只重载自己的 sandbox。Debugger.getScriptSource 的运行时 bundle SHA-256 与整合构建一致：`c3dd9988c29a2b656e005cff52546bf723d79ed344a25e07a40be3339dd6ff77`。

真实当前报告 88/88 来源、7 处局部高亮；后写条件仍在当前正文。已认可旧 revision 和 acceptance 完全不变，历史明确选择已认可修订、原生编辑禁用；返回当前恢复后来文字。连接断开，材料 available，本地阅读及历史仍可用，tasksEnabled=false、没有 Kernel。精简事实、运行代码 SHA 与日志 hash 见 [integration-evidence.json](../implementation/assets/collaboration-review-ux/integration-evidence.json)。

独立生产 CLI 的润色、move-block、query/recover 与同键重试，以及真实本地纠正／建议／认可／原生继续写作，见 [功能交接](../implementation/collaboration-review-ux-handoff.md)。整合没有重写 transport 或 executor；此处没有把最终 Desktop 阅读复验说成重新执行了一整轮 CLI。

物理中文 IME、系统 Undo、原生系统拖放、其他 OS 与 Desktop 崩溃／Journal 损坏注入仍未实机验收；对应 DOM／逻辑保护和恢复回归已通过。没有新增实机通过声明或 SDK 全局 CAS 保证。

## 发布核验

整合代码与文档完成后，检查主 checkout 在 main 且干净，快进到本整合结果，正常执行 git push origin main:main。保留 pre-push guard，不强推、不绕过 hook、不改变全局 proxy。发布前再次核验远端仍是本次整合的 main，若已增长则先整合后重新验证。

最终发布 SHA 在任务完成回复和 git log 中给出；使用 git rev-parse main 与 git ls-remote --heads origin refs/heads/main 相同 SHA 确認。本记录的最后提交只更新文档和验收事实，受检产品代码仍为 670076e。
