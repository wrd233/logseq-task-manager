import assert from "node:assert/strict";
import test from "node:test";

import { OriginRouteController } from "../src/origin-route-controller.ts";

function host(options: { currentPageUuid?: string; blockPageUuid?: string } = {}) {
  const currentPageUuid = options.currentPageUuid ?? "page-main";
  const blockPageUuid = options.blockPageUuid ?? "page-main";
  const events: string[] = [];
  return {
    events,
    value: {
      getCurrentPage: async () => ({ uuid: currentPageUuid, name: currentPageUuid }),
      getPage: async (identity: unknown) => {
        const uuid = String(identity);
        return { uuid, name: uuid === "page-origin" ? "renamed-origin" : uuid };
      },
      getBlock: async (uuid: string) => uuid === "missing"
        ? null
        : { uuid, content: "[任务] 来源", page: { uuid: blockPageUuid } },
      scrollToBlockInPage: async (page: string, block: string) => { events.push(`scroll:${page}:${block}`); },
      pushState: (route: "page", parameters: { name: string }) => { events.push(`push:${route}:${parameters.name}`); },
      hideMainUI: () => { events.push("hide"); },
    },
  };
}

test("main-page Block origin revalidates its UUID, scrolls to the current page identity, and hides the overlay", async () => {
  const fake = host();
  const controller = new OriginRouteController(fake.value);
  const token = await controller.captureBlock("block-origin");
  assert.deepEqual(token, {
    kind: "BLOCK",
    surface: "MAIN_PAGE",
    blockUuid: "block-origin",
    pageUuid: "page-main",
    pageName: "page-main",
  });
  assert.deepEqual(await controller.returnTo(token), { status: "RETURNED", label: "已返回原 Block。" });
  assert.deepEqual(fake.events, ["scroll:page-main:block-origin", "hide"]);
});

test("secondary-page Block origin preserves the sidebar instead of navigating the main page", async () => {
  const fake = host({ currentPageUuid: "page-main", blockPageUuid: "page-sidebar" });
  const controller = new OriginRouteController(fake.value);
  const token = await controller.captureBlock("block-sidebar");
  assert.equal(token.surface, "SECONDARY_PAGE");
  assert.deepEqual(await controller.returnTo(token), { status: "RETURNED", label: "已返回原 Block。" });
  assert.deepEqual(fake.events, ["hide"]);
});

test("main Page origin follows its stable UUID after a rename while a missing Block still closes safely", async () => {
  const fake = host({ currentPageUuid: "page-other" });
  const controller = new OriginRouteController(fake.value);
  const pageToken = {
    kind: "PAGE" as const,
    surface: "MAIN_PAGE" as const,
    pageUuid: "page-origin",
    pageName: "old-origin",
  };
  assert.deepEqual(await controller.returnTo(pageToken), { status: "RETURNED", label: "已返回原 Page。" });
  assert.deepEqual(fake.events, ["push:page:renamed-origin", "hide"]);

  fake.events.length = 0;
  const missing = {
    kind: "BLOCK" as const,
    surface: "MAIN_PAGE" as const,
    blockUuid: "missing",
    pageUuid: "page-main",
    pageName: "page-main",
  };
  assert.deepEqual(await controller.returnTo(missing), {
    status: "SOURCE_UNAVAILABLE",
    label: "原 Block 已不可用；已关闭 Task Copilot，未执行其他导航。",
  });
  assert.deepEqual(fake.events, ["hide"]);
});

test("a persisted formal source target returns to the main Block even after the Project Page was deleted", async () => {
  const fake = host({ currentPageUuid: "page-after-deletion", blockPageUuid: "page-mini-project" });
  const controller = new OriginRouteController(fake.value);
  assert.deepEqual(await controller.returnToMainTarget({ kind: "BLOCK", externalId: "mini-project-root" }), {
    status: "RETURNED",
    label: "已返回来源 Block。",
  });
  assert.deepEqual(fake.events, ["scroll:page-mini-project:mini-project-root", "hide"]);

  fake.events.length = 0;
  assert.deepEqual(await controller.returnToMainTarget({ kind: "PAGE", externalId: "page-origin" }), {
    status: "RETURNED",
    label: "已返回来源 Page。",
  });
  assert.deepEqual(fake.events, ["push:page:renamed-origin", "hide"]);
});
