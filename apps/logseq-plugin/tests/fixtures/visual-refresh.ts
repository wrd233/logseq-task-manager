import { longformRows } from "./report-longform.ts";

/** One synthetic source shared by the design draft, projection audit and Desktop lab. */
export function visualRefreshRows(materialId = "77777777-7777-4777-8777-777777777777") {
  const rows = longformRows(materialId);
  const extra = [
    "**[问题]** 异步改名期间切换工作，结果应该呈现在哪个范围？\n没有标签的第二行同样完整保留。",
    "[想法] 复制成功的反馈应留在当前文件行附近。",
    "**[想法]** 连续思考只表达一次局部标题，但每个来源和原句都保留。",
    "[说明] 失败后保留输入草稿，取消不会重新执行文件操作。",
    "> **[想法]** 这是引文中的字面示例，标记不能清除。",
    "    [目标] 这是缩进代码里的标记，不是阅读标题。",
    "`[注]` 是行内代码；句子中间的 [想法] 也保留。",
    "[未知类别] 不根据关键词猜测语义，也不删除 hashtag #原始记录。",
    "```text\n**[目标]** 围栏内保留\n[想法] 也保留\n```",
  ];
  for (const [index, content] of extra.entries()) rows.push({
    uuid: `33333333-3333-4333-8333-${String(rows.length).padStart(12, "0")}`,
    parentUuid: rows[0]!.uuid, depth: 1, order: 100 + index, content, expectedText: content,
  });
  return rows;
}
