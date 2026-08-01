import { RuntimeShapeAdapter, resolveLogseqPageReference } from "@task-copilot/logseq-adapter";

export type OriginSurface = "MAIN_PAGE" | "SECONDARY_PAGE";

export type OriginRouteToken =
  | {
    kind: "BLOCK";
    surface: OriginSurface;
    blockUuid: string;
    pageUuid: string;
    pageName: string;
  }
  | {
    kind: "PAGE";
    surface: OriginSurface;
    pageUuid: string;
    pageName: string;
  };

export type OriginReturnTarget =
  | { kind: "BLOCK"; externalId: string }
  | { kind: "PAGE"; externalId: string };

export interface OriginRouteHost {
  getCurrentPage(): Promise<unknown>;
  getPage(identity: unknown): Promise<unknown>;
  getBlock(uuid: string): Promise<unknown>;
  scrollToBlockInPage?(page: string, blockUuid: string): Promise<unknown>;
  pushState(route: "page", parameters: { name: string }): unknown;
  hideMainUI(): unknown;
}

export interface OriginReturnResult {
  status: "RETURNED" | "SOURCE_UNAVAILABLE";
  label: string;
}

export type DurableOriginResolveResult =
  | { status: "RETURNED"; label: string }
  | { status: "RETURNED_PAGE_ONLY"; label: string }
  | { status: "PARKED"; label: string }
  | { status: "SOURCE_UNAVAILABLE"; label: string };

async function resolvePage(host: OriginRouteHost, value: unknown): Promise<{ pageUuid: string; pageName: string } | undefined> {
  const page = await resolveLogseqPageReference(value, (identity) => host.getPage(identity));
  const pageName = page.originalName ?? page.pageName ?? (page.displayName === "无法解析的 Logseq 页面" ? undefined : page.displayName.replace(" · Journal", ""));
  return page.pageUuid && pageName ? { pageUuid: page.pageUuid, pageName } : undefined;
}

export class OriginRouteController {
  constructor(private readonly host: OriginRouteHost) {}

  async captureBlock(blockUuid: string): Promise<OriginRouteToken> {
    const block = RuntimeShapeAdapter.block(await this.host.getBlock(blockUuid));
    if (!block || block.uuid !== blockUuid || block.page === undefined) {
      throw new Error("当前 Block 来源不可用；没有打开 Task Copilot 路由。");
    }
    const [blockPage, currentPage] = await Promise.all([
      resolvePage(this.host, block.page),
      resolvePage(this.host, await this.host.getCurrentPage()),
    ]);
    if (!blockPage) throw new Error("当前 Block 所在 Page 无法解析；没有打开 Task Copilot 路由。");
    return {
      kind: "BLOCK",
      surface: currentPage?.pageUuid === blockPage.pageUuid ? "MAIN_PAGE" : "SECONDARY_PAGE",
      blockUuid,
      ...blockPage,
    };
  }

  capturePage(input: { originSurface: OriginSurface; pageUuid: string; pageName: string }): OriginRouteToken {
    return {
      kind: "PAGE",
      surface: input.originSurface,
      pageUuid: input.pageUuid,
      pageName: input.pageName,
    };
  }

  async returnToMainTarget(target: OriginReturnTarget): Promise<OriginReturnResult> {
    try {
      if (target.kind === "BLOCK") {
        const token = await this.captureBlock(target.externalId);
        const result = await this.returnTo({ ...token, surface: "MAIN_PAGE" });
        return result.status === "RETURNED"
          ? { ...result, label: "已回到来源内容。" }
          : result;
      }
      const page = await resolvePage(this.host, await this.host.getPage(target.externalId));
      if (!page) {
        this.host.hideMainUI();
        return {
          status: "SOURCE_UNAVAILABLE",
          label: "来源页面已不可用；已关闭 Task Copilot，没有跳到其他位置。",
        };
      }
      const result = await this.returnTo({
        kind: "PAGE",
        surface: "MAIN_PAGE",
        pageUuid: page.pageUuid,
        pageName: page.pageName,
      });
      return result.status === "RETURNED"
        ? { ...result, label: "已回到来源页面。" }
        : result;
    } catch {
      this.host.hideMainUI();
      return {
        status: "SOURCE_UNAVAILABLE",
        label: `来源${target.kind === "BLOCK" ? "内容" : "页面"}暂时无法定位；已关闭 Task Copilot，没有跳到其他位置。`,
      };
    }
  }

