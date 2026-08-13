import assert from "node:assert/strict";
import test from "node:test";

import { ensurePersistentSourceIdentity } from "../src/source-identity.ts";

test("file-graph formalization persists the native id without changing canonical natural content", async () => {
  const uuid = "11111111-1111-4111-8111-111111111111";
  const block: Record<string, unknown> = { uuid, title: "TODO 自然记录", properties: {} };
  const result = await ensurePersistentSourceIdentity({
    getBlock: async () => block,
    upsertBlockProperty: async (_uuid, key, value) => { (block.properties as Record<string, unknown>)[key] = value; block.title = `TODO 自然记录\nid:: ${value}`; },
  }, { uuid, content: "TODO 自然记录", isDbGraph: false });
  assert.deepEqual(result, { uuid, content: "TODO 自然记录" });
});

test("DB graph identity requires no textual property write", async () => {
  let writes = 0;
  await ensurePersistentSourceIdentity({
    getBlock: async () => ({ uuid: "source-01", title: "TODO 自然记录" }),
    upsertBlockProperty: async () => { writes += 1; },
  }, { uuid: "source-01", content: "TODO 自然记录", isDbGraph: true });
  assert.equal(writes, 0);
});

test("file-graph formalization fails closed when the id property was not persisted", async () => {
  await assert.rejects(ensurePersistentSourceIdentity({
    getBlock: async () => ({ uuid: "source-01", title: "TODO 自然记录", properties: {} }),
    upsertBlockProperty: async () => undefined,
  }, { uuid: "source-01", content: "TODO 自然记录", isDbGraph: false }), /LOGSEQ_SOURCE_IDENTITY_NOT_PERSISTED/u);
});
