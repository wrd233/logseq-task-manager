# V2 MiniProject Closure Desktop Report

## 结论

```text
SIDEBAR_OBJECT_ONLY_CLOSURE_DESKTOP_PASS
MARKER_EVIDENCE_CLOSURE_DESKTOP_PASS
```

2026-07-22 在 Logseq Desktop 0.10.15、专用 Test Graph `experiment/logseq-plugin-capability-lab` 和隔离 SQLite schema v11 中，完成了对象列表发起的 MiniProject 三问 Closure 纵向闭环。未修改用户正式 Graph，未使用 Provider，未在报告或截图中保存 Service token。

## 真实路径与证据

1. 使用受控 Service API 在隔离库建立一个 `OPEN + v2` MiniProject 和 active Primary Anchor，作为 Desktop 入口 fixture。
2. Logseq 重载当前插件构建后，面板真实显示 `Runtime READY / Store READY`；`Projects / 对象` 显示该 MiniProject 和“关闭 MiniProject”。
3. 点击关闭只创建一个 `READY` Proposal，UI 明示“正式对象和正文均未改变”；Service 重读仍为 `OPEN + v2 + closure=null`。
4. 三问对话框要求原目标、实际结果、遗留或转移和显式勾选。接受 HIGH 组后 Proposal 为 `ACCEPTED`，但 Service 重读仍为 `OPEN + v2 + closure=null`。
5. 最终对话框明示“重验对象版本且不会改写 Logseq 正文”，且必须再次勾选。确认后，同一对象原子变为 `COMPLETED + v3`，三问 Closure 全部持久化，Proposal 为 `APPLIED`。
6. Primary Anchor 的 `anchor_id`、`external_id`、`content_hash=a57c5508` 和 `active` 状态前后不变，证明 object-only 路径没有伪造 Graph 重验或改写正文。
7. 冷重载 Logseq 后，对象列表仍显示 `COMPLETED + v3` 和完整三问，不再显示关闭按钮；Review Center 仍能读回 APPLIED Proposal。
8. 隔离库 Backup create/validate 为 `PASS`；Doctor 为 `PASS`，`integrity=ok`、`foreignKeyViolations=0`、`warn=0`。

运行截图和机器读取证据保存在被 Git 忽略的 `tmp/runtime/v2-desktop/mini-closure/`；其中关键节点为 `16-projects-open.png`、`17-proposal-created.png`、`18-three-questions.png`、`20-closure-accepted.png`、`21-final-confirm.png`、`23-applied.png`、`25-after-reload-projects.png` 以及 `final-service-proof.json`、`backup-doctor-proof.json`。

## 未通过与边界

- 本次通过的是“对象列表 -> object-only Proposal -> 三问 -> Review -> Commit -> reload”。
- Marker/DONE 路径也已用真实 Logseq Block 事件通过：真实 SDK 形状是 `DONE [MiniProject] 标题`，首跑因 Parser 只接受 `[MiniProject] DONE 标题` 而安全地保持 OPEN。修复后新 Block 从 `OPEN + v2` 生成唯一 READY Proposal，同步证据为 `DONE + Block hash + active Anchor + Object v3`；三问接受后仍 `OPEN + v3`，最终对话明示重验 Block、Anchor 和 Object，确认后为 `COMPLETED + v4`。正文仍保留 DONE，Anchor hash 与重验证据一致，reload 读回 Closure；Backup/Doctor PASS。运行证据位于被忽略的 `tmp/runtime/v2-desktop/mini-closure-marker/`。
- Agent 草拟三问和“将遗留转为新对象 Proposal”现已通过自动 Gate，前者还有一次真实 DeepSeek Flash 零正式写入证据；但这两个新按钮尚未在 Desktop 中验收，本报告不将既有人工填写场景冒充新交互证据。

## 复杂度结论

该 Gate 未引入任何新表、状态、扫描器、恢复器或写入路径。Desktop 操作重用唯一 Proposal、既有 SemanticCommit、Application Command 和 SQLite Closure 列；唯一代码修复是让纯 Parser 接受 Logseq 真实前置 Marker 形状，并显式拒绝内外 Marker 冲突。DevTools 端口只用于测试界面的可重复操作，不是产品运行依赖。
