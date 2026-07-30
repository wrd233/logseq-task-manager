# Release Freeze 代表 Gate（2026-07-30）

## 基线

- branch：`feature/task-copilot-mvp`
- code/build commit：`1549728`
- Logseq Desktop：`0.10.15` File Graph `logseq`
- Node：`20.20.2`
- 用户既有未提交改动：Local Service `package.json` / `package-lock.json` 的 Logseq package
  identity 与 `docs/research/`，全程未覆盖、未暂存、未提交。

## 自动与安装 Gate

- 根级 `./scripts/check.sh` PASS：Application `173/173`、Local Service `172/172`、
  Launcher `29/29`、Persistence `49/49`，Plugin、CLI、typecheck、build、145 条稳定规则与
  recovery rehearsal 全部通过；
- 发布前源码搜索没有 skipped test；命中的 `TODO` 全部是 Logseq 执行 Marker 合同，不是
  未实现占位；silent-overwrite 与 Pending Recovery 继续由根级规则覆盖；
- 同 Graph 无参数重装保留既有 authority：
  `graph-a00da3a2f9b4c5a53b393c03a0c234d0562be1905965dd11e50b96f10514ce46` 与
  `tmp/runtime/manual-v2/task-copilot.sqlite` 均未变化；
- 安装态 Service/Launcher SHA-256 分别为
  `c6eb3c343cdf8764a875d3ac8c7f84142e359acb6387f84624c61ee3404fc02c`、
  `34279f427b65b73ed4f4551e5d4cc420c7effa6e006f9ba61f6229157d97223d`，与 payload
  一致。既有 quit/reopen、owned shutdown、Graph switch/切回证据使用完全相同的二进制；
  本轮不机械重复未受代码影响的宿主 Gate；
- CLI `READY · objects 14`，Doctor `PASS`、schema `12`、Commit healthy `0`、Anchor/Identity
  `0`。唯一 warning 是一条历史 stale Proposal，不是当前待处理或恢复记录。

## Skill 与真实 Provider

- 五个 active Skill 的 source、payload、安装态与 Service catalog SHA-256 一致；没有并行
  active 旧版本；
- 当前构建以 `recover-context@1.3.0` 完成一次真实 DeepSeek Desktop smoke：确定性状态
  保留，AI 只增加一个关注点与一个主动作，Project 保持 `v31`，零 Proposal、零 Commit；
- 当前 Project Creation 使用同一 `project-creation-modeling@1.6.0` 完成五轮自适应 Grill
  和一次最终预览调用。全部调用一次返回、Validator rejection `0`、retry `0`、abstention
  `0`；模型能依据用户纠正拒绝固定日会建议，但仍逐项询问边界、证据、闭环和当前接口，
  属于可接受但偏长的既有质量债，不升级 Skill、不加样本补丁。

## 当前构建 Project create → reload → Undo

1. 从 Blank 入口开始，五轮 Grill 明确结果、边界、完成证据、阻塞闭环和当前推进；
2. 最终阅读 Preview 只显示系统理解、会改变、不会改变和下一步；此时零正式写入；
3. HIGH Review 首屏先显示影响和退出安全；“审阅方案”与“确认应用”分开说明；
4. 最终确认后创建一个正式 Project 与专用受控 Page，落地页显示当前状态、唯一当前推进、
   预期成果和 Context Recovery/调整入口；
5. Logseq Plugin Manager 真实 reload 后，新 Project 继续出现在 Now，正式投影保持；
6. 从“最近修改与恢复”发起 Project Creation 专用 Undo，重新检查 ownership、空 Page 与
   Object 版本后移除 Object/Anchor/专用 Page；
7. 再次 reload 后精确搜索只显示“创建 Page”，正式 Page 已不存在；CLI 回到 objects `14`，
   Doctor PASS、Commit healthy `0`。

该链没有修改测试来源 Page；Blank 来源没有伪造来源关系。测试创建的 Project 与 Page 已撤销，
历史 Audit 保留。CURRENT 截图见 `current-ui/SCREENSHOT_INDEX.md`。

## Release 包

- 路径：`tmp/releases/task-copilot-v2-0.1.0-1549728.zip`
- SHA-256：`38120182627f89946b5deafdd94be81b2cb5e3c05169a6b08b00da61aa5b2c04`
- 大小：约 `10 MiB`
- `unzip -t`：PASS
- 从 zip 解压出的 `task-copilot-launcher/dist/installer.js` 对当前测试 Graph 执行真实无参数
  install：`INSTALLED`；graphKey/databasePath 不变，安装后二进制 hash 保持一致，Service
  `READY · objects 14`、Doctor PASS；
- 内容：Plugin、Launcher/Service payload、SQLite native runtime、五个 Skills、CLI 与
  `13_RELEASE_RUNBOOK.md`；不包含 Graph、SQLite 数据、日志、截图、API Key 或凭据。

## 依赖审计与边界

- `brace-expansion 5.0.7 → 5.0.9` 后 audit 从 `4` 降为 `3`；
- 剩余 `2 high / 1 critical` 来自 `@logseq/libs@0.0.17` 固定的 DOMPurify/lodash runtime。
  npm 建议的 `0.3.4` 仍落在 advisory 范围，type-only 又已被 Logseq `0.10.15` 真实证明无法
  提供 `window.logseq`；因此作为显式上游风险保留，不执行无效的 `--force` major；
- 显式 Block Marker 自动物化已经有 Application/SQLite 精确 inverse，Proposal 正式化也有
  用户层 Undo。没有新增“删除任意正式对象”入口：直接显式标记产生且已有后续状态的对象只能
  取消 Lifecycle 或通过受控恢复处理，避免把删除伪装成安全撤销。这是产品合同边界，不是
  缺失 Recovery Kernel。

## 完成度与复杂度

- P0：`DONE_DESKTOP_REPRESENTATIVE`；
- P1：release boundary 已关闭；时间 Attention 为 bounded Pilot，其他高噪声类型 Shadow，
  Context Recovery DONE，Block Marker OFF；
- P2：release boundary 已关闭；P2-D shared external Agent、P2-E bounded recovery、P2-G
  高风险代表链 DONE，P2-F Shadow/non-blocking；
- Final Release：`RELEASE_CANDIDATE_READY`；完整长期 Goal仍不提前结束；
- 本 Gate 新增正式状态 `0`、Runtime `0`、Recovery 分支 `0`、Skill/Prompt 版本 `0`；关闭
  Release package/runbook 与 latest Project create/reload/Undo 两个既有 Partial，新增
  Partial `0`，净变化 `-2`。
