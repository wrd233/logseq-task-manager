import type { ServiceGraphReadRequest, ServiceGraphReadResult } from "@task-copilot/service-client";

import { executeGraphReadRequest, type GraphReadBridgeHost } from "./graph-read-bridge.ts";

export interface GraphReadBridgeClient {
  claimGraphReadRequest(): Promise<ServiceGraphReadRequest | undefined>;
  completeGraphReadRequest(result: ServiceGraphReadResult): Promise<void>;
}

export interface GraphReadBridgeControllerOptions {
  onIssue?(code: string): void;
}

export class GraphReadBridgeController {
  private generation = 0;
  private active = false;

  constructor(
    private readonly host: GraphReadBridgeHost,
    private readonly options: GraphReadBridgeControllerOptions = {},
  ) {}

  start(client: GraphReadBridgeClient): void {
    const generation = ++this.generation;
    this.active = true;
    void this.run(client, generation);
  }

  stop(): void {
    this.active = false;
    this.generation += 1;
  }

  isActive(): boolean {
    return this.active;
  }

  private async run(client: GraphReadBridgeClient, generation: number): Promise<void> {
    while (this.active && generation === this.generation) {
      try {
        const request = await client.claimGraphReadRequest();
        if (!this.active || generation !== this.generation) {
          if (request) await client.completeGraphReadRequest({ requestId: request.requestId, status: "ERROR", errorCode: "GRAPH_READ_BRIDGE_RESTARTED", message: "Logseq Desktop 只读桥接正在重连；没有读取缓存或执行写入。" }).catch(() => undefined);
          return;
        }
        if (!request) continue;
        const result = await executeGraphReadRequest(request, this.host);
        await client.completeGraphReadRequest(result);
        if (!this.active || generation !== this.generation) return;
      } catch {
        if (!this.active || generation !== this.generation) return;
        this.stop();
        this.options.onIssue?.("GRAPH_READ_BRIDGE_TRANSPORT_FAILED");
        return;
      }
    }
  }
}
