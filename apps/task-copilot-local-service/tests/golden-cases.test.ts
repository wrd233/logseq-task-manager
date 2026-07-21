import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

interface GoldenCase {
  id: string;
  category: string;
  input: string;
  expected: "PROPOSAL" | "NO_PROPOSAL";
  assertions: string[];
}

test("DeepSeek semantic fixture contains the 12 fixed, sanitized, non-empty golden categories", async () => {
  const file = new URL("./fixtures/deepseek-golden-cases.json", import.meta.url);
  const cases = JSON.parse(await readFile(file, "utf8")) as GoldenCase[];
  assert.equal(cases.length, 12);
  assert.deepEqual(cases.map((item) => item.id), Array.from({ length: 12 }, (_, index) => `DS-${String(index + 1).padStart(2, "0")}`));
  assert.equal(new Set(cases.map((item) => item.category)).size, 12);
  assert(cases.some((item) => item.expected === "NO_PROPOSAL"));
  for (const item of cases) {
    assert(item.input.trim());
    assert(item.assertions.length > 0);
  }
  const serialized = JSON.stringify(cases);
  assert.doesNotMatch(serialized, /Authorization|Bearer|API_KEY|@example\.|\b(?:\d{1,3}\.){3}\d{1,3}\b/i);
});
