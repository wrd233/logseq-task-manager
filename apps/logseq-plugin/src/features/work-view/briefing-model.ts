import type { BlockSnapshot,SourceSnapshot } from "../../workspace/source-protocol.ts";
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
  tone?: "progress" | "attention";
  display?: "quote" | "table" | "chart";
  materialIds?: string[];
  materialQuotes?: {materialId:string;quote:string}[];
}
export interface BriefingParagraph {
  key?: string;
  markdown: string;
  cue?: string;
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
  candidate?: "ready"|"stale";
}
export interface ReadingChanges {sourceIds:string[];materialIds:string[];affectedKeys:string[]}

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
    const paragraph = lensRecord(item, ["key", "markdown", "sourceIds", "kind", "tone", "details", "cue"]);
    requireLens(kinds.includes(String(paragraph.kind)), "invalid-briefing-kind");
    requireLens(paragraph.tone === undefined || paragraph.tone === "progress" || paragraph.tone === "attention", "invalid-briefing-tone");
    const details = paragraph.details === undefined ? undefined : lensArray(paragraph.details, 100, 1).map(item => {
      const detail = lensRecord(item, ["key", "markdown", "sourceIds", "heading", "kind", "tone", "display", "materialIds","materialQuotes"]);
      requireLens(detail.kind === undefined || kinds.includes(String(detail.kind)), "invalid-briefing-kind");
      requireLens(detail.tone === undefined || detail.tone === "progress" || detail.tone === "attention", "invalid-briefing-tone");
      requireLens(detail.display === undefined || ["quote", "table", "chart"].includes(String(detail.display)), "invalid-evidence-display");
      const quotes=detail.materialQuotes===undefined?undefined:lensArray(detail.materialQuotes,30,1).map(item=>{const quote=lensRecord(item,["materialId","quote"]);return {materialId:lensText(quote.materialId,128),quote:lensText(quote.quote,2400)};});
      const materialIds=detail.materialIds===undefined?undefined:ids(detail.materialIds,128);
      requireLens(!quotes||quotes.every(quote=>materialIds?.includes(quote.materialId)),"material-quote-not-in-scope");
      return {key: uniqueKey(detail.key), markdown: lensText(detail.markdown, 24000), sourceIds: ids(detail.sourceIds),
        ...(detail.heading === undefined ? {} : {heading: lensText(detail.heading, 160)}),
        ...(detail.kind === undefined ? {} : {kind: detail.kind as BriefingKind}),
        ...(detail.tone === undefined ? {} : {tone: detail.tone as NonNullable<BriefingDetail["tone"]>}),
        ...(detail.display === undefined ? {} : {display: detail.display as NonNullable<BriefingDetail["display"]>}),
        ...(materialIds ? {materialIds} : {}),...(quotes?{materialQuotes:quotes}:{})};
    });
    return {...(paragraph.key === undefined ? {} : {key: uniqueKey(paragraph.key)}), markdown: lensText(paragraph.markdown, 12000),
      ...(paragraph.cue === undefined ? {} : {cue:lensText(paragraph.cue,160)}),
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
export const readingMaterialChanged = (before?:ReadingMaterial,after?:ReadingMaterial) => !before||!after||before.version!==after.version||before.availability!==after.availability;
export const readingMaterialsChanged = (before:ReadingMaterial[],after:ReadingMaterial[])=>before.length!==after.length||before.some(material=>readingMaterialChanged(material,after.find(item=>item.id===material.id)));
export const readingBlockChanged = (before?:BlockSnapshot,after?:BlockSnapshot) => !before||!after||before.contentVersion!==after.contentVersion||before.parentUuid!==after.parentUuid||before.depth!==after.depth||before.order!==after.order||before.availability!==after.availability;
const sourcesOf=(unit:BriefingParagraph)=>[...unit.sourceIds,...paragraphDetails(unit).flatMap(detail=>detail.sourceIds)];
const materialsOf=(unit:BriefingParagraph)=>paragraphDetails(unit).flatMap(detail=>detail.materialIds??[]);
export function readingChanges(previous:ProgressiveReading):ReadingChanges{
  const before=new Map(previous.basis?.blocks.map(block=>[block.sourceId,block])??[]),after=new Map(previous.current.blocks.map(block=>[block.sourceId,block]));
  const sourceIds=[...new Set([...before.keys(),...after.keys()])].filter(id=>readingBlockChanged(before.get(id),after.get(id)));
  const materialIds=[...new Set([...previous.materialBasis,...previous.materials].map(item=>item.id))].filter(id=>readingMaterialChanged(previous.materialBasis.find(item=>item.id===id),previous.materials.find(item=>item.id===id)));
  const affectedKeys=briefingParagraphs(previous.briefing).filter(unit=>sourcesOf(unit).some(id=>sourceIds.includes(id))||materialsOf(unit).some(id=>materialIds.includes(id))).flatMap(unit=>unit.key?[unit.key]:[]);
  return {sourceIds,materialIds,affectedKeys};
}
export function retainUnchangedParagraphs(previous:WorkBriefing,next:BriefingParagraph[],changes:ReadingChanges):BriefingParagraph[]{
  const original=briefingParagraphs(previous),byKey=new Map(next.filter(unit=>unit.key).map(unit=>[unit.key,unit]));
  const affected=(unit:BriefingParagraph)=>!!unit.key&&changes.affectedKeys.includes(unit.key)||sourcesOf(unit).some(id=>changes.sourceIds.includes(id))||materialsOf(unit).some(id=>changes.materialIds.includes(id));
  const result:BriefingParagraph[]=[];
  for(const old of original){
    if(!old.key)continue;
    const proposed=byKey.get(old.key);
    if(!affected(old)&&(!proposed||!affected(proposed)))result.push(old);
    else if(proposed)result.push(proposed);
  }
  for(const [index,unit] of next.entries()){
    if(unit.key&&result.some(item=>item.key===unit.key))continue;
    const following=next.slice(index+1).find(item=>item.key&&result.some(existing=>existing.key===item.key));
    const at=following?result.findIndex(item=>item.key===following.key):result.length;
    result.splice(at,0,unit);
  }
  return result;
}

export const progressivePlanId = "work-resume-briefing";
export const progressivePurpose = "保持人话的自然节奏和完整自解释的句意，用轻盈重点标出核心进展与卡点；不套多余分类盒子，不把完整句子拆碎，也不注水扩写";
