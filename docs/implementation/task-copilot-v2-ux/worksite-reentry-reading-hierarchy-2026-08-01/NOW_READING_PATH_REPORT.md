# Now Reading Path Report（Goal §16.1 交付物）

## 目标

用户从上到下浏览 Now 卡片时，标题与标题之间不再被状态、解释、按钮、更多操作反复打断；
每张卡只有一个视觉主动作；内容区与操作区语义分离。

## 实现后的阅读顺序

```text
类型／来源                                     [⋯]
事项标题                        [唯一主动作]
当前状态（正常弱，异常强）
工作记录（Focus 短预览 / 其他折叠）
为什么现在显示它（muted，默认折叠）
```

- 宽屏（≥761px）：`.now-card` 两列 grid（内容列 + 固定 156px 操作列）；
- 窄栏（≤760px）：标题完整宽度，主按钮进入 footer 右对齐，⋯ 固定右上角；
- DOM/AX 顺序：内容列先于操作列；主阅读列控件数 = 0。

## 实测指标（1000×720 Light）

| 指标 | before | after |
|---|---|---|
| primary 坐标 | x=53（左列） | x=776（右侧操作列，与标题同排 y=390 vs 382） |
| 首卡高度 | 235px | 155px |
| 第二张卡标题 y | 624 | 549（首屏可见） |
| 主阅读列控件 | 3（依据+按钮+更多） | 0 |
| 每卡 primary | 1 | 1 |

## Overflow Menu 行为（Desktop 真实输入）

- 鼠标点击打开/关闭；Enter/Space 原生可用；Esc 关闭并聚焦回 summary；
- 点击菜单外部关闭；`aria-label="更多操作"`、`aria-expanded` 同步；
- 760px 无横向溢出（shell 758 ≤ 760）。

## 证据

- `tmp/runtime/worksite-reentry-reading-hierarchy/current/{01..04, sprint-a, sprint-g/07,14,16}`
- 自动测试：single-primary、内容/操作区顺序、CSS 两列与 760 footer、
  菜单键盘接线、duplicate-id。
