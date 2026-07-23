# Screenshots

本目录只保存经过脱敏、与当前实现 commit 对应、可进入版本控制的运行证据。

每张图片必须在 `../06_TEST_AND_EVIDENCE_PLAN.md` 规定的元数据中登记。原始私人截图、descriptor、终端历史、API Key、绝对路径和真实业务内容不得进入本目录。

当前本地 UX 调研原图位于 `docs/research/current-ux-evidence/screenshots/original/`，在完成内容审查并明确纳入某个 Slice 前不自动复制。

## 当前证据

| 文件 | 类型 | 结论 |
|---|---|---|
| `original/p0-a-01-descriptor-filesystem-path-rejected.png` | 真实 Logseq Desktop 0.10.15 | 独立 Service 已存在时，filesystem descriptor 路径仍被当前 renderer 的 FileStorage fallback 判为 `SERVICE_DESCRIPTOR_PATH_INVALID`；P0-A 正式写入 Gate 必须先完成 P0-H 私有 handshake |
| `original/p0-h-01-private-descriptor-import-ready.png` | 真实 Logseq Desktop 0.10.15 | 选择本地 descriptor 后，校验内容只进入固定插件私有 key；主 UI 显示 Runtime/Store READY 和不暴露 token/path 的成功反馈 |
| `original/p0-h-02-private-descriptor-reload-ready.png` | 真实 Logseq Desktop 0.10.15 | reload 后无需再次选择文件，插件直接恢复 Runtime/Store READY |
| `original/p0-a-02-block-context-menu.png` | 真实 Logseq Desktop 0.10.15 | 正式 MiniProject Block 的原生右键菜单显示 Focus toggle 和会话 Undo 两项稳定意图 |
| `original/p0-a-03-focus-added.png` | 真实 Logseq Desktop 0.10.15 | 从原 Block 加入当前关注并获得原地成功反馈 |
| `original/p0-a-04-focus-removed.png` | 真实 Logseq Desktop 0.10.15 | 同一 Block 再次触发后移出当前关注并获得原地反馈 |
| `original/p0-a-05-focus-remove-undone.png` | 真实 Logseq Desktop 0.10.15 | 会话内 Undo 将刚移出的对象恢复到关注集；Local Service 读回一致 |
| `original/p0-b-01-block-context-menu.png` | 真实 Logseq Desktop 0.10.15 | 正式 Block 的原生菜单同时显示 Focus、暂时做不了及两项精确 Undo |
| `original/p0-b-02-intent-router.png` | 真实 Logseq Desktop 0.10.15 | “暂时做不了”先显示等待别人、被问题卡住、我先暂停三种用户意图 |
| `original/p0-b-03-waiting-minimal-form.png` | 真实 Logseq Desktop 0.10.15 | WAITING 只要求一个合并短语与复查时间 |
| `original/p0-b-04-blocked-minimal-form.png` | 真实 Logseq Desktop 0.10.15 | BLOCKED 只要求具体卡点，可选 blocker object |
| `original/p0-b-05-paused-minimal-form.png` | 真实 Logseq Desktop 0.10.15 | PAUSED 只要求暂停原因与重新判断时间 |
| `original/p0-b-06-blocked-success.png` | 真实 Logseq Desktop 0.10.15 | BLOCKED 正式保存后自动返回原 Block，并明确 Focus 未改变、Undo 可用 |
| `original/p0-b-07-waiting-undo-success.png` | 真实 Logseq Desktop 0.10.15 | stable JSON 修复后，WAITING 的会话 Undo 真实恢复 ACTIONABLE，Focus 未改变 |
| `original/p0-b-08-validation-error.png` | 真实 Logseq Desktop 0.10.15 | 缺少必要字段时明确显示没有保存、原状态未改变 |
| `original/p0-c-01-low-risk-ready.png` | 真实 Logseq Desktop 0.10.15 | READY/PENDING/LOW 单组 `REWRITE_BLOCK` 只显示白名单的一键“接受并应用”；HIGH 与复合 Proposal 不会得到该入口 |
| `original/p0-c-02-applying-disabled.png` | 真实 Logseq Desktop 0.10.15 | 连续 Review/revalidate/Commit 期间按钮显示“正在接受并应用…”且同卡片审阅动作禁用 |
| `original/p0-c-03-applied-with-undo.png` | 真实 Logseq Desktop 0.10.15 | 只有 Proposal APPLIED、SemanticCommit COMPLETED 后才显示成功和既有安全 Undo |
| `original/p0-c-04-undo-confirmation.png` | 真实 Logseq Desktop 0.10.15 | Undo 仍要求独立确认，并说明只在正文、对象与 Anchor 未被后续修改时生效 |
| `original/p0-c-05-undone.png` | 真实 Logseq Desktop 0.10.15 | 逆向 Commit 完成后正文与对象恢复，正向 Audit/Commit 历史保留 |
| `original/p0-d-01-ordinary-page-route.png` | 真实 Logseq Desktop 0.10.15 | 普通 Page 的单一原生入口显示整理、正式事项、建立 Project 三项意图 |
| `original/p0-d-02-page-formal-items.png` | 真实 Logseq Desktop 0.10.15 | 本 Page tree 中通过 active Primary Anchor 关联的正式事项被有界投影 |
| `original/p0-d-03-project-create-route.png` | 真实 Logseq Desktop 0.10.15 | 普通 Page 只路由既有受控 Project 创建器，并明确不转换当前 Page |
| `original/p0-d-05-project-page-route.png` | 真实 Logseq Desktop 0.10.15 | Project Page 显示更新当前状态、讨论项目结构、项目操作三项意图 |
| `original/p0-d-06-project-current-state-route.png` | 真实 Logseq Desktop 0.10.15 | Project 当前状态进入既有版本保护 HIGH Proposal 编辑器 |
| `original/p0-d-08-return-original-page.png` | 真实 Logseq Desktop 0.10.15 | 完成新 Project 路由后可返回原普通 Page |
| `original/p0-d-09-page-route-with-sidebar-open.png` | 真实 Logseq Desktop 0.10.15 | main Page route 打开时 right sidebar 保持存在 |
| `original/p0-d-10-sidebar-preserved-after-close.png` | 真实 Logseq Desktop 0.10.15 | 关闭 route 后 main Page 与 right sidebar 均保持原现场 |
| `original/p0-d-11-journal-page-route.png` | 真实 Logseq Desktop 0.10.15 | Journal 被安全识别为普通 Page；截图已裁掉 Journal 正文 |
| `original/p0-e-01-four-primary-nav.png` | 真实 Logseq Desktop 0.10.15 | 主导航只显示“现在 / 待我确认 / 项目 / 更多”，顶部 Diagnostics 已降级 |
| `original/p0-e-02-project-navigation.png` | 真实 Logseq Desktop 0.10.15 | “项目”保留 Project 列表、重入、当前接口与正文动作 |
| `original/p0-e-03-project-formal-items.png` | 真实 Logseq Desktop 0.10.15 | “项目”二级入口继续提供正式对象与受控 Area/Project/Association 创建 |
| `original/p0-e-04-more-hub.png` | 真实 Logseq Desktop 0.10.15 | “更多”汇集最近修改/恢复、系统状态/诊断、备份/恢复与迁移 |
| `original/p0-f-01-formal-connection-risk-badge.png` | 真实 Logseq Desktop 0.10.15 | 受控停服后只形成一次正式连接风险，工具栏显示 `TC ①` 并可进入诊断 |
| `original/p0-f-02-recovered-quiet-toolbar.png` | 真实 Logseq Desktop 0.10.15 | 同库 Service 与私有 descriptor 恢复后工具栏回到无噪声 `TC` |
| `original/p0-g-01-recent-changes-user-language.png` | 真实 Logseq Desktop 0.10.15 | 最近修改以用户意图、时间和结果为主，技术详情默认折叠 |
| `original/p0-g-02-immediate-result-same-commit.png` | 真实 Logseq Desktop 0.10.15 | LOW 正式应用后的即时结果提供查看与撤销，并由实际 Commit identity 取回 |
| `original/p0-g-03-long-term-undo-entry.png` | 真实 Logseq Desktop 0.10.15 | reload 后同一修改仍在长期入口显示已应用与撤销 |
| `original/p0-g-04-long-term-undo-completed.png` | 真实 Logseq Desktop 0.10.15 | 长期 Undo 完成后显示已撤销且不再提供重复 Undo |
