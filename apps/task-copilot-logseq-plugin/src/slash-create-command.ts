export type SlashCreateObjectType = "TASK" | "MINI_PROJECT" | "DECISION" | "OUTPUT";

export const SLASH_CREATE_SYNTAX: Readonly<Record<SlashCreateObjectType, "[任务]" | "[MiniProject]" | "[决策]" | "[成果]">> = {
  TASK: "[任务]",
  MINI_PROJECT: "[MiniProject]",
  DECISION: "[决策]",
  OUTPUT: "[成果]",
};

export interface SlashCreateEditor {
  insertAtEditingCursor(content: string): Promise<void>;
}

export function slashCreateContentAfterInsertion(content: string, cursorPosition: number, objectType: SlashCreateObjectType): string {
  if (!Number.isSafeInteger(cursorPosition) || cursorPosition < 0 || cursorPosition > content.length) {
    throw new Error("Slash create command requires a valid editing cursor position.");
  }
  const insertion = `${SLASH_CREATE_SYNTAX[objectType]} `;
  return `${content.slice(0, cursorPosition)}${insertion}${content.slice(cursorPosition)}`;
}

/**
 * A slash create command only writes canonical Logseq syntax at the user's
 * editing cursor. Formalization remains owned by the explicit-sync parser and
 * Local Service command path.
 */
export async function insertSlashCreateSyntax(editor: SlashCreateEditor, objectType: SlashCreateObjectType): Promise<void> {
  await editor.insertAtEditingCursor(`${SLASH_CREATE_SYNTAX[objectType]} `);
}
