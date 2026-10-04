import type { BlockSnapshot, BlockTarget, SourceScope, SourceSnapshot } from "../../workspace/source-protocol.ts";
import type { ViewPresentation } from "./operations.ts";
import { workObject } from "./focus.mjs";
import { composeWorkView, type ComposedView, type LensSelection } from "./view-composer.ts";
import type { SourceRow } from "./model.mjs";

export type ReportCategory = "goals" | "notes" | "ideas" | "todos" | "objects";
const titles: Record<ReportCategory, string> = {goals:"目标", notes:"记录与说明", ideas:"想法", todos:"待办", objects:"工作事项"};
const categories: ReportCategory[] = ["goals", "notes", "ideas", "todos", "objects"];
export interface ReportFragment {
  scope: SourceScope; sourceId: string; target: BlockTarget; contentVersion: string;
  range: {unit: "block"}; parentUuid: string | null; objectKind: string | null;
}
export interface ReportHeading {key: string; title: string; beforeUuid: string; depth: number; sourceIds: string[]}
export interface ReportComposition {
  view: ComposedView; headings: ReportHeading[]; fragments: ReportFragment[];
  structureVersion: string; sourceSetVersion: string;
}

/** Only explicit leading marks are classified. Plain conditions travel with the previous marked sibling. */
export function reportCategory(content: string): ReportCategory | null {
  const first = content.split("\n").find(line => line.trim() && !/^\s*[\w-]+::/.test(line))?.trim() ?? "";
  if (workObject(first)) return "objects";
  if (/^TODO(?:\s|$)/.test(first)) return "todos";
  const mark = /^(?:\*\*)?\[(目标|注|记录|说明|想法)\](?:\*\*)?(?=\s|$|[：:])/.exec(first)?.[1];
  return mark === "目标" ? "goals" : mark === "想法" ? "ideas" : mark ? "notes" : null;
}

export function reportFragment(source: SourceSnapshot, sourceId: string): ReportFragment | null {
  const block = source.blocks.find(block => block.sourceId === sourceId);
  return block ? fragmentForBlock(source.scope,block) : null;
}
function fragmentForBlock(scope: SourceScope, block: BlockSnapshot): ReportFragment | null {
  return block?.availability === "available" && block.contentVersion ? {
    scope: {...scope}, sourceId: block.sourceId, target: {...block.target}, contentVersion: block.contentVersion,
    range: {unit: "block"}, parentUuid: block.parentUuid, objectKind: workObject(block.content ?? "")?.type ?? null,
  } : null;
}
export function reportFragments(source: SourceSnapshot): ReportFragment[] {
  return source.blocks.map(block=>fragmentForBlock(source.scope,block)).filter((fragment):fragment is ReportFragment=>!!fragment);
}

/** Rearrange complete source subtrees only. Headers have presentation keys and never block identities. */
export function composeReport(source: SourceSnapshot, personal: ViewPresentation, lens: LensSelection | null, folds: ReadonlySet<string>, overlay?: ComposedView): ReportComposition {
  const byUuid = new Map(source.blocks.map(block => [block.target.blockUuid, block]));
  const children = new Map<string, string[]>(), order = new Map(personal.items.map((item, index) => [item.uuid, index]));
  for (const block of source.blocks.slice(1)) {
    const siblings = children.get(block.parentUuid!) ?? []; siblings.push(block.target.blockUuid); children.set(block.parentUuid!, siblings);
  }
  const rows: SourceRow[] = source.blocks.map(block => ({uuid:block.target.blockUuid, content:block.content ?? "来源暂不可用", depth:block.depth, sourceParent:block.parentUuid}));
  const canonical = {...personal, items:rows.map(row => ({uuid:row.uuid, depth:row.depth})), collapsed:[...folds]};
  const base = composeWorkView(rows, canonical, lens), items = new Map((overlay?.items ?? base.items).map(item => [item.uuid, item]));
  const arranged: string[] = [], headings: ReportHeading[] = [];
  const emit = (uuid: string): void => {
    arranged.push(uuid);
    const siblings = children.get(uuid) ?? [];
    if (!siblings.length) return;
    const hasMarks = siblings.some(id => reportCategory(byUuid.get(id)!.content ?? ""));
    if (!hasMarks) { for (const id of siblings) emit(id); return; }
    const packets: Array<{category:ReportCategory; ids:string[]}> = [];
    let current: typeof packets[number] | null = null;
    for (const id of siblings) {
      const category = reportCategory(byUuid.get(id)!.content ?? "");
      if (category || !current || current.category === "objects") {
        current = {category:category ?? "notes", ids:[]}; packets.push(current);
      }
      current.ids.push(id);
    }
    for (const category of categories) {
      const selected = packets.filter(packet => packet.category === category).sort((a,b) => (order.get(a.ids[0]!) ?? 0) - (order.get(b.ids[0]!) ?? 0));
      const ids = selected.flatMap(packet => packet.ids);
      if (!ids.length) continue;
      const visible = ids.find(id => !items.get(id)?.hidden);
      const heading = visible ? {key:JSON.stringify([uuid,category]), title:titles[category], beforeUuid:visible,
        depth:byUuid.get(visible)!.depth, sourceIds:[] as string[]} : null;
      if (heading) headings.push(heading);
      const start=arranged.length;
      for (const id of ids) emit(id);
      if (heading) heading.sourceIds=arranged.slice(start).map(id=>byUuid.get(id)!.sourceId);
    }
  };
  emit(source.scope.rootUuid);
  return {
    view:overlay ?? {...base, items:arranged.map(uuid => ({...items.get(uuid)!, full:true}))}, headings,
    fragments:arranged.map(uuid => fragmentForBlock(source.scope,byUuid.get(uuid)!)).filter((fragment): fragment is ReportFragment => !!fragment),
    structureVersion:source.structureVersion, sourceSetVersion:source.sourceSetVersion,
  };
}
