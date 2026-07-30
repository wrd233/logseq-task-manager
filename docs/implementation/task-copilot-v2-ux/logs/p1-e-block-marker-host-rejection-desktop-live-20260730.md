# P1-E Block Marker 宿主拒绝 Desktop Gate（2026-07-30）

## 运行基线

- 分支：`feature/task-copilot-mvp`
- 缺陷构建：`79da995`（生产包仍含默认关闭的 marker runtime）
- 修复构建：`53337f2`（生产 runtime、setting 与 CSS 已移除）
- Logseq：`0.10.15`
- Graph：File Graph `logseq`（专用测试 Graph）
- 宿主主题 / Plugin 外观：Light / Dark
- 窗口：约 `1000×720`
- 页面：`Task Copilot Lab/P0 Recovery Frontstage 20260730`
- 正式根 Block：`[MiniProject] P0 恢复前台结构演练 20260730`

## 真实操作链

1. 在 Logseq 插件设置把 Block marker 从 `off` 切到 `line`。
2. 正式 MiniProject 根 Block 的可见正文立即消失，页面只剩一条短竖线和原有子 Block。
3. 新的 Accessibility tree 同样不再包含根 Block 文本，只报告 Task Copilot marker 容器。
4. 只读检查 Markdown 文件，根文本仍为文件第一行；正式 SQLite Object、Primary Anchor、UUID
   和版本没有变化。
5. 把设置恢复 `off` 并重载 Plugin；宿主仍保留被替换的可见 slot。
6. 完整退出并重开 Logseq，再打开同一 Page；根文本和子 Block 恢复可见，Accessibility tree
   重新报告完整根文本。
7. 构建 `53337f2`，移除生产 setting、slot runtime、marker CSS 和 lifecycle 接线；通过
   Plugin Manager 真实重载。
8. 打开 Logseq `设置 → 插件设置 → Task Copilot`：只剩 Agent 模式、运行环境 descriptor 和
   界面外观，Block Marker 不再可启用。
9. 关闭设置返回同一 Page；根文本持续可见。

## 结论

自动 harness 能证明精确 UUID、容量、identity guard 和零 Markdown 写入，却不能证明宿主 slot
是追加式装饰位置。Logseq `0.10.15` File Graph 的真实行为是替换目标 Block 的可见正文；即使
底层数据没有损坏，这也违反“Logseq 正文是工作现场”和“插件关闭后正文仍可读”的发布边界。

当前发布策略：

- `productionMode=OFF`
- `publicSettingVisible=false`
- `status=HOST_SLOT_REJECTED`
- `recheckWhen=STABLE_APPEND_ONLY_BLOCK_SLOT`

不采用 MutationObserver、DOM selector、renderer macro 或正文属性模拟来绕过宿主限制。
隔离的 LINE/DOT/ICON/TINT/PHRASE 原型与 100 Block harness 保留，用于未来官方能力变化后的
低成本复验；当前用户前台由 Now、Project workspace 和状态翻译承担。

## 自动证据

- focused Block Marker：`5/5 PASS`
- Plugin typecheck：PASS
- Plugin build：PASS
- 根级 `./scripts/check.sh`：PASS
- stable rules：`145`
- recovery rehearsal：`differences=[]`
- outer repository boundary：PASS

## 当前截图

| 文件 | 状态 | 说明 |
|---|---|---|
| `p1-block-marker-line-replaces-content-current-79da995.jpeg` | `SUPERSEDED_DEFECT` | 真实 `line` 模式替换根 Block 可见正文，只剩竖线和子 Block |
| `p1-block-marker-setting-removed-current-53337f2.jpeg` | `CURRENT` | 最新构建的 Task Copilot 设置已无 Block Marker 入口 |
| `p1-block-marker-off-restored-current-53337f2.jpeg` | `CURRENT` | 完整重启和最新构建 reload 后，原根正文与子 Block 可见 |

## 状态与复杂度变化

- P1-E：`PARTIAL_PROTOTYPE_AUTOMATED → DONE_BOUNDED_HOST_REJECTION`
- 新增正式状态：`0`
- 新增 Runtime：`0`
- 新增恢复分支：`0`
- 新增 Skill/Prompt：`0`
- 删除生产 Runtime：`1`
- 长期 Partial 净变化：`-1`
- 完整 Goal：仍为 `IN_PROGRESS`；P1 helpful/noise、跨会话 disposition、建议关注、P2-D/P2-F、
  DB Graph Page Head 和 Final Release 继续开放。
