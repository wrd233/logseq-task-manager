# P2-A MiniProject Grill Preview — Automated + Real Provider Evidence — 2026-07-24

结论：`PREVIEW_CONTRACT_PASS / PLUGIN_UI_AUTOMATED_PASS / LIVE_PROVIDER_PASS / DESKTOP_OPEN`

## 安全边界

- Preview 只在机器 readiness 为 `READY_FOR_PREVIEW` 后开放；
- Service 复用精确 OPEN MiniProject、active Primary Anchor、Logseq Block 子树与 Context Package，
  Provider 前后重验 Object version、Anchor identity 与 subtree scope hash；
- 每项原材料必须恰好进入一个 section 或 `unclassified`；root 原材料必须留在 `root`；
- 原文和 hash 由机器注入，模型不能重写；被排除材料仍在 `unclassified` 原位保留；
- impact 由机器计算，`deletedMaterialCount` 固定为 0；
- 输出 authority 为 `SESSION_PREVIEW_ONLY`，没有 Proposal、operation、Commit 或正式写入；
- Plugin 只有生成/重试/阅读/返回原 Block，没有应用按钮。

## 自动证据

- Application Validator 覆盖 exact-once、root、evidence allowlist、额外字段、零删除与 bounded authority；
- Local Service generator/builder/route 覆盖 readiness、truncated source、Provider 前后 stale、零正式状态变化；
- Service Client 与 Plugin controller/UI 覆盖 loading、retry、source stale、runtime cleanup、impact 与无正式动作；
- focused Plugin controller/UI：57/57 PASS，Plugin 全量 238/238，typecheck/build PASS；
- focused Preview generator：2/2 PASS；Application 132/132、Local Service 111/111；
- 根级 `scripts/check.sh` PASS，0 skipped，rule coverage 145，recovery rehearsal differences `[]`。

## 真实 DeepSeek Gate

使用既有 Launcher 非敏感 Provider 元数据、macOS Keychain reference 和实际
`deepseek-v4-flash`。Key、Prompt、原始响应、正文和对象身份均未输出或写入证据。

前两次输出分别因顶层额外字段、遗漏一项原材料被 Validator fail closed；两次都没有生成
Proposal 或写入。收紧精确 JSON shape、边界排除仍须原位保留和返回前集合守恒检查后，真实
结果为：

```json
{"status":"PASS","authorityBoundary":"SESSION_PREVIEW_ONLY","sourceMaterialCount":3,"movedMaterialCount":0,"addedDerivedBlockCount":0,"deletedMaterialCount":0,"unclassifiedMaterialCount":1,"rootPreserved":true,"providerId":"deepseek","model":"deepseek-v4-flash","attempts":1,"durationMs":29176}
```

## 尚未声明

当前安装态 Logseq Graph read bridge 仍未连接，因此没有声明 Plugin→Service→Graph→Provider
完整 Desktop route、reload/stale/主题/窄栏或正式重构 PASS。Preview 后的 Proposal、单次 Commit、
Undo 与 Recovery 也仍未实现；本文不能作为 P2-A/P2-B 完成证据。
