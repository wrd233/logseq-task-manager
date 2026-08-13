export const WRITING_LANGUAGE_VERSION = 1 as const;

export const managedLabels = {
  CURRENT_FOCUS: "当前推进",
  WAITING: "等待",
  REVIEW: "复查",
  COMPLETION: "完成",
  CANCELLATION: "取消",
} as const;

export type ManagedFieldKind = keyof typeof managedLabels;

export function renderManagedField(kind: ManagedFieldKind, value: string): string {
  return `**[${managedLabels[kind]}]** ${value.trim()}`;
}

/** Label wording is presentation. UUID identity selects the semantic field. */
export function readManagedFieldValue(content: string): string {
  const firstLine = content.split("\n", 1)[0]?.trim() ?? "";
  return firstLine.replace(/^\*\*\[[^\]\n]+\]\*\*\s*/u, "").trim();
}
