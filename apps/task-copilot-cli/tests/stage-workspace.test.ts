import test from "node:test";
import assert from "node:assert/strict";
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startWorkspaceServer } from "../src/workspace-server.ts";
import { resolveStageWorkspace } from "../src/stage-workspace.ts";

test("D-62 Companion resolves the active file Graph, preserves it on restart, and clears it for DB/no Graph", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "tc-stage-workspace-")));
  const state = join(root, "state"), graphA = join(root, "Graph A"), graphB = join(root, "Graph B");
  const fallback = join(state, "stage-workspace"), configured = join(root, "explicit-reviews");
  const oldOverride = process.env.TASK_COPILOT_STAGE_WORKSPACE_DIR;
  const oldSkip = process.env.TASK_COPILOT_SKIP_WINDOW_ACTIVATE;
  delete process.env.TASK_COPILOT_STAGE_WORKSPACE_DIR;
  process.env.TASK_COPILOT_SKIP_WINDOW_ACTIVATE = "1";
  await Promise.all([mkdir(graphA), mkdir(graphB)]);
  const start = () => startWorkspaceServer({
    stateDirectory: state, inboxDirectory: join(root, "inbox"), icloudInboxDirectory: join(root, "icloud"),
    watchIcloud: false, appleCalendar: { disabled: true },
  });
  let server = await start();
  const post = async (path: string, payload: unknown = {}, plugin = false) => {
    const { baseUrl, token, pluginToken, instanceId } = server.descriptor;
    const response = await fetch(baseUrl + path, {
      method: "POST",
      headers: { "content-type": "application/json", "x-workspace-instance": instanceId,
        ...(plugin ? { "x-workspace-plugin": pluginToken } : { authorization: `Bearer ${token}` }) },
      body: JSON.stringify(payload),
    });
    return { status: response.status, ...(await response.json()) };
  };
  const workspace = async () => {
    const result = await post("/stage/workspace");
    assert.equal(result.status, 200, JSON.stringify(result));
    return result.value;
  };
  const report = async (payload: unknown) => assert.equal((await post("/plugin/stage/graph", payload, true)).status, 200);
  try {
    assert.deepEqual(await workspace(), { stageWorkspaceDir: fallback, source: "fallback" });
    assert.ok((await lstat(fallback)).isDirectory());
    await report({ graphId: "a", graphName: "Graph A", graphPath: graphA });
    const reviewsA = join(graphA, "pages", "stage-reviews");
    await assert.rejects(lstat(reviewsA), { code: "ENOENT" }, "Graph reporting itself only caches the location");
    assert.deepEqual(await workspace(), { stageWorkspaceDir: reviewsA, source: "graph" });
    assert.ok((await lstat(reviewsA)).isDirectory());
    assert.equal((await post("/stage/workspace", { graphPath: graphB })).status, 400);
    assert.equal((await post("/plugin/stage/graph", { graphPath: graphB })).status, 401);
    assert.equal((await post("/stage/workspace", {}, true)).status, 401);
    const cached = JSON.parse(await readFile(join(state, "stage-workspace.json"), "utf8"));
    assert.equal(cached.graphPath, graphA);
    assert.equal(cached.stageWorkspaceDir, reviewsA);

    await server.close();
    server = await start();
    assert.deepEqual(await workspace(), { stageWorkspaceDir: reviewsA, source: "graph" });

    process.env.TASK_COPILOT_STAGE_WORKSPACE_DIR = configured;
    assert.deepEqual(await workspace(), { stageWorkspaceDir: configured, source: "configured" });
    await report({ graphId: "db", graphName: "DB Graph" });
    assert.deepEqual(await workspace(), { stageWorkspaceDir: configured, source: "configured" });
    delete process.env.TASK_COPILOT_STAGE_WORKSPACE_DIR;
    assert.deepEqual(await workspace(), { stageWorkspaceDir: fallback, source: "fallback" });

    const reviewsB = join(graphB, "pages", "stage-reviews");
    const offline = await post("/plugin/stage/open-dsh", { graphId: "b", graphPath: graphB, graphName: "Graph B" }, true);
    assert.equal(offline.error.code, "DSH_NOT_RUNNING");
    assert.equal((await workspace()).stageWorkspaceDir, reviewsB);
    await writeFile(join(state, "dsh-browser.json"), JSON.stringify({ url: "http://127.0.0.1:3080/?token=test", pid: process.pid }), { mode: 0o600 });
    const opened = await post("/plugin/stage/open-dsh", { graphId: "b", graphPath: graphB, graphName: "Graph B" }, true);
    assert.equal(opened.status, 200, JSON.stringify(opened));
    assert.equal(opened.value.url, "http://127.0.0.1:3080/?token=test#stage-discuss=1");
    assert.equal(opened.value.stageWorkspaceDir, reviewsB);
    assert.equal(opened.value.source, "graph");
    assert.deepEqual(await workspace(), { stageWorkspaceDir: reviewsB, source: "graph" });
    assert.equal((await post("/stage/open-dsh")).value.stageWorkspaceDir, reviewsB, "standalone open retains the active Graph");
    assert.equal((await post("/plugin/stage/open-dsh", { graphId: "db" }, true)).value.stageWorkspaceDir, fallback);

    await report({ graphId: "a", graphPath: graphA });
    await report({});
    assert.equal((await workspace()).stageWorkspaceDir, fallback);
    await report({ graphId: "remote", graphPath: "https://example.test/graph" });
    assert.equal((await workspace()).source, "fallback");
    await report({ graphId: "removed", graphPath: join(root, "removed") });
    assert.equal((await workspace()).source, "fallback");
    await assert.rejects(lstat(join(root, "removed")), { code: "ENOENT" });
  } finally {
    await server.close();
    if (oldOverride === undefined) delete process.env.TASK_COPILOT_STAGE_WORKSPACE_DIR;
    else process.env.TASK_COPILOT_STAGE_WORKSPACE_DIR = oldOverride;
    if (oldSkip === undefined) delete process.env.TASK_COPILOT_SKIP_WINDOW_ACTIVATE;
    else process.env.TASK_COPILOT_SKIP_WINDOW_ACTIVATE = oldSkip;
    await rm(root, { recursive: true, force: true });
  }
});

