import type { BlockIdentity } from "./block-context.ts";

export const FORMAL_MARKER_GLYPH = "◇";
export const FORMAL_MARKER_WARNING_GLYPH = "◇!";
export const FORMAL_MARKER_MAX_ACTIVE = 200;

const KIND_LABELS: Record<string, string> = { TASK: "Task", MINI_PROJECT: "MiniProject", PROJECT: "Project" };
const ENGAGEMENT_LABELS: Record<string, string> = { ACTIONABLE: "可推进", WAITING: "正在等待", PARKED: "暂缓" };
const LIFECYCLE_LABELS: Record<string, string> = { COMPLETED: "已完成", CANCELLED: "已取消" };
const CONSISTENCY_WARNING_LABEL = "正式事项的 Logseq 显示可能未同步";

export function isFormalIdentity(identity: BlockIdentity): identity is Extract<BlockIdentity, { kind: "FORMAL" }> {
  return identity.kind === "FORMAL";
}

export function markerGlyphFor(identity: Extract<BlockIdentity, { kind: "FORMAL" }>): string {
  return identity.consistency === "WARNING" ? FORMAL_MARKER_WARNING_GLYPH : FORMAL_MARKER_GLYPH;
}

export function formalMarkerTooltip(identity: Extract<BlockIdentity, { kind: "FORMAL" }>): string {
  const kind = KIND_LABELS[identity.objectKind] ?? identity.objectKind;
  const lines = [`Task Copilot · ${kind}`];
  const engagement = identity.engagement ? ENGAGEMENT_LABELS[identity.engagement] : null;
  const lifecycle = identity.lifecycle ? LIFECYCLE_LABELS[identity.lifecycle] : null;
  if (identity.consistency === "WARNING") {
    lines.push(CONSISTENCY_WARNING_LABEL);
    lines.push("点击查看");
    return lines.join("\n");
  }
  if (engagement) lines.push(engagement);
  else if (lifecycle) lines.push(lifecycle);
  lines.push("点击打开事项");
  return lines.join("\n");
}

export interface ProjectionObligationLike {
  status: string;
  retryExhausted: boolean;
  nextAttemptAt: string | null;
  lastError: string | null;
}

/**
 * Stable Formal projection consistency anomaly, not a transient retry.
 * Business states (WAITING / PARKED / closure readiness) are not represented
 * here at all.
 */
export function isStableProjectionAnomaly(obligation: ProjectionObligationLike): boolean {
  if (obligation.status !== "FAILED") return false;
  if (obligation.retryExhausted) return true;
  if (obligation.nextAttemptAt === null) return true;
  if (obligation.lastError && /PROJECTION_VERIFY_MISMATCH|PRECONDITION|CONFLICT|MISMATCH/u.test(obligation.lastError)) return true;
  return false;
}

export function markerSemanticKey(identity: BlockIdentity): "ORDINARY" | "FORMAL" {
  return identity.kind;
}
