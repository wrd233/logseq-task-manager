# RC Release Gate

> 状态：2026-08-16 Phase 20 收口。每项只能 PASS / PASS_WITH_KNOWN_ISSUE / FAIL。
> 规则：RELEASE_BLOCKER = 0 才允许 RC_READY。
> Authoritative source hierarchy：当前代码/tests → RC_RELEASE_GATE → RC_INPUT_CHECKLIST → README/docs/vnext/README → User/Developer guides → Experience docs（历史证据）。历史 run 保留原数字，但 Final Gate 只引用最新 authoritative run。

| Gate | 结论 | 证据 / Known Issue |
| --- | --- | --- |
| Functional Freeze | PASS | ADR 042；本轮零新 Domain capability |
| Data Safety | PASS | integrity_check / foreign_key_check doctor + backup/restore tests |
| Backup / Restore | PASS | `task-copilot backup create/inspect/restore`；SQLite backup API；active runtime 拒绝；atomic replace；失败不破坏现有 DB |
| Migration | PASS | v16–v22 fixtures 通过；future schema fail closed；malformed fail closed |
| Startup / Shutdown | PASS | service start/stop/status；stale pid 识别；12-cycle restart soak |
| Recovery | PASS_WITH_KNOWN_ISSUE | Graph offline / DeepSeek 401 / projection backlog / in-flight supersession / USER decision no-double-apply 有测试；真实 long-soak 首轮完成，更长期持续观察 |
| Single Instance | PASS | SQLite lease；second runtime fail fast；stale lease takeover |
| Runtime Health | PASS | HEALTHY/CATCHING_UP/PAUSED/DEGRADED；closure component-aware summary |
| Security | PASS_WITH_KNOWN_ISSUE | localhost bind；USER-channel execute gate；DB/backup/state 权限收紧；Plugin settings 仍可显示 descriptor JSON（见 Known Issues） |
| Performance | PASS_WITH_KNOWN_ISSUE | UI 查询 1–2ms；backup/restore/migration 小库 <10ms；大库/真实 LLM latency 见 perf baseline |
| Long Soak | PASS | 12-day 103-object synthetic + 5-day 36-object + real Desktop closure 链；Day12 HEALTHY/Now3/Conf0 |
| UI | PASS | Now/Confirmation/More/closed-reopened 均已验证；closed re-entry 残留已修 |
| Agent | PASS_WITH_KNOWN_ISSUE | 24-conversation scripted replay 0 errors；40-case closure eval falseReady=0；真实 DSH 多轮质量回归未在 repo 内自动化（沿用 Phase17 实机证据） |
| Docs | PASS | ADR 040–043 / golden paths / experience / RC_INPUT_CHECKLIST 与代码一致 |
| Known Issues | 见下 | 全部为 RC_KNOWN_ISSUE 或 DEFERRED_1.X |

## Migration contract

- Minimum supported schema for automatic upgrade: **v16**。
- v16–v21 → v22：自动迁移，已逐版测试。
- future schema（>22）：`SCHEMA_VERSION_TOO_NEW`，拒绝迁移和 runtime writer，原数据不修改。
- <v16：不声明支持；如果旧测试环境需要升级，先 `doctor` / 人工评估，不得假设自动迁移成功。

## Final decision

**RC_READY**

Release Blocker: **0**

Evidence: final `npm run check` green（216 tests）；backup/restore/service/doctor/migration/soak 实测完成；DeepSeek 40-case false READY=0；secret audit clean；`logseq/` 与 `tmp/` untracked。

## Metadata sweep decision

**RC_METADATA_READY**

- 日期/指标/状态与 Git 事实一致；release docs 不再含 synthetic future date。
- Clean clone（Node 20.20.2 与 Node 24）按 User Guide 原样可执行：install → build → start → status → doctor → backup → stop → restore → start → doctor。
- Suggested RC tag：`vnext-1.0.0-rc.1`；candidate SHA 以最终 report 中的 HEAD 为准。

RC Known Issues:
1. Windows/Linux 未做真实 Desktop soak（代码路径支持但未实测）。
2. Plugin 设置中的 `kernelDescriptorJson` 明文可见；descriptor token 每次 Kernel 启动轮换，且只写 Plugin 私有 FileStorage，建议 RC 使用期保持本机。
3. 真实 DSH 多轮对话质量回归未在 repo 内自动化；以 Phase17 实机记录 + 24-conversation scripted replay 为当前证据。
4. DeepSeek 历史 run 曾出现非法 JSON（最多 1/40）；最新 final run format failure 0/40。Host parser/semantic validation 继续 fail-safe，不能因 final 0/40 删除。

DEFERRED_1.X：Natural Content Curation / Taste auto-learning / continuous Discovery / provider routing / notification platform / MCP ecosystem / Project report generation / 新 Domain fields。
