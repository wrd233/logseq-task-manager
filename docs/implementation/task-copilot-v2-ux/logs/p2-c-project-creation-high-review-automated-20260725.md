# P2-C Project Creation HIGH Review 自动证据（2026-07-25）

## 结论

Project Creation 的 session-only Preview handle 已能进入既有 Proposal Review 权威层，
但尚未进入正式 Project 创建。当前状态是 `IN_PROGRESS_HIGH_REVIEW_AUTOMATED`，不是
P2-C 或完整 Goal 完成。

## 已自动验证

- Service 只接受当前 session 的 opaque Preview handle，不接受客户端上传 Preview、
  Proposal、来源正文或正式 operation；
- 消费 handle 前，Service 重新构造 Blank/Page/MiniProject 来源，并重验稳定
  source fingerprint 与当前 Graph scope；
- source fingerprint 不受 Context Package 的 `generatedAt`、`observedAt` 或瞬态
  context fingerprint 影响，但会随来源材料、正式 Context facts、用户答案、用户语义或
  Skill 版本变化；
- Proposal identity 绑定 server-owned Preview handle 与完整规范化 Preview intent；同一
  handle 幂等重放，分别生成但内容相同的 Preview 也不会因不同 `createdAt` 复用同一个
  Proposal ID；同一来源下不同 outcome、boundary、closure、current interface、材料处置
  或 provenance 同样不会发生碰撞；
- Preview 只生成一个 `HIGH` 语义组和一个 `CREATE_OBJECT` operation；
- Blank 只允许创建独立受控 `Project/<title>` Page；
- Page 允许整体审阅“保留来源并另建 Project Page”或“升级当前 Page”；
- MiniProject 只允许保留来源并另建 Project Page，不能被模型升级为复用 Page；
- Page Proposal 保存 Logseq bridge 解析后的规范 Page identity、version/hash；新建 Page
  明确要求 target `ABSENT`，复用 Page 明确要求 target `PRESENT`；
- 每个 semantic operation target 必须与 modify scope 的 identity、existence、version 和
  hash 完全相同，不能只凭 `kind:id` 借用另一份并发证据；
- `REVIEW_REQUIRED`、过期 handle、来源变化或 scope 变化均 fail closed；
- 重试相同 handle 幂等重放同一 Proposal；
- 既有 HIGH Review 明确确认可接受该组；接受后 Object/Page/Commit 数仍不变。
- MiniProject READY Preview→handle→HIGH Proposal 已通过 Service-owned
  Object/version、Primary Anchor 和 Graph 双重读取；Provider 尝试 `REUSE_SOURCE_PAGE`
  会在 Preview Validator 层 fail closed；Preview 后 Graph subtree 变化会返回
  `GRILL_SOURCE_STALE`，正式 MiniProject version 变化会返回
  `V2_OBJECT_VERSION_CONFLICT`，两者都不会产生新的 Proposal。

## 自动测试

```text
@task-copilot/application: 149/149 PASS
@task-copilot/domain: 43/43 PASS
@task-copilot/service-client: 12/12 PASS
@task-copilot/local-service: 127/127 PASS
```

覆盖文件：

- `packages/application/tests/project-creation-proposal.test.ts`
- `packages/application/tests/project-creation-preview.test.ts`
- `apps/task-copilot-local-service/tests/project-creation-grill.test.ts`
- `apps/task-copilot-local-service/tests/service.test.ts`

## 本轮未声称

- 未声称 HIGH Review 已产生正式 Project；
- 未声称 Page、Object、Anchor、Audit 或 SemanticCommit 已写入；
- 未声称 Page/MiniProject 已通过真实 Provider；
- 未声称 Desktop、reload、失败恢复、Undo 或完成后返回来源已通过。

## 下一 Gate

accepted HIGH Proposal 必须进入同一条正式安全链，并分别支持：

1. Blank/Page/MiniProject 的独立 Project Page 创建；
2. 当前 Page 的受控 Project 升级；
3. prepare、Graph apply/verify、finalize、Pending/Recovery、inverse Undo；
4. reload 后 Object/Page/Anchor/结构一致性和精确业务现场返回。
