# Release r6 当前安装包与 Desktop 生命周期证据

> 状态：`CURRENT`
> 日期：2026-07-31
> 分支：`feature/task-copilot-mvp`
> 源码 / 构建 HEAD：`11e0131e39464d73e1ae50aa0a543010f77521ce`
> Logseq：`0.10.15` File Graph `logseq`

## 为什么生成 r6

r5 的 Plugin、Launcher 和 Service 本身已通过真实安装与生命周期 Gate，但它是从
r3 解压后只替换 Plugin 构建得到的。因此包内 `docs/13_RELEASE_RUNBOOK.md`
仍是旧版，缺少“解压到稳定、用户可控目录”和“不得从 `/var/folders`
等临时目录注册 Plugin”的正式说明。这是发布包与仓库文档漂移，不是
新功能需求。r6 从当前 HEAD 全量组装 Plugin、Launcher/Service payload、
CLI 和 Runbook，不再继承旧包的文档。

## 包完整性与安全

- 当前包：`tmp/releases/task-copilot-v2-0.1.0-11e0131-r6.zip`
- SHA-256：`bedf541640bd45976d213f72a98308705fc33173de63c1d208e59c269fc5e8e5`
- 解压目录：`tmp/releases/task-copilot-v2-0.1.0-11e0131-r6/`
- `unzip -t`：PASS（109 files）
- 包内 Runbook 与当前仓库文件字节一致；
- 包内不包含 database/sqlite/log/截图/压缩归档类运行数据；
- 凭据特征扫描命中 `0`；
- Plugin 内嵌 provenance：`11e0131e3946`；
- Plugin JS：`c8999840963348ef886d8158b590f1e12304af01e6acb636aa1461cdf2e6255d`；
- Plugin CSS：`ce26ba4fe035715bbb56f27020f61cae13225844dce6d989437c2faed27a99e6`；
- Launcher：`34279f427b65b73ed4f4551e5d4cc420c7effa6e006f9ba61f6229157d97223d`；
- Service payload：`c6eb3c343cdf8764a875d3ac8c7f84142e359acb6387f84624c61ee3404fc02c`。

## 安装与 database authority

先真正零参数执行 installer，结果为 exit `2` /
`LAUNCHER_INSTALL_ARGUMENTS_INVALID`，没有猜测 Graph 或 database。随后仅显式提供：

- Graph path：`/Users/wangrundong/work/任务管理中心-logseq插件/logseq`
- Graph id：`logseq`
- 不提供 `--database`

安装成功后，旧映射与新映射一致：

- graph key：`graph-a00da3a2f9b4c5a53b393c03a0c234d0562be1905965dd11e50b96f10514ce46`
- graph id：`logseq`
- database authority：`tmp/runtime/manual-v2/task-copilot.sqlite`

Installer 没有因发现其他 database 而静默替换既有 authority。安装态
Launcher/Service 与 r6 payload hash 一致。

## 真实 Desktop 链

1. 从稳定 r6 目录重新注册 Plugin；Logseq 对旧 r5 注册提示已存在，
   因此先通过 Plugin Manager 卸载旧注册，再手工加载 r6；
2. Plugin Manager reload 后，Task Copilot 命令完整注册；
3. 打开“现在”，iframe 精确指向
   `tmp/releases/task-copilot-v2-0.1.0-11e0131-r6/task-copilot-plugin/dist/index.html`；
4. 前台显示“Copilot 可用 · 建议需审阅”，Now 保持一卡一主操作；
5. 完整退出 Logseq，Logseq 进程第一次检查即消失；owned Service
   在约 8.5 秒后移除 descriptor，Launcher 保持运行；
6. 重新打开 Logseq，Service descriptor 第一次轮询即 READY；
7. 再次打开 Task Copilot，iframe 仍指向同一稳定 r6 目录；
8. CLI：`READY · objects 14`；Doctor：PASS，schema `12`。唯一 warning
   为既有 `STALE_PROPOSAL_PRESENT 1`，不是本轮新增。

CURRENT 截图：

- `../current-ui/screenshots/release-r6-stable-package-now-current-11e0131.png`
- `../current-ui/screenshots/release-r6-stable-package-now-restart-current-11e0131.png`

两张均为 1000×720、host Light / Plugin Dark，不含 Key、token 或技术详情。

## 收口结论

- r5 的真实生命周期仍是有效历史证据，但其发布包由于 Runbook 漂移标记为
  `SUPERSEDED_PACKAGE`；r6 是当前可安装产物。
- 关闭既有“发布包与当前 Runbook 一致” Partial `1`，新增长期 Partial `0`，
  净变化 `-1`。
- 新增正式状态 `0`、Runtime `0`、Recovery 分支 `0`、Skill/Prompt/Validator
  版本 `0`、写入权威 `0`。
- P0/P1/P2 发布边界不变；Final Release 保持 `RELEASE_CANDIDATE_READY`。
- 完整长期 Goal 仍为 `IN_PROGRESS`：本轮不把一个候选包冒充长期真实日用完成。
