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
- 合并完成 V1 `RT-MVP-002..004`：Proposal 部分接受、Commit/Undo、Project/Area 归属、三轴状态、Now Work、Re-entry、Anchor 冲突/缺失/rebind、FileStorage 备份恢复和 No-Agent reload 全部形成 Desktop 证据。
- 现场发现并修复逆向 Commit 中 `undefined` 不可稳定序列化的持久化缺陷；A/B 前一 slot 恢复路径本身完成实机验证。
- 移除正式插件剩余 `window.prompt` / `window.confirm` 依赖，改为插件内可审查表单与两步确认。

## 证据

- 文件：`docs/implementation/specification-index.md`、`repository-assessment.md`、`v2-traceability-matrix.md`、`open-decisions.md`、`slices/slice-A-plan.md`；
- 测试：91 tests PASS，0 skipped；
- 命令：`./scripts/check.sh` PASS；恢复演练 differences 为空；
- PDF：108/108 页总览；第 3、9、24、28、31、35、44 页高分辨率复核无排版缺陷；
- Git：V1 合并 Desktop checkpoint 已保存为本地 commit `366da6b`；未 push、未修改 remote；inner Graph dirty 仅作信息。

## 尚未完成

- 用户确认总体 V2 实施计划和三项迁移合同；
- Slice A-F 代码与 Gate；
- E2E-01..24；
- V2 Desktop 验收、DeepSeek 真实在线验收、迁移与 Backup/Restore 实机演练；
- V1 四项 copied-data Pilot、Pilot 反馈修复与 `MVP_SUCCESS` root clean gate。

## 阻塞与风险

- 当前不是技术 BLOCKED；结构性修改按 Goal §30 等待总体实施方案确认；
- V1 Phase/Signal 与 V2 Lifecycle/Focus 冲突，禁止静默迁移；
- V1 FileStorage 与 V2 SQLite 冲突，禁止双写；
- 实际 remote 与旧文档不一致；no-push 约束仍有效；
- `@logseq/libs@0.0.17` 依赖链有 2 high + 1 critical audit findings；major 升级需兼容证明。

## 与设计偏差

- 新规范源文件仍位于 Downloads/attachment；本轮通过绝对路径和 SHA-256 建立索引，未复制或改写用户原件；
- V1 `RT-MVP-001B..004` 已完成，仅作历史 MVP 基线，不冒充 V2 runtime evidence。RT-MVP-003 保留已观测限制：Logseq 0.10.15 删除后 Undo 恢复正文，但需显式 rebind 恢复可解析 Anchor。

## 下一步

1. 用户确认 OD-001..003 的总体方案；
2. 冻结 V2 工作约定与迁移 ADR；
3. 以测试优先方式进入 Slice A0/A1；
4. 在用户选定四项代表性事项后执行 V1 copied-data Pilot；
5. 每个可解释闭环运行 `./scripts/check.sh` 并做本地 commit，不 push。
