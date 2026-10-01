import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { isOwnedSandboxProcess, sandboxPaths } from "./logseq-sandbox.mjs";

test("production Logseq and normal Kernel commands are never owned by the sandbox", () => {
  assert.equal(isOwnedSandboxProcess("/Applications/Logseq 2.app/Contents/MacOS/Logseq"), false);
  assert.equal(isOwnedSandboxProcess("node --import tsx apps/kernel-service/src/main.ts"), false);
});
test("a copied application without its isolated profile is refused", () => {
  const binary = join(sandboxPaths.app, "Contents/MacOS/Logseq");
  assert.equal(isOwnedSandboxProcess(binary), false);
  assert.equal(isOwnedSandboxProcess(`${binary} --user-data-dir=/Users/mac/Library/Application Support/Logseq`), false);
});
test("only the copied application with the isolated profile is owned", () => {
  assert.equal(isOwnedSandboxProcess(`${join(sandboxPaths.app, "Contents/MacOS/Logseq")} --user-data-dir=${sandboxPaths.profile} --remote-debugging-port=19333`), true);
});
test("Kernel ownership requires both the unique sandbox runner and its loader", () => {
  assert.equal(isOwnedSandboxProcess(`node --import tsx ${join(sandboxPaths.root, "kernel-runner.mjs")}`), true);
  assert.equal(isOwnedSandboxProcess(`node ${join(sandboxPaths.root, "kernel-runner.mjs")}`), false);
});
test("similar profile and runner names cannot pass process ownership checks", () => {
  const binary = join(sandboxPaths.app, "Contents/MacOS/Logseq");
  assert.equal(isOwnedSandboxProcess(`${binary} --user-data-dir=${sandboxPaths.profile}-production`), false);
  assert.equal(isOwnedSandboxProcess(`${binary}-other --user-data-dir=${sandboxPaths.profile}`), false);
  assert.equal(isOwnedSandboxProcess(`node --import tsx ${join(sandboxPaths.root, "kernel-runner.mjs")}-other`), false);
});
