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

  async returnTo(token: OriginRouteToken): Promise<OriginReturnResult> {
    try {
      if (token.kind === "BLOCK") {
        const block = RuntimeShapeAdapter.block(await this.host.getBlock(token.blockUuid));
        if (!block || block.uuid !== token.blockUuid || block.page === undefined) {
          return {
            status: "SOURCE_UNAVAILABLE",
            label: "原 Block 已不可用；已关闭 Task Copilot，未执行其他导航。",
          };
        }
        const currentBlockPage = await resolvePage(this.host, block.page);
        if (!currentBlockPage) {
          return {
            status: "SOURCE_UNAVAILABLE",
            label: "原 Block 所在 Page 已不可用；已关闭 Task Copilot，未执行其他导航。",
          };
        }
        if (token.surface === "MAIN_PAGE") {
          if (!this.host.scrollToBlockInPage) {
            return {
              status: "SOURCE_UNAVAILABLE",
              label: "当前 Logseq 不能定位原 Block；已关闭 Task Copilot，未执行其他导航。",
            };
          }
          await this.host.scrollToBlockInPage(currentBlockPage.pageUuid, token.blockUuid);
        }
        return { status: "RETURNED", label: "已返回原 Block。" };
      }

      const page = await resolvePage(this.host, await this.host.getPage(token.pageUuid));
      if (!page || page.pageUuid !== token.pageUuid) {
        return {
          status: "SOURCE_UNAVAILABLE",
          label: "原 Page 已不可用；已关闭 Task Copilot，未执行其他导航。",
        };
      }
      if (token.surface === "MAIN_PAGE") {
        const currentPage = await resolvePage(this.host, await this.host.getCurrentPage());
        if (currentPage?.pageUuid !== token.pageUuid) this.host.pushState("page", { name: page.pageName });
      }
      return { status: "RETURNED", label: "已返回原 Page。" };
    } catch {
      return {
        status: "SOURCE_UNAVAILABLE",
        label: `原${token.kind === "BLOCK" ? " Block" : " Page"} 暂时无法定位；已关闭 Task Copilot，未执行其他导航。`,
      };
    } finally {
      this.host.hideMainUI();
    }
  }
}
