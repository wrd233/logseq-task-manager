# P0-J 原生中文 IME Desktop Gate

日期：2026-07-29
分支：`feature/task-copilot-mvp`
仓库 HEAD：`a65da34`
Logseq：`0.10.15`
Graph：File Graph `logseq`
主题 / 视口：host Light，`754×720`
运行方式：真实 Logseq Desktop，Computer Use 逐键输入；未调用 Provider，未注入 Unicode，
未修改 SQLite 或正式 Task Copilot 对象。

## 目标

补齐此前 Computer Use `type_text` 会丢失中文字符而无法证明的原生输入法 Gate：

- macOS 拼音组合态；
- 候选提交；
- 已提交中文中的光标移动与中间插入；
- Logseq Block 保存；
- reload 后正文读回；
- 测试后恢复原 ABC 输入源。

## 真实操作与结果

1. 在专用测试 Page `Task Copilot Lab/P0 J IME Gate 20260729` 的空白 Block 中，通过
   `ctrl+space` 从 ABC 切换到 macOS 简体拼音；逐键输入 `zhongwen`。
2. 编辑区真实显示带分词的组合串 `zhong'wen`，按空格提交为 `中文`。这不是
   `type_text` 或程序化 Unicode 注入。
3. 继续逐键输入并提交 `shuru`；逐键输入 `yanzheng` 时真实显示
   `中文输入yan'zheng`，提交后为 `中文输入验证`。
4. 将光标向左移动两个字符，在已提交中文中间逐键输入 `guangbiao`。组合态真实显示
   `中文输入guang'biao验证`，提交后为 `中文输入光标验证`。
5. 首次 reload 暴露原页面只是未正式建立的临时 UUID 路由，Logseq 显示
   `Page no longer exists!!`。该结果没有被当作 PASS。
6. 通过 Logseq 搜索的正式 `Create` 路径建立同名 Page；之前保存的中文 Block 被页面
   正确收纳。再次完整页面 reload 后，Page 与 `中文输入光标验证` 均可读。
7. 通过 `ctrl+space` 切回 ABC，并用只读系统配置确认当前布局为
   `com.apple.keylayout.ABC`。

## 证据

| 文件 | 状态 | 证明 |
|---|---|---|
| `current-ui/screenshots/p0-j-native-ime-composition-current-a65da34.png` | CURRENT | 原生拼音组合态 `中文输入yan'zheng` |
| `current-ui/screenshots/p0-j-native-ime-cursor-composition-current-a65da34.png` | CURRENT | 在已提交中文中间移动光标并组合 `guang'biao` |
| `current-ui/screenshots/p0-j-native-ime-saved-current-a65da34.png` | CURRENT | 最终中文 Block `中文输入光标验证` 已保存 |
| `current-ui/screenshots/p0-j-native-ime-reload-current-a65da34.png` | CURRENT | 正式建页后 reload 读回 Page 与中文 Block |

Computer Use 返回的截图是 `754×720` JPEG 字节，沿用当前证据目录既有 `.png` 命名约定。
SHA-256：

- composition：
  `30d594c8c13a33418591e9517ef5c12f38059d45e0b9f04530e2c73332f5e6eb`
- cursor composition：
  `b56c42af3b1686fe2fcd686c5b94799fe1e25329a44ed19dcdaa7d6243b25b71`
- saved：
  `ddf3c010110b38e1d154abada1b5600fd3fd9d6405e9687357ce007492b96ef0`
- reload：
  `bdb221e3d9a9358a4de2da07e3cc3f1edf72603ba190fc814ff05812abe85f4f`

## 结论

P0-J 的原生中文 IME 子 Gate 从 `OPEN` 变为
`DONE_DESKTOP_REPRESENTATIVE`。结合既有 palette、Slash、custom binding、结束运行后的
fail-closed 与显式重启证据，P0-J 可关闭为 `DONE_DESKTOP_REPRESENTATIVE`。

这不表示整个 P0 或完整 Goal 完成。accepted-not-applied、PENDING/Recovery 前台组合、
跨宿主视觉代表矩阵和 Final Release 仍需继续收口。此次没有新增正式状态、Runtime、
Recovery 分支、Skill/Prompt/Validator、Attention 类型或写入权威；长期 Partial 净变化
`-1`。
