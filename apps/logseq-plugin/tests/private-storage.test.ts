import assert from "node:assert/strict";
import test from "node:test";

import { readOptionalPrivateItem } from "../src/private-storage.ts";

test("an absent Desktop FileStorage descriptor permits the settings fallback", async () => {
  for (const missing of ["file not existed", new Error("file not existed")]) {
    assert.equal(await readOptionalPrivateItem({ getItem: async () => { throw missing; } }, "descriptor"), null);
  }
});

test("existing descriptor content and modern null results are preserved", async () => {
  for (const value of ["private descriptor", null]) {
    assert.equal(await readOptionalPrivateItem({ getItem: async () => value }, "descriptor"), value);
  }
});

test("storage permission and transport errors fail closed", async () => {
  for (const failure of [new Error("EACCES"), "rpc unavailable"]) {
    await assert.rejects(readOptionalPrivateItem({ getItem: async () => { throw failure; } }, "descriptor"), (error: unknown) => error === failure);
  }
});
