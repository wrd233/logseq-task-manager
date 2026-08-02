# Agent Governance 前端减法 Acceptance Matrix

状态：`NOT_STARTED` / `AUTOMATED` / `DESKTOP_PARTIAL` / `DONE`。

| ID | Requirement | 自动证据 | Desktop / 视觉 | Status |
|---|---|---|---|---|
| AGI-A-01 | 决策/规则/复盘次级视图；默认决策 | renderer tests | Desktop 真实点击切换 | DONE |
| AGI-A-02 | 设置入口；低频控制可达 | renderer tests | Desktop 打开/关闭 | DONE |
| AGI-A-03 | 键盘切换（Tab/Arrow）、aria-selected/expanded、焦点稳定 | renderer + keydown tests | Desktop ArrowRight 切换 | DONE |
| AGI-B-01 | 页头只留一行状态 + 设置按钮 | renderer tests | Desktop 截图 | DONE |
| AGI-B-02 | 六格统计墙压缩为一句摘要 + 24h/7d 切换 | renderer tests | Desktop 截图 | DONE |
| AGI-B-03 | 零值弱化/隐藏；需要查看与异常优先 | renderer tests | Desktop 截图 | DONE |
| AGI-C-01 | 来源主标题；来源失败安全回退；裸 UUID 不作为标题 | renderer tests | Desktop 真实行 | DONE |
| AGI-C-02 | 单一主状态；SHADOW 不逐行无意义重复 | renderer tests | Desktop 真实行 | DONE |
| AGI-C-03 | 无常驻选择框；批量模式显式进入/退出 | renderer tests | Desktop 批量进入/退出 | DONE |
| AGI-C-04 | 无选中时全宽，无固定侧栏 | renderer tests | Desktop 无侧栏 | DONE |
| AGI-D-01 | 详情三段落；技术详情与事件历史默认折叠且数据不丢 | renderer tests | Desktop 展开 | DONE |
| AGI-D-02 | 快速反馈：正确一键；基本正确/错误渐进展开；表单校验 | renderer tests | Desktop 展开/收起 | DONE |
| AGI-D-03 | 批量反馈兼容分组语义不变；Undo 与反馈分离 | renderer tests | 既有 ADG-DATA-02 | DONE |
| AGI-E-01 | 规则视图中文名称、实际权限、命中数、暂停/恢复 | renderer tests | Desktop 规则视图 | DONE |
| AGI-E-02 | 全局模式/版本摘要去重复 | renderer tests | Desktop 规则视图 | DONE |
| AGI-E-03 | Review Signal 用户化；导出合并单入口 | renderer tests | Desktop 复盘视图 | DONE |
| AGI-F-01 | 必测视口无横向溢出（document + root） | headless Chrome fixture 72/72 PASS | Desktop 705/1440 宽零溢出 | DONE |
| AGI-F-02 | 键盘全路径、焦点恢复、ARIA、Light/Dark token | renderer + headless | Desktop ArrowRight/主题切换 | DONE |
| AGI-F-03 | 普通/空/高密度/异常/详情/批量/规则/复盘/设置截图 | headless fixture 36 张 | Desktop 18 张 | DONE |
| AGI-F-04 | 根级检查、追踪矩阵、PENDING_VISUAL_REVIEW | scripts/check.sh | — | DONE |
| AGI-SAFE-01 | Objects/Decisions/Signals/Auto Apply 计数不变；无权限晋升；无新写入口 | before/after 运行证据 | 59/4/2/0 前后一致 | DONE |

## Definition of Done

默认主体是最近 Decision；用户快速知道 Agent 对原始记录做了什么；只有真正需要关注的 Decision 突出；系统开关不占首屏；全量规则、弱信号、导出不常驻决策旁；技术字段默认折叠；反馈可一键完成、复杂修正按需展开；批量选择仅在批量模式出现；720×520 无横向溢出；Light/Dark、键盘与 Focus 完整；原有能力全部可达；Shadow 与写入安全合同不变；无新大状态机或平台级复杂度。
