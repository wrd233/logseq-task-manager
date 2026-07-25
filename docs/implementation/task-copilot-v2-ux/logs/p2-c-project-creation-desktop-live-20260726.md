# P2-C Project Creation Desktop Live Gate — 2026-07-26

## 结论

`PARTIAL_PASS`。Blank 来源的真实 DeepSeek→Grill→Preview→HIGH Review→同 Commit
Recovery→正式创建→reload→专用 Undo→reload→健康状态已完成。Page 与 MiniProject 来源的
当前 Desktop 边界仍开放，因此 P2-C 和整体 Goal 都保持 `IN_PROGRESS`。

## 环境

- branch：`feature/task-copilot-mvp`
- 入口实现 commit：`c9c29b7`
- LLM/Validator/metadata 修复：`0b4ffc622fcc`
- 最近修改专用 Undo 路由：`b43b3cf7c944`
- 删除可见性与 Page name 契约最终 commit：`d81b1a84f165`
- 最终 Plugin 构建时间：`2026-07-26T00:54:38+08:00`
- Plugin / Service / Launcher：`0.1.0`
- Logseq Desktop：`0.10.15`
- Graph：仓库忽略的专用测试 Graph `logseq`
- 主题 / 窗口：Dark / `994×700`
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

## 证据分层

- 自动：Application `152/152`、Local Service `129/129`、Plugin 最终 `269/269`；Node 20
  根级 `./scripts/check.sh` PASS，rule coverage 145，recovery rehearsal differences `[]`。
- 真实 Provider：Blank 多轮 Grill 与 Preview PASS；404/422 均零正式写入。
- Desktop：真实创建恢复、reload、Undo 恢复、再次 reload 与健康状态 PASS。
- CURRENT 截图：`p2-c-09`、`p2-c-10`、`p2-c-11`，对应 `d81b1a84f165`。
- HISTORICAL/SUPERSEDED：`p2-c-01`～`p2-c-08`；它们证明真实过程，但不代表最终 build。

## 剩余 Gate

- Page 来源：有界 Page Context、保留另建/升级当前 Page 两种关系与原 Page 不丢失；
- MiniProject 来源：Object/version + Primary Anchor + subtree 边界、只允许保留来源另建；
- Light、窄栏和来源返回；
- 一条全程同一 commit 的中间截图链；
- Review 历史密度与预检式 Undo 文案一致性。
