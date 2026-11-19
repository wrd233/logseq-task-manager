import type { PageEntity } from "@logseq/libs/dist/LSPlugin";
import { workKey, type CatalogWork } from "@task-copilot/contracts";
import { existingWorkPageMark, extractObjectNavigationLabel } from "../../canonical-writing.ts";
import { graphIdentity } from "../../graph-adapter.ts";
import { readScopedPrivateItem, writeScopedPrivateItem } from "../../scoped-private-storage.ts";
import { readSelectedPages, resolveSelectedPage, type SelectedPage } from "./catalog-pages.ts";
import type { CatalogBlock, CatalogPage, NoteCatalogWork } from "./work-catalog.ts";

const preferenceKey = "work-catalog-discovery";
interface DiscoveryPreferences {
  enabled: boolean;
  excluded: string[];
}
export interface CatalogContext {
  graphId: string;
  graphName: string;
  check(): void;
}

export async function catalogContext(checkActive: () => void): Promise<CatalogContext> {
  const graph = await logseq.App.getCurrentGraph();
  checkActive();
  if (!graph) throw new Error("请先打开一个 Logseq 笔记库。");
  const graphId = graphIdentity(graph);
  return { graphId, graphName: graph.name || graphId, check: checkActive };
}

export async function readDiscovery({ graphId, check }: CatalogContext): Promise<DiscoveryPreferences> {
  const value = await readScopedPrivateItem(logseq.FileStorage, preferenceKey, graphId, check);
  return typeof value === "string" ? JSON.parse(value) as DiscoveryPreferences : { enabled: false, excluded: [] };
}

export function writeDiscovery({ graphId, check }: CatalogContext, value: DiscoveryPreferences): Promise<void> {
  return writeScopedPrivateItem(logseq.FileStorage, preferenceKey, graphId, JSON.stringify(value), check);
}

export async function readCatalogBlocks(check: () => void): Promise<CatalogBlock[]> {
  const rows = await logseq.DB.datascriptQuery(String.raw`[:find (pull ?b [:block/uuid :block/content :block/properties :block/updated-at {:block/parent [:db/id :block/uuid]} {:block/page [:db/id :block/name :block/original-name]}]) :where [?b :block/content ?content] [(clojure.string/includes? ?content "[")]]`) as Array<[CatalogBlock & { page?: CatalogBlock["page"] & { "original-name"?: string } }]>;
  check();
  return (rows ?? []).map(([row]) => {
    const name = row.page?.["original-name"];
    return name ? { ...row, page: { ...row.page, originalName: name } } : row;
  });
}

function projectTags(): Set<string> {
  const custom = String(logseq.settings?.workCatalogProjectTags ?? "").split(/[,，、\n]/u).map(normalizeTag).filter(Boolean);
  return new Set(["项目", "project", ...custom]);
}

function normalizeTag(value: string): string {
  return value.trim().replace(/^#/u, "").replace(/^\[\[|\]\]$/gu, "").trim().toLocaleLowerCase();
}

function pageProjectTag(page: PageEntity, allowed: Set<string>): string | undefined {
  const tags: unknown = page.properties?.tags;
  const names: unknown[] = Array.isArray(tags) ? tags : typeof tags === "string" ? tags.split(/[,，、]/u) : [];
  return names.find((name): name is string => typeof name === "string" && allowed.has(normalizeTag(name)));
}

export async function readCatalogPages(scope: CatalogContext, enabled: boolean): Promise<CatalogPage[]> {
  const { graphId, check } = scope;
  const pages = new Map<string, CatalogPage>();
  for (const selected of await readSelectedPages(graphId, check)) {
    const page = await resolveSelectedPage(selected, check);
    pages.set(page?.sourceUuid ?? selected.uuid, {
      ...(page ?? { uuid: selected.uuid, title: selected.title }),
      reason: "你手动加入的笔记",
    });
  }
  if (!enabled) return [...pages.values()];
  const allowed = projectTags();
  const existing = await logseq.Editor.getAllPages();
  check();
  for (const page of existing ?? []) {
    if (!page.uuid || !page.name || page["journal?"] || page.type === "journal" ||
        page.type === "whiteboard" || page.type === "property" || pages.has(page.uuid)) continue;
    const title = page.originalName ?? page.name;
    const tag = pageProjectTag(page, allowed);
    const mark = existingWorkPageMark(title);
    if (!tag && (!mark || title.trim().toLocaleLowerCase() === mark.toLocaleLowerCase())) continue;
    pages.set(page.uuid, {
      uuid: page.uuid, title, sourceUuid: page.uuid, updatedAt: page.updatedAt,
      reason: tag ? `使用了项目标签 #${tag.trim().replace(/^#/u, "").replace(/^\[\[|\]\]$/gu, "")}` : `页面名包含 ${mark} 标记`,
    });
  }
  return [...pages.values()];
}

export function catalogChoiceKeys(work: Pick<CatalogWork, "workRef" | "pageSourceUuid">): string[] {
  const ref = work.workRef;
  if (ref.kind !== "logseq") return [];
  return work.pageSourceUuid && work.pageSourceUuid !== ref.rootUuid
    ? [workKey(ref), workKey({ ...ref, rootUuid: work.pageSourceUuid })]
    : [workKey(ref)];
}

export function isIncluded(work: Pick<CatalogWork, "workRef" | "pageSourceUuid">, preferences: DiscoveryPreferences): boolean {
  return !catalogChoiceKeys(work).some(key => preferences.excluded.includes(key));
}

export function explainBlockWork(work: NoteCatalogWork, block?: CatalogBlock): NoteCatalogWork {
  const label = block && extractObjectNavigationLabel(block.content);
  if (!label) return work;
  return { ...work, reason: `已有 ${work.objectType} 标记` };
}

export function selectedPageFor(page: {uuid: string; name: string; originalName?: string}, previous?: SelectedPage): SelectedPage {
  return {
    uuid: previous?.uuid ?? page.uuid,
    title: page.originalName ?? page.name,
    ...(previous && previous.uuid !== page.uuid ? { sourceUuid: page.uuid } : {}),
  };
}
