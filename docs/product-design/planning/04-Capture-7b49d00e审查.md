# Capture A `7b49d00e`：独立审查

日期：2026-10-21（Asia/Shanghai）。固定比较：`75c8c44982e7348413c8cdd207f3eb69cb47b904...7b49d00e1467303a197b0e4ae08017525b6d24a6`，仅一项模块实现提交。以下行号均属于该固定提交，不指向 A 后来尚未提交的工作。审查不修改 A/B 模块。

结论：新增 22 项测试在独立归档、干净 npm ci、Node 20.20.2 下全部通过，但下列六个独立复现尚未覆盖。**该版本不通过 G2，不整合到 main，不接真实宿主写入入口。** 共享适配器可独立准备，模块修正后仍须重新审查、跑回归及真实宿主验收。

## Standards

依据：[G2 方案](03-Capture-G2与宿主接线计划.md)第 2 节的跨进程 CAS、不可变结果与目录/符号链接规则；[共同契约](02-并行开发契约.md)的真实保存、分区与权限边界。以下均为硬性违反，不是风格建议。

1. **[P1] 两次读取的版本不一致可写坏修订链。** `apps/dsh-plugin/src/capture-inbox/store.mjs:129–139`：先读 rows，再独立读 current。命令 expectedVersion=2 若先读到 v1 的 rows，再看到另一进程刚发布的 v2 current，会通过 CAS，却把 v3.parent 设为 v1 的哈希。真实临时文件、在第二次读前插入正常 v2 写入的受控交错复现：execute 返回 unknown/CORRUPT_CAPTURE_HISTORY，随后 list 永久报同错。父哈希、期望版本与当前正文必须来自同一已校验快照；交错不满足前提时应冲突/重读，不能发布错误版本。
2. **[P1] 同键重试返回后来的结果，削弱编辑冲突保护。** `store.mjs:130–132`：首次 edit-a 返回 v2/“two”，edit-b 发布 v3/“three”后重试 edit-a，却返回 v3/“three”，而非原操作结果。`controller.mjs:153–156` 还会用该 v3 推进正在继续编辑的本地草稿 expectedVersion，使用户未审阅的 edit-b 可被下一次保存覆盖。真实文件复现确认 receipt 的版本/正文变化。原请求结果须稳定，返回原操作对应的历史视图；当前最新状态应另读，不能暗中更新编辑基准。
3. **[P1] 记录目录符号链接绕过分区。** `store.mjs:84–89,98–100`：最终 JSON 的 O_NOFOLLOW 不保护父目录；list 未核实每个记录目录。两个 Graph 使用同一 session/请求键，各保存一条后，将 A 的哈希记录目录替换为指向 B 记录目录的符号链接，list(A) 实际返回 B 的正文。复现只用合成数据和临时目录。读取、列举、发布均需核实实际父目录与路径边界；不能仅检查最终文件。

未发现 A 修改共享核心或扩大正式对象/权限的越界提交。服务端上下文与真实来源核实仍是主代理接线责任，不把尚未接线列为模块违规。

## Spec

依据：[A Goal](goals/01-Capture-Inbox-Goal.md)的“关闭、中断、保存失败、连接改变时保护输入”与异步期间继续输入，以及模块 README 的“只有草稿回执可靠才隐藏并 returnFocus”。以下用固定提交的 controller 和合成 Store 复现，不代表真实桌面证据。

1. **[P1] 初次草稿读取失败后，重开覆盖新输入。** `controller.mjs:93–99,107–109`：初次 readDraft 抛错后 loaded=false 但窗口可编辑；输入新正文不触发持久化，后续 open 成功时直接 spread 磁盘旧草稿。复现结果：before=“new user input after read failure”，after=“older persisted draft”。不能无条件 hydrate 覆盖本地输入；须保留两份并显式处理差异。
2. **[P1] 关闭只等旧快照，隐藏未确认的新草稿。** `controller.mjs:186–189`：close 在旧草稿的 persist 等待期间继续键入，会排队另一个快照；close 不延长关闭门槛，后一个保存失败仍隐藏窗口。复现结果：visible=false，text=“new”，draftStatus=unknown，磁盘仅有“old”。关闭必须确认当前快照，或在任何后续键入/未知结果时保持可见。
3. **[P2] 自动收起使用过期的 unchanged 判断。** `controller.mjs:122–125`：unchanged 在等待 refresh 前计算；用户在已清空输入区继续写下一条后，旧判断仍触发 close。复现结果：text=“next unsaved capture”但 visible=false。最后收起前应重新核对正文、请求身份与输入代次；新增输入不能让前一条保存动作自动关闭。

未发现额外范围膨胀。unknown 请求保留原 key 是正确行为；仅凭 capture conflict 的重试循环暂不新增独立缺陷，避免把必要的幂等保护误判成错误。

## 验证与后续

- 独立目录从固定 Git 提交归档，不使用 A 的工作区或 node_modules；执行 `npm ci --no-audit --no-fund` 和 `node --import tsx --test apps/dsh-plugin/tests/capture-inbox.*test.mjs`，22/22 通过。
- 主代理独立重跑了上述六项最小复现。Store 的竞态、符号链接、结果重放使用真实临时文件；controller 关闭/继续输入/读失败使用受控 Promise 与合成 Store。没有读写真实 Graph/profile，没有外发项目内容。
- A 应在自己的目录修复并补六类回归，普通推送新 SHA。主代理随后从新提交独立复核，不直接改 A 文件、不强推、不把主链损坏用覆盖数据掩盖。
- 重新通过 G2 后，按[接线计划](03-Capture-G2与宿主接线计划.md)先整合已提交模块，再发布共享入口/RPC/原生草稿适配。真实 Desktop/Logseq、重启与物理 IME 继续单独验收。

本轮统计：Standards 3 项（最高 P1）；Spec 3 项（最高 P1）。
