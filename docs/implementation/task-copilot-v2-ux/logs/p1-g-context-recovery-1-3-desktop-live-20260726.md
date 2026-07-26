# P1-G Context Recovery 1.3 Desktop / Provider Gate — 2026-07-26

## 运行身份

- branch：`feature/task-copilot-mvp`
- 当前实现与截图提交：`653875a`
- 起始提交：`554ab57`
- Logseq Desktop：`0.10.15`
- 测试 Graph：仓库内专用 File Graph
- Provider：真实 `deepseek-v4-flash`；API Key 只由 Keychain reference 解析
- 主题 / 窗口：Dark 标准宽度、Light 标准宽度、Light 约 720 px 窄窗
- 正式基线：7 Objects、24 SemanticCommits、12 Proposals；普通生成、错误与拒绝均零正式写入

截图、日志和报告不保存 API Key、token、Provider 原始响应、Context 正文或本机 authority
路径。受控错误、拒绝和延迟转发完成后均恢复真实 Provider 配置。

## 1.3.0 语义复验

上一版真实输出把“本次 Provider Gate 结果”和“用户对当前草稿的评价”当作 Project 业务
未知。`recover-context@1.3.0` 没有为这条样本增加 Validator 特例，而是明确区分：

- 正式业务事实；
- 正式材料无法回答的业务未知；
- 当前 session 草稿；
- 当前草稿的用户评价与反馈。

真实 DeepSeek 在原 Project 上返回 4 条机器接地事实和 1 条判断，不再产生反身 unknown；
用户标记 `HELPFUL`。独立的真实 Provider 样本又保留了真实业务未知
“当前项目边界和目标尚未明确”，证明 1.3.0 没有用过度过滤换取表面通过。两个样本均一次
调用完成，未观察到重试。

## 代表性失败与显示 Gate

| Gate | 真实结果 | Interaction Evidence | 正式写入 |
|---|---|---|---|
| 信息充分 | 真实 DeepSeek，4 facts，0 false unknown，`HELPFUL` | `GENERATED=1` | 0 |
| 真实未知 | 隔离真实 DeepSeek，保留业务 unknown | `GENERATED=1`，attempts 1 | 0 |
| Provider error | 受控无效 model 经真实 Provider 路径返回用户层降级；确定性卡仍可用 | `ERROR=1`，无重试 | 0 |
| Validator rejection | 受控兼容 Provider 返回越过前台语言合同的结构结果；统一 Validator 拒绝 | `REJECTED=1`，无重试 | 0 |
| generation stale | 真实 DeepSeek 请求经本地无日志 8 秒延迟代理转发；期间 Project v17→v18→Undo v19 | `STALE=1 / GENERATED=0` | 仅测试 Condition 与其正式 Undo |
| reload | 草稿、评价和错误均清除，确定性投影重算 | session-only | 0 |
| Light / 窄栏 | Logseq theme event 驱动真实浅色；约 720 px 仍保持主结论与动作可读 | 不适用 | 0 |

stale 首次 Desktop Gate 暴露“用户界面正确丢弃草稿，但 Interaction Evidence 仍计
GENERATED”的遥测错误。修复复用同一 session entry，把 post-Provider version conflict
替换为 `STALE / V2_OBJECT_VERSION_CONFLICT`；没有新增事件、状态或恢复分支。当前安装包
复验得到 `total=1, STALE=1, GENERATED=0, PENDING=0, RECOVERY_REQUIRED=0`。

Light 首次复验也真实发现 Plugin 只读取系统 `prefers-color-scheme`，没有跟随 Logseq
`preferredThemeMode`。修复改为初始读取宿主主题并监听 `onThemeModeChanged`；CSS media query
只保留为宿主事件不可用时的 fallback。

## Skill 生命周期

- `recover-context@1.2.0`：`RETIRED`，不再作为安装态或运行态 active Skill；
- `recover-context@1.3.0`：`CANDIDATE/DESKTOP_VERIFIED`；
- 不直接晋升 `PRODUCTION`：当前真实有用度样本仍小，长 Page、矛盾材料和越权输出质量要在
  后续黄金样本中继续观测，但不再阻断 P1-G 这一既定代表性纵向 Slice。

本轮没有新 Skill、Prompt Runtime、正式状态、写入 authority 或 Recovery Kernel。

## 截图

- `p1-g-07-context-recovery-skill-1-3-provider-current-dark.png`：1.3.0 真实 DeepSeek Dark；
- `p1-g-08-context-recovery-skill-1-3-current-light-before-fix.png`：真实主题缺陷，`HISTORICAL`；
- `p1-g-08-context-recovery-skill-1-3-current-light.png`：修复后的 Light；
- `p1-g-09-context-recovery-skill-1-3-current-light-narrow.png`：Light 窄窗；
- `p1-g-10-context-recovery-provider-error-current-light.png`：Provider error 降级；
- `p1-g-11-context-recovery-validator-rejection-current-light.png`：Validator rejection；
- `p1-g-12-context-recovery-generation-stale-current-light.png`：stale 用户界面；
- `p1-g-13-context-recovery-stale-telemetry-current-light.png`：当前包的 stale + 遥测复验。

## 结论

P1-G 从 `PARTIAL_DESKTOP_DARK_MAIN_CHAIN_CONTENT_QUALITY_GATE_OPEN` 升级为
`DONE_REPRESENTATIVE_DESKTOP_PROVIDER_GATES`。确定性基线、真实内容质量、反身边界、真实
业务 unknown、error、rejection、stale、feedback、reload、Dark/Light/窄栏和零越权写入均已
完成代表性 Gate。

Logseq 0.10.15 File Graph 不挂载 Page Head slot 的结论仍是 P1-F 的
`BOUNDED_HOST_LIMIT`；DB Graph Page Head 属宿主矩阵剩余项，不回滚 P1-G 的 Project
workspace Context Recovery 完成结论。
