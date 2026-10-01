import { indent, move, type LayoutItem } from "./model.mjs";
import { levels } from "./display.mjs";

export interface ViewPresentation { items: LayoutItem[]; collapsed: string[]; overrides: Record<string, string>; expanded: string[]; selected: string }
export type ViewResult = {ok: false; reason: string} | {ok: true; state: ViewPresentation};

export function copyPresentation(state: ViewPresentation): ViewPresentation {
  return { items: state.items.map(item => ({ ...item })), collapsed: [...state.collapsed], overrides: { ...state.overrides }, expanded: [...state.expanded], selected: state.selected };
}

/** Closed presentation-only vocabulary: source writers and research probes have no route. */
export function applyPresentation(state: ViewPresentation, input: unknown, scope: {graph: string; root: string | null; seq: number}): ViewResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {ok: false, reason: "operation-required"};
  const op = input as Record<string, unknown>;
  if (op.graph !== scope.graph || op.root !== scope.root) return {ok: false, reason: "scope-mismatch"};
  if (op.expectedSeq !== scope.seq) return {ok: false, reason: "stale-view"};
  const next = copyPresentation(state);
  if (!["layout", "reorder", "indent", "collapse", "display", "focus"].includes(String(op.type))) return {ok: false, reason: "unsupported-presentation-operation"};
  const has = (uuid: unknown): uuid is string => typeof uuid === "string" && state.items.some(item => item.uuid === uuid);
  if (op.type === "layout") {
    if (!Array.isArray(op.items) || op.items.length !== state.items.length) return {ok: false, reason: "layout-must-include-every-item"};
    const seen = new Set<string>(); const items: LayoutItem[] = [];
    for (const [index, value] of op.items.entries()) {
      if (!value || typeof value !== "object") return {ok: false, reason: "invalid-item"};
      const item = value as Record<string, unknown>;
      if (!has(item.uuid) || seen.has(item.uuid) || typeof item.depth !== "number" || !Number.isInteger(item.depth)) return {ok: false, reason: "invalid-item"};
      if (index === 0 ? item.uuid !== scope.root || item.depth !== 0 : item.depth < 1 || item.depth > (items[index - 1]?.depth ?? 0) + 1) return {ok: false, reason: "invalid-nesting"};
      seen.add(item.uuid); items.push({uuid: item.uuid, depth: item.depth});
    }
    next.items = items;
  } else {
    if (!has(op.uuid)) return {ok: false, reason: "uuid-not-in-view"};
    if (op.type === "reorder" || op.type === "indent") {
      if (op.uuid === scope.root) return {ok: false, reason: "root-not-movable"};
      if (op.type === "reorder") {
        if (!has(op.target) || !["before", "after", "child"].includes(String(op.mode ?? "before"))) return {ok: false, reason: "invalid-target"};
        next.items = move(next.items, op.uuid, op.target, String(op.mode ?? "before"));
      } else {
        if (op.delta !== -1 && op.delta !== 1) return {ok: false, reason: "invalid-indent-direction"};
        next.items = indent(next.items, op.uuid, op.delta);
      }
      if (JSON.stringify(next.items) === JSON.stringify(state.items)) return {ok: false, reason: "move-had-no-effect"};
    }
    if (op.type === "collapse") next.collapsed = op.collapsed === false ? next.collapsed.filter(id => id !== op.uuid) : [...new Set([...next.collapsed, op.uuid])];
    if (op.type === "display") {
      if (typeof op.level !== "string" || !levels.includes(op.level)) return {ok: false, reason: "invalid-display-level"};
      if (op.level === "auto") delete next.overrides[op.uuid]; else next.overrides[op.uuid] = op.level;
    }
    if (op.type === "focus") next.selected = op.uuid;
  }
  return {ok: true, state: next};
}
