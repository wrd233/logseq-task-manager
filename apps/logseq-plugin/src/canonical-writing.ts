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
export const MINI_PROJECT_LABEL = "MiniProject";
export const MINI_PROJECT_TAG = "#MiniProject";

export const TASK_MARKERS = ["TODO", "DONE", "DOING", "NOW", "LATER", "CANCELED", "CANCELLED"] as const;
export type TaskMarker = (typeof TASK_MARKERS)[number];

export interface FormalAnchorFormatInput {
  kind: "TASK" | "MINI_PROJECT";
  title: string;
  lifecycle?: "OPEN" | "COMPLETED" | "CANCELLED";
  marker?: TaskMarker | null;
}

export interface ParsedFormalAnchor {
  kind: "TASK" | "MINI_PROJECT";
  title: string;
  marker: TaskMarker | null;
}

/** Strip projection decoration from a Kernel title candidate. */
export function normalizeFormalTitle(value: string): string {
  let title = value.replace(/\s+/gu, " ").trim();
  title = title.replace(/^\*\*\[任务\]\*\*\s*/u, "");
  title = title.replace(/^\*\*\[MiniProject\]\*\*\s*/u, "");
  title = title.replace(/^\[任务\]\s*/u, "");
  title = title.replace(/^\[MiniProject\]\s*/u, "");
  title = title.replace(/^(?:TODO|DONE|DOING|NOW|LATER|CANCELED|CANCELLED)\s+/u, "");
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
  const title = normalizeFormalTitle(input.title);
  if (input.kind === "MINI_PROJECT") {
    return `**[${MINI_PROJECT_LABEL}]** ${title} ${MINI_PROJECT_TAG}`;
  }
  if (input.kind !== "TASK") throw new Error("PROJECT_DOES_NOT_USE_BLOCK_ANCHOR_FORMATTER");
  const marker = taskMarkerFor(input);
  return marker ? `${marker} **[${TASK_LABEL}]** ${title}` : `**[${TASK_LABEL}]** ${title}`;
}

function firstLine(content: string): string {
  return content.split("\n", 1)[0]?.trim() ?? "";
}

/** Parse a canonical (or legacy canonical) Formal anchor line. */
export function parseFormalAnchor(content: string): ParsedFormalAnchor | null {
  const line = firstLine(content);
  const mini = /^\*\*\[MiniProject\]\*\*\s+(.+?)(?:\s+#MiniProject)?\s*$/u.exec(line);
  if (mini) {
    return { kind: "MINI_PROJECT", title: normalizeFormalTitle(mini[1]!), marker: null };
  }
  const markerFirst = /^(TODO|DONE|DOING|NOW|LATER|CANCELED|CANCELLED)\s+\*\*\[任务\]\*\*\s+(.+)$/u.exec(line);
  if (markerFirst) {
    return { kind: "TASK", title: normalizeFormalTitle(markerFirst[2]!), marker: markerFirst[1] as TaskMarker };
  }
  const prefixFirst = /^\*\*\[任务\]\*\*\s+(TODO|DONE|DOING|NOW|LATER|CANCELED|CANCELLED)\s+(.+)$/u.exec(line);
  if (prefixFirst) {
    return { kind: "TASK", title: normalizeFormalTitle(prefixFirst[2]!), marker: prefixFirst[1] as TaskMarker };
  }
  return null;
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
  return formatFormalAnchor(input);
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
  return normalizeFormalTitle(line.replace(/^(?:TODO|DONE|DOING|NOW|LATER|CANCELED|CANCELLED)\s+/u, ""));
}

export function isTaskMarker(value: unknown): value is TaskMarker {
  return typeof value === "string" && (TASK_MARKERS as readonly string[]).includes(value);
}

export function taskMarkerFromContent(content: string): TaskMarker | null {
  const line = firstLine(content);
  const markerFirst = /^(TODO|DONE|DOING|NOW|LATER|CANCELED|CANCELLED)\s+/u.exec(line);
  if (markerFirst) return markerFirst[1] as TaskMarker;
  const prefixFirst = /^\*\*\[任务\]\*\*\s+(TODO|DONE|DOING|NOW|LATER|CANCELED|CANCELLED)\s+/u.exec(line);
  if (prefixFirst) return prefixFirst[1] as TaskMarker;
  return null;
}

/** Replaces the workflow marker in a Task anchor while preserving the rest. */
export function replaceTaskMarker(content: string, marker: TaskMarker): string {
  const parsed = parseFormalAnchor(content);
  if (parsed?.kind === "TASK") {
    return formatFormalAnchor({ kind: "TASK", title: parsed.title, marker });
  }
  const line = firstLine(content);
  const markerFirst = /^(TODO|DONE|DOING|NOW|LATER|CANCELED|CANCELLED)\s+/u.exec(line);
  if (markerFirst) {
    return `${marker} ${content.slice(markerFirst[0].length)}`;
  }
  const prefixFirst = /^\*\*\[任务\]\*\*\s+(?:TODO|DONE|DOING|NOW|LATER|CANCELED|CANCELLED)\s+/u.exec(line);
  if (prefixFirst) {
    const natural = content.slice(prefixFirst[0].length);
    return `${marker} **[${TASK_LABEL}]** ${natural}`;
  }
  return `${marker} ${content.replace(/^(?:TODO|DONE|DOING|NOW|LATER|CANCELED|CANCELLED)\s+/u, "")}`;
}
