import type { SourceSnapshot } from "../../workspace/source-protocol.ts";
import type { ReadingPlan } from "./reading-plan.ts";

export interface BriefingParagraph {
  markdown:string;
  sourceIds:string[];
  kind:"fact"|"inference"|"suggestion";
  tone?:"progress"|"attention";
}
export interface WorkBriefing {
  basisVersion:string;
  createdAt:string;
  paragraphs:BriefingParagraph[];
  followUps?:BriefingParagraph[];
}

export function latestBriefing(plans:ReadingPlan[]) {
  return plans.filter(plan=>plan.briefing).sort((a,b)=>a.briefing!.createdAt.localeCompare(b.briefing!.createdAt)).at(-1)??null;
}
export function briefingStatus(briefing:WorkBriefing,source:SourceSnapshot):"current"|"stale" {
  return briefing.basisVersion===source.sourceSetVersion?"current":"stale";
}

/** Same reading tools, source identities and local view store as existing Agent layouts. */
export const workBriefingRequest = `请为当前 Logseq 工作生成或更新一份“重新进入工作”的工作简报，并提交到简报阅览器。
先读取当前工作与共同指导，再使用 logseq_reading_request（purpose: 工作恢复简报）取得完整来源和版本。阅读已有读法，复用 planId: work-resume-briefing。
用连贯自然语言说明背景、已发生的进展、当前中断处和必要关注事项。简单工作一段即可，复杂工作适量分段，不堆标题和固定栏目，不补写没有依据的背景，不以记录顺序推定时间顺序。保留未确认和冲突语义，不能把用户计划写成完成事实。少量 **加粗** 即可。
通过 logseq_reading_submit 提交标准 ReadingPlan：schemaVersion、requestId、planId、name（工作恢复简报）、scope、structureVersion、sourceSetVersion、sourceVersions（完整来源逐块版本），layout 使用一个 sequence 单元按原顺序包含全部 sourceIds，保留原文 Reader 的能力。
在同一 plan 增加 briefing: {basisVersion: 本次 sourceSetVersion, createdAt: 当前 ISO 时间, paragraphs: [{markdown: 自然语言段落, sourceIds: 该段依据的原块 ID 数组, kind: fact|inference|suggestion, tone?: progress|attention}], followUps?: 同样结构的少量关注事项}。
每段均须引用实际来源。fact 仅表示有原文依据，不能擅自称为用户确认；AI 推断与建议必须独立成段且标明 kind。只有明确进展用 progress，需要关注的困难或未确认事项用 attention。没有后续事项则省略 followUps。
只组织阅读投影，不修改 Logseq 原文、TODO 或材料，不调用 reading_select 切换用户的原文读法。简报提交返回 saved 是正常结果。提交后说明已更新简报，提醒用户回到 Logseq 打开“简报”。`;
