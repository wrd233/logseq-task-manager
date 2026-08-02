# Screenshot Evidence Manifest

生成方式：`apps/task-copilot-logseq-plugin/scripts/generate-governance-fixtures.ts`（静态 fixture，纯代表性数据）与 `apps/task-copilot-logseq-plugin/scripts/governance-viewport-check.mjs --screenshots`（headless Chrome 渲染，Light/Dark token 由 fixture 的 `data-theme-mode` 驱动）。Desktop 截图由真实 Logseq Desktop 0.10.15 + 正式 Plugin 加载路径（`tmp/runtime/global-object-directory/plugin-dist/task-copilot-plugin`）经 CDP 捕获，见 `tmp/runtime/agent-governance-interface-simplification/desktop-evidence.json`。

统一元数据：

- commit：`0b8981f`（静态与 Desktop 截图均基于该构建；Plugin 运行证据 `pluginCommit 0b8981f2fba9`）
- 业务数据：静态 fixture 不含真实业务数据（纯 fixture）；`desktop-*` 截图包含真实 Shadow 数据（4 条 Decision、2 条 Review Signal，均已脱敏为页面正文摘要，无凭据）
- 用途：仅用于独立视觉审阅与响应式证据；实现 Agent 不评价视觉优劣

## 静态 fixture（headless Chrome；1440×900，标记 720×520 者除外）

| 状态 | Light | Dark |
|---|---|---|
| 决策默认态 | decisions-default-light.jpg | decisions-default-dark.jpg |
| 决策默认态 720×520 | decisions-default-light-720x520.jpg | — |
| 决策空态 | decisions-empty-light.jpg | decisions-empty-dark.jpg |
| 高密度 | decisions-dense-light.jpg | decisions-dense-dark.jpg |
| 需要查看 / 异常 | decisions-abnormal-light.jpg | decisions-abnormal-dark.jpg |
| 详情 | decisions-detail-light.jpg | decisions-detail-dark.jpg |
| 技术详情展开 | decisions-detail-tech-light.jpg | decisions-detail-tech-dark.jpg |
| 复杂反馈展开 | decisions-feedback-expanded-light.jpg | decisions-feedback-expanded-dark.jpg |
| 批量模式 | decisions-batch-light.jpg | decisions-batch-dark.jpg |
| 规则视图 | rules-light.jpg | rules-dark.jpg |
| 复盘视图 | review-light.jpg | review-dark.jpg |
| 复盘导出菜单 | review-export-open-light.jpg | review-export-open-dark.jpg |
| 设置 / 运行控制 | settings-open-light.jpg | settings-open-dark.jpg |

## Desktop 真实运行（Logseq 0.10.15；1440×900，标记 narrow 者除外）

| 截图 | 说明 |
|---|---|
| decisions-default-light.png | 默认决策视图，真实 4 条 Decision，来源主标题 |
| decisions-empty-light.png | 搜索无结果空态 |
| decisions-abnormal-light.png | 异常筛选（需要查看 / 模型输出未通过校验） |
| decisions-detail-light.png | 详情三段落 + 快速反馈 |
| decisions-detail-tech-light.png | 技术详情与事件历史展开 |
| decisions-feedback-expanded-light.png | 复杂反馈展开 |
| decisions-batch-light.png | 批量模式 |
| rules-light.png / rules-dark.png | 规则视图（真实 6 条规则） |
| review-light.png / review-dark.png / review-export-open-light.png | 复盘视图与导出菜单 |
| settings-open-light.png / settings-open-dark.png | 设置 / 运行控制 |
| decisions-default-dark.png / decisions-default-dark-narrow.png | 决策默认态 Dark 与 720×520 窄宽 |
| decisions-batch-dark.png / decisions-detail-tech-dark.png | Dark 批量与详情 |

原始 PNG 全量保留于 `tmp/runtime/agent-governance-interface-simplification/`（git-ignored）。
