import type { Lifecycle, V2Anchor, V2Condition, V2ManagedObject, V2ObjectType, V2PrimaryOwnership } from "@task-copilot/domain";
import type { ServiceFocusSelection, ServiceNowWork } from "@task-copilot/service-client";

/**
 * 全局对象目录只读查询投影。
 *
 * 本模块是纯函数：只聚合正式对象、Primary Anchor、主归属、FocusSelection 与 Now 投影，
 * 不写 SQLite/Graph，不改变对象 version/Lifecycle/Condition/Focus。
 */
export interface GlobalObjectDirectoryEntry {
  objectId: string;
  objectType: V2ObjectType;
  version: number;
  text: string;
  lifecycle: Lifecycle;
  /** 仅 OPEN 对象携带当前 Condition；非 OPEN 默认不展示。 */
  condition?: V2Condition;
  dueAt?: string;
  updatedAt: string;
  primaryAnchor?: {
    externalId: string;
    status: "active" | "missing" | "conflict" | "replaced";
  };
  ownership?: {
    ownerObjectId: string;
    ownerText: string;
  };
  focus: {
    selected: boolean;
    rank?: number;
  };
  now?: {
    section: "focus" | "next" | "waitingReview";
    reason: string;
  };
}

export interface GlobalObjectDirectoryInput {
  objects: readonly V2ManagedObject[];
  anchors: readonly V2Anchor[];
  ownerships: readonly V2PrimaryOwnership[];
  focusSelections: readonly ServiceFocusSelection[];
  nowWork?: ServiceNowWork;
}

export type DirectoryFocusFilter = "all" | "focus" | "now";
export type DirectoryTypeFilter = "ALL" | V2ObjectType;
export type DirectoryLifecycleFilter = "ALL" | Lifecycle;
export type DirectoryConditionFilter = "ALL" | V2Condition["kind"];
export type DirectorySort = "updated" | "title" | "type" | "lifecycle" | "due" | "focus";

export interface DirectoryFilterState {
  search: string;
  focus: DirectoryFocusFilter;
  type: DirectoryTypeFilter;
  lifecycle: DirectoryLifecycleFilter;
  condition: DirectoryConditionFilter;
  sort: DirectorySort;
}

export const DIRECTORY_SORT_ORDER: Record<Lifecycle, number> = {
  OPEN: 0,
  COMPLETED: 1,
  CANCELLED: 2,
  ARCHIVED: 3,
};

const TYPE_ORDER: V2ObjectType[] = ["AREA", "PROJECT", "MINI_PROJECT", "TASK", "DECISION", "OUTPUT"];

export function defaultDirectoryFilterState(): DirectoryFilterState {
  return { search: "", focus: "all", type: "ALL", lifecycle: "ALL", condition: "ALL", sort: "updated" };
}

export function filterAndSortDirectoryEntries(
  entries: readonly GlobalObjectDirectoryEntry[],
  state: DirectoryFilterState,
): GlobalObjectDirectoryEntry[] {
  const query = state.search.trim().toLocaleLowerCase();
  const filtered = entries.filter((entry) => {
    if (query && !entry.text.toLocaleLowerCase().includes(query)) return false;
    if (state.focus === "focus" && !entry.focus.selected) return false;
    if (state.focus === "now" && !entry.now) return false;
    if (state.type !== "ALL" && entry.objectType !== state.type) return false;
    if (state.lifecycle !== "ALL" && entry.lifecycle !== state.lifecycle) return false;
    if (state.condition !== "ALL" && entry.condition?.kind !== state.condition) return false;
    return true;
  });
  const dueTime = (entry: GlobalObjectDirectoryEntry) => entry.dueAt ? Date.parse(entry.dueAt) : Number.POSITIVE_INFINITY;
  const byUpdated = (left: GlobalObjectDirectoryEntry, right: GlobalObjectDirectoryEntry) =>
    right.updatedAt.localeCompare(left.updatedAt) || left.objectId.localeCompare(right.objectId);
  return [...filtered].sort((left, right) => {
    switch (state.sort) {
      case "title":
        return left.text.localeCompare(right.text, "zh-CN") || byUpdated(left, right);
      case "type":
        return (TYPE_ORDER.indexOf(left.objectType) - TYPE_ORDER.indexOf(right.objectType)) || byUpdated(left, right);
      case "lifecycle":
        return (DIRECTORY_SORT_ORDER[left.lifecycle] - DIRECTORY_SORT_ORDER[right.lifecycle]) || byUpdated(left, right);
      case "due":
        return (dueTime(left) - dueTime(right)) || byUpdated(left, right);
      case "focus":
        if (left.focus.selected !== right.focus.selected) return left.focus.selected ? -1 : 1;
        return (left.focus.rank ?? Number.MAX_SAFE_INTEGER) - (right.focus.rank ?? Number.MAX_SAFE_INTEGER) || byUpdated(left, right);
      default:
        return byUpdated(left, right);
    }
  });
}

