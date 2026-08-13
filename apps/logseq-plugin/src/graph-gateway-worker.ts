import { canonicalizeGraphContent, stableHash, type GraphBlockRead, type GraphGatewayRequestEnvelope, type GraphGatewayResponse } from "@task-copilot/contracts";
import type { PluginKernelDescriptor } from "@task-copilot/client/browser";

import type { LogseqGraphAdapter } from "./graph-adapter.ts";

export interface GraphGatewayReadHost {
  search(query: string, limit: number): Promise<Array<{ uuid: string; content: string; pageName: string | null }>>;
  readBlock(uuid: string): Promise<{ uuid: string; content: string; pageName: string | null } | null>;
  readPage(pageName: string): Promise<Array<{ uuid: string; content: string; pageName: string | null }> | null>;
}

function block(graphId: string, value: { uuid: string; content: string; pageName: string | null }): GraphBlockRead {
  const content = canonicalizeGraphContent(value.content);
  return { graphId, blockUuid: value.uuid, pageName: value.pageName, content, contentHash: stableHash(content) };
}

export async function handleGraphGatewayRequest(input: { envelope: GraphGatewayRequestEnvelope; graphId: string; adapter: LogseqGraphAdapter; readHost: GraphGatewayReadHost; graphSnapshotKey: string }): Promise<GraphGatewayResponse> {
  const { request } = input.envelope;
  const requestedGraphId = request.kind === "READ_TARGET_SNAPSHOT" ? request.input.graphId : request.kind === "APPLY_EFFECT" ? request.effect.graphId : request.kind === "APPLY_CURATION" ? request.curation.graphId : request.graphId;
  if (requestedGraphId !== input.graphId) throw new Error("GRAPH_ID_MISMATCH");
  if (request.kind === "SEARCH") {
    const values = await input.readHost.search(request.query, request.limit);
    return { kind: "SEARCH", matches: values.slice(0, request.limit).map((value) => { const item = block(input.graphId, value); return { graphId: item.graphId, blockUuid: item.blockUuid, pageName: item.pageName, snippet: item.content.slice(0, 240), contentHash: item.contentHash }; }) };
  }
  if (request.kind === "READ_BLOCK") {
    const value = await input.readHost.readBlock(request.blockUuid); if (!value) throw new Error("GRAPH_BLOCK_NOT_FOUND");
    return { kind: "READ_BLOCK", block: block(input.graphId, value) };
  }
  if (request.kind === "READ_PAGE") {
    const values = await input.readHost.readPage(request.pageName); if (!values) throw new Error("GRAPH_PAGE_NOT_FOUND");
    return { kind: "READ_PAGE", page: { graphId: input.graphId, pageName: request.pageName, blocks: values.slice(0, request.limit).map((value) => block(input.graphId, value)), truncated: values.length > request.limit } };
  }
  if (request.kind === "READ_EVIDENCE") return { kind: "READ_EVIDENCE", material: await input.adapter.readEvidenceMaterial({ graphId: request.graphId, blockUuid: request.blockUuid }, input.graphSnapshotKey) };
  if (request.kind === "READ_TARGET_SNAPSHOT") return { kind: "READ_TARGET_SNAPSHOT", snapshot: await input.adapter.readGraphSnapshot(request.input) };
  if (request.kind === "READ_CURATION_SNAPSHOT") return { kind: "READ_CURATION_SNAPSHOT", snapshot: await input.adapter.readNaturalCurationSnapshot({ graphId: request.graphId, rootBlockUuid: request.rootBlockUuid }) };
  if (request.kind === "APPLY_CURATION") {
    const applied = await input.adapter.applyAddReferenceCuration(request.curation);
    return { kind: "APPLY_CURATION", ...applied };
  }
  const effect = request.effect;
  const result = await input.adapter.applyGraphEffect(effect);
  let snapshot;
  if (effect.type === "REMOVE_MANAGED_PROJECTION") {
    if (!effect.expectedProjection) throw new Error("GRAPH_EXPECTED_PROJECTION_REQUIRED");
    snapshot = await input.adapter.readRemovedProjectionSnapshot({ graphId: effect.graphId, sourceBlockUuid: effect.sourceBlockUuid, expectedProjection: effect.expectedProjection });
  } else {
    const expected = effect.type === "UPSERT_MANAGED_PROJECTION" ? effect.projection : effect.resultingProjection;
    if (!expected) throw new Error("GRAPH_RESULTING_PROJECTION_REQUIRED");
    snapshot = await input.adapter.readGraphSnapshot({ graphId: effect.graphId, sourceBlockUuid: effect.sourceBlockUuid, expectedProjection: expected });
  }
  return { kind: "APPLY_EFFECT", result, snapshot };
}

async function post(descriptor: PluginKernelDescriptor, path: string, value: unknown): Promise<Response> {
  return fetch(`${descriptor.baseUrl}${path}`, { method: "POST", headers: { "content-type": "application/json", "x-task-copilot-graph-bridge": descriptor.graphBridgeToken }, body: JSON.stringify(value) });
}

export function startGraphGatewayWorker(options: { connection: () => Promise<{ descriptor: PluginKernelDescriptor; graphId: string; adapter: LogseqGraphAdapter; readHost: GraphGatewayReadHost }>; intervalMs?: number; onError?: (error: unknown) => void }): () => void {
  let stopped = false; let timer: ReturnType<typeof setTimeout> | null = null; const interval = options.intervalMs ?? 250;
  const tick = async () => {
    try {
      const value = await options.connection();
      const polled = await post(value.descriptor, "/v1/graph-adapter/poll", { graphId: value.graphId });
      if (!polled.ok) throw new Error(`GRAPH_BRIDGE_POLL_FAILED:${polled.status}`);
      const envelope = (await polled.json() as { request: GraphGatewayRequestEnvelope | null }).request;
      if (envelope) {
        try {
          const response = await handleGraphGatewayRequest({ envelope, graphId: value.graphId, adapter: value.adapter, readHost: value.readHost, graphSnapshotKey: value.descriptor.graphSnapshotKey });
          const accepted = await post(value.descriptor, `/v1/graph-adapter/requests/${encodeURIComponent(envelope.id)}/complete`, { graphId: value.graphId, response });
          if (!accepted.ok) throw new Error(`GRAPH_BRIDGE_COMPLETE_FAILED:${accepted.status}`);
        } catch (error) {
          const code = error instanceof Error && "code" in error ? String(error.code) : error instanceof Error ? error.message.split(":")[0]! : "GRAPH_ADAPTER_FAILED";
          await post(value.descriptor, `/v1/graph-adapter/requests/${encodeURIComponent(envelope.id)}/fail`, { graphId: value.graphId, error: { code, message: error instanceof Error ? error.message.slice(0, 300) : "Graph Adapter failed." } });
        }
      }
    } catch (error) { options.onError?.(error); }
    if (!stopped) timer = setTimeout(() => void tick(), interval);
  };
  void tick();
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}
