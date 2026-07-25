# P2-C Project Creation Desktop Live Gate — 2026-07-26

## 结论

`PARTIAL_PASS`。Blank 来源的真实 DeepSeek→Grill→Preview→HIGH Review→同 Commit
Recovery→正式创建→reload→专用 Undo→reload→健康状态已完成。Page 来源的“保留来源、
另建受控 Project Page”也已真实穿过 DeepSeek 七轮 Grill→Preview→HIGH Review→创建→
完整 Logseq restart→跨宿主 identity 漂移 Undo→再次 restart→健康状态；来源三段正文逐字
保留，专用 Page 与正式 Project/Anchor 均移除。

Page Gate 同时给出一个有界宿主结论：Logseq File Graph 在一次完整重启后重建了 Page/Block
runtime UUID，因此不能把宿主 runtime UUID 跨完整重启不变当成产品保证。Service 账本仍保留
原 identity；Undo 只允许用精确 Page name 加 owner/object/semantic-commit 三项 metadata
重新绑定受控专用 Page，来源/复用 Page 永不使用该删除回退。MiniProject 来源以及 Page
“升级当前 Page”关系仍开放，因此 P2-C 和整体 Goal 都保持 `IN_PROGRESS`。

## 环境

- branch：`feature/task-copilot-mvp`
- 入口实现 commit：`c9c29b7`
- LLM/Validator/metadata 修复：`0b4ffc622fcc`
- 最近修改专用 Undo 路由：`b43b3cf7c944`
- 删除可见性与 Page name 契约最终 commit：`d81b1a84f165`
- Page Preview/Validator failure 分类：`8658643bdaba`
- identity 漂移 Undo / mounted diagnostics / Grill 422：`913bbda4528f`
- 最终 Plugin 构建时间：`2026-07-26T01:46:49+08:00`
- Plugin / Service / Launcher：`0.1.0`
- Logseq Desktop：`0.10.15`
- Graph：仓库忽略的专用测试 Graph `logseq`
- 主题 / 当前 viewport：Dark / `1567×1104`
- Provider：真实 DeepSeek `deepseek-v4-flash`，Key 只经本地安全引用解析

## 真实 Provider 质量

第一轮真实输出成功返回 JSON，但出现英文正文和一轮两个问题；这不算通过。随后将
Project Creation Skill 升至 `1.2.0`、MiniProject Skill 升至 `1.3.0`，并在统一 Grill
Validator 中强制自然中文和每轮恰好一个 focus question。重跑后连续输出中文单问。

模型曾建议虚构“开始测试”按钮，用户回答明确拒绝；最终阅读保留了真实当前接口，没有把
该建议提升为事实。首次 Preview 又因 Prompt 示例固定 Page 关系而返回 422；改为
source-specific machine output contract 后，Blank 只允许
`CREATE_DEDICATED_PROJECT_PAGE`，真实 Preview 通过。

质量结论：

- 减少重读：PASS，最终阅读把结果、范围、证据、内部闭环和当前接口收敛在一页；
- 事实/推断/未知：PASS，机器引用与 LLM 文本分离；
- 非固定问卷：PASS，问题顺序由当前最大不确定性决定；
- 杜撰抑制：PASS with finding，虚构 UI 建议被用户否决且未进入正式事实；
- 正式权限：PASS，LLM 只到 Proposal，接受后仍需显式 Commit；
- Provider 失败降级：已有确定性基线与零写边界，本轮 404/422 均未产生正式对象。

Page 来源使用三段脱敏测试材料，真实七轮回答分别收敛材料去向、Page/Object 关系、持续
成果、范围、完成证据、内部闭环和当前接口。模型多次建议自动写入 Page、回链或额外 UUID
metadata；这些都不在机器允许的事实/动作集合内，统一 Validator 安全拒绝，原答案保留后可
重试。最终 Preview 逐条保留三段来源材料，关系为
`CREATE_DEDICATED_PROJECT_PAGE_PRESERVE_SOURCE`，没有把建议提升为事实。

质量结论：

