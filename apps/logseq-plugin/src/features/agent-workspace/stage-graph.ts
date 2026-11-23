import { graphIdentity } from "../../graph-adapter.ts";
import { currentGraphIsDb, type GraphModeHost } from "../../source-identity.ts";

/** Location metadata for the active Graph. DB graphs and non-local paths omit graphPath. */
export async function stageGraphMetadata(
  graph: Awaited<ReturnType<typeof logseq.App.getCurrentGraph>>,
  host: GraphModeHost,
): Promise<{ graphId?: string; graphName?: string; graphPath?: string }> {
  if (!graph) return {};
  const graphId = graphIdentity(graph);
  const identity = { graphId, graphName: graph.name || graphId };
  const path = graph.path;
  if (typeof path !== "string" || !/^(?:\/(?!\/)|[A-Za-z]:[\\/])/u.test(path) ||
      Array.from(path).some(char => char.charCodeAt(0) < 32) || path.split(/[\\/]/u).includes("..")) return identity;
  try {
    const isDb = await currentGraphIsDb({
      getCurrentGraph: async () => graph,
      ...(typeof host.checkCurrentIsDbGraph === "function" ? { checkCurrentIsDbGraph: () => host.checkCurrentIsDbGraph!() } : {}),
    });
    return isDb ? identity : { ...identity, graphPath: path };
  } catch {
    // An unknown Graph mode must never expose a DB storage directory as a file Graph.
    return identity;
  }
}
