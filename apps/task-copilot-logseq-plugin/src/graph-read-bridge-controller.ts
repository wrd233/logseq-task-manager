import type { ServiceGraphReadRequest, ServiceGraphReadResult } from "@task-copilot/service-client";

import { executeGraphReadRequest, type GraphReadBridgeHost } from "./graph-read-bridge.ts";

export interface GraphReadBridgeClient {
  claimGraphReadRequest(): Promise<ServiceGraphReadRequest | undefined>;
  completeGraphReadRequest(result: ServiceGraphReadResult): Promise<void>;
}

export interface GraphReadBridgeControllerOptions {
  onIssue?(code: string): void;
  staleBridgeRetryDelayMs?: number;
  maximumStaleBridgeRetries?: number;
  delay?(milliseconds: number): Promise<void>;
}

function remoteErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const details = (error as { details?: unknown }).details;
  if (!details || typeof details !== "object") return undefined;
  const code = (details as { remoteCode?: unknown }).remoteCode;
  return typeof code === "string" ? code : undefined;
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
    let staleBridgeRetries = 0;
    while (this.active && generation === this.generation) {
      try {
        const request = await client.claimGraphReadRequest();
        staleBridgeRetries = 0;
        if (!this.active || generation !== this.generation) {
          if (request) await client.completeGraphReadRequest({ requestId: request.requestId, status: "ERROR", errorCode: "GRAPH_READ_BRIDGE_RESTARTED", message: "Logseq Desktop 只读桥接正在重连；没有读取缓存或执行写入。" }).catch(() => undefined);
          return;
        }
        if (!request) continue;
        const result = await executeGraphReadRequest(request, this.host);
        await client.completeGraphReadRequest(result);
        if (!this.active || generation !== this.generation) return;
      } catch (error) {
        if (!this.active || generation !== this.generation) return;
        if (
          remoteErrorCode(error) === "GRAPH_READ_BRIDGE_ALREADY_CONNECTED"
          && staleBridgeRetries < (this.options.maximumStaleBridgeRetries ?? 20)
        ) {
          staleBridgeRetries += 1;
          await (this.options.delay ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))))(
            this.options.staleBridgeRetryDelayMs ?? 1_000,
          );
          continue;
        }
        this.stop();
        this.options.onIssue?.("GRAPH_READ_BRIDGE_TRANSPORT_FAILED");
        return;
      }
    }
  }
}