  async returnTo(token: OriginRouteToken): Promise<OriginReturnResult> {
    try {
      if (token.kind === "BLOCK") {
        const block = RuntimeShapeAdapter.block(await this.host.getBlock(token.blockUuid));
        if (!block || block.uuid !== token.blockUuid || block.page === undefined) {
          return {
            status: "SOURCE_UNAVAILABLE",
            label: "原内容已不可用；已关闭 Task Copilot，没有跳到其他位置。",
          };
        }
        const currentBlockPage = await resolvePage(this.host, block.page);
        if (!currentBlockPage) {
          return {
            status: "SOURCE_UNAVAILABLE",
            label: "原内容所在页面已不可用；已关闭 Task Copilot，没有跳到其他位置。",
          };
        }
        if (token.surface === "MAIN_PAGE") {
          if (!this.host.scrollToBlockInPage) {
            return {
              status: "SOURCE_UNAVAILABLE",
              label: "当前 Logseq 不能定位原内容；已关闭 Task Copilot，没有跳到其他位置。",
            };
          }
          await this.host.scrollToBlockInPage(currentBlockPage.pageName, token.blockUuid);
          this.host.pushState("page", { name: currentBlockPage.pageName });
        }
        return { status: "RETURNED", label: "已回到原内容。" };
      }

      const page = await resolvePage(this.host, await this.host.getPage(token.pageUuid));
      if (!page || page.pageUuid !== token.pageUuid) {
        return {
          status: "SOURCE_UNAVAILABLE",
          label: "原页面已不可用；已关闭 Task Copilot，没有跳到其他位置。",
        };
      }
      if (token.surface === "MAIN_PAGE") {
        const currentPage = await resolvePage(this.host, await this.host.getCurrentPage());
        if (currentPage?.pageUuid !== token.pageUuid) this.host.pushState("page", { name: page.pageName });
      }
      return { status: "RETURNED", label: "已回到原页面。" };
    } catch {
      return {
        status: "SOURCE_UNAVAILABLE",
        label: `原${token.kind === "BLOCK" ? "内容" : "页面"}暂时无法定位；已关闭 Task Copilot，没有跳到其他位置。`,
      };
    } finally {
      this.host.hideMainUI();
    }
  }

  async resolveAfterReload(token: OriginRouteToken): Promise<DurableOriginResolveResult> {
    const currentPage = await resolvePage(this.host, await this.host.getCurrentPage());
    if (currentPage) {
      const samePageByName = Boolean(
        currentPage.pageName
        && token.pageName
        && currentPage.pageName.trim().toLowerCase() === token.pageName.trim().toLowerCase(),
      );
      if (
        token.kind === "BLOCK"
        && token.surface === "MAIN_PAGE"
        && (currentPage.pageUuid === token.pageUuid || samePageByName)
        && this.host.scrollToBlockInPage
      ) {
        const block = RuntimeShapeAdapter.block(await this.host.getBlock(token.blockUuid));
        if (block && block.uuid === token.blockUuid && block.page !== undefined) {
          const blockPage = await resolvePage(this.host, block.page);
          if (blockPage) {
            await this.host.scrollToBlockInPage(blockPage.pageName, token.blockUuid);
            return { status: "RETURNED", label: "已回到来源内容。" };
          }
        }
      }
      return {
        status: "PARKED",
        label: "已保留返回现场；需要时仍可从 Task Copilot 返回原内容。",
      };
    }

    if (token.kind === "BLOCK") {
      const block = RuntimeShapeAdapter.block(await this.host.getBlock(token.blockUuid));
      if (block && block.uuid === token.blockUuid && block.page !== undefined) {
        const blockPage = await resolvePage(this.host, block.page);
        if (blockPage && token.surface === "MAIN_PAGE") {
          if (!this.host.scrollToBlockInPage) {
            return {
              status: "SOURCE_UNAVAILABLE",
              label: "当前 Logseq 不能定位原内容；可以尝试手动打开来源页面。",
            };
          }
          await this.host.pushState("page", { name: blockPage.pageName });
          await this.host.scrollToBlockInPage(blockPage.pageName, token.blockUuid);
          return { status: "RETURNED", label: "已回到来源内容。" };
        }
        if (blockPage) return { status: "RETURNED", label: "已回到来源内容。" };
      }
      const pageByName = await resolvePage(this.host, await this.host.getPage(token.pageName));
      if (pageByName) {
        await this.host.pushState("page", { name: pageByName.pageName });
        return {
          status: "RETURNED_PAGE_ONLY",
          label: "原内容已不可用；已回到它所在的页面。",
        };
      }
      return {
        status: "SOURCE_UNAVAILABLE",
        label: "原内容与所在页面都无法定位；可以尝试在知识库中搜索。",
      };
    }

    const pageByUuid = await resolvePage(this.host, await this.host.getPage(token.pageUuid));
    if (pageByUuid && pageByUuid.pageUuid === token.pageUuid) {
      if (token.surface === "MAIN_PAGE") await this.host.pushState("page", { name: pageByUuid.pageName });
      return { status: "RETURNED", label: "已回到原页面。" };
    }
    const pageByName = await resolvePage(this.host, await this.host.getPage(token.pageName));
    if (pageByName) {
      if (token.surface === "MAIN_PAGE") await this.host.pushState("page", { name: pageByName.pageName });
      return {
        status: "RETURNED_PAGE_ONLY",
        label: "原页面已改名或路由变化；已按名称回到原页面。",
      };
    }
    return {
      status: "SOURCE_UNAVAILABLE",
      label: "原页面无法定位；可以尝试在知识库中搜索。",
    };
  }
}
