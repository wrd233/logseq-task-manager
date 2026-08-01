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
        return { uuid, name: uuid === "page-origin" ? "renamed-origin" : `${uuid}-name` };
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
    pageName: "page-main-name",
  });
  assert.deepEqual(await controller.returnTo(token), { status: "RETURNED", label: "已回到原内容。" });
  assert.deepEqual(fake.events, ["scroll:page-main-name:block-origin", "push:page:page-main-name", "hide"]);
});

test("secondary-page Block origin preserves the sidebar instead of navigating the main page", async () => {
  const fake = host({ currentPageUuid: "page-main", blockPageUuid: "page-sidebar" });
  const controller = new OriginRouteController(fake.value);
  const token = await controller.captureBlock("block-sidebar");
  assert.equal(token.surface, "SECONDARY_PAGE");
  assert.deepEqual(await controller.returnTo(token), { status: "RETURNED", label: "已回到原内容。" });
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
  assert.deepEqual(await controller.returnTo(pageToken), { status: "RETURNED", label: "已回到原页面。" });
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
    label: "原内容已不可用；已关闭 Task Copilot，没有跳到其他位置。",
  });
  assert.deepEqual(fake.events, ["hide"]);
});

test("a persisted formal source target returns to the main Block even after the Project Page was deleted", async () => {
  const fake = host({ currentPageUuid: "page-after-deletion", blockPageUuid: "page-mini-project" });
  const controller = new OriginRouteController(fake.value);
  assert.deepEqual(await controller.returnToMainTarget({ kind: "BLOCK", externalId: "mini-project-root" }), {
    status: "RETURNED",
    label: "已回到来源内容。",
  });
  assert.deepEqual(fake.events, ["scroll:page-mini-project-name:mini-project-root", "push:page:page-mini-project-name", "hide"]);

  fake.events.length = 0;
  assert.deepEqual(await controller.returnToMainTarget({ kind: "PAGE", externalId: "page-origin" }), {
    status: "RETURNED",
    label: "已回到来源页面。",
  });
  assert.deepEqual(fake.events, ["push:page:renamed-origin", "hide"]);
});

test("reload resolution restores a broken UUID route to the Block page and anchor", async () => {
  const fake = host({ currentPageUuid: "broken-route" });
  const controller = new OriginRouteController({
    ...fake.value,
    getCurrentPage: async () => undefined,
    getPage: async (identity: unknown) => {
      const value = String(identity);
      if (value === "page-main-name" || value === "page-main") return { uuid: "page-main", name: "page-main-name" };
      return undefined;
    },
  });
  const token = {
    kind: "BLOCK" as const,
    surface: "MAIN_PAGE" as const,
    blockUuid: "block-origin",
    pageUuid: "page-main",
    pageName: "page-main-name",
  };
  assert.deepEqual(await controller.resolveAfterReload(token), { status: "RETURNED", label: "已回到来源内容。" });
  assert.deepEqual(fake.events, ["push:page:page-main-name", "scroll:page-main-name:block-origin"]);
});

test("reload resolution falls back to the page name when the Block is gone", async () => {
  const fake = host({ currentPageUuid: "broken-route" });
  const controller = new OriginRouteController({
    ...fake.value,
    getCurrentPage: async () => undefined,
    getBlock: async () => null,
    getPage: async (identity: unknown) => {
      const value = String(identity);
      if (value === "page-main-name" || value === "page-main") return { uuid: "page-main", name: "page-main-name" };
      return undefined;
    },
  });
  const token = {
    kind: "BLOCK" as const,
    surface: "MAIN_PAGE" as const,
    blockUuid: "missing",
    pageUuid: "page-main",
    pageName: "page-main-name",
  };
  assert.deepEqual(await controller.resolveAfterReload(token), {
    status: "RETURNED_PAGE_ONLY",
    label: "原内容已不可用；已回到它所在的页面。",
  });
  assert.deepEqual(fake.events, ["push:page:page-main-name"]);
});

