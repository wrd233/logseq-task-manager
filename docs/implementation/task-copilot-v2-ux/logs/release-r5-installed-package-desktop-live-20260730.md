# Release r5 安装包真实 Desktop Gate（2026-07-30）

## 基线

- branch：`feature/task-copilot-mvp`
- HEAD：`70a7fe7e01272d2d8dd70d6e34393c8dc8f5fd7e`
- Logseq Desktop：`0.10.15`，File Graph `logseq`
- release：`tmp/releases/task-copilot-v2-0.1.0-9e7a105-r5.zip`
- SHA-256：`d3f2242d2a0c3721656a6a9f8b72052e3c3fe301d4ea33b0971d1eb5c43f83d3`
- 测试 Graph：仓库内忽略的 `logseq/`；本 Gate 没有对正式对象或正文发起写入。

## 安装与 authority

1. 直接从 r5 解压包执行真正零参数 `install`，以
   `LAUNCHER_INSTALL_ARGUMENTS_INVALID` 和退出码 `2` 安全停止，没有修改已有映射。
2. 从同一解压包显式提供 `--graph-path` 和 `--graph-id`，不传
   `--database`，安装结果为 `INSTALLED`。
3. 重装前后保持：
   - graph key：`graph-a00da3a2f9b4c5a53b393c03a0c234d0562be1905965dd11e50b96f10514ce46`
   - database authority：`tmp/runtime/manual-v2/task-copilot.sqlite`
4. 安装态与 r5 payload 一致：
   - Launcher：`34279f427b65b73ed4f4551e5d4cc420c7effa6e006f9ba61f6229157d97223d`
   - Service：`c6eb3c343cdf8764a875d3ac8c7f84142e359acb6387f84624c61ee3404fc02c`
5. r5 包内 Plugin 对应源码提交 `9e7a105`：`dist/index.js` SHA-256 为
   `e4ec6ac96e8eb401e3725991d0e8e52809592e10dd88cef1ba4c84af1aa20e30`，
   `dist/index.css` 为
   `ce26ba4fe035715bbb56f27020f61cae13225844dce6d989437c2faed27a99e6`。
6. 必须的根级检查在文档-only HEAD `70a7fe7` 上重建 workspace Plugin，内嵌
   build commit 从 `9e7a1050f757` 变为 `70a7fe7e0127`，因此原始 JS/HTML hash
   按设计变化。将该 12 位 provenance 归一化后，两份 JS 字节精确相同；
   CSS 原始 hash 也精确相同。这是构建来源标识，不是源码或产品逻辑漂移。

## Plugin 可持续注册

- 先移除只指向 `/var/folders` 临时解压目录的注册，再通过 Logseq
  “手动载入插件”选择稳定的忽略目录：
  `tmp/releases/task-copilot-v2-0.1.0-9e7a105-r5/task-copilot-plugin`。
- 启用后执行真实 Plugin Manager `reload`；命令面板仍登记全部 Task Copilot
  命令。
- Task Copilot iframe URL 明确指向上述稳定 r5 目录，不再依赖临时路径。
- 插件 settings 的业务配置项全部保持；唯一差异是用户真实启用插件后
  `disabled: true → false`。layouts hash 完全一致。

## reload、quit 与重连

1. 稳定包路径下真实 reload 后，Now 显示 `Copilot 可用 · 建议需审阅`，
   一对象一个主操作保持。
2. 从 Logseq 执行完整退出：第 `6` 次 500 ms 轮询前 Logseq 进程已退出，
   Graph Service descriptor 已移除，owned shutdown `PASS`；Launcher 保持待命。
3. 从 Finder 再次打开 Logseq：第 `1` 次轮询 Service descriptor 已恢复。
4. 重开后命令面板仍可打开 Task Copilot，iframe 仍指向稳定 r5 目录；
   没有回退到 workspace 源码路径或临时解压路径。

## 最终健康

- CLI：`READY`，objects `14`，schema `12`，protocol `1`。
- Doctor：`PASS`；Graph bridge connected，SQLite integrity/schema、Anchor/Identity、
  Semantic Commit、Backup、Key reference、5 个 active Skill 和 protocol 均通过。
- 唯一警告是既有 `STALE_PROPOSAL_PRESENT 1`，不是 PENDING、Recovery 或本轮写入。
- database authority、Launcher/Service payload 和 Plugin 稳定包路径在 reload 与完整
  restart 后同时保持。
- API Key、descriptor token 和正文均未进入仓库、截图或本记录。

## CURRENT 截图

- `current-ui/screenshots/release-r5-stable-package-now-current-70a7fe7.jpg`：稳定 r5
  目录启用并真实 reload 后的 Now。
- `current-ui/screenshots/release-r5-stable-package-now-restart-current-70a7fe7.jpg`：完整
  quit/owned shutdown/reopen 后的同一 Now，iframe 仍指向稳定 r5 目录。

两张截图均为 1000×720、File Graph `logseq`、真实 Logseq Desktop 界面。
早先指向临时解压目录的三张 r5 截图已删除，不得当作当前安装态证据。

## 结论

r5 发布包的 Launcher、Service 和 Plugin 现在都有直接的真实安装、reload、
owned shutdown 与 restart 证据。Release package 安装态 Partial 由“文档声称”关闭
为“真实 Desktop 已验证”；新增正式状态、Runtime、Recovery 分支、Skill/Prompt
版本和写入权威均为 `0`。Final Release 保持 `RELEASE_CANDIDATE_READY`，完整长期
Goal 仍为 `IN_PROGRESS`。
