import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dateKey, type StageSnapshot } from "@task-copilot/stage-runtime";
import { startWorkspaceServer } from "../src/workspace-server.ts";
import type { PendingJournalCapture } from "../src/stage-inbox-store.ts";

test("reflection writes are Graph-scoped, raw and idempotent across Companion restart", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "tc-reflection-")));
  const options = {
    stateDirectory: join(root, "state"), inboxDirectory: join(root, "inbox"),
    icloudInboxDirectory: join(root, "voice"), watchIcloud: false, appleCalendar: { disabled: true },
  };
  await mkdir(options.icloudInboxDirectory);
  const today = dateKey();
  await writeFile(join(options.icloudInboxDirectory, today.replaceAll("-", "") + "-182500.md"), "随口说的第一句\n随口说的第二句");
  let server = await startWorkspaceServer(options);
  const post = async <T>(path: string, input: object): Promise<T> => {
    const { baseUrl, token, instanceId } = server.descriptor;
    const plugin = path.startsWith("/plugin/");
    const { pluginToken } = plugin ? JSON.parse(await readFile(server.pluginDescriptorPath, "utf8")) as { pluginToken: string } : { pluginToken: "" };
    const headers = new Headers({ "Content-Type": "application/json", "x-workspace-instance": instanceId });
    if (plugin) headers.set("x-workspace-plugin", pluginToken);
    else headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(baseUrl + path, { method: "POST", headers, body: JSON.stringify(input) });
    const body = await response.json() as { value: T };
    assert.equal(response.status, 200, JSON.stringify(body));
    return body.value;
  };
  const graphId = "fixture-graph";
  const uuid = "f7980ac1-1055-4098-82e6-7fffa43c9f76";
  const text = `  我自己的原文\n\n${"第二段里的一句话。".repeat(1000)}  `;
  const action = (action: object) => post<{ snapshot: StageSnapshot }>("/stage/action", { action });
  const reflect = () => action({ type: "set-viewport", source: "logseq", viewport: { activeTab: "reflect" } });
  const save = (targetGraph = graphId) => action({ type: "save-evening-note", requestId: uuid, graphId: targetGraph, date: today, text });
  const pending = (graphId: string) => post<{ captures: PendingJournalCapture[] }>("/plugin/stage/pending-captures", { graphId });
  try {
    await post("/plugin/stage/graph", { graphId, graphName: "验收图谱" });
    const before = await reflect();
    assert.equal(before.snapshot.reflection?.graphId, graphId);
    assert.equal(before.snapshot.reflection?.journalAvailable, false);
    await post("/plugin/stage/journal-signals", {
      graphId, graphName: "验收图谱", signals: [],
      todayJournal: { date: today, blocks: [{ blockUuid: "journal", text: "原生日记行" }] },
    });
    const after = await post<StageSnapshot>("/stage/state", {});
    assert.deepEqual(after.reflection?.traces.map(item => item.original), ["原生日记行", "随口说的第一句\n随口说的第二句"]);

    await assert.rejects(() => save("wrong-graph"), /当前图谱已切换/);
    await Promise.all([save(), save()]);
    assert.deepEqual((await pending("wrong-graph")).captures, []);
    assert.equal((await pending(graphId)).captures.length, 1);
    assert.equal((await pending(graphId)).captures[0]?.text, text);
    assert.deepEqual((await post<StageSnapshot>("/stage/state", {})).reflection?.pendingNoteIds, [uuid]);

    await server.close();
    server = await startWorkspaceServer(options);
    await reflect();
    const [note] = (await pending(graphId)).captures;
    assert.equal(note?.captureId, `evening:${uuid}`);
    assert.equal(note?.text, text);
    await post("/plugin/stage/pending-captures/ack", { graphId, captureId: note!.captureId, blockUuid: uuid, journalDate: today, pageName: "今天" });
    await save();
    assert.deepEqual((await pending(graphId)).captures, []);
    assert.deepEqual((await post<StageSnapshot>("/stage/state", {})).reflection?.pendingNoteIds, []);

    const entryId = "e5290ac1-1055-4098-82e6-7fffa43c9f76";
    await action({ type: "append-idea-note", entryId, text: "第一个念头" });
    const revision = { type: "append-idea-note", ideaId: entryId, entryId: "a5280ac1-1055-4098-82e6-7fffa43c9f76", text: "今天再补一条" };
    await Promise.all([action(revision), action(revision)]);
    const snapshot = await post<StageSnapshot>("/stage/state", {});
    assert.deepEqual(snapshot.reflection?.ideas[0]?.entries.map(entry => [entry.date, entry.text]), [[today, "第一个念头"], [today, "今天再补一条"]]);
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});
