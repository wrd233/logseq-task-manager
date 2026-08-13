import assert from "node:assert/strict";
import test from "node:test";

import { registerOnlineDoneMarkerCommand } from "../src/marker-command.ts";

test("online marker observer coalesces DONE for one block and ignores every other Graph change", async () => {
  let callback: ((event: { blocks?: readonly { uuid?: unknown; content?: unknown }[] }) => void) | null = null; const handled: string[] = []; const errors: unknown[] = [];
  const off = registerOnlineDoneMarkerCommand({ onChanged: (value) => { callback = value; return () => undefined; } }, async (uuid) => { handled.push(uuid); }, (error) => errors.push(error), 0);
  callback!({ blocks: [{ uuid: "task-01", content: "TODO 未完成" }, { uuid: "note", content: "普通 note" }, { uuid: "task-01", content: "DONE 已完成" }, { uuid: "task-01", content: "DONE 已完成" }] });
  await new Promise((resolve) => setTimeout(resolve, 10)); off();
  assert.deepEqual(handled, ["task-01"]); assert.deepEqual(errors, []);
});