test("D-62 directory validation refuses Graph roots, pages roots and symlink escapes before creation", async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "tc-stage-path-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  const state = join(root, "state"), graph = join(root, "graph"), pages = join(graph, "pages");
  await mkdir(pages, { recursive: true });
  await mkdir(state);
  const location = { graphPath: graph };
  for (const invalid of [graph, pages, root, state, "/", "relative", join(graph, "pages") + "/../other"]) {
    await assert.rejects(resolveStageWorkspace(state, location, invalid), { code: "STAGE_WORKSPACE_PATH_INVALID" });
  }
  // Even offline, avoid treating a file Graph root as the navigation workspace.
  await assert.rejects(resolveStageWorkspace(state, {}, graph), { code: "STAGE_WORKSPACE_PATH_INVALID" });
  const safe = join(root, "dedicated");
  assert.deepEqual(await resolveStageWorkspace(state, location, safe), { stageWorkspaceDir: safe, source: "configured" });
  const alias = join(root, "alias");
  await symlink(graph, alias);
  await assert.rejects(resolveStageWorkspace(state, location, join(alias, "outside")), { code: "STAGE_WORKSPACE_PATH_INVALID" });
  await assert.rejects(lstat(join(graph, "outside")), { code: "ENOENT" });
  await symlink(root, join(pages, "stage-reviews"));
  await assert.rejects(resolveStageWorkspace(state, location, ""), { code: "STAGE_WORKSPACE_PATH_INVALID" });
  assert.equal(await realpath(join(pages, "stage-reviews")), root);
});