- 减少重读：PASS，三段散乱材料被压缩成一屏可进入的持续接口；
- 事实/推断/未知：PASS，来源逐条可追溯，推断没有覆盖原文；
- 非固定问卷：PASS，七轮围绕当前最大未决项推进，但轮数偏长；
- 权限边界：PASS，多次越界建议被 Validator 拒绝，正式写入仍只经 HIGH Review/Commit；
- 前台负担：PARTIAL，重复 Validator rejection 会让用户感到“答案没被接受”，现已把
  `GRILL_TURN_VALIDATION_FAILED`/`GRILL_PREVIEW_VALIDATION_FAILED` 映射为可修正的 422，
  但仍需继续降低真实 Provider 拒绝率；
- Skill：沿用并形成 `project-creation-modeling@1.2.0` 改进候选，不新建平行 Prompt 系统。

## Desktop 发现与修复

1. 安装的 Service payload 比仓库构建旧，Project Grill route 404。重新安装同一 Graph 的
   最新 Launcher payload，保留数据库和 Keychain 配置后恢复。
2. Logseq `createPage(properties, createFirstBlock:false)` 会把 Page properties 表现为一个
   metadata Block。旧代码误判为用户正文并进入 `RECOVERY_REQUIRED`。修复后仅接受精确三项
   ownership metadata、无子 Block、无额外正文。
3. 同一 SemanticCommit 恢复后原子完成 Project、Anchor 和当前接口，没有重复创建。
4. 最近修改把 Project Creation 错路由到通用 Undo；通用路径安全零写失败。现按 Proposal
   operation shape 路由到专用 Page-aware inverse Commit，并折叠
   `project-creation-undo:` ledger。
5. Logseq `Editor.deletePage` 的契约是 Page name，不是 UUID。旧实现虽先按 UUID 校验所有权，
   但删除调用无效，Undo 保持 PENDING。现改为 UUID/属性验证、name 删除、bounded absence
   复核；同一 PENDING Undo 重试后完成。
6. Undo 后 Page 文件移除，Project/Anchor 当前投影撤销，Audit 与 inverse Commit 保留；
   reload 后用户系统状态明确“可以正常使用、无需操作”。
7. Page 来源创建后一次完整 Logseq restart 重建了 Page/Block runtime UUID。旧实现严格按
   原 UUID 找专用 Page，安全拒绝 Undo 且没有先删正式对象。修复后先读原账本 identity；
   只有找不到时才按已审阅 Page name 重新读取，并再次验证精确 owner/object/commit
   metadata 与 metadata-only 内容。Service prepare/finalize 仍使用原账本 identity。
8. 删除专用 Page 后 event bridge 短暂显示“一项正文变化需要核对”，但
   Pending/Recovery/Source Conflict 为 `0/0/0`；完整 Logseq restart 后冷启动重验自动收敛为
   `reconciliationRequired:false`，无需人工重复操作。
9. reload/restart 时旧诊断 HTML 可能已挂载但 `isMainUIVisible` 为 false；恢复完成后现在会
   只刷新已挂载的 diagnostics shell，不覆盖普通 workspace。当前构建重载后可原地显示 READY。
10. Launcher `package:runtime` 是安装最新 Service payload 的必要步骤；只 build Service 不会
    更新安装包。本 Gate 发现旧 payload 后补齐打包与重新安装，未改数据库或 Keychain 配置。

## 证据分层

- 自动：Application `152/152`、Local Service `129/129`、Plugin 最终 `269/269`；Node 20
  根级 `./scripts/check.sh` PASS，rule coverage 145，recovery rehearsal differences `[]`。
- 真实 Provider：Blank 多轮 Grill 与 Preview PASS；404/422 均零正式写入。
- Desktop：真实创建恢复、reload、Undo 恢复、再次 reload 与健康状态 PASS。
- CURRENT 截图：`p2-c-18`～`p2-c-20`，对应 `913bbda4528f`，覆盖 Undo 确认、Undo 完成与
  restart 后健康状态。
- HISTORICAL/SUPERSEDED：`p2-c-01`～`p2-c-17`。其中 `p2-c-12`～`p2-c-17` 证明真实 Page
  Provider/Review/create/restart 过程，但早于最终 identity 漂移修复，不作为当前 UI 权威。

## 剩余 Gate

- Page 来源：保留另建主链已 bounded PASS；升级当前 Page 关系、来源返回和当前 build
  的 Grill/Preview/Review 中间截图仍需验证；
- MiniProject 来源：Object/version + Primary Anchor + subtree 边界、只允许保留来源另建；
- Light、窄栏和来源返回；
- 一条全程同一 commit 的中间截图链；
- Review 历史密度与预检式 Undo 文案一致性。
