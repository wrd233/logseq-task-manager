# P1-F Project Page Head 重入自动证据（2026-07-24）

结论：`PARTIAL_UI_AUTOMATED_PASS / MAIN_PAGE_ONLY / DESKTOP_OPEN`

## 宿主能力结论

- 固定依赖 `@logseq/libs@0.0.17` 暴露 `App.onPageHeadActionsSlotted`、`provideUI(slot)` 与
  `UI.checkSlotValid`；
- Logseq 0.10.15 tag `03bcefbdf87458f87499abb988ac3b9fac2c07d8` 的
  `src/main/frontend/components/page.cljs` 在 Page header 创建该 slot；
- 同版本 `components/plugins.cljs` 将 callback payload 原样传递，而 Page header 传入
  `nil`；因此 slot 本身没有可依赖的 Page UUID/name；
- Page header 同时可用于 sidebar Page。实现只在 main Page 显示按钮，right sidebar 明确
  隐藏；没有根据无身份 slot 猜测 secondary Page。

## 只读检测与点击重验

- 被动检测只读取当前 Page identity、Service Object 投影和分页 Primary Anchor；
- 不调用 `getPageBlocksTree`，不扫描当前 Page 正文，不写 Graph/SQLite；
- 只有当前 Page UUID 对应唯一 active Project Page Anchor 且 Project Object 存在时注入；
- 重复 Object identity、多个 active Project Page Anchor、Page 在读取中切换、分页循环或
  Service 受限均 fail closed，旧按钮清除；
- slot identity 有长度和 32 项 session 容量上限；并发 slot 共享一次 Project 解析；
- 点击“继续项目”后重新解析 current Page，再走既有 Page Context 读取和重验
  Page UUID、Project object ID/version；
- 成功后只显示该 Project 的同一 P1-F 重入投影；目标消失时不回退到其他 Project；
- “查看全部项目”显式解除 session-only 过滤；
- Plugin unload 主动清除已观察 slot；单个失效 slot 的同步清理错误会被隔离和记录，不会
  阻断后续 slot 清理或 owned Service lease 释放，宿主卸载仍保留自身 injected UI cleanup。

## 自动证据

- Plugin tests：219/219、0 skipped；
- Plugin typecheck/build/lint：PASS；
- bootstrap integrity：PASS，新增 UI key/model key 纳入 CSS-safe 与 collision 检查；
- 根级 `./scripts/check.sh`：PASS，145 条稳定规则纳入覆盖；导出恢复演练
  `differences: []`；
- 覆盖 exact active Page Anchor、无 Block tree read、普通/变化/歧义 Page、重复 Object、
  slot stale/unavailable/error、unload 单 slot 清理失败隔离、HTML escaping、无 identity
  属性、目标 Project 过滤与 stale fail-closed。

## 尚未声明

- 未完成真实 Logseq Desktop 的 Project main Page 按钮可见和点击；
- 未完成 ordinary Page 静默、right sidebar 隐藏、Light/Dark、窄栏、Zoom 与 reload；
- 当前不能声称 Project Page Head Desktop Gate 或完整 P1-F 完成。
