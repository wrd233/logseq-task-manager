# P0-A 普通 Block“处理这条内容”自动证据（2026-07-24）

结论：`AUTOMATED_PASS / DESKTOP_GATE_OPEN`

## 用户路径

```text
右键任意 Block
→ Task Copilot：处理这条内容
→ 按该次右键 payload 的精确 UUID 重读原 Block
→ 既有 Provider → Validator → Proposal / NO_PROPOSAL
→ 返回原 Block
```

入口不猜对象类型，不直接写 Graph、SQLite、Focus 或 Ownership。Provider 不可用时显示
受限状态，不发起模型请求、不产生正式写入。

## 安全边界

- context menu callback 传递选中 Block UUID，而不是稍后读取主编辑区的“当前 Block”；
- 模型请求前以 `includeChildren: false` 重读同一 UUID，并验证返回 UUID 完全一致；
- Block 缺失、宿主 shape 不合法、UUID 不一致或去除自身 `id::` 后正文为空均 fail closed；
- 目标 UUID 为单次消费的 session 状态；成功、失败、一般入口、Graph switch 和 UI 打开异常
  都不会把旧目标留给下一次请求；
- P0-K origin token 继续区分 `MAIN_PAGE / SECONDARY_PAGE`，不把 sidebar/Query/引用来源提升
  为主 Page 导航；
- 日志只记录既有 Block UUID/Proposal ID 技术身份，不记录完整正文或 Provider 凭据。

## 自动 Gate

- 注册测试证明菜单标签稳定且回调收到原始 payload UUID；
- 目标状态测试证明 single-use 与显式 clear；
- 读回测试覆盖精确 UUID、仅去除自己的 identity property、missing、mismatch、空正文；
- Plugin tests：191/191 PASS，0 skipped；
- Plugin typecheck/build：PASS。

## Desktop Gate

尚需在真实 Logseq 集中验证：

1. 普通 Block 成功 Proposal/NO_PROPOSAL 与返回；
2. Query 结果和 Block 引用回调实际提供的 UUID shape；
3. right sidebar/Zoom 中触发后不改变 main Page；
4. Provider 不可用、来源移动/删除和 Graph switch；
5. Light/Dark、窄栏及键盘路径。
