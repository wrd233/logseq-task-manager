# P1-C Dynamic Now Shadow 纯投影自动证据（2026-07-24）

结论：`PARTIAL_RUNTIME_SHADOW_PASS / COUNT_ONLY_PLUGIN_RUNTIME / SERVICE_UI_DESKTOP_OPEN`

## 稳定骨架

`projectV2DynamicNowShadow` 固定输出：

- `continueProcessing`；
- `needsReview`；
- `keepWaiting`；
- `suggestedAttention`；
- bounded metrics；
- `visibility: SHADOW`。

Plugin 已从既有 `/now-work.focus` 读取经过 Service 过滤的有序 Focus object IDs，在同一个
session shadow cycle 运行投影并仅输出 counts；没有新增 Service endpoint、Plugin ViewModel
或 UI consumer。

## Inclusion / Exclusion

继续处理：

- 只来自用户 Focus；
- 只含 OPEN + ACTIONABLE 的 Task/MiniProject/Project；
- 保留 Focus rank；
- Focus 继续项不受 section limit 截断。

需要回看：

```text
blocker 已完成
> WAITING / PAUSED reviewAt 到期
> 七天内 due
> Focus 中 BLOCKED
```

一个对象只进入一次。保持等待只含 Focus 中未到 reviewAt 的 WAITING/PAUSED。

明确排除：

- 普通 OPEN；
- 普通非 Focus WAITING/PAUSED；
- Area/Decision/Output；
- COMPLETED/CANCELLED/ARCHIVED；
- expired Focus；
- 七天外 due。

## 用户权威与容量

- Focus 超过 7 项只产生温和提示；
- 不自动移出、不阻止加入、不更改 rank；
- review/waiting 默认各 12，允许 1..100；
- overflow 有独立计数，不静默伪装为完整；
- suggestedAttention 首轮严格为空，不把近期更新、Project 静默或 SHADOW Signal 提前显现。

## 自动 Gate

- 三段稳定骨架与普通 OPEN 排除；
- Focus 顺序；
- review priority 与一对象一区；
- future waiting/paused；
- completed blocker；
- unsupported/closed/expired/far-due；
- 8 项 Focus 温和提示且输入未修改；
- 15 项 review overflow；
- duplicate Object/Focus identity fail closed；
- invalid observedAt/expiresAt/sectionLimit fail closed；
- Application 98/98 tests、0 skipped；
- Application typecheck PASS；
- Plugin runtime summary 只含 continue/review/waiting/suggestion/suppressed/overflow counts
  与 focus-overload，不含 object IDs 或正文；
- Plugin 197/197 tests、0 skipped、typecheck/build PASS；
- 根级 `./scripts/check.sh` PASS。

## 尚未声明

- 未做现有 `/now-work` 与新投影的真实数据对照；
- 未替换用户可见 Now；
- 未验证信息密度、操作距离、Light/Dark/窄栏或 Desktop；
- Copilot 建议质量门槛仍未开放。
