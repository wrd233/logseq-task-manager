import assert from "node:assert/strict";
import test from "node:test";

import { normalizeTextPromptValue } from "../src/text-prompt.ts";

test("text prompt values are trimmed, bounded, and fail closed when empty", () => {
  assert.equal(normalizeTextPromptValue("  bounded reason  "), "bounded reason");
  assert.equal(normalizeTextPromptValue("   "), null);
  assert.equal(normalizeTextPromptValue("abcd", 3), null);
});
