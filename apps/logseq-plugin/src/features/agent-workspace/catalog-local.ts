import type { PageEntity } from "@logseq/libs/dist/LSPlugin";
import { workKey, type CatalogWork } from "@task-copilot/contracts";
import { existingWorkPageMark, extractObjectNavigationLabel } from "../../canonical-writing.ts";
import { graphIdentity } from "../../graph-adapter.ts";
import { readScopedPrivateItem, writeScopedPrivateItem } from "../../scoped-private-storage.ts";
import { readSelectedPages, resolveSelectedPage, type SelectedPage } from "./catalog-pages.ts";
import type { CatalogBlock, CatalogPage, CatalogPageMeta, NoteCatalogWork } from "./work-catalog.ts";
import { pageWorkIds } from "../../workspace/page-identity.ts";

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

const ARCHIVED_STATES = new Set(["archived", "done", "completed", "cancelled", "canceled"]);
const AREA_TAGS = new Set(["领域", "area"]);

function projectTags(): Set<string> {
  const custom = String(logseq.settings?.workCatalogProjectTags ?? "").split(/[,，、\n]/u).map(normalizeTag).filter(Boolean);
  return new Set(["项目", "project", ...custom]);
}

function normalizeTag(value: string): string {
  return value.trim().replace(/^#/u, "").replace(/^\[\[|\]\]$/gu, "").trim().toLocaleLowerCase();
}

export function parsePropertyLinks(raw: unknown): string[] {
  const out: string[] = [];
  const push = (text: string) => {
    const clean = text.trim().replace(/^#/u, "").replace(/^\[\[|\]\]$/gu, "").trim();
    if (!clean || clean.includes("::") || /^(?:na|none|null|-)$/iu.test(clean)) return;
    if (!out.includes(clean)) out.push(clean);
  };
  if (Array.isArray(raw)) {
    for (const item of raw) if (typeof item === "string") push(item);
  } else if (typeof raw === "string") {
    const wikiMatches = [...raw.matchAll(/\[\[([^\]]+)\]\]/gu)].map((m) => m[1] ?? "");
    if (wikiMatches.length > 0) {
      for (const m of wikiMatches) push(m);
    } else {
      for (const part of raw.split(/[,，、]/u)) push(part);
    }
  }
  return out;
}

function readPageProp(page: PageEntity, ...keys: string[]): unknown {
  const props = page.properties as Record<string, unknown> | undefined;
  const textProps = (page as PageEntity & { propertiesTextValues?: Record<string, unknown> }).propertiesTextValues;
  for (const key of keys) {
    if (props && props[key] !== undefined && props[key] !== null) return props[key];
    if (textProps && textProps[key] !== undefined && textProps[key] !== null) return textProps[key];
  }
  return undefined;
}

function readLifecycleState(page: PageEntity): string | undefined {
  const raw = readPageProp(page, "state", "status");
  const links = parsePropertyLinks(raw);
  const first = links[0]?.toLocaleLowerCase();
  return first || undefined;
}

function isParaSystemPage(title: string): boolean {
  const trimmed = title.trim();
  return /^para(?:\/|$)/iu.test(trimmed) || /^para面板$/iu.test(trimmed);
}

export function classifyCatalogPage(
  page: PageEntity,
  allowedProjectTags: Set<string>,
): { kind: "area" | "project" | "archived" | "other"; reason?: string; parentAreas: string[]; lifecycleState?: string } {
  const title = (page.originalName ?? page.name ?? "").trim();
  const paraValues = parsePropertyLinks(readPageProp(page, "para", "PARA")).map(normalizeTag);
  const tagValues = parsePropertyLinks(readPageProp(page, "tags")).map(normalizeTag);
  const parentAreas = parsePropertyLinks(readPageProp(page, "areas", "area", "Areas", "Area"));
  const lifecycleState = readLifecycleState(page);

  if (isParaSystemPage(title)) {
    return { kind: "other", parentAreas: [], ...(lifecycleState ? { lifecycleState } : {}) };
  }

  const isArchived =
    paraValues.some((v) => v === "para/archive" || v === "archive") ||
    Boolean(lifecycleState && ARCHIVED_STATES.has(lifecycleState));
  if (isArchived) {
    return { kind: "archived", parentAreas, ...(lifecycleState ? { lifecycleState } : {}) };
  }

  const isWorkflowDoc = /^(?:工作流|模板|template|workflow)[/／]/iu.test(title);
  const isArea =
    !isWorkflowDoc &&
    (paraValues.some((v) => v === "para/area" || v === "area") ||
      tagValues.some((v) => AREA_TAGS.has(v)) ||
      /^area\//iu.test(title));
  if (isArea) {
    return {
      kind: "area",
      reason: lifecycleState === "active" ? "活跃领域 (PARA/Area)" : "领域 (PARA/Area)",
      parentAreas: [],
      ...(lifecycleState ? { lifecycleState } : {}),
    };
  }

  const matchedProjectTag = [...paraValues, ...tagValues].find((v) => {
    if (allowedProjectTags.has(v)) return true;
    const leaf = v.split("/").at(-1)?.trim() ?? "";
    return Boolean(leaf && allowedProjectTags.has(leaf));
  });
  const mark = existingWorkPageMark(title);
  if (matchedProjectTag || (mark && title.toLocaleLowerCase() !== mark.toLocaleLowerCase())) {
    return {
      kind: "project",
      reason: matchedProjectTag ? `使用了项目标签 #${matchedProjectTag}` : `页面名包含 ${mark} 标记`,
      parentAreas,
      ...(lifecycleState ? { lifecycleState } : {}),
    };
  }

  return { kind: "other", parentAreas, ...(lifecycleState ? { lifecycleState } : {}) };
}

export function buildPageMetaMap(allPages: readonly PageEntity[]): Map<string, CatalogPageMeta> {
  const allowed = projectTags();
  const map = new Map<string, CatalogPageMeta>();
  for (const page of allPages) {
    if (!page.name) continue;
    const title = (page.originalName ?? page.name).trim();
    if (!title) continue;
    const info = classifyCatalogPage(page, allowed);
    const meta: CatalogPageMeta = {
      ...(info.kind === "archived" ? { archived: true } : {}),
      ...(info.parentAreas.length > 0 ? { parentAreas: info.parentAreas } : {}),
      ...(info.lifecycleState ? { lifecycleState: info.lifecycleState } : {}),
    };
    if (meta.archived || meta.parentAreas || meta.lifecycleState) {
      map.set(title.toLocaleLowerCase(), meta);
      map.set(page.name.trim().toLocaleLowerCase(), meta);
    }
  }
  return map;
}

export async function readCatalogPages(scope: CatalogContext, enabled: boolean, allPages?: PageEntity[]): Promise<CatalogPage[]> {
  const { graphId, check } = scope;
  const pages = new Map<string, CatalogPage>();
  const allowed = projectTags();
  const existing = allPages ?? (enabled ? await logseq.Editor.getAllPages() : undefined);
  if (enabled) check();
  const byUuid = new Map((existing ?? []).filter((p) => p.uuid).map((p) => [p.uuid, p]));

  for (const selected of await readSelectedPages(graphId, check)) {
    const page = await resolveSelectedPage(selected, check);
    const rawPage = page?.sourceUuid ? byUuid.get(page.sourceUuid) : undefined;
    const classified = rawPage ? classifyCatalogPage(rawPage, allowed) : null;
    pages.set(page?.sourceUuid ?? selected.uuid, {
      ...(page ?? { uuid: selected.uuid, title: selected.title }),
      reason: "你手动加入的笔记",
      ...(classified?.kind === "area" ? { objectType: "Area" } : classified?.kind === "project" ? { objectType: "Project" } : {}),
      ...(classified?.parentAreas.length ? { parentAreas: classified.parentAreas } : {}),
      ...(classified?.lifecycleState ? { lifecycleState: classified.lifecycleState } : {}),
    });
  }
  if (!enabled) return [...pages.values()];

  for (const page of existing ?? []) {
    if (!page.uuid || !page.name || page["journal?"] || page.type === "journal" ||
        page.type === "whiteboard" || page.type === "property" || pages.has(page.uuid)) continue;
    const title = page.originalName ?? page.name;
    const classified = classifyCatalogPage(page, allowed);
    if (classified.kind !== "area" && classified.kind !== "project") continue;
    pages.set(page.uuid, {
      uuid: pageWorkIds({graphId,rootUuid:page.uuid,kind:"page",pageName:title},localStorage)[0]!,
      title,
      sourceUuid: page.uuid,
      updatedAt: page.updatedAt,
      objectType: classified.kind === "area" ? "Area" : "Project",
      ...(classified.reason ? { reason: classified.reason } : {}),
      ...(classified.parentAreas.length > 0 ? { parentAreas: classified.parentAreas } : {}),
      ...(classified.lifecycleState ? { lifecycleState: classified.lifecycleState } : {}),
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