function activeOrIssueAnchor(anchors: readonly V2Anchor[], objectId: string): GlobalObjectDirectoryEntry["primaryAnchor"] {
  const primary = anchors.filter((anchor) => anchor.objectId === objectId && anchor.role === "primary_text" && anchor.status !== "replaced");
  if (primary.length === 0) return undefined;
  const active = primary.find((anchor) => anchor.status === "active");
  const chosen = active ?? primary.sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt))[0]!;
  return { externalId: chosen.externalId, status: chosen.status };
}

export function projectGlobalObjectDirectory(input: GlobalObjectDirectoryInput): GlobalObjectDirectoryEntry[] {
  const byId = new Map(input.objects.map((object) => [object.objectId, object]));
  const focusByObject = new Map<string, ServiceFocusSelection>();
  for (const selection of input.focusSelections) {
    const current = focusByObject.get(selection.objectId);
    if (!current || (current.rank ?? Number.MAX_SAFE_INTEGER) > (selection.rank ?? Number.MAX_SAFE_INTEGER)) {
      focusByObject.set(selection.objectId, selection);
    }
  }
  const nowSections = new Map<string, NonNullable<GlobalObjectDirectoryEntry["now"]>>();
  if (input.nowWork) {
    for (const item of input.nowWork.focus) nowSections.set(item.objectId, { section: "focus", reason: item.reason });
    for (const item of input.nowWork.next) if (!nowSections.has(item.objectId)) nowSections.set(item.objectId, { section: "next", reason: item.reason });
    for (const item of input.nowWork.waitingReview) if (!nowSections.has(item.objectId)) nowSections.set(item.objectId, { section: "waitingReview", reason: item.reason });
  }
  const entries = input.objects.map((object) => {
    const selection = focusByObject.get(object.objectId);
    const ownership = input.ownerships.find((value) => value.childObjectId === object.objectId);
    const ownerText = ownership ? byId.get(ownership.ownerObjectId)?.text : undefined;
    const now = nowSections.get(object.objectId);
    const primaryAnchor = activeOrIssueAnchor(input.anchors, object.objectId);
    return {
      objectId: object.objectId,
      objectType: object.objectType,
      version: object.version,
      text: object.text,
      lifecycle: object.lifecycle,
      ...(object.lifecycle === "OPEN" ? { condition: object.condition } : {}),
      ...(object.dueAt ? { dueAt: object.dueAt } : {}),
      updatedAt: object.updatedAt,
      ...(primaryAnchor ? { primaryAnchor } : {}),
      ...(ownership && ownerText ? { ownership: { ownerObjectId: ownership.ownerObjectId, ownerText } } : {}),
      focus: selection
        ? { selected: true, ...(selection.rank !== undefined ? { rank: selection.rank } : {}) }
        : { selected: false },
      ...(now ? { now } : {}),
    };
  });
  return entries.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.objectId.localeCompare(right.objectId));
}
