import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { AppGraphInfo } from "@logseq/libs/dist/LSPlugin";
import { startWorkspaceServer } from "../../task-copilot-cli/src/workspace-server.ts";
import { stageGraphMetadata } from "../src/features/agent-workspace/stage-graph.ts";
import { installAgentWorkspace } from "../src/features/agent-workspace/installer.ts";
import { installCatalogPublisher } from "../src/features/agent-workspace/catalog-publisher.ts";
import { installContentWriteback } from "../src/features/content-writeback/installer.ts";
import { contentFixture, deferred } from "./fixtures/content-writeback.ts";

test("Graph location metadata includes only known local file Graph paths and supports older file Graph hosts", async () => {
  const graph = { name: "File Graph", url: "file", path: "/local/Graph A" };
  const file = { getCurrentGraph: async () => graph, checkCurrentIsDbGraph: async () => false };
  const expected = { graphId: "File Graph:file", graphName: "File Graph" };
  assert.deepEqual(await stageGraphMetadata(graph, file), { ...expected, graphPath: graph.path });
  assert.deepEqual(await stageGraphMetadata(graph, { ...file, checkCurrentIsDbGraph: async () => true }), expected);
  assert.deepEqual(await stageGraphMetadata(graph, { getCurrentGraph: file.getCurrentGraph }), { ...expected, graphPath: graph.path });
  assert.deepEqual(await stageGraphMetadata(graph, { ...file, checkCurrentIsDbGraph: async () => { throw Error("Not existed method #checkCurrentIsDbGraph"); } }),
    { ...expected, graphPath: graph.path });
  assert.deepEqual(await stageGraphMetadata(graph, { ...file, checkCurrentIsDbGraph: async () => { throw Error("disconnected"); } }), expected);
  for (const path of ["", "https://example.test/graph", "logseq://graph", "relative", "//remote/share", "/local/../other"]) {
    assert.deepEqual(await stageGraphMetadata({ ...graph, path }, file), expected);
  }
  assert.deepEqual(await stageGraphMetadata(null, file), {});
});

test("Logseq publishes active Graph state and opens the actual Companion discuss URL without a single-work grant", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "logseq-stage-graph-")));
  const state = join(root, "state"), graphA = join(root, "Graph A"), graphB = join(root, "Graph B");
  await Promise.all([mkdir(graphA), mkdir(graphB)]);
  const oldOverride = process.env.TASK_COPILOT_STAGE_WORKSPACE_DIR, oldSkip = process.env.TASK_COPILOT_SKIP_WINDOW_ACTIVATE;
  delete process.env.TASK_COPILOT_STAGE_WORKSPACE_DIR;
  process.env.TASK_COPILOT_SKIP_WINDOW_ACTIVATE = "1";
  const f = await contentFixture();
  const server = await startWorkspaceServer({
    stateDirectory: state, inboxDirectory: join(root, "inbox"), icloudInboxDirectory: join(root, "icloud"),
    watchIcloud: false, appleCalendar: { disabled: true },
  });
  await writeFile(join(state, "dsh-browser.json"), JSON.stringify({
    url: "http://127.0.0.1:3080/?token=test", pid: process.pid,
  }), { mode: 0o600 });
  (f.browser as unknown as { apis: unknown }).apis = {
    doAction: async ([action, path]: unknown[]) => {
      if (action === "readFile") return readFile(String(path), "utf8");
      throw Error(`unexpected desktop action ${String(action)}`);
    },
  };
  logseq.settings = { disabled: false, agentWorkspaceDescriptor: server.pluginDescriptorPath };
  let graph: AppGraphInfo | null = { name: "Graph A", url: graphA, path: graphA };
  logseq.App.getCurrentGraph = async () => graph;
  logseq.Editor.getAllPages = async () => [];
  logseq.DB.datascriptQuery = async <T>() => [] as unknown as T;

  const content = installContentWriteback({ journal: f.journal, adapter: f.adapter });
  const agent = installAgentWorkspace({
    content, materials: null, work: null,
    binding: { selected: async () => { throw Error("must not connect"); }, valid: async () => false },
  });
  const catalog = installCatalogPublisher(async () => [], async () => undefined);
  const graphState = async () => {
    try { return JSON.parse(await readFile(join(state, "stage-workspace.json"), "utf8")); }
    catch { return null; }
  };
  const waitForGraph = async (predicate: (value: Awaited<ReturnType<typeof graphState>>) => boolean) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const value = await graphState();
      if (predicate(value)) return value;
      await delay(30);
    }
    throw Error("Graph heartbeat did not publish current location");
  };
  try {
    const first = await agent.local.stageOpenDsh();
    assert.equal(first.url, "http://127.0.0.1:3080/?token=test#stage-discuss=1");
    assert.equal(first.stageWorkspaceDir, join(graphA, "pages", "stage-reviews"));
    assert.equal((await graphState()).graphPath, graphA);

    const normalModeCheck = logseq.App.checkCurrentIsDbGraph;
    const checkStarted = deferred<void>(), checkResult = deferred<boolean>();
    logseq.App.checkCurrentIsDbGraph = async () => { checkStarted.resolve(); return checkResult.promise; };
    const staleOpen = agent.local.stageOpenDsh();
    await checkStarted.promise;
    graph = { name: "Graph B", url: graphB, path: graphB };
    f.graph("B");
    checkResult.resolve(false);
    await assert.rejects(staleOpen, { code: "GRAPH_SCOPE_CHANGED" });
    logseq.App.checkCurrentIsDbGraph = normalModeCheck;
    await waitForGraph(value => value?.graphPath === graphB);
    assert.equal((await server.stageHub.workspace()).stageWorkspaceDir, join(graphB, "pages", "stage-reviews"));

    // DB mode must omit graphPath even when the SDK exposes an absolute storage path.
    f.db(true);
    f.graph("DB");
    graph = { name: "DB Graph", url: "db-graph", path: graphB };
    await waitForGraph(value => value?.graphId === "DB Graph:db-graph" && !("graphPath" in value));
    const db = await agent.local.stageOpenDsh();
    assert.equal(db.stageWorkspaceDir, join(state, "stage-workspace"));

    graph = null;
    f.graph("closed");
    await waitForGraph(value => value && Object.keys(value).length === 0);
    assert.equal((await agent.local.stageOpenDsh()).stageWorkspaceDir, join(state, "stage-workspace"));
    assert.equal(agent.api.status().connected, false);
    assert.equal(server.broker.binding, null);
    assert.equal(f.counts().writes, 0);
    assert.equal(f.counts().identities, 0);
  } finally {
    catalog.dispose();
    agent.dispose();
    content.dispose();
    await server.close();
    await f.cleanup();
    if (oldOverride === undefined) delete process.env.TASK_COPILOT_STAGE_WORKSPACE_DIR;
    else process.env.TASK_COPILOT_STAGE_WORKSPACE_DIR = oldOverride;
    if (oldSkip === undefined) delete process.env.TASK_COPILOT_SKIP_WINDOW_ACTIVATE;
    else process.env.TASK_COPILOT_SKIP_WINDOW_ACTIVATE = oldSkip;
    await rm(root, { recursive: true, force: true });
  }
});
