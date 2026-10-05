# 长篇报告与最新 main 整合

用户明确授权将已完成改动合入最新远端 main 并推送。origin 已核对为 `https://github.com/wrd233/logseq-task-manager.git`；本轮使用独立工作树整合，不读写其他 session 的未提交内容或 runtime。

## 基线与提交

| 项目 | SHA |
| --- | --- |
| 原始本地 main | `df307efee3572c312b1cbd9c04a4b93a81ac69f1` |
| fetch 后最新远端 main / 实现固定 BASE | `8529212296f0b65fb78ef7ccd2a2102474d9310a` |
| 来源树、正文 helper 与样式 | `54bcdcf0a1b2730af6c551101fb9ed4daf79b1dd` |
| 公共 renderer/controller 最小接线 | `69927cbcabbc881d14e5d1fba172544836af25c8` |
| 实现分支 HEAD，文档与 Desktop 证据 | `6ecbf8d1e75cba521debe8d68810dd3af1fa12f9` |
| 合并后的受检代码 HEAD | `77d822c28f8bd33af8881687d746311d7292b8c8` |

原本地 main 落后远端 8 个提交。本轮从 fetch 得到的 origin/main 建立 `codex/merge-report-fulltext-main`，以普通 `--no-ff` 合并实现分支，无冲突。合并树与实现分支一致，保留全部最新远端历史。门禁之后仅追加本记录、验证日志/清单和交接文档中的实测结果，产品代码不再改变。

## 最终门禁

使用 Node 20.20.2、npm 10.8.2，独立安装依赖和构建输出。`npm run check` 退出码 0：

| 检查 | 结果 |
| --- | --- |
| workspace 测试 | 624/624，其中 Logseq plugin 390/390 |
| sandbox 测试 | 5/5 |
| boundary 测试 | 12/12 |
| 总计 | 641/641，失败、跳过、取消均为 0 |
| docs:requirements、typecheck、lint | 通过 |
| build、built binaries、dependency boundaries | 通过 |
| taste:eval | PASS；既有 0.1.0 保持 active，未自动激活候选 |
| `git diff --check origin/main..HEAD` | 通过 |

针对性回归 40/40。完整日志和分包计数见 [verification.json](../implementation/assets/report-fulltext-layout/verification.json)、[full-check-integrated.txt](../implementation/assets/report-fulltext-layout/full-check-integrated.txt)。

最终构建 `apps/logseq-plugin/dist/index.js` SHA-256 为 `ad235cc0b8feeaaa09dc48a58fc1b86085f59e40b8a9d0e70a091a437d0fdad2`，与真实隔离 Desktop 已加载脚本一致。合并没有改变被实测的产品代码。

Desktop 初始 93/93 核心来源、修改后 94/94 全部来源逐条对应；中间块编辑只改变该块 raw 版本，其他 93 来源及真实结构不变。历史修订/认可事件与 hash 不变，资料返回恢复全文。生产 Graph/config 前后 3,540 文件无变化。截图与未验的物理 IME、Undo、跨应用剪贴板、OS 文件拖放、多生产 Graph 等边界见 [实施交接](../implementation/report-fulltext-layout-handoff.md)。

## main 发布步骤

重新检查主 checkout 干净且仍在 main，快进到整合结果，再执行正常 `git push origin main:main`。保留本地 pre-push guard；不强推、不跳过 hook、不修改全局 proxy。若远端再次前进，先整合并重新验证后再推送。

最终以 `git rev-parse main` 和 `git ls-remote --heads origin refs/heads/main` 的相同 SHA 确认发布；这份记录和验证清单随合并后的文档提交一起推送，最终发布 SHA 在任务完成回复中给出。
