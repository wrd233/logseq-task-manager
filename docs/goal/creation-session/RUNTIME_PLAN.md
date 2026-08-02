# Consolidated runtime plan

After automated verticals complete, one bounded Desktop campaign will cover blank and
source-backed MiniProject and Project, two concurrent Sessions, reload/restart, source
drift/deletion, Provider failure/retry, real create/reload/Undo/reload, and user-edit-
safe Project Undo.

Viewports: 720x520, 1000x720, 1440x900. Themes: Light and Dark. Every capture records
commit, build hash, Logseq version, viewport, theme, graph identity, provider/fixture
classification, expectation, and visual conclusion.

## 已完成的真实运行时部分（2026-08-02 无视觉接力）

- MiniProject：真实 Desktop 原 PENDING 事务同 Proposal 续跑 → Commit → reload →
  Undo → reload；Pending/Recovery 0。
- Project：真实 Desktop Page 来源 → 真实 DeepSeek 多轮 Grill → READY Draft →
  独立 Page → 会话内最终确认 → Commit → reload → Undo → reload；来源页零修改，
  Pending/Recovery 0。
- 两并发会话（一个 CREATED、一个 ABANDONED 测试会话）、Local Service restart、
  Plugin reload 均有证据。

## 剩余：独立视觉复验（一次集中、30 分钟内）

见 `NON_VISUAL_HANDOFF_TO_VISUAL_REVIEWER.md`：环境启动、25 个场景、每场景截图与
判断问题、Light/Dark、三视口、焦点/溢出/中文 IME。视觉 reviewer 只判断观感与交互，
不再排查 Domain 或事务。
