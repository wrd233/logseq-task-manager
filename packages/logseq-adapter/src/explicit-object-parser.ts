import type { V2ObjectType } from "@task-copilot/domain";

export type LogseqTodoMarker = "TODO" | "NOW" | "DOING" | "DONE" | "CANCELED" | "CANCELLED" | "WAITING";

export type ExplicitObjectParseResult =
  | {
    kind: "OBJECT";
    objectType: Extract<V2ObjectType, "TASK" | "MINI_PROJECT" | "DECISION" | "OUTPUT">;
    marker: LogseqTodoMarker | undefined;
    syntax: "[任务]" | "[MiniProject]" | "#MiniProject" | "[决策]" | "[成果]";
    title: string;
  }
  | {
    kind: "NONE";
    marker: LogseqTodoMarker | undefined;
    reason: "NO_EXPLICIT_OBJECT_MARKER";
  }
  | {
    kind: "INVALID";
    code: "EXPLICIT_OBJECT_TITLE_REQUIRED" | "EXPLICIT_OBJECT_MARKER_CONFLICT";
    markers: string[];
  };

type SupportedSyntax = Extract<ExplicitObjectParseResult, { kind: "OBJECT" }>[
  "syntax"
];
type ParserManagedObjectType = Extract<
  V2ObjectType,
  "TASK" | "MINI_PROJECT" | "DECISION" | "OUTPUT"
>;

const explicitSyntax: readonly {
  syntax: SupportedSyntax;
  objectType: ParserManagedObjectType;
}[] = [
  { syntax: "[任务]", objectType: "TASK" },
  { syntax: "[MiniProject]", objectType: "MINI_PROJECT" },
  { syntax: "#MiniProject", objectType: "MINI_PROJECT" },
  { syntax: "[决策]", objectType: "DECISION" },
  { syntax: "[成果]", objectType: "OUTPUT" },
];

const todoMarkers: readonly LogseqTodoMarker[] = [
  "CANCELLED",
  "CANCELED",
  "WAITING",
  "DOING",
  "DONE",
  "TODO",
  "NOW",
];

const logseqBlockUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function stripLogseqBlockIdentityProperty(content: string, expectedUuid?: string): string {
  return content.split(/\r?\n/u).filter((line) => {
    const match = line.trim().match(/^id::\s*(\S+)$/iu);
    if (!match?.[1] || !logseqBlockUuid.test(match[1])) return true;
    return expectedUuid !== undefined && match[1].toLowerCase() !== expectedUuid.toLowerCase();
  }).join("\n");
}

function leadingTodoMarker(content: string): LogseqTodoMarker | undefined {
  return todoMarkers.find(
    (marker) => content === marker || (content.startsWith(marker) && /^\s/u.test(content.slice(marker.length))),
  );
}

function startsWithToken(content: string, token: string): boolean {
  return content === token || (content.startsWith(token) && /^\s/u.test(content.slice(token.length)));
}

function allExplicitSyntax(content: string): typeof explicitSyntax {
  return explicitSyntax.filter(({ syntax }) => content.includes(syntax));
}

export function parseExplicitObjectSyntax(content: string): ExplicitObjectParseResult {
  const trimmed = stripLogseqBlockIdentityProperty(content).trim();
  const leading = explicitSyntax.find(
    ({ syntax }) => startsWithToken(trimmed, syntax),
  );

  if (!leading) {
    return {
      kind: "NONE",
      marker: leadingTodoMarker(trimmed),
      reason: "NO_EXPLICIT_OBJECT_MARKER",
    };
  }

  const presentSyntax = allExplicitSyntax(trimmed);
  if (new Set(presentSyntax.map(({ objectType }) => objectType)).size > 1) {
    return {
      kind: "INVALID",
      code: "EXPLICIT_OBJECT_MARKER_CONFLICT",
      markers: presentSyntax.map(({ syntax }) => syntax),
    };
  }

  let title = trimmed.slice(leading.syntax.length).trim();
  const marker = leadingTodoMarker(title);
  if (marker) title = title.slice(marker.length).trim();
  if (!title) {
    return {
      kind: "INVALID",
      code: "EXPLICIT_OBJECT_TITLE_REQUIRED",
      markers: [leading.syntax],
    };
  }

  return {
    kind: "OBJECT",
    objectType: leading.objectType,
    marker,
    syntax: leading.syntax,
    title,
  };
}
