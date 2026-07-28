# P0-J 结束运行后的正式写入边界 Desktop Gate

> 状态：`DONE_DESKTOP_REPRESENTATIVE`
> runtime commit：`bc79ffd1ce6a091186cc54ee0a32bcb6a1c8b24b`
> Logseq：`0.10.15`
> Graph：File Graph `logseq`
> 日期：2026-07-28

## 问题

此前结束 Task Copilot 后，切换插件路由可能重新触发 bootstrap，等价于用户已结束产品、
正式写入能力却被静默恢复。该问题不是普通按钮可见性，而是用户声明“结束”后的写入权威
边界。

## 实现结论

- 显式结束后进入 session ended boundary；
- 查看 Now、系统状态等只读路由不会重新启动 Service；
- Focus、Condition、Undo 等正式动作 fail closed，原正式状态和正文不变；
- Slash 仍保持 Logseq 本地显式语法插入能力，不借此获得正式写入；
- 只有用户显式重新启动 Task Copilot 才恢复正式能力。

没有新增正式状态、写入权威、Recovery 分支、Skill、Prompt 或 Validator。

## 自动证据

- Plugin：`350/350` PASS，0 skipped；
- typecheck、build、dist/bootstrap integrity PASS；
- 根级稳定规则与恢复演练由同轮 `./scripts/check.sh` 再确认。

## Desktop 操作链

1. 在当前构建显式结束 Task Copilot；
2. 切换到 Now / 系统状态，观察没有自动重启；
3. 从正式事项尝试 Focus、Condition、Undo，均被用户层受限结果阻止；
4. 验证正式对象版本、正文和 Commit 没有变化；
5. 在临时 Block 调用 Slash，显式正文语法仍可插入，随后清理临时内容；
6. 显式重新启动 Task Copilot；
7. reload 后 Now 恢复，未出现受限期间的 Focus/Condition/Undo 写入。

## CURRENT 截图

| 文件 | 场景 | 主结论 | 下一步 |
|---|---|---|---|
| `../current-ui/screenshots/p0-j-restricted-ended-current-dark-bc79ffd.jpg` | 显式结束后的受限状态 | Task Copilot 已结束，没有自动重启 | 可查看说明或显式重启 |
| `../current-ui/screenshots/p0-j-restricted-formal-action-blocked-current-light-bc79ffd.jpg` | 受限期间尝试正式动作 | 本次没有修改正式事项或正文 | 显式重启后再做 |
| `../current-ui/screenshots/p0-j-restricted-slash-current-light-bc79ffd.jpg` | 受限期间使用 Slash | 仅插入显式正文语法 | 用户继续编辑或取消 |
| `../current-ui/screenshots/p0-j-restricted-restarted-current-light-bc79ffd.jpg` | 显式重新启动后 | 正式能力恢复；受限期间零写入 | 继续原工作 |

## Gate 结论

`ended → route → formal action` 边界从 `OPEN` 变为
`DONE_DESKTOP_REPRESENTATIVE`。P0-J 整体仍是 `PARTIAL`：Computer Use 不能证明真实中文
输入法候选、组词和光标行为，原生中文 IME Gate 继续 OPEN；不能用 Slash 的程序化中文
插入替代该证据。
