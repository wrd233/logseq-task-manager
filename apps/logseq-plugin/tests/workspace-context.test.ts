import test from "node:test";
import assert from "node:assert/strict";
import { PanelCoordinator, scopeKey } from "../src/workspace/context.ts";

test("switching panels awaits draft preservation and closes exactly the previous module", async () => {
  const panels = new PanelCoordinator(), events: string[] = [];
  panels.register("work", () => { events.push("close-work"); });
  panels.register("materials", async () => { await Promise.resolve(); events.push("save-materials"); });
  await panels.activate("work"); await panels.activate("work"); await panels.activate("materials"); await panels.activate("tasks");
  assert.deepEqual(events, ["close-work", "save-materials"]); assert.equal(panels.active, "tasks");
  panels.release("work"); assert.equal(panels.active, "tasks"); panels.release("tasks"); assert.equal(panels.active, null);
});
test("saved scope namespaces distinguish Graph and root without separator collisions", () => {
  assert.notEqual(scopeKey("a:b", "c"), scopeKey("a", "b:c"));
  assert.notEqual(scopeKey("graph-a", "root"), scopeKey("graph-b", "root"));
});

test("late task loads cannot revive a pane after a newer user navigation", async () => {
  const panels = new PanelCoordinator();
  const delayedTask = panels.reserve();
  const newerWork = panels.reserve();
  assert.equal(await panels.activate("work", newerWork), true);
  assert.equal(await panels.activate("tasks", delayedTask), false);
  assert.equal(panels.active, "work");
});
