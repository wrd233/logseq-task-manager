# Metrics Baseline（2026-08-01）

来源：`tmp/runtime/worksite-reentry-reading-hierarchy/current/metrics-{1000,760}.json`。

## Scan Path / Action Interruption Count

当前单卡 DOM 顺序（主阅读路径）：

```text
eyebrow → h3 标题 → 状态 → 查看依据(details) → primary 按钮 → 更多操作(details)
```

| 指标 | 基线 | 目标（Goal §4.2） |
|---|---|---|
| 标题到下一标题之间的控件数 | 3（查看依据 + primary + 更多操作）+ 1 状态文本 | 默认主阅读流最多 1 个主动作；更多菜单不进正文流 |
| 每卡 primary 数 | 1 | 1 |
| primary 与标题的纵向关系 | primary y=488，标题 y=376（1000）；同一纵列 | 独立操作列，标题保持完整主列宽度 |
| 首屏第二张卡标题 y | 624（1000）/ 635（760） | 明显提前进入视野 |
| 首卡高度 | 235px | 下降（内容/操作区分离后） |
| 760px 溢出 | shell scrollWidth 758 ≤ 760；无横向溢出 | 保持无溢出 |

## Worksite Recovery Coverage（Sprint B 后生效）

基线：Now 无来源子级工作记录；只有“打开正文”。

## Semantic Hierarchy（Sprint C 后生效）

基线：`当前可以继续推进` 使用 `<strong>` 且每卡重复；accent 主按钮 + 正常状态均较强；
可见内部词：0（Now）/ Objects 0 技术词。

## Visual Competition

每卡高权重元素（结构证据）：页面标题、Focus 卡标题、primary 按钮、每卡状态、每卡“更多操作”。

## Performance（Sprint B 后记录）

基线：Now 无子树读取；Graph read 0 次/渲染。
