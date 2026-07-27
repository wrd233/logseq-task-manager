# P0-K 来源移动与删除返回 Desktop Gate

> 日期：2026-07-27
> 状态：`CURRENT`
> 运行代码：`d7526f43e798`
> 取证前仓库 HEAD：`66850e6e7f70`
> Logseq：0.10.15 / File Graph / Dark / 1000×720
> 测试材料：被 Git 忽略的脱敏专用页面 `Task Copilot Lab/P0 K Host Gate 20260727`

## 目标

验证 Task Copilot 从普通来源 Block 打开后，来源位置变化或来源消失时，完成后路由不会依赖
旧位置、页面文字或 Query/reference 投影猜测目标：

1. 同一 UUID 的来源 Block 移动后，返回到新位置；
2. 来源 Block 删除后，关闭 Task Copilot，不执行其他导航；
3. Provider 分析不构成正式写入，来源变化不产生 Proposal/Commit。

## 真实操作链

1. 在脱敏专用页面的普通来源 Block 上打开宿主菜单，选择
   “Task Copilot：处理这条内容”；
2. 真实 Provider 两次都返回 `NO_PROPOSAL`：该材料只是测试来源说明，没有明确任务、决策、
   产出或持续承诺。两次均为一次请求、无自动重试，未观察到 Validator rejection；
3. 保持 Task Copilot 打开，把同一 UUID
   `0e82dad6-c2af-4b02-bbcc-1e0b7438ddeb` 从页面顶部移动到页面底部并修改可见文字；
4. 点击“返回原 Block”，插件按 UUID 重验并进入
   `?anchor=block-content-0e82dad6-c2af-4b02-bbcc-1e0b7438ddeb`，画面中的来源已处于新位置；
5. 再次从移动后的普通来源 Block 打开 Task Copilot，等待真实 Provider 完成；
6. 保持面板打开并删除该 UUID，待 Logseq 更新后点击“返回原 Block”；
7. Task Copilot 关闭，宿主提示“原 Block 已不可用；已关闭 Task Copilot，未执行其他导航。”
   没有跳到 Query 结果、Block reference、同名文字或其他 Page；
8. 截图后恢复脱敏测试材料，未改动真实个人正文。

## 结果

| Gate | 结果 | 用户层结论 |
|---|---|---|
| 来源移动 | PASS | 仍返回同一 UUID 的新位置，不依赖旧路径 |
| 来源删除 | PASS | 安全关闭并明确说明未执行其他导航 |
| Query/reference 猜测 | PASS（拒绝猜测） | 不把投影或同名内容当作来源 |
| Provider | PASS（只读） | 两次 `NO_PROPOSAL`，无自动重试 |
| 正式写入 | PASS（零写入） | 没有 Proposal、Commit 或正文应用动作 |
| 测试环境恢复 | PASS | 脱敏 fixture 已恢复；个人 Graph 正文未参与 |

## 当前边界

- 本 Gate 关闭“来源移动”和“来源删除”的返回现场子项；
- Query、Block reference 与 right-sidebar 的原地入口仍遵循既有 bounded host conclusion；
- P0-K 整体仍为 `PARTIAL`：成功应用、失败和 Undo 后返回现场的代表性 Desktop 链仍开放；
- 未新增正式状态、恢复分支、Agent Runtime、Skill、Prompt 或 Validator。

## CURRENT 截图

- `../current-ui/screenshots/p0-k-07-moved-source-return-current-dark-66850e6.png`
- `../current-ui/screenshots/p0-k-08-deleted-source-safe-return-current-dark-66850e6.png`
