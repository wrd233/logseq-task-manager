# V2 当前实施状态

## 当前 Slice

Pre-Slice / Repository Assessment and Overall Plan Confirmation

## 本轮完成

- 完整读取四份新规范材料并建立版本、指纹和权威索引；
- 视觉 PDF 108 页全部巡检，关键架构/UI 页高分辨率复核；
- 扫描 Git、源码、包、入口、适配器、持久化、测试和旧 MVP 证据；
- 运行当前根级完整基线；
- 建立 V2 仓库评估、初版追踪、开放决定、Slice A 计划和 DeepSeek v4 在线测试计划。
- 将候选 V2 入口同步到现行 `docs/goal/MVP_STATUS.md`，避免下一轮启动遗漏新基线。
- 在 Logseq Desktop 0.10.15 完成 V1 `RT-MVP-001B`：来源解析、Inbox 六动作、真实 reload、只读 Probe 与 Diagnostics JSONL 全部 PASS。

## 证据

- 文件：`docs/implementation/specification-index.md`、`repository-assessment.md`、`v2-traceability-matrix.md`、`open-decisions.md`、`slices/slice-A-plan.md`；
- 测试：85 tests PASS，0 skipped；
- 命令：`./scripts/check.sh` PASS；恢复演练 differences 为空；
- PDF：108/108 页总览；第 3、9、24、28、31、35、44 页高分辨率复核无排版缺陷；
- Git：调研开始时 outer worktree clean；未 push、未修改 remote；inner Graph dirty 仅作信息。

## 尚未完成

- 用户确认总体 V2 实施计划和三项迁移合同；
- Slice A-F 代码与 Gate；
- E2E-01..24；
- Desktop 验收、DeepSeek 真实在线验收、迁移与 Backup/Restore 实机演练。

## 阻塞与风险

- 当前不是技术 BLOCKED；结构性修改按 Goal §30 等待总体实施方案确认；
- V1 Phase/Signal 与 V2 Lifecycle/Focus 冲突，禁止静默迁移；
- V1 FileStorage 与 V2 SQLite 冲突，禁止双写；
- 实际 remote 与旧文档不一致；no-push 约束仍有效；
- `@logseq/libs@0.0.17` 依赖链有 2 high + 1 critical audit findings；major 升级需兼容证明。

## 与设计偏差

- 新规范源文件仍位于 Downloads/attachment；本轮通过绝对路径和 SHA-256 建立索引，未复制或改写用户原件；
- V1 `RT-MVP-001B` 已完成，仅作历史 MVP 基线，不冒充 V2 runtime evidence；RT-MVP-002..004 仍待集中执行。

## 下一步

1. 用户确认 OD-001..003 的总体方案；
2. 冻结 V2 工作约定与迁移 ADR；
3. 以测试优先方式进入 Slice A0/A1；
4. 将 RT-MVP-002..004 合并为一次剩余 V1/MVP Desktop 检查；
5. 每个可解释闭环运行 `./scripts/check.sh` 并做本地 commit，不 push。
