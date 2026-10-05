# 本轮协作审阅证据与复验

这些文件来自 2026-10-05 本分支隔离验收；完整 Graph、原始 Journal 和 descriptor 留在私有 tmp，不作为公开日志。精简 evidence.json 仅含合成身份、状态、hash 和前后位置，不含认证 token。

| 文件 | 含义 |
| --- | --- |
| default-reading.png | 初始 87/87 条来源，只显示一个协作入口 |
| report-review.png | 完整报告正文、局部高亮、纠正／普通建议；连接／历史均按需 |
| history-version.png | 明确选择已认可的旧修订，原生入口及报告切换禁用；历史内容不含后来输入 |
| partial-review.png | 当前修订保留写回问题，普通 TODO 不变 |
| conflict-proposal.png | TODO 保护拒绝后保留当前文与提议，禁用旧请求保存，允许显式重新读取 |
| evidence.json | 独立生产 CLI、移动 UUID、所见认可、原生输入、重载／离线的精简事实 |
| fixture.mjs | 80 条正文及四层子树定义；只在明确空的隔离 Graph 创建，不改已有页 |
| production-cli.mjs | 独立进程调用现有生产 CLI，生成版本绑定请求、查询／recover、同 payload 重试 |

复验在自己的 sandbox app/home/profile/Graph 进行，先核对进程及端口归属。用当前仓库的 sandbox 说明准备实例；本轮独立启动配置使用空闲 19347，没有连接另一个 session 的 19333。不要将模块加载到生产 Graph。

在插件宿主的受控测试环境用 fixture 的 createFixture(logseq.Editor)，检查实际父级和 UUID，保存它返回的合成身份 JSON。通过现有材料入口关联一个实际 Markdown 文件，使用返回的 materialId；不要自己生成材料 ID。结束自己创建的原生输入，再关联独立工作目录。

在真实协作 UI 中开始阶段，准备自己的 workspace serve / descriptor 并明确允许结构整理。以兼容 Node 运行：

```sh
node docs/implementation/assets/collaboration-review-ux/production-cli.mjs "$CLI" "$WORK_DIRECTORY" "$PRIVATE_STATE" "$FIXTURE_JSON"
```

保留脚本输出的请求文件；查询使用输出的原 requestId 与 client=synthetic-review-demo。不把内部 external-* requestId 再传 router；不要在脚本已失败或 fixture 后改时重新生成请求补齐。

随后在本地界面完成：查看改动 → 纠正 → 添加普通建议 → 记录同阶段版本 → 认可实际所见 revision → 从源行进入 UUID 匹配的原生 textarea 继续写 → 历史选择已认可旧版 → 返回当前。核对旧 revision / acceptance 的完整 JSON 没有被后改，普通 TODO、标记、材料链接、完整子树身份仍在。断开连接后再次读取正文、材料和历史。

截图证明当时的真实宿主 UI，不替代结构与不可变事实；CDP 输入文本不是物理中文 IME / Undo / 系统拖放证据。未知回复及 composition 的精确回归使用本轮测试；实机未注入崩溃或损坏私有记录。
