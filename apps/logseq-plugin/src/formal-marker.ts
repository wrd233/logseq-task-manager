import type { BlockIdentity } from "./block-context.ts";

export const FORMAL_MARKER_GLYPH = "◇";
export const FORMAL_MARKER_MAX_ACTIVE = 200;

const KIND_LABELS: Record<string, string> = { TASK: "Task", MINI_PROJECT: "MiniProject", PROJECT: "Project" };
const ENGAGEMENT_LABELS: Record<string, string> = { ACTIONABLE: "可推进", WAITING: "正在等待", PARKED: "暂缓" };
const LIFECYCLE_LABELS: Record<string, string> = { COMPLETED: "已完成", CANCELLED: "已取消" };

export function isFormalIdentity(identity: BlockIdentity): identity is Extract<BlockIdentity, { kind: "FORMAL" }> {
  return identity.kind === "FORMAL";
}

export function formalMarkerTooltip(identity: Extract<BlockIdentity, { kind: "FORMAL" }>): string {
  const kind = KIND_LABELS[identity.objectKind] ?? identity.objectKind;
  const lines = [`Task Copilot · ${kind}`];
  const engagement = identity.engagement ? ENGAGEMENT_LABELS[identity.engagement] : null;
  const lifecycle = identity.lifecycle ? LIFECYCLE_LABELS[identity.lifecycle] : null;
  if (engagement) lines.push(engagement);
  else if (lifecycle) lines.push(lifecycle);
  lines.push("点击打开事项");
  return lines.join("\n");
}

export function markerSemanticKey(identity: BlockIdentity): "ORDINARY" | "FORMAL" {
  return identity.kind;
}
