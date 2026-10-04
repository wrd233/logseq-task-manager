/**
 * Canonical Formal Object writing language for Logseq projection.
 *
 * This module is the single owner of the user-visible Formal anchor format.
 * Kernel title/lifecycle/kind remain authoritative; this module only decides
 * how those formal values are written into a Logseq block when Task Copilot
 * owns the anchor line (new formalization and explicit normalization).
 *
 * Compatibility note (verified on Logseq Desktop 0.10.15):
 * Logseq only recognises TODO/DONE workflow markers when the marker is the
 * first non-whitespace token of a block. A bold `[任务]` prefix before the
 * marker makes the block an ordinary paragraph in Logseq's database. We
 * therefore keep the user's bold `[任务]` decoration but place it after the
 * workflow marker:
 *
 *   TODO **[任务]** <title>
 *   DONE **[任务]** <title>
 *
 * MiniProject has no TODO workflow marker, so the exact requested form is safe:
 *
 *   **[MiniProject]** <title> #MiniProject
 */

export const TASK_LABEL = "任务";
export const TASK_LABELS = [TASK_LABEL, "事务"] as const;
export type TaskLabel = (typeof TASK_LABELS)[number];
export const MINI_PROJECT_LABEL = "MiniProject";
export const MINI_PROJECT_TAG = "#MiniProject";

export const TASK_MARKERS = ["TODO", "DONE", "DOING", "NOW", "LATER", "CANCELED", "CANCELLED"] as const;
export type TaskMarker = (typeof TASK_MARKERS)[number];

export interface FormalAnchorFormatInput {
  kind: "TASK" | "MINI_PROJECT";
  title: string;
  lifecycle?: "OPEN" | "COMPLETED" | "CANCELLED";
  marker?: TaskMarker | null;
  taskLabel?: TaskLabel;
}

export interface ParsedFormalAnchor {
  kind: "TASK" | "MINI_PROJECT";
  title: string;
  marker: TaskMarker | null;
  taskLabel?: TaskLabel;
}

