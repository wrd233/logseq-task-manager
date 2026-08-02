# Creation Session — 一次性视觉/人工复验包（无视觉 Codex 交接）

> 生成：2026-08-02（无视觉接力收口）
> 交接对象：具备视觉能力的人类 reviewer 或视觉模型
> 性质：只做视觉与交互判断；不需要重新排查 Domain、事务、SQLite 或 Graph 写入

## 1. 环境启动（约 10 分钟）

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"   # Node 20.20.2
cd /Users/wangrundong/work/任务管理中心-logseq插件
./scripts/check.sh                                    # 预期 PASS（可选，收口前已跑）
npm run build -w @task-copilot/logseq-plugin          # 重建 Plugin
```

1. 把 `apps/task-copilot-logseq-plugin/dist/` 复制到
   `tmp/runtime/global-object-directory/plugin-dist/task-copilot-plugin/dist/`
   （Logseq external 加载路径，id `task-copilot-personal-mvp`）。
2. 启动 Logseq Desktop `0.10.15`，打开测试 Graph
   `/Users/wangrundong/work/任务管理中心-logseq插件/logseq`。
3. 确认插件工具栏可见、打开后系统状态为“可以正常使用”，
   `Pending / Recovery / Source Conflict = 0 / 0 / 0`。
4. Local Service 由 LaunchAgent 自动启动（`com.task-copilot.launcher`，
   Node 20，DB `tmp/runtime/manual-v2/task-copilot.sqlite`，schema 16，
   Graph key `graph-a00da3a2…`）。
5. 每张截图记录：commit（`c0ad54dc` 基 + 收口提交）、build hash、Logseq 版本、
   主题、视口、场景、Graph identity、fixture/真实 Provider、预期、实际结论。

## 2. 场景清单（建议一次 30 分钟内完成）

按顺序执行并截图：

1. 创建入口（“整理结构 → 新建 MiniProject / 新建 Project”）；
2. 多会话列表（“创建中的事项”）；
3. 选择来源（空白 / Block / Page）；
4. 空白会话首屏；
5. Block 来源摘要；
6. Page 材料识别摘要（来源页材料识别）；
7. 一轮 3 个相关问题（主题清晰、每题理由+推荐）；
8. 接受本轮全部建议；
9. 部分回答 / 暂不确定；
10. 会话重入摘要（“当前共识”页）；
11. MiniProject Draft Preview；
12. Project Draft Preview；
13. 草稿文本编辑；
14. 节点来源 / 变更说明；
15. 来源变化提示；
16. MiniProject Placement；
17. Project Page 命名；
18. 影响摘要（将发生 / 不会发生）；
19. Provider 失败；
20. Commit 中；
21. 创建成功（MiniProject 与 Project 各一次）；
22. Undo；
23. Recovery Required（可用既有恢复入口演示或由 reviewer 判断入口可读性）；
24. 空态（无会话 / 无草稿）；
25. 高密度长内容（17 节点 Project 树）。

每个场景分别检查：Light、Dark；视口 720×520、1000×720、1440×900（至少各一个
代表场景）；中文 IME 输入；键盘 / Focus；横向溢出
（`scrollWidth <= clientWidth`，不用全局 `overflow-x:hidden` 掩盖）。

## 3. 每项必答问题

- 主任务是否明显（用户在创建思考，而不是操作技术控制台）？
- 是否又变成聊天框？
- 是否出现面板墙（来源/历史/技术信息同时常驻）？
- 一轮多个问题是否拥挤、主题是否清楚？
- 推荐答案是否帮助判断而不是压迫用户？
- 重入是否能在数秒内恢复上下文？
- Draft 是否像未来真实 Logseq 结果？
- 来源事实、用户确认、Agent 建议是否可理解但不过度占屏？
- 影响摘要是否清楚“不会发生什么”？
- 是否存在重复审阅（会话内“确认正式创建”后不应再被迫跳“待我确认”重看同一方案）？
- 窄宽（720×520）是否仍可完成核心链？
- Light / Dark 层级是否一致？
- Recovery 是否可理解？

## 4. 完成后的回写

把结论写回 `docs/goal/creation-session/VISUAL_REVIEW.md`，并把该文件 `Status`
更新为独立结论（如 `PASS` / `PASS_WITH_MINOR_ISSUES` + 清单）。实现 Agent 不代签。

## 5. 已知结构化状态（供对照，不要求 reviewer 复验）

- MiniProject 真实闭环：`creation_20260802093016710_…` CREATED v19、
  Commit `proposal-commit:fffce7…` UNDONE、inverse COMPLETED、Object/Anchor 0。
- Project 真实闭环：`creation_20260802130822957_…` CREATED v30、
  Commit `proposal-commit:ceb61e21…` UNDONE、inverse COMPLETED、
  Page `Project/统一监控告警治理` 已删除、来源页零修改。
- 测试会话 `creation_20260802130728459_…` 已 ABANDONED。
