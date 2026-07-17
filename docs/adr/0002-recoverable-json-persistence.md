# ADR-0002：可恢复 JSON/JSONL 持久化

- 状态：accepted
- 日期：2026-07-17
- 影响规则：AUD-EVT-001、COM-ATM-001、INF-OWN-001、SYN-CON-001、SYN-REC-001

## 背景与限时实验结论

Capability Lab 只证明 `FileStorage` 类型表面存在，尚未证明 SQLite/WASM 在目标 Logseq Desktop 中稳定加载，也未证明 FileStorage 的物理位置或同步语义。引入 native addon 会造成不可接受的安装和 ABI 风险。

## 决策

- 正式状态采用 schema-v1 JSON；
- Logseq FileStorage 使用 checksummed A/B slot：先写非活动 payload，最后原子切换小 manifest；
- Node 恢复工具使用临时文件加原子 rename；
- 未知 schema 和 checksum 损坏进入只读错误，不覆盖原证据；
- Event/Commit 保存在独立集合并只通过 Application Command 追加；
- 开放恢复包输出 JSONL、JSON、Markdown summary、Anchor Report 和逐文件 checksum。

## 代价

FileStorage 的物理文件替换原子性仍需 Desktop 观察；双槽协议只依赖单 key 写入的可见性。未来可在保持 `StateStore` 接口的前提下替换为 SQLite/WASM。

## 验证

持久化测试覆盖代际切换、损坏检测和往返恢复；`scripts/acceptance-rehearsal.ts` 在临时目录真实执行导出、导入与差异比较。
