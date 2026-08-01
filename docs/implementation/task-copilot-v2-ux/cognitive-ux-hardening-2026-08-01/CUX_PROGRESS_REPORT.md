# Task Copilot Cognitive UX Hardening — Progress Report

> 2026-08-01 · 无视觉执行版 · 证据分级：STRUCTURAL_FACT / AUTOMATED / DESKTOP_BEHAVIOR_FACT /
> HISTORICAL_VISUAL_OBSERVATION / CURRENT_VISUAL_JUDGMENT。
> 本报告不产生 CURRENT_VISUAL_JUDGMENT；所有 Sprint 的视觉结论保留为 VISUAL_GATE_PENDING。

## 基线（Phase 0）

- HEAD `179a6bc`（audit 后已含 `beginUiAction`、`scoped-outcome`、durable-origin 存储、全 dialog active surface）。
- 根级 `./scripts/check.sh` PASS（Node 20.20.2；145 rules、恢复演练、仓库边界）。
- 基线/问题矩阵/证据索引/Skill 日志已建立（本目录 `CUX_BASELINE.md` 等）。
- gstack `plan-design-review` 已执行（无交互适配版），七轮审查通过，初始 5/10 → 8/10，0 未决决定。

## Sprint 1 — Scoped Outcome 收口（CUX-P0-01 / CUX-P1-04）→ `af9c852`

- 空/全非法“整理当前页”扫描：不再 throw；返回中性 empty 面板，显示已扫描块数与非法显式块计数，无提交按钮。
- 新增 scoped-outcome 测试：empty≠error、同 scope 新动作替换旧结果、cancel 不假成功。
- 证据：candidate 14/14、scoped-outcome 4/4、Plugin 399/399、typecheck/build、根级 PASS。

## Sprint 2 — Durable Origin / Return Contract（CUX-P0-02）→ `13f47ec`

- `OriginRouteController.resolveAfterReload`：当前路由可解析→PARKED（不劫持）；失效 UUID 路由→按 Block/Page 恢复；
  Block 丢失→Page 名 fallback（RETURNED_PAGE_ONLY）；全部失败→SOURCE_UNAVAILABLE（有界 3 次重试后弹 fallback 对话框）。
- 正常返回（`returnTo`）在滚动后写稳定 pageName 路由；`returnToBusinessOrigin` 保留 durable origin 供下次 reload 恢复。
- fallback 对话框：`尝试打开原页面` / `留在当前页`，不出现无解释空白。
- 证据：origin-route-controller 9/9、Plugin 404/404、根级 PASS。

## Sprint 3 — One-question Workspace + Progressive Disclosure（CUX-P1-02 / CUX-P1-03）→ `13f47ec`

- MiniProject / Project Grill：唯一问题 + 输入置顶；系统理解/已确认事实/推断/未知/建议折叠进
  “查看系统理解与已确认事实”；READY_FOR_PREVIEW 时预览优先。
- 对象工作区：新建领域/相关内容/所属关系/正式事项全部用户语言；类型/生命周期/状态/交付状态/版本号
  不再出现在日常行；技术说明进 `<details>`。
- 新增 visible-text 合同测试：日常对象工作区不出现 SQLite/Anchor/Association/Lifecycle/Primary
  Ownership/大写类型/版本号；相关·有效等用户语言可读。
- 证据：Plugin 405/405、typecheck/build、根级 PASS。

## Sprint 4 — 时间语言与表单错误可见性（CUX-P3-02 / CUX-P2-03 结构部分 / P2-01/02 复核）

- Review eyebrow 时间本地化（`toLocaleString("zh-CN")`），新增“不显示原始 ISO”回归测试。
- Active Surface 内新增 dialog-scoped error：表单失败不再无反馈，也不复用旧全局 banner。
- P2-01：筛选/排列折叠、其余 N 项折叠已有（历史提交），保持结构验收。
- P2-02：Provider 失败文案 + 重试 + 系统状态入口已有测试覆盖，复核通过。
- 证据：Plugin 406/406、typecheck/build，根级检查待收尾。

## Desktop Gate 增补（真实 Logseq 0.10.15，CDP 采集）

- r11 构建（`b443d589b268`）已加载进真实 Logseq；Service READY / formal writes true / 0/0/0。
- Desktop 已验证：CUX-P0-01 空/部分非法中性结果、CUX-P1-01 确认面唯一与取消恢复、
  CUX-P1-02 Grill 问题置顶+理解折叠（真实 DeepSeek）、CUX-P1-03 对象工作区与 Condition 下拉用户语言
  （含本次修复的 select 术语）、CUX-P2-03 dialog-scoped 错误可见、CUX-P3-02 Review 本地时间。
- 追加（2026-08-01 第二轮）：CUX-P0-02 Desktop 全链 PASS——真实右键 Block 菜单 → 处理这条内容 →
  返回原内容（路由为页面名+anchor）→ hard reload 后页面正常加载、无空白、无 fallback、BLOCK origin
  持久化；`resolveAfterReload` 新增“当前页即来源页时滚动恢复 anchor”（origin 11/11）；Light/Dark ×
  1000/760 四张 Now 截图已采集（窄栏 756px 无横向溢出）。
- 追加（2026-08-01 第三轮）：quit/reopen 变体验证 PASS（origin 文件跨重启持久化、解析器返回 RETURNED）；
  修复真实循环回归（滚动→路由事件→再解析，console 捕获数十万条日志）：resolved-token 守卫 +
  750ms 节流 + 防重入 + PARKED 静默；增加 1s/2.5s 有界跟随滚动。宿主 `scrollToBlockInPage` 在无焦点
  CDP 环境未产生可见滚动 → 记 OPEN_MANUAL_GATE。生成 6 组机器可读证据包（now/review/confirmation/
  objects × light/dark × 1000/760），见 `CUX_EVIDENCE_INDEX.md`。
- 修复：Condition/Candidate/阶段映射/主归属等下拉仍泄漏 `TASK/OUTPUT/...` 原始类型码 → 已改为用户语言
  （ui.ts），新增 select 术语合同测试；Desktop 复验 `hasRawCodes=false`。
- 明细见 `evidence/DESKTOP_GATE_2026-08-01.md`；截图已就绪，独立视觉 Gate 仍 PENDING。

## 安全与不回归

- 未新增正式状态、Runtime、Recovery 分支、写路径或第二权威；
- Proposal-only、Commit、Undo、PENDING、Recovery、SQLite/Local Service 权威未改；
- 未提交 `logseq/`、dist、凭据或用户既有 `apps/task-copilot-local-service/package.json` 修改；
- 未 push、未配置 remote 变更。

## 待办 Gate（不允许由无视觉模型关闭）

1. Desktop 复验代表矩阵：无候选/部分非法已 PASS；Apply/Undo/PENDING 确认面 PASS；Grill 首轮 PASS；
   其余（Undo/PENDING 全链、Grill 三轮、Light/Dark × 1000/760）待补。
2. Durable Origin Desktop：Block 入口→返回→reload 已 PASS；quit/reopen、Graph switch、Page 改名、
   Block 移动/删除、broken-UUID fallback 场景待补。
3. datetime-local 鼠标/键盘/VoiceOver 手工 Gate（OPEN_MANUAL_GATE）。
4. 独立视觉 Gate：每个 Sprint 截图交 gstack/Microsoft frontend-design-review 或人工 reviewer；
   未完成前全部标记 `VISUAL_GATE_PENDING`。
5. P3-01 右键入口发现性：命令面板/快捷键路径已有，novice visual gate 待做。
