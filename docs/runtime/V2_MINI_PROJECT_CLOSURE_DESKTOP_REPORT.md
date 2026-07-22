# V2 MiniProject Closure Desktop Report

## 结论

```text
SIDEBAR_OBJECT_ONLY_CLOSURE_DESKTOP_PASS
MARKER_EVIDENCE_CLOSURE_DESKTOP_PASS
UC28_AGENT_DRAFT_AND_LEGACY_TRANSFER_DESKTOP_PASS
```

2026-07-22 在 Logseq Desktop 0.10.15、专用 Test Graph 和隔离 SQLite schema v11 中，完成了对象列表发起、Marker/DONE 与 UC-28 Agent 草拟/遗留承接三个纵向闭环。UC-28 使用真实 `deepseek-v4-flash`，Key 只经 Keychain reference 解析；未修改用户正式 Graph，未在报告、Graph、截图或 Git 中保存 Service token/API Key。

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

## UC-28 Agent 草拟与遗留承接

1. Agent 请求期间按钮真实显示 `Agent 正在草拟…` 且 disabled，防止重复提交。故障注入中断 Local Service 后，UI 显示 Provider timeout、保留三个可编辑字段并允许重试；Proposal/Object/Commit 均未正式变化。
2. 恢复后真实 Flash 请求 `HTTP 200 / finish_reason=stop / 1 attempt`，Provider 约 16.9 秒、总交互约 17.0 秒、1058 prompt tokens、1800 completion tokens；Validator 通过后只原位修订同一 proposal_id，仍为 `READY/PENDING`，MiniProject 仍 `OPEN + v2`，Closure Commit 为 0。脱敏机器结果见 `docs/testing/deepseek-v4-uc28-desktop-2026-07-22.json`。
3. 用户可继续编辑模型草稿；保存并接受 HIGH 组后 MiniProject 仍 OPEN。独立最终确认后才原子写入三问 Closure 与 `COMPLETED`，原 Logseq MiniProject Block 未改写。
4. 选中非空 Block 时，“将遗留转为新对象 Proposal”明确拒绝覆盖，Block/Proposal/Object 数量均不变。选中新空 Block 后创建另一份 `READY` Task Proposal；关闭 Proposal 的 id/status/组保持独立。
5. 遗留 Proposal 接受后仍零写入；最终 Commit 写入可读 Task Block、一个 `v2` Task 与两步 SemanticCommit。Undo 后该对象删除，正向 Commit=`UNDONE`、逆向 Commit=`COMPLETED`，MiniProject Closure 保持 COMPLETED；reload 后仍一致，Pending/Recovery=0。
6. 首次真实遗留 Commit 暴露两个竞态并安全停写：Logseq `updateBlock` 的第一次权威读取仍可能返回旧正文；连续的 `id::` 与正文插件写入只保留一个 suppression hash，晚到的第一条事件会释放第二条。修复只在现有 Adapter/Controller 中增加“仅旧 hash 可重试”的 20×50ms 有界读回，以及同 UUID 最多 4 个插件 hash 的 10 秒窗口，并在队列接受/恢复发送前复核；任意第三方正文 hash 仍立即解除 suppression 并按 stale 保护。
7. 修复后最终 Task 审计只有 `proposal_commit 0→v2` 与 `proposal_undo v2→0`，`logseq-plugin` echo 计数为 0；Graph/Domain 两步均 VERIFIED。Backup create/validate PASS；Backup 后 Doctor PASS，integrity=ok、foreign keys=0、warn=0。

## 未通过与边界

- 本次通过的是“对象列表 -> object-only Proposal -> 三问 -> Review -> Commit -> reload”。
- Marker/DONE 路径也已用真实 Logseq Block 事件通过：真实 SDK 形状是 `DONE [MiniProject] 标题`，首跑因 Parser 只接受 `[MiniProject] DONE 标题` 而安全地保持 OPEN。修复后新 Block 从 `OPEN + v2` 生成唯一 READY Proposal，同步证据为 `DONE + Block hash + active Anchor + Object v3`；三问接受后仍 `OPEN + v3`，最终对话明示重验 Block、Anchor 和 Object，确认后为 `COMPLETED + v4`。正文仍保留 DONE，Anchor hash 与重验证据一致，reload 读回 Closure；Backup/Doctor PASS。运行证据位于被忽略的 `tmp/runtime/v2-desktop/mini-closure-marker/`。
- Project/MiniProject 的显式重开仍使用原因化 HIGH Proposal；UC-28 的完成与遗留 Undo 不会自动重开原 MiniProject。

## 复杂度结论

该 Gate 未引入任何新表、状态、扫描器、恢复器或写入路径。Desktop 操作重用唯一 Proposal、既有 SemanticCommit、Application Command 和 SQLite Closure 列；竞态修复只收紧已有 Logseq read-after-write 与 exact-content echo suppression，不形成第二队列或新的恢复协议。DevTools 端口只用于测试界面的可重复操作，不是产品运行依赖。
