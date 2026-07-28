# “现在”中文标签与单一结论 Desktop 记录

## 环境

- branch：`feature/task-copilot-mvp`
- runtime commit：`f1d0e1f1cee93cfda861316dfbacfe0e7b6a6aae`
- Plugin build：`2026-07-28 13:03:00 +0800`
- Logseq Desktop：`0.10.15`
- Graph：仓库忽略的 File Graph `logseq`
- 主题：Plugin 显式 Dark；宿主可见工作现场为 Light
- 窗口：`1000×720`、`724×720`
- 运行：真实 Plugin、Launcher、Local Service；reload 后重新连接

## 真实操作

1. 构建 exact commit 并执行 Logseq reload。
2. 从工具栏打开 Task Copilot；状态为“Copilot 可用 · 建议需审阅”。
3. 打开“现在”，确认类型筛选、卡片类型和无障碍区名。
4. 使用纯会话“项目”筛选，避免把测试 Graph 中其他 Task 标题保存为仓库截图。
5. 缩窄窗口到 724 px，再恢复到 1000 px。

## 结果

- `Project / MiniProject / Task` 和原始对象枚举均不再显示，统一为“项目 / 小项目 / 任务”。
- 筛选提示使用“当前关注”，无障碍区名为“现在：筛选与分组”。
- 通用可推进卡片首屏不再同时显示“当前可以继续推进”和“正式状态允许继续推进”；
  完整正式事实仍保留在“查看依据”。
- 1000 px 与 724 px 下主结论、类型筛选、唯一主动作及折叠入口均可达，无横向溢出。
- 筛选仅改变 session view；正文、Focus、对象版本、Proposal、Commit、Recovery 均未变化。
- 本场景没有调用 LLM/Provider，没有 Validator 拒绝或重试，也没有正式写入。

## CURRENT 截图

- `current-ui/screenshots/ui-now-chinese-single-conclusion-current-f1d0e1f.png`
- `current-ui/screenshots/ui-now-chinese-single-conclusion-current-narrow-f1d0e1f.png`

`ui-compression-01-now-light-f4acf77.jpg` 与
`ui-compression-07-now-dark-f4acf77.jpg` 仍是真实历史运行证据，但因对象类型和提示语言
已变化，状态改为 `SUPERSEDED`。

## 自动证据

- Application：`169/169`
- Plugin：`343/343`
- Plugin typecheck/build：PASS
- 根级 `./scripts/check.sh`：PASS
- 稳定规则：`145`
- 恢复演练：`PASS`，`differences=[]`

## 未关闭

- Now 的真实宿主 Light CURRENT 代表图仍缺失；当前 File Graph Light 行为受宿主边界影响。
- P1 Attention 前台开放门、Block Marker 和其余 P0/P2 Partial 不因本次 UI 压缩而完成。