test("reload resolution parks when the user is already on a real page", async () => {
  const fake = host({ currentPageUuid: "page-other" });
  const controller = new OriginRouteController(fake.value);
  const token = {
    kind: "BLOCK" as const,
    surface: "MAIN_PAGE" as const,
    blockUuid: "block-origin",
    pageUuid: "page-main",
    pageName: "page-main-name",
  };
  assert.deepEqual(await controller.resolveAfterReload(token), {
    status: "PARKED",
    label: "已保留返回现场；需要时仍可从 Task Copilot 返回原内容。",
  });
  assert.deepEqual(fake.events, []);
});

test("reload resolution restores the Block anchor when the user is already on the origin page", async () => {
  const fake = host({ currentPageUuid: "page-main" });
  const controller = new OriginRouteController(fake.value);
  const token = {
    kind: "BLOCK" as const,
    surface: "MAIN_PAGE" as const,
    blockUuid: "block-origin",
    pageUuid: "page-main",
    pageName: "page-main-name",
  };
  assert.deepEqual(await controller.resolveAfterReload(token), { status: "RETURNED", label: "已回到来源内容。" });
  assert.deepEqual(fake.events, ["scroll:page-main-name:block-origin"]);
});

test("reload resolution parks on the origin page when the Block itself is gone", async () => {
  const fake = host({ currentPageUuid: "page-main" });
  const controller = new OriginRouteController({
    ...fake.value,
    getBlock: async () => null,
  });
  const token = {
    kind: "BLOCK" as const,
    surface: "MAIN_PAGE" as const,
    blockUuid: "missing",
    pageUuid: "page-main",
    pageName: "page-main-name",
  };
  assert.deepEqual(await controller.resolveAfterReload(token), {
    status: "PARKED",
    label: "已保留返回现场；需要时仍可从 Task Copilot 返回原内容。",
  });
  assert.deepEqual(fake.events, []);
});

test("reload resolution reports an explicit unavailable fallback when nothing resolves", async () => {
  const fake = host({ currentPageUuid: "broken-route" });
  const controller = new OriginRouteController({
    ...fake.value,
    getCurrentPage: async () => undefined,
    getBlock: async () => null,
    getPage: async () => undefined,
  });
  const token = {
    kind: "BLOCK" as const,
    surface: "MAIN_PAGE" as const,
    blockUuid: "missing",
    pageUuid: "page-main",
    pageName: "old-page-name",
  };
  assert.deepEqual(await controller.resolveAfterReload(token), {
    status: "SOURCE_UNAVAILABLE",
    label: "原内容与所在页面都无法定位；可以尝试在知识库中搜索。",
  });
  assert.deepEqual(fake.events, []);
});

test("reload resolution restores a Page token by stable UUID then by name", async () => {
  const byName = host({ currentPageUuid: "broken-route" });
  const controllerByName = new OriginRouteController({
    ...byName.value,
    getCurrentPage: async () => undefined,
    getPage: async (identity: unknown) => {
      const value = String(identity);
      if (value === "page-name") return { uuid: "page-origin", name: "page-name" };
      return undefined;
    },
  });
  const pageToken = {
    kind: "PAGE" as const,
    surface: "MAIN_PAGE" as const,
    pageUuid: "page-origin",
    pageName: "page-name",
  };
  assert.deepEqual(await controllerByName.resolveAfterReload(pageToken), {
    status: "RETURNED_PAGE_ONLY",
    label: "原页面已改名或路由变化；已按名称回到原页面。",
  });
  assert.deepEqual(byName.events, ["push:page:page-name"]);

  const byUuid = host({ currentPageUuid: "broken-route" });
  const controllerByUuid = new OriginRouteController({
    ...byUuid.value,
    getCurrentPage: async () => undefined,
    getPage: async (identity: unknown) => {
      const value = String(identity);
      if (value === "page-origin") return { uuid: "page-origin", name: "renamed-origin" };
      return undefined;
    },
  });
  assert.deepEqual(await controllerByUuid.resolveAfterReload(pageToken), { status: "RETURNED", label: "已回到原页面。" });
  assert.deepEqual(byUuid.events, ["push:page:renamed-origin"]);
});
