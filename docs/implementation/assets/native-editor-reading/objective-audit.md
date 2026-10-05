# 实施要求与验收证据对应

2026-10-05。核对对象是固定 BASE 分支的最终代码 `34473ae56d46cbbc8da1e3a80790b6407e9d5353` 和真实隔离 Desktop 证据。自动化通过、实机通过与未验范围分别记录；中文输入法人工流程及系统文件拖放没有算作通过。

| 要求 | 当前证据与结论 |
| --- | --- |
| 指定仓库、固定提交、独立工作树／分支，保留其他工作 | git origin、BASE、分支和三份代码提交见 verification.json；原 checkout 只读核对 clean，前进的 main 没有合入本分支；自己的代码和 tests 无未提交差异 |
| 实际 OS／CPU／工具链／SDK／宿主 | macOS 15.1 arm64、Node 20.20.2／npm 10.8.2；Lab 日志为 Logseq 0.10.15，连接 SDK 0.3.4；最终两个加载资源 SHA 与落盘一致 |
| 私有依赖、构建、Graph、材料、profile、descriptor、端口和进程 | 本工作树 node_modules／dist／tmp；两个隔离 Graph、私有材料与 home；19333；Kernel 未启动，tasks disabled，agent descriptor 空；没有生产 Graph 写入、远端发布或其他 chat／agent 操作 |
| 真正原生写作，不能用自制正文编辑器替代 | NativeEditorHost 使用宿主 `.block-editor textarea`；中间 UUID、SDK checkEditing、同一 DOM／value／88–90 选区和 OS 输入事实在 native-input-proof.json／desktop-proof.json；最终 screenshot 有真实宿主选区 |
| 完整原句、普通段落、标记、四层嵌套、默认全文展开 | fixture.json；实机／落盘都是 98 UUID、4,456 中文字符、深度 4、65 无标记段落，两个事务及子 MiniProject；24 个原生报告 UI 测试包括 production default。composer 未改，报告 fold 集合默认空 |
| 既有正文／材料导航、离线本地写作、不自动正式化／改权限 | WorkView 默认 report 已被 BASE index 的实际入口消费；材料端口和 longdoc 链接往返实测，reference 编辑权限均 false、前后 SHA 相同；没有 Kernel／agent 依赖和新 executor |
| 宽窗真实并排，尊重两侧栏；窄窗让出主编辑区 | desktop-proof 的 wide／native-yield／right-sidebar-settled：原生 920 + 阅读 520；右栏 576 + 原生 560 + 阅读 304；980 宽且左栏打开时隐藏阅读而保留原生输入；布局和 sidebar mutation 回归通过 |
| 单一、可键盘返回入口，不改变工作对象／正文 | 窄窗一个 host 返回按钮，输入中 Cmd+Alt+R 拒绝并保留输入，Escape 后快捷键恢复 UUID／偏移；FeaturePanel 绕开该宿主 hideMainUI 无条件 blur，wide 没有重复按钮 |
| 当前工作子块写作不把根误切成子块，明确打开才切工作 | WorkView.follow 的 held／trace 范围判断；跨页、子聚焦退出、第二 Graph 明确打开／返回都记录真实 scope；旧 Graph 请求被拒绝 |
| 来源导航使用 scope、sourceId、BlockTarget、版本和当前成员 | report-target 的严格 resolve、WorkViewReport 新导航 provider／SDK raw hash 再核验；实机移出来源拒绝旧结构目标；hidden provider lease／moved-out UUID 回归通过 |
| 就地对照与明确进入原生分开；选择／复制／链接不自动导航 | renderer 无双击自动编辑；compare 派生同一捕获 raw、没有新正文 store；条目菜单／compare pointer guard 的实机焦点修正后复验通过，longdoc 进入材料；选择和对照不路由回归通过 |
| 复用同一输入、value、光标；晚到页面不能取消新输入 | OS 原生 selection 和 visible continue 证明 exact 同一输入；真实跨页等待 mounted UUID／SDK 编辑一致；void route acknowledgement、晚到 close／Graph／dispose 取消回归通过 |
| 草稿／IME 组合态／其它 block 编辑时不刷新或抢焦点 | 普通原生输入新增真实 block 时报告保持旧 98，Escape 后才发布 99；wide→narrow 同一输入保持；自动化 composition、异步 read／revision 保护通过。完整物理中文输入法流程未验，不能将这些结果替代人工 IME 验收 |
| 原生／材料／历史／聚焦／窗口／Graph 按来源身份恢复 | desktop-proof 每个对应步骤有 UUID 和相对偏移；graph/root 会话最多 12 份；材料和历史返回、退出聚焦、窗口变化已实测，不以显示顺序映射原块 |
| 新增／修改／移动／删除只更新受影响正文，有效选区／折叠保持 | source update／native draft 回归与实机 stable body 检查；删除条目没有 orphan，完整报告仍 98；最终删除可见子块后真实父块偏移 0.09375px。跨正文 selection 内容变更后不恢复旧 Range |
| 来源不可用、根被删、旧历史拒绝写当前、读／导航过期清理 | 删除独立合成工作后保留两条最后已知内容并显示 unavailable；重新明确打开工作恢复；历史 API 拒绝当前目标；旧阶段深比较不变；历史 raw 清除当前版本 DOM metadata；Graph/root／dispose 回归通过 |
| 所有权及并行边界，最小公共接线单独提交 | 1bf91ee 仅 FeaturePanel／readingLayoutSpec／register 与布局测试；af47c80 属于本轮 report／native／bookmark 薄消费；没有改公共 style/nav 函数、composer、MaterialTransfers、stage bridge 或 writeback executor；架构文件给出 01／04／05／06 接法 |
| 原生 drop 范围、输入限制、消费者归属与卸载 | NativeEditorHost 的 trusted 未消费 event／真实 body UUID、scope／version／输入限制；stop 和 dispose 自有监听。BASE 实际没有注册 native drop consumer，保留端口及完整 reference 复制降级，没有宣称任意 caret 导入 |
| >=80 条正文、约 4,000 中文字、实际材料身份 | 真正树／persisted Markdown 98 block、4,456 Han、4 层；完整真实 UUID 列表、实际 reference 材料 ID 和两 Graph root 在 fixture.json；材料文件 SHA 再核对通过 |
| Undo、剪贴板、IME、系统拖放分别保留实机事实 | OS type／Cmd+Z 和普通窗口 pasteboard／Cmd+Z 实测通过；全屏粘贴失败保留。物理中文 IME 与系统文件拖放未执行，handoff 给出最小复核步骤；观察端口和 Finder 文件没有被当作已导入 |
| 当前门禁、构建、diff 检查和可审查交付 | 74 定向用例；完整 check exit 0：629 业务 + 5 sandbox + 12 boundary = 646，通过且无失败／跳过／取消；类型、lint、构建／二进制、边界 scan、taste 均通过；diff check exit 0；三份文档、14 张截图、JSON 和本地提交保留 |

未验范围是明确的验收边界：本分支完成原生编辑与阅读的主要实机往返和生产消费；物理中文 IME、跨应用系统文件拖放、其它平台／宿主和任意 caret 落点没有扩大验证。完整命令、计数、日志 SHA、构建身份和各截图采集阶段以 verification.json 为准。
