import type { SourceSnapshot } from "../../workspace/source-protocol.ts";
import { lensArray, lensHash, lensRecord, lensText, requireLens } from "./lens-input.ts";
import type { ReadingPlan } from "./reading-plan.ts";
import type { ReadingMaterial } from "./reading-layout.ts";

export type BriefingKind = "fact" | "inference" | "suggestion";
export interface BriefingDetail {
  key: string;
  markdown: string;
  sourceIds: string[];
  heading?: string;
  kind?: BriefingKind;
  display?: "quote" | "table" | "chart";
  materialIds?: string[];
}
export interface BriefingParagraph {
  key?: string;
  markdown: string;
  sourceIds: string[];
  kind: BriefingKind;
  tone?: "progress" | "attention";
  details?: BriefingDetail[];
}
export interface WorkBriefing {
  basisVersion: string;
  createdAt: string;
  paragraphs: BriefingParagraph[];
  followUps?: BriefingParagraph[];
}
export interface ProgressiveReading {
  planId: string;
  briefing: WorkBriefing;
  basis: SourceSnapshot | null;
  current: SourceSnapshot;
  materialBasis: ReadingMaterial[];
  materials: ReadingMaterial[];
}

const kinds = ["fact", "inference", "suggestion"];
const ids = (value: unknown, limit = 4096) => lensArray(value, 1000, 1).map(id => lensText(id, limit));
export function decodeBriefing(input: unknown): WorkBriefing {
  const raw = lensRecord(input, ["basisVersion", "createdAt", "paragraphs", "followUps"]);
  const keys = new Set<string>();
  const uniqueKey = (value: unknown) => {
    const key = lensText(value, 128);
    requireLens(!keys.has(key), "duplicate-briefing-key"); keys.add(key); return key;
  };
  const paragraphs = (value: unknown): BriefingParagraph[] => lensArray(value, 100, 1).map(item => {
    const paragraph = lensRecord(item, ["key", "markdown", "sourceIds", "kind", "tone", "details"]);
    requireLens(kinds.includes(String(paragraph.kind)), "invalid-briefing-kind");
    requireLens(paragraph.tone === undefined || paragraph.tone === "progress" || paragraph.tone === "attention", "invalid-briefing-tone");
    const details = paragraph.details === undefined ? undefined : lensArray(paragraph.details, 100, 1).map(item => {
      const detail = lensRecord(item, ["key", "markdown", "sourceIds", "heading", "kind", "display", "materialIds"]);
      requireLens(detail.kind === undefined || kinds.includes(String(detail.kind)), "invalid-briefing-kind");
      requireLens(detail.display === undefined || ["quote", "table", "chart"].includes(String(detail.display)), "invalid-evidence-display");
      return {key: uniqueKey(detail.key), markdown: lensText(detail.markdown, 24000), sourceIds: ids(detail.sourceIds),
        ...(detail.heading === undefined ? {} : {heading: lensText(detail.heading, 160)}),
        ...(detail.kind === undefined ? {} : {kind: detail.kind as BriefingKind}),
        ...(detail.display === undefined ? {} : {display: detail.display as NonNullable<BriefingDetail["display"]>}),
        ...(detail.materialIds === undefined ? {} : {materialIds: ids(detail.materialIds, 128)})};
    });
    return {...(paragraph.key === undefined ? {} : {key: uniqueKey(paragraph.key)}), markdown: lensText(paragraph.markdown, 12000),
      sourceIds: ids(paragraph.sourceIds), kind: paragraph.kind as BriefingKind,
      ...(paragraph.tone === undefined ? {} : {tone: paragraph.tone}), ...(details ? {details} : {})};
  });
  const createdAt = lensText(raw.createdAt, 64);
  requireLens(Number.isFinite(Date.parse(createdAt)), "invalid-briefing-date");
  return {basisVersion: lensHash(raw.basisVersion), createdAt, paragraphs: paragraphs(raw.paragraphs),
    ...(raw.followUps === undefined ? {} : {followUps: paragraphs(raw.followUps)})};
}

export function briefingParagraphs(briefing: WorkBriefing) {
  return [...briefing.paragraphs, ...briefing.followUps ?? []];
}
export function paragraphDetails(paragraph: BriefingParagraph): BriefingDetail[] {
  return paragraph.details ?? [{key: "original", markdown: "", sourceIds: paragraph.sourceIds}];
}
export function briefingMaterialIds(briefing: WorkBriefing): string[] {
  return [...new Set(briefingParagraphs(briefing).flatMap(paragraph => paragraphDetails(paragraph).flatMap(detail => detail.materialIds ?? [])))];
}
export function validateBriefing(briefing: WorkBriefing, source: SourceSnapshot, materials: ReadonlySet<string>) {
  requireLens(briefing.basisVersion === source.sourceSetVersion, "stale-briefing");
  const available = new Set(source.blocks.map(block => block.sourceId));
  for (const paragraph of briefingParagraphs(briefing)) {
    const refs = [...paragraph.sourceIds, ...paragraphDetails(paragraph).flatMap(detail => detail.sourceIds)];
    requireLens(refs.every(id => available.has(id)), "source-not-in-scope");
  }
  requireLens(briefingMaterialIds(briefing).every(id => materials.has(id)), "material-not-in-scope");
}
export function latestBriefing(plans: ReadingPlan[]) {
  return plans.filter(plan => plan.briefing).sort((a, b) => a.briefing!.createdAt.localeCompare(b.briefing!.createdAt)).at(-1) ?? null;
}
export function briefingStatus(plan: ReadingPlan, source: SourceSnapshot): "current" | "stale" {
  return plan.briefing?.basisVersion === source.sourceSetVersion && plan.structureVersion === source.structureVersion ? "current" : "stale";
}

export const progressivePlanId = "work-resume-briefing";
export const progressivePurpose = "整理为渐进式阅读：恢复工作并理解原始思路与依据";
