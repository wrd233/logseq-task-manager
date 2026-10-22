# 外部工作证据 MVP

本模块按用户选择的 Git 根目录，回答“哪里变了”，并把选中的元数据引用插入 DSH 原生草稿。无需模型密钥、Task、阶段或 commit。它是本机运营记录，不是 Formal Kernel Evidence；没有正式任务状态、Journal、结构历史或 Graph 写入。

实现基线：2026-10-22 fetch 后的 `origin/main` = `2cb0ced7688b7af19ac5814b1f556ecae255f3c9`。独立分支 `codex/work-evidence-v1`，Worktree `/Users/wangrundong/work/logseq-task-manager-work-evidence`。未合入其他功能分支。

当前版本包含 MVP 之后的可靠性修复。最新测试、真实 DSH 操作记录及接口兼容说明以 [reliability/ACCEPTANCE.md](reliability/ACCEPTANCE.md) 为准；原验收页保留初版历史结果。

## 启动

以下命令均在本 Worktree 根目录运行。项目依赖使用 Node 20，DSH 0.2.1-rc.2 使用本机 Node 24。系统默认 Node 25 的动态库缺失，因此显式指定版本，不改全局设置。

```sh
PATH=/opt/homebrew/opt/node@20/bin:$PATH npm ci --no-audit --no-fund
PATH=/opt/homebrew/opt/node@24/bin:$PATH node apps/dsh-plugin/scripts/work-evidence-preview.mjs
```

启动器构建独立插件和 CLI，使用 `tmp/work-evidence/` 专属输出、状态、日志、DSH_HOME 和 `work-evidence` profile。监听 `127.0.0.1:0`，终端打印实际带本机认证的 URL；`address.json` 只保存地址，`process.json` 保存本次进程号。使用终端的 Ctrl-C 停止本次宿主。不会安装到日常 DSH profile。

可用 `WORK_EVIDENCE_RUN_DIRECTORY="$PWD/tmp/自己的运行目录"` 指定本 Worktree 内的独立运行目录。该路径必须绝对、规范化且位于本 Worktree 的 `tmp/` 下；状态目录检查会在创建前拒绝已有符号链接前缀。正常启动不要设置仅供验收的 `WORK_EVIDENCE_HOST_PROOF`。

第一次在 DSH 关闭 API Key/登录提示即可。新会话上方或已有会话标题栏点“工作变化” → 输入明确选择的 Git 根目录 → “查看工作变化并保存” → 按需展开文件、查看暂存/未暂存差异 → 可选保存补充 → 勾选文件 → “引用所选证据到草稿”。发送由用户操作。面板选择独立于 DSH 工作区、cwd、工具权限和 Logseq 绑定。

独立 CLI 同样可用，所有命令的第一个参数都是本模块的专属状态目录：

```sh
PATH=/opt/homebrew/opt/node@24/bin:$PATH node apps/dsh-plugin/scripts/work-evidence-build.mjs
/opt/homebrew/opt/node@24/bin/node tmp/work-evidence/cli.mjs "$PWD/tmp/work-evidence/state" select /绝对路径/Git仓库
/opt/homebrew/opt/node@24/bin/node tmp/work-evidence/cli.mjs "$PWD/tmp/work-evidence/state" scopes
/opt/homebrew/opt/node@24/bin/node tmp/work-evidence/cli.mjs "$PWD/tmp/work-evidence/state" observe SCOPE_ID
/opt/homebrew/opt/node@24/bin/node tmp/work-evidence/cli.mjs "$PWD/tmp/work-evidence/state" history SCOPE_ID
/opt/homebrew/opt/node@24/bin/node tmp/work-evidence/cli.mjs "$PWD/tmp/work-evidence/state" read SCOPE_ID OBSERVATION_ID
/opt/homebrew/opt/node@24/bin/node tmp/work-evidence/cli.mjs "$PWD/tmp/work-evidence/state" note SCOPE_ID OBSERVATION_ID '这次主要想解决什么'
/opt/homebrew/opt/node@24/bin/node tmp/work-evidence/cli.mjs "$PWD/tmp/work-evidence/state" diff SCOPE_ID OBSERVATION_ID '含空格的文件.txt' unstaged
/opt/homebrew/opt/node@24/bin/node tmp/work-evidence/cli.mjs "$PWD/tmp/work-evidence/state" quote SCOPE_ID OBSERVATION_ID '含空格的文件.txt'
```

