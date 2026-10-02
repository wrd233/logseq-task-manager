import test from "node:test";
import assert from "node:assert/strict";
import { desktopFiles } from "../src/host/desktop-files.ts";

test("Desktop missing-stat null is checked against the parent; unreadable existing paths never become absent", async () => {
  const original = globalThis.window;
  let present = false, readable = true, empty: unknown = null;
  Object.assign(globalThis, {window: {top: {apis: {doAction: async ([op]: string[]) => op === "stat" ? empty : readable ? present ? ["/materials/a.md"] : [] : null}}}});
  try {
    const io = desktopFiles(() => "/graph");
    await assert.rejects(io.stat!("/materials/a.md"), /ENOENT/);
    empty = {}; await assert.rejects(io.stat!("/materials/a.md"), /ENOENT/);
    present = true; await assert.rejects(io.stat!("/materials/a.md"), /文件状态不可用/);
    readable = false; await assert.rejects(io.stat!("/materials/a.md"), /文件状态不可用/);
  } finally { if (original) globalThis.window = original; else Reflect.deleteProperty(globalThis, "window"); }
});
