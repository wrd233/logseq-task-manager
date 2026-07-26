import assert from "node:assert/strict";
import test from "node:test";

import {
  MODEL_PROJECT_REENTRY,
  PROJECT_PAGE_HEAD_UI_KEY,
  ProjectPageHeadActionController,
  renderProjectPageHeadAction,
} from "../src/project-page-head-action.ts";

test("Project Page head action is compact, identity-free, and escapes the accessible label", () => {
  const html = renderProjectPageHeadAction({ projectText: '交付 <V2> "安全"' });
  assert.match(html, new RegExp(`data-on-click="${MODEL_PROJECT_REENTRY}"`));
  assert.match(html, />继续项目</);
  assert.match(html, /交付 &lt;V2&gt; &quot;安全&quot;/);
  assert.doesNotMatch(html, /objectId|pageUuid|anchorId|data-value/);
});

test("slot controller shares one resolution, hides unavailable pages, and removes stale slots", async () => {
  const provided: Array<{ key: string; slot: string; template: string | null }> = [];
  const valid = new Set(["main", "sidebar"]);
  let available = true;
  let resolutions = 0;
  const issues: unknown[] = [];
  const controller = new ProjectPageHeadActionController({
    checkSlotValid: async (slot) => valid.has(slot),
    provideUi: (input) => { provided.push(input); },
  }, {
    available: () => available,
    resolveCurrentProject: async () => {
      resolutions += 1;
      await Promise.resolve();
      return { projectText: "Task Copilot V2" };
    },
    onIssue: (error) => { issues.push(error); },
  });

  controller.observe("main");
  controller.observe("sidebar");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(resolutions, 1);
  assert.equal(provided.filter(({ template }) => template !== null).length, 2);
  assert.equal(provided.every(({ key }) => key === PROJECT_PAGE_HEAD_UI_KEY), true);

  available = false;
  await controller.refreshAll();
  assert.deepEqual(provided.slice(-2).map(({ template }) => template), [null, null]);

  valid.delete("sidebar");
  available = true;
  await controller.refreshAll();
  assert.equal(provided.at(-1)?.slot, "main");
  assert.equal(issues.length, 0);
});

test("slot controller fails closed and never leaves an old action after resolution failure", async () => {
  const provided: Array<{ template: string | null }> = [];
  const issues: unknown[] = [];
  const controller = new ProjectPageHeadActionController({
    checkSlotValid: async () => true,
    provideUi: (input) => { provided.push(input); },
  }, {
    available: () => true,
    resolveCurrentProject: async () => { throw new Error("ambiguous Project"); },
    onIssue: (error) => { issues.push(error); },
  });

  controller.observe("main");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(provided.at(-1)?.template, null);
  assert.equal(issues.length, 1);
});

test("slot controller retains a host slot that becomes valid after the slotted callback", async () => {
  const provided: Array<{ template: string | null }> = [];
  let valid = false;
  const controller = new ProjectPageHeadActionController({
    checkSlotValid: async () => valid,
    provideUi: (input) => { provided.push(input); },
  }, {
    available: () => true,
    resolveCurrentProject: async () => ({ projectText: "Task Copilot V2" }),
    onIssue: assert.fail,
  });

  controller.observe("main");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(provided.length, 0);

  valid = true;
  await controller.refreshAll();
  assert.match(provided.at(-1)?.template ?? "", />继续项目</);
});

test("slot controller coalesces route bursts and only renders the latest resolution", async () => {
  const provided: Array<{ template: string | null }> = [];
  let releaseFirst: (() => void) | undefined;
  let calls = 0;
  let active = 0;
  let maximumActive = 0;
  const controller = new ProjectPageHeadActionController({
    checkSlotValid: async () => true,
    provideUi: (input) => { provided.push(input); },
  }, {
    available: () => true,
    resolveCurrentProject: async () => {
      calls += 1;
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      if (calls === 1) await new Promise<void>((resolve) => { releaseFirst = resolve; });
      active -= 1;
      return { projectText: calls === 1 ? "旧项目" : "最新项目" };
    },
    onIssue: assert.fail,
  });

  controller.observe("main");
  await new Promise((resolve) => setTimeout(resolve, 0));
  const second = controller.refreshAll();
  const third = controller.refreshAll();
  releaseFirst?.();
  await Promise.all([second, third]);

  assert.equal(maximumActive, 1);
  assert.equal(calls, 2);
  assert.equal(provided.length, 1);
  assert.match(provided[0]?.template ?? "", /最新项目/);
});

test("slot cleanup isolates invalid host slots so unload can continue", async () => {
  const cleared: string[] = [];
  const issues: unknown[] = [];
  const controller = new ProjectPageHeadActionController({
    checkSlotValid: async () => true,
    provideUi: ({ slot, template }) => {
      if (template === null && slot === "invalid") throw new Error("slot expired");
      if (template === null) cleared.push(slot);
    },
  }, {
    available: () => true,
    resolveCurrentProject: async () => ({ projectText: "Task Copilot V2" }),
    onIssue: (error) => { issues.push(error); },
  });

  controller.observe("invalid");
  controller.observe("valid");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.doesNotThrow(() => controller.clear());
  assert.deepEqual(cleared, ["valid"]);
  assert.equal(issues.length, 1);
});