引用格式为 `work-evidence:v1:<scopeId>:<observationId>`，CLI `read` 读回对应原记录及独立补充。`recordHash` 校验原观察 JSON，补充各有自己的时间、来源和校验值；不构成数字签名或防本机管理员篡改承诺。

`scopes`、`history` 与 `read.notes` 返回 `{ items, complete, problems }`。损坏记录会显示部分可用，其余有效记录仍可读取。CLI `note` 可再传一个 UUID `requestId`；丢失回执后以相同 ID 和原文重试，返回原补充及原时间。同一 ID 改写原文会被拒绝。

## 范围与状态

- `workspace-files.ts` 已有授权根目录、符号链接限制、文件元数据与预览；本模块复用 `authorizedRoot`，新增独立 Git 观察。没有复制正式 Kernel Evidence、SourceSnapshot 或正式历史机制。
- 采用参数化 `spawn`、NUL 分隔 porcelain v2、字面路径参数、无 shell。暂存/未暂存独立，保留重命名前后路径；支持删除、无 HEAD、detached HEAD、空格、换行、制表符和 Git pathspec 特殊字符。不能可靠解码的非 UTF-8 路径会明确观察失败。
- `GIT_OPTIONAL_LOCKS=0`，关闭 fsmonitor/untracked cache；清除继承的 `GIT_*` 覆盖，避免 cwd 被环境变量改向。Git 本身为判断变化可能计算文件哈希；应用不取回或存档正文。
- 未观察与失败、无变化、结果截断、观察期间来源变化、查看差异时来源已变化是不同状态。每次观察都保存，包括失败。一次观察对前后状态与有限文件元数据校验，永远不声称是原子快照。
- 版本由 Git 状态（含 HEAD、分支、index 对象与模式）及 dirty 文件的 inode/size/mtime/ctime 等元数据计算。没有前次完整一致观察，、分支/HEAD 改变或任一观察截断/不一致时，比较为“无法确定”；完整一致记录才区分“新增或发生变化”“已有变化”和“已不在变化列表中”。已有变化不证明正文完全相同，消失也不证明完成。
- 原记录通过排他创建、完整文件原子发布、文件与目录同步保存，API 无覆盖或删除。用户补充单独追加；新的补充不会改写机器记录。仅保存元数据、引用和主动输入的解释，保留在本机专属目录，首版无自动清理。
- 每个 Git 子进程最多 5 秒，元数据整理每轮最多 5 秒；一个观察包含根目录与前后校验，整体可能超过 5 秒，但没有常驻扫描。Git 输出最多 1 MiB，最多返回 500 文件；超限明确标记。每目录显示最近 100 条观察，最多 32 个选择范围；各记录类别达到 2,000 条后要求使用新的专属状态目录，避免无界历史读取。
- 默认不返回未跟踪文件正文；敏感路径（`.env*`、凭据/secret、SSH/AWS/GnuPG/Kube、私钥等）仅元数据。diff 是主动操作，分别限制为 64 KiB，当前文件 256 KiB；符号链接、gitlink、二进制、明显凭据正文被拒绝或排除。过滤器不是全面秘密识别器，发送前仍应审阅自己的草稿。
- diff 不存档，只有来源版本仍匹配才提供当前差异。超限不返回半截正文，显示“差异截断”。旧记录永远不伪装成历史正文快照。子模块内部不观察；首版不支持裸仓库、子目录范围、非 Git 目录或全盘索引。

## 独立整合

DSH 服务扩展仅注入 authenticated Connection，注册 `/api/work-evidence/*` 的 UI RPC；不注入 SessionController、tools、SystemPrompt。客户端使用正式 `conversation.hero.options` 和 `conversation.session.header.utilities` 插槽，以及原生 `captureInsertion`/`insertText`，不访问提交接口。构建出的独立 bundle 通过 DSH profile 的 bundle 机制加载。

本轮不需要共享接线补丁。以后要合并到现有工作台，只需在串行整合阶段把独立 bundle 加入目标 profile（或由共同入口加载该模块），传入明确的专属 `stateDirectory`；如需把轻量观察提升为正式 Evidence，必须另走 Kernel 的可信来源与授权流程。禁止把本地选择当作 DSH 执行权限。

验收、边界和截图见 [ACCEPTANCE.md](ACCEPTANCE.md)。
