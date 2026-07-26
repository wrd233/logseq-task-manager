# P0-H 本次使用安全结束与重新启动 Desktop Gate

## 结论

状态：`END_RESTART_CURRENT_LANGUAGE_DESKTOP_DONE_GRAPH_SWITCH_OPEN`

本 Gate 在最新真实 Logseq Desktop 中完成“更多 → 结束本次 Task Copilot → 安全结束 →
重新启动 → 系统健康”纵向链。正式修改在用户确认后立即暂停，正文、正式历史和恢复信息保持；
结束过程不再短暂误报知识库不匹配，结束态只保留“更多”、关闭和重新启动，重启后必须同时
满足连接、client 与正式修改可用才报告成功。Graph switch 等 P0 宿主 Gate 继续开放。

## 运行基线

- branch：`feature/task-copilot-mvp`
- Plugin commit：`e8db32f1af6deee6e37e222ade5c4f68298954db`
- Plugin：`0.1.0`，构建时间 `2026-07-26 20:35:55 +0800`
- Logseq Desktop：`0.10.15`
- Graph：专用测试 Graph `logseq`
- theme：Dark
- window / viewport：`1000 × 720` CSS px，截图 `2000 × 1440` px
- 操作方式：后台 Computer Use 通过 Electron loopback CDP 操作与取证；不发送全局鼠标事件，
  不切换系统前台应用
- 隐私：没有 API Key、descriptor token、数据库路径或私人正文进入截图、日志或报告

## 真实发现与修复

第一次运行没有被误报为通过，而是发现三层同链缺陷：

1. 用户确认结束后，`featureReady=false` 直接进入通用诊断，导致现有“本次使用已结束”卡永远
   不可达，并把主动结束误报为知识库不匹配；修复为保留 product shell 与既有 END reason。
2. 结束态顶部仍显示“Copilot 未配置”，并暴露“整理当前页”和其他主导航；修复为一个主结论、
   单一“重新启动”操作与关闭入口。
3. Launcher 租约释放期间连接先断、用户结束意图后置，造成短暂错误闪烁；修复为先记录
   session-only 用户意图并关闭正式动作，再后台释放既有生命周期租约。

这些修复复用现有 `SERVICE_ENDED_BY_USER`、Launcher lease、用户状态翻译和启动入口；没有
新增正式状态、领域对象、顶层导航、Agent Runtime、Prompt、Skill、Validator 或 Recovery
分支。

## 用户纵向链

1. “更多”显示本次使用和“结束本次 Task Copilot”；
2. 独立确认再次说明会检查未完成修改与正文核对，Logseq 正文、历史和其他进程不受影响；
3. 确认后立即暂停正式动作；100 / 400 / 1000 / 2500 ms 四次采样均没有知识库不匹配；
4. 最终结束态只显示“本次使用已结束 · 正文仍可编辑”、更多维护入口和“重新启动”；
5. 点击重新启动后 Launcher 为当前知识库重建正式连接；
6. 400 ms 内用户层恢复为可用，随后系统状态核验通过；
7. 技术详情读回 exact commit `e8db32f1af6d`、formal writes true、Pending / Recovery /
   Source Conflict `0 / 0 / 0`。

## 自动证据

- Application status narration focused tests：`15/15`；
- Plugin UI + user system status focused tests：`77/77`；
- Plugin 全量：`328/328`；
- Launcher：`29/29`；
- Local Service：`160/160`；
- Service Client：`13/13`；
- Shared：`9/9`；
- rule coverage：`145`；
- acceptance rehearsal：PASS，differences `[]`；
- 根级 `./scripts/check.sh`：PASS。

本 Slice 不调用 LLM / Provider；Validator 拒绝率和模型重试次数不适用。

## CURRENT 截图

- `../current-ui/screenshots/p0-h-09-end-session-confirm-current-dark.png`
- `../current-ui/screenshots/p0-h-10-end-session-safe-current-dark.png`
- `../current-ui/screenshots/p0-h-11-restart-session-ready-current-dark.png`
- `../current-ui/screenshots/p0-h-12-restart-session-health-current-dark.png`

四张均为 commit `e8db32f1af6d` 的真实 Logseq Desktop 截图。旧的正常 reload / quit 证据
仍可证明进程生命周期，但不再代表当前结束态文案和操作逻辑。

## 仍开放

- P0 Graph switch 当前视觉链；
- slash / command palette / custom binding；
- Query / reference / sidebar 等来源返回；
- Light / 窄栏代表性视觉 Gate；
- P1/P2 与最终发布的其他既定关键路径。
