import test from "node:test";
import assert from "node:assert/strict";
import { PanelCoordinator } from "../src/workspace/context.ts";

test("panel lifecycle distinguishes temporary navigation from explicit close without moving feature state into the coordinator", async () => {
  const panels = new PanelCoordinator(), reasons: string[] = [];
  panels.register("work", reason => { reasons.push("work:" + reason); });
  panels.register("materials", reason => { reasons.push("materials:" + reason); });
  await panels.activate("work"); await panels.activate("materials"); await panels.closeActive();
  assert.deepEqual(reasons, ["work:switch", "materials:close"]);
  assert.equal(panels.active, null);
});