/** Strip projection decoration from a Kernel title candidate. */
export function normalizeFormalTitle(value: string): string {
  const parsed = parseFormalAnchor(value);
  if (parsed) return parsed.title;
  let title = value.trim();
  title = title.replace(/^(?:TODO|DONE|DOING|NOW|LATER|CANCELED|CANCELLED)\s+/u, "");
  title = title.replace(/^(?:\*\*)?\[(?:任务|事务|MiniProject)\](?:\*\*)?\s*/u, "");
  title = title.replace(/\s+#MiniProject\s*$/u, "").trim();
  title = title.replace(/\s*#MiniProject\s*$/u, "").trim();
  return title;
}

function taskMarkerFor(input: FormalAnchorFormatInput): TaskMarker | null {
  if (input.marker) return input.marker;
  if (input.lifecycle === "COMPLETED") return "DONE";
  if (input.lifecycle === "CANCELLED") return null;
  return "TODO";
}

/**
 * Deterministic canonical Formal anchor line.
 *
 * Task uses marker-first because Logseq's task parser requires it.
 * MiniProject uses the exact requested bold prefix + trailing tag.
 */
export function formatFormalAnchor(input: FormalAnchorFormatInput): string {
  // Callers provide a semantic title; do not strip a second marker/label from
  // the title's own text (e.g. a task named "TODO 语法说明").
  const title = input.title.trim();
  if (input.kind === "MINI_PROJECT") {
    return `**[${MINI_PROJECT_LABEL}]** ${title} ${MINI_PROJECT_TAG}`;
  }
  if (input.kind !== "TASK") throw new Error("PROJECT_DOES_NOT_USE_BLOCK_ANCHOR_FORMATTER");
  const marker = taskMarkerFor(input);
  const label = input.taskLabel ?? TASK_LABEL;
  return marker ? `${marker} **[${label}]** ${title}` : `**[${label}]** ${title}`;
}

function firstLine(content: string): string {
  return content.split("\n", 1)[0]?.trim() ?? "";
}

/** Parse a canonical (or legacy canonical) Formal anchor line. */
export function parseFormalAnchor(content: string): ParsedFormalAnchor | null {
  const line = firstLine(content);
  const mini = /^\*\*\[MiniProject\]\*\*\s+(.+?)(?:\s+#MiniProject)?\s*$/u.exec(line);
  if (mini) {
    return { kind: "MINI_PROJECT", title: mini[1]!.replace(/\s*#MiniProject\s*$/u, "").trim(), marker: null };
  }
  const markerFirst = /^(TODO|DONE|DOING|NOW|LATER|CANCELED|CANCELLED)\s+\*\*\[(任务|事务)\]\*\*\s+(.+)$/u.exec(line);
  if (markerFirst) {
    return { kind: "TASK", title: markerFirst[3]!.trim(), marker: markerFirst[1] as TaskMarker, taskLabel: markerFirst[2] as TaskLabel };
  }
  const prefixFirst = /^\*\*\[(任务|事务)\]\*\*\s+(TODO|DONE|DOING|NOW|LATER|CANCELED|CANCELLED)\s+(.+)$/u.exec(line);
  if (prefixFirst) {
    return { kind: "TASK", title: prefixFirst[3]!.trim(), marker: prefixFirst[2] as TaskMarker, taskLabel: prefixFirst[1] as TaskLabel };
  }
  return null;
}

/** Conservative syntax protection, not proof of formal identity or authority. */
export function hasFormalAnchorSyntax(content: string): boolean {
  return !!parseFormalAnchor(content) || /^\s*(?:(?:TODO|DONE|DOING|NOW|LATER|CANCELED|CANCELLED)\s+)?(?:\*\*)?\[(?:任务|事务|MiniProject|Project)\]/u.test(content);
}

/** Existing navigation vocabulary only; ordinary TODOs and pages are not roots. */
export function extractObjectNavigationLabel(content: string): { kind: "TASK" | "MINI_PROJECT"; title: string } | null {
  const parsed = parseFormalAnchor(content);
  if (parsed?.kind === "TASK") return { kind: parsed.kind, title: parsed.title };
  const line = firstLine(content).replace(/^(?:TODO|DONE|DOING|NOW|LATER|WAITING|CANCELED|CANCELLED)\s+/u, "");
  const task = /^\*\*\[(事务|事项|任务)\]\*\*/u.exec(line);
  if (task) return { kind: "TASK", title: line.slice(task[0].length).trim() || task[1]! };
  const mini = /^\*\*\[MiniProject\]\*\*/u.exec(line);
  if (mini && /(?:^|\s)#MiniProject(?=\s|$)/u.test(line.slice(mini[0].length))) {
    return { kind: "MINI_PROJECT", title: line.slice(mini[0].length).replace(/(?:^|\s)#MiniProject(?=\s|$)/gu, "").trim() || MINI_PROJECT_LABEL };
  }
  return null;
}

function replaceFirstLine(content: string, line: string): string {
  const end = content.search(/\r?\n/u);
  return line + (end < 0 ? "" : content.slice(end));
}

/** Explicit formalization/normalization preserves source spelling and all tail bytes. */
export function formatFormalSource(content: string, input: FormalAnchorFormatInput): string {
  const parsed = parseFormalAnchor(content);
  const label = parsed?.taskLabel ?? /^(?:(?:TODO|DONE|DOING|NOW|LATER|CANCELED|CANCELLED)\s+)?\*\*\[(任务|事务)\]\*\*/u.exec(firstLine(content))?.[1] as TaskLabel | undefined;
  return replaceFirstLine(content, formatFormalAnchor({ ...input, taskLabel: label ?? input.taskLabel ?? TASK_LABEL }));
}

export function isCanonicalFormalAnchor(content: string, kind?: "TASK" | "MINI_PROJECT"): boolean {
  const parsed = parseFormalAnchor(content);
  return parsed !== null && (kind === undefined || parsed.kind === kind);
}

/**
 * Return the canonical source line for a source that is already a managed
 * Formal anchor. Natural user content (not yet canonical) returns null and is
 * never rewritten by the Graph Adapter.
 */
export function canonicalizeFormalSource(
  content: string,
  overrides: { title?: string; lifecycle?: FormalAnchorFormatInput["lifecycle"]; marker?: TaskMarker | null } = {},
): string | null {
  const parsed = parseFormalAnchor(content);
  if (!parsed) return null;
  const input: FormalAnchorFormatInput = {
    kind: parsed.kind,
    title: overrides.title ?? parsed.title,
    marker: overrides.marker === undefined ? parsed.marker : overrides.marker,
  };
  if (overrides.lifecycle !== undefined) input.lifecycle = overrides.lifecycle;
  return formatFormalSource(content, input);
}

/** Extract a clean semantic title from a canonical anchor line, if any. */
export function extractFormalTitle(content: string): string | null {
  return parseFormalAnchor(content)?.title ?? null;
}

/** Extract a clean semantic title from any user line (marker + optional canonical decoration). */
export function extractTitleFromSourceLine(content: string): string {
  const line = firstLine(content);
  const parsed = parseFormalAnchor(line);
  if (parsed) return parsed.title;
  return normalizeFormalTitle(line);
}

export function isTaskMarker(value: unknown): value is TaskMarker {
  return typeof value === "string" && (TASK_MARKERS as readonly string[]).includes(value);
}

export function taskMarkerFromContent(content: string): TaskMarker | null {
  const line = firstLine(content);
  const markerFirst = /^(TODO|DONE|DOING|NOW|LATER|CANCELED|CANCELLED)\s+/u.exec(line);
  if (markerFirst) return markerFirst[1] as TaskMarker;
  const prefixFirst = /^\*\*\[(?:任务|事务)\]\*\*\s+(TODO|DONE|DOING|NOW|LATER|CANCELED|CANCELLED)\s+/u.exec(line);
  if (prefixFirst) return prefixFirst[1] as TaskMarker;
  return null;
}

/** Replaces the workflow marker in a Task anchor while preserving the rest. */
export function replaceTaskMarker(content: string, marker: TaskMarker): string {
  const parsed = parseFormalAnchor(content);
  if (parsed?.kind === "TASK") {
    return formatFormalSource(content, { kind: "TASK", title: parsed.title, marker });
  }
  const line = content.split(/\r?\n/u, 1)[0] ?? "";
  const markerFirst = /^(\s*)(?:TODO|DONE|DOING|NOW|LATER|CANCELED|CANCELLED)\s+/u.exec(line);
  if (markerFirst) {
    return `${markerFirst[1]}${marker} ${content.slice(markerFirst[0].length)}`;
  }
  return `${marker} ${content.replace(/^(?:TODO|DONE|DOING|NOW|LATER|CANCELED|CANCELLED)\s+/u, "")}`;
}
