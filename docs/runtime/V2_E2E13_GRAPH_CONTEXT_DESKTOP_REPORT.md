# V2 E2E-13 Graph Context 与外部 Agent Desktop 报告

> 日期：2026-07-22
> 环境：Logseq Desktop 0.10.15 / macOS arm64 / Node 20.20.2 / SQLite schema v11
> 状态：`DESKTOP_PASS / E2E-13_DONE`

## 结论

真实专用 Test Graph 已连续证明 `Logseq Desktop → 瞬态只读 bridge → CLI Graph/Context Package → DeepSeek 外部 Agent Proposal → CLI validate/submit → Plugin Review`。模型、CLI 和 Review 都没有直接写 Graph 或正式对象；接受唯一 MEDIUM 组后仍是 `Object=0 / Proposal=1 ACCEPTED / SemanticCommit=0`，正文 hash 保持 `c8fd796b`。最终确认未执行。

## 真实 Desktop 发现与修复

首次 page 读取和 Context Package 成功，但 block 读取真实暴露 Logseq 0.10.15 的 SDK shape：根 Block 的 `parent` 与 `page` 都是 `{id}` entity reference，且指向同一个 Page ID。旧实现把 Page parent 传给 `getBlock`，返回 Adapter 失败；`resolve ((uuid))` 又因内部规范化 UUID 与原请求文本不一致，被 Broker 正确拒绝后超时。

修复只调整现有 bridge Adapter：统一把 entity reference 归一为 Logseq 接受的 ID，父链到 Page 时停止，并让 resolve snapshot 保留调用者原始 target。没有新增表、状态、缓存、扫描器、恢复器、服务或 Graph 写入口。对应自动回归覆盖真实 `{id}` shape、Page 边界、Block 父链和 wrapped resolve target。

## 纵向证据

1. 独立 Local Service 使用隔离 SQLite 与 0600 descriptor 启动；Doctor 为 `GRAPH_READ_BRIDGE_CONNECTED`、integrity `ok`、foreign keys 0、Object 0。
2. `tc graph page` 返回 Page UUID/version/evidence hash 和一个实时 Root Block；修复后 `tc graph block --children --parents 2` 与 `tc graph resolve ((uuid))` 均返回同一 Block 与 scope hash，未读 Graph 文件。
3. `tc context export --scope page` 创建 0700 目录和 15 个 0600 文件，包含 `graph/page.json`、两份完整 Skill、SQLite 空正式事实与 manifest hash；package fingerprint 为 `83156722d2e68c525f0da9d685272effa8a7fed6630961419ddb86b2aa257d10`。
4. DeepSeek v4 Flash 只读取该 Context Package。首轮 Structured JSON 因 operation group shape 不完整被 `V2_PROPOSAL_GROUP_SHAPE_INVALID` 拒绝且零写入；把部分模板收紧为完整逐字段模板后，第二轮 1 attempt、2997 tokens、14.922 秒通过 Domain Validator。
5. CLI validate 前后均为 `0/0/0`；submit 后为 `Object=0 / Proposal=1 READY / Commit=0`，响应 `formalWritesExecuted=false`。
6. Logseq Review Center 真实显示 `EXTERNAL_AGENT · DEEPSEEK-V4-FLASH · READY`、原文、最终预览、Diff、`CREATE_OBJECT` 和唯一 MEDIUM 组。点击接受后显示 `ACCEPTED` 与独立“提交前检查/确认最终提交”，并明确尚未正式生效。
7. Review 后 SQLite 为 `0/1/0`，Graph Block 仍是原普通正文与 hash `c8fd796b`；Doctor `COMMIT_HEALTHY`、Pending 0、integrity `ok`。

DeepSeek 原始成功候选、首轮失败分类、tokens、hash、机器规范化与跨入口计数见 `docs/testing/deepseek-v4-e2e13-desktop-2026-07-22.json`；实际 CLI Proposal 文件见 `docs/testing/deepseek-v4-e2e13-external-proposal-2026-07-22.json`。二者均不含 Key、Authorization、原始 request ID、descriptor path 或 Service token。

## 清理

测试只使用被忽略的专用 Graph 页面和 `tmp/runtime/v2-desktop/graph-context` 隔离运行目录。完成证据写入后删除精确匹配的测试页与私有 descriptor value；Context Package、临时 Agent runner、隔离 SQLite 和临时截图已整体移出工作区到废纸篓，仍可恢复。Logseq 已关闭测试 CDP 端口并按普通方式重启；正式 Graph 与正式 SQLite 未接触。
