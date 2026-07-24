import {
  RuntimeShapeAdapter,
  stripLogseqBlockIdentityProperty,
} from "@task-copilot/logseq-adapter";

export interface SelectedBlockAnalysisHost {
  getBlock(uuid: string, options: { includeChildren: boolean }): Promise<unknown>;
}

export interface SelectedBlockAnalysisInput {
  blockUuid: string;
  text: string;
}

export class SelectedBlockAnalysisTarget {
  private blockUuid: string | undefined;

  bind(blockUuid: string): void {
    this.blockUuid = blockUuid;
  }

  consume(): string | undefined {
    const blockUuid = this.blockUuid;
    this.blockUuid = undefined;
    return blockUuid;
  }

  clear(): void {
    this.blockUuid = undefined;
  }
}

export async function readSelectedBlockForAnalysis(
  host: SelectedBlockAnalysisHost,
  blockUuid: string,
): Promise<SelectedBlockAnalysisInput> {
  const block = RuntimeShapeAdapter.block(await host.getBlock(blockUuid, { includeChildren: false }));
  if (!block) {
    throw new Error("原 Block 已不存在或当前宿主无法读取；没有调用 Provider。");
  }
  if (block.uuid !== blockUuid) {
    throw new Error("Logseq 返回了另一个 Block；为避免误处理，已取消本次分析。");
  }
  const text = stripLogseqBlockIdentityProperty(block.content, block.uuid).trim();
  if (!text) {
    throw new Error("原 Block 没有可分析的正文；没有调用 Provider。");
  }
  return { blockUuid: block.uuid, text };
}
