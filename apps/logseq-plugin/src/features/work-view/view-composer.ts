import type { SourceRow } from "./model.mjs";
import type { ViewPresentation } from "./operations.ts";
import type { VerifiedFocus } from "./lens-plan.ts";

export interface LensSelection { focus: VerifiedFocus; userFolds: ReadonlySet<string>; changed: boolean }
export interface ComposedItem { uuid: string; depth: number; hidden: boolean; folded: boolean; child: boolean; full: boolean; emphasis: boolean }
export interface ComposedView { items: readonly ComposedItem[]; focused: boolean; visibleCount: number }

/** No reads, writes or semantic selection. Source structure and personal structure remain separate. */
export function composeWorkView(rows: readonly SourceRow[], presentation: ViewPresentation, lens?: LensSelection | null): ComposedView {
  const bodies = new Map(rows.map(row => [row.uuid, row.content]));
  const parents = new Map<string, string | null>(), stack: string[] = [];
  for (const item of presentation.items) {
    stack.length = item.depth; parents.set(item.uuid, stack[item.depth - 1] ?? null); stack[item.depth] = item.uuid;
  }
  const visible = lens ? new Set([...lens.focus.selected, ...lens.focus.ancestors]) : new Set(presentation.items.map(item => item.uuid));
  const open = new Set<string>();
  if (lens) {
    for (const uuid of [...visible]) {
      let parent = parents.get(uuid);
      while (parent) {
        visible.add(parent); open.add(parent); parent = parents.get(parent);
      }
    }
  }
  let hiddenDepth: number | null = null, visibleCount = 0;
  const items = presentation.items.map((item, index): ComposedItem => {
    if (hiddenDepth !== null && item.depth <= hiddenDepth) hiddenDepth = null;
    const folded = presentation.collapsed.includes(item.uuid) && !(lens && open.has(item.uuid) && !lens.userFolds.has(item.uuid));
    // Empty structural ancestors carry depth but occupy no reading space.
    const empty = lens && !lens.focus.selected.has(item.uuid) && !(bodies.get(item.uuid) ?? "").replace(/^\s*id::[^\n]*(?:\n|$)/gm, "").trim();
    const hidden = hiddenDepth !== null || !visible.has(item.uuid) || !!empty;
    if (folded && !hidden) hiddenDepth = item.depth;
    if (!hidden) visibleCount++;
    return {
      ...item, hidden, folded, child: (presentation.items[index + 1]?.depth ?? -1) > item.depth,
      full: !!lens && visible.has(item.uuid),
      emphasis: !!lens && !lens.changed && lens.focus.emphasis.has(item.uuid),
    };
  });
  return { items, focused: !!lens, visibleCount };
}
