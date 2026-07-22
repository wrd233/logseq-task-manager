import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { ServiceContextExportResult } from "@task-copilot/service-client";

import { writeContextPackage } from "../src/context-output.ts";

function result(path = "objects.json", content = "{\"formalFacts\":[]}\n"): ServiceContextExportResult {
  return {
    fingerprint: "f".repeat(64),
    contextPackage: {
      manifest: { schemaVersion: 1, generatedAt: "2026-07-21T08:00:00.000Z", scope: { kind: "object", id: "object-1" }, authority: "READ_ONLY_DERIVATIVE", formalFactsSource: "SQLITE", graphExcerptStatus: "NOT_INCLUDED", includedObjectCount: 1, files: [{ path, bytes: Buffer.byteLength(content), sha256: createHash("sha256").update(content).digest("hex") }] },
      files: { [path]: content },
    },
  };
}

test("Context output verifies every file, writes manifest last, and refuses overwrite or traversal", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-context-output-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const output = join(root, "context");
  await writeContextPackage(output, result());
  assert.equal(JSON.parse(await readFile(join(output, "objects.json"), "utf8")).formalFacts.length, 0);
  assert.equal(JSON.parse(await readFile(join(output, "manifest.json"), "utf8")).fingerprint, "f".repeat(64));
  assert.equal((await stat(output)).mode & 0o777, 0o700);
  assert.equal((await stat(join(output, "manifest.json"))).mode & 0o777, 0o600);
  await assert.rejects(() => writeContextPackage(output, result()), /exist/i);
  await assert.rejects(() => writeContextPackage(join(root, "escape"), result("../escape.json")), /unsafe path/);
  await assert.rejects(() => stat(join(root, "escape")));
});

test("Context output accepts canonical nested Skill paths while refusing unsafe components", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-copilot-context-skills-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const output = join(root, "context");
  await writeContextPackage(output, result("skills/design-project/SKILL.md", "# Design Project\n"));
  assert.equal(await readFile(join(output, "skills", "design-project", "SKILL.md"), "utf8"), "# Design Project\n");
  for (const [index, path] of ["/absolute.json", "skills//SKILL.md", "skills/./SKILL.md", "skills/../escape.json", "skills\\escape.json"].entries()) {
    await assert.rejects(() => writeContextPackage(join(root, `unsafe-${index}`), result(path)), /unsafe path/);
  }
});
