# P0-H Graph switch / authority Desktop Gate — 2026-07-27

## 环境

- branch：`feature/task-copilot-mvp`
- runtime commit：`ca50304e9aa2`
- Plugin build：2026-07-27 00:05:53 +0800
- Logseq Desktop：0.10.15，File Graph
- 原 Graph：仓库内专用 `logseq` 测试 Graph
- 目标 Graph：`/private/tmp/task-copilot-graph-switch-gate-20260726`
- 主题 / viewport：Dark，1001 × 720
- Launcher：LaunchAgent `com.task-copilot.launcher`，真实 loopback runtime

目标 Graph 只含两条非私人测试正文，未加入 Launcher 映射，也没有 SQLite authority。测试
没有点击任何正式动作，没有修改 Launcher config、Provider 配置或正式数据库。

## 真实发现

修复前从原 Graph 切到未配置 Graph 后，Logseq 已显示目标 Graph，但 Task Copilot 主面板仍
短暂保留原 Graph 的 Project 卡与“Copilot 可用”。约 6 秒后才收敛到安全受限态。正式
Service client 已被撤销，但陈旧 DOM 仍把旧 Graph 的业务投影呈现在新工作现场，属于用户
层 authority 泄漏，不能用“按钮最终会失败”视为安全完成。

对应证据：

- `p0-h-13-graph-switch-old-authority-leak-historical-dark.png`：真实缺陷，`HISTORICAL`；
- `p0-h-14-graph-switch-restricted-current-dark.png`：修复前最终受限态，已被精确构建替代；
- `p0-h-15-graph-switch-return-ready-current-dark.png`：修复前切回结果，已被精确构建替代。

## 修复

Graph change 现在按以下顺序执行：

1. 进入既有 `GRAPH_SWITCH_IN_PROGRESS` 受限语义并撤销正式 client；
2. 递增已有 Service discovery generation，立即清除旧 `currentGraphKey`；
3. 用现有用户系统状态投影立即替换主 UI / mounted diagnostics；
4. 再等待旧 lease 释放；
5. 最后重新读取宿主 Graph identity 并发现对应 runtime。

`onGraphAfterIndexed` / `onRouteChanged` 在受限时也会先清除缓存 identity 再恢复，不能使用
上一 Graph key。没有新增正式状态、Launcher 映射、恢复入口、Agent Runtime 或第二权威。

回归测试明确约束“清除旧 identity 和受限 UI 刷新都必须发生在 lease release 之前”。

## 修复后 Desktop Gate

1. Logseq 首次显示隔离 Graph 的取样发生在点击后约 2481 ms；
2. 同一取样已显示“当前知识库与正式状态不匹配 / 应用正式修改已暂停”，旧 Project 卡不可见；
3. 再等待 6 秒仍保持同一受限结论，未自动选择或创建数据库；
4. 切回原 Graph 后约 2994 ms 首次显示原工作现场，约 3752 ms 恢复
   “Copilot 可用 · 已为当前知识库重新建立连接；没有复用上一知识库的数据”；
5. 原 Project 投影重新出现，证明不是空库或临时默认库；
6. Launcher 保持 `READY`、`configuredGraphs=1`；唯一映射仍为 `graphId=logseq`；
7. graphKey digest `1560878c9a97b680`、databasePath digest `56632d412d8d32ef`、
   database inode `46601378` 均与无参数重装 Gate 相同；
8. owned Service descriptor 仍为同一 graphKey digest，Service health `READY`；
9. 原 Graph 已恢复为当前 Logseq Graph；临时 Graph 只保留为 Logseq recent entry，
   Launcher config 和正式数据没有变化。

当前证据：

- `p0-h-16-graph-switch-immediate-restricted-current-dark.png`
- `p0-h-17-graph-switch-settled-restricted-current-dark.png`
- `p0-h-18-graph-switch-return-ready-current-dark.png`

## 自动证据

- focused red/green regression：
  `npx tsx --test --test-name-pattern="startup stays non-blocking" apps/task-copilot-logseq-plugin/tests/ui.test.ts`
- Plugin tests：334/334 PASS
- Plugin typecheck / build：PASS
- 根级 `./scripts/check.sh`：PASS
- stable rules：145
- recovery rehearsal：differences `[]`

## 结论

P0-H 从 `IN_PROGRESS_DESKTOP_GRAPH_SWITCH_GATE` 推进为
`DONE_DESKTOP_REPRESENTATIVE`。真实 Gate 覆盖未配置 Graph 的 fail-closed、旧 authority
不可见、稳定受限和切回原 authority；配置到配置的多 Graph 隔离继续由 Launcher 自动合同
覆盖，不扩大成宿主笛卡尔积。P0 仍因 P0-J 中文 IME/受限视觉和 P0-K Query/reference/
来源变化等 Gate 保持 `IN_PROGRESS`，完整 Goal 没有提前结束。
