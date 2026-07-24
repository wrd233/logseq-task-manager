import assert from "node:assert/strict";
import test from "node:test";

import { insertSlashCreateSyntax, slashCreateContentAfterInsertion, SLASH_CREATE_SYNTAX, type SlashCreateObjectType } from "../src/slash-create-command.ts";

test("Chinese slash create commands insert only canonical explicit syntax at the editing cursor", async () => {
  const inserted: string[] = [];
  const editor = {
    insertAtEditingCursor: async (content: string) => { inserted.push(content); },
  };

  for (const objectType of Object.keys(SLASH_CREATE_SYNTAX) as SlashCreateObjectType[]) {
    await insertSlashCreateSyntax(editor, objectType);
  }

  assert.deepEqual(inserted, ["[任务] ", "[MiniProject] ", "[决策] ", "[成果] "]);
});

test("the predicted intermediate content is exact so explicit sync can suppress only the unfinished prefix", () => {
  assert.equal(slashCreateContentAfterInsertion("", 0, "TASK"), "[任务] ");
  assert.equal(slashCreateContentAfterInsertion("TODO ", 5, "MINI_PROJECT"), "TODO [MiniProject] ");
  assert.equal(slashCreateContentAfterInsertion("前 后", 1, "DECISION"), "前[决策]  后");
  assert.throws(() => slashCreateContentAfterInsertion("正文", 3, "OUTPUT"), /valid editing cursor/);
});

test("slash creation propagates an editor failure and never falls back to another write path", async () => {
  let attempts = 0;
  await assert.rejects(
    () => insertSlashCreateSyntax({
      insertAtEditingCursor: async () => {
        attempts += 1;
        throw new Error("editing cursor unavailable");
      },
    }, "TASK"),
    /editing cursor unavailable/,
  );
  assert.equal(attempts, 1);
});
