import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorkspaceBroker, startWorkspaceServer } from "../src/workspace-server.ts";
import { parseWorkspaceCall, type WorkspaceCall } from "@task-copilot/contracts";
const binding = { scope: { graphId: "A", rootUuid: "00000000-0000-4000-8000-000000000001" }, directory: "/work", organization: "flat" as const, provider: "material-binding" as const, workspaceId: null };
const call = (clientId = "one"): WorkspaceCall => ({ schemaVersion: 1, instanceId: "instance", connectionId: "connection", clientId, requestId: "same-request", command: "status", payload: {} });
test("broker isolates clients, rejects forged commands and stale grants, and never redelivers an unknown result", async () => {
    const broker = new WorkspaceBroker("instance", 1000, 20);
    broker.grant("connection", binding);
    const one = broker.request(call());
    assert.equal(broker.poll("connection")!.clientId, "one");
    assert.equal(broker.poll("connection"), null);
    const two = broker.request(call("two"));
    assert.equal(broker.poll("connection", true), null);
    assert.equal(broker.poll("connection")!.clientId, "two");
    broker.complete("connection", "same-request", "one", { client: "one" });
    broker.complete("connection", "same-request", "two", { client: "two" });
    assert.deepEqual((await one).value, { client: "one" });
    assert.deepEqual((await two).value, { client: "two" });
    assert.throws(() => broker.request({ ...call(), command: "refresh" }), /IDEMPOTENCY_KEY_REUSED/);
    const timed = broker.request({ ...call(), requestId: "lost" });
    broker.poll("connection");
    await assert.rejects(timed, /unknown result/);
    assert.equal(broker.poll("connection"), null);
    broker.complete("connection", "lost", "one", { finished: true });
    assert.deepEqual((await broker.request({ ...call(), requestId: "lost" })).value, { finished: true });
    broker.revoke();
    assert.throws(() => broker.request(call()), /WORKSPACE_OFFLINE/);
    broker.grant("new", binding);
    assert.throws(() => broker.poll("connection"), /CONNECTION_STALE/);
    assert.throws(() => parseWorkspaceCall({ ...call(), actor: "user" }), /UNSUPPORTED_FIELD/);
    assert.throws(() => parseWorkspaceCall({ ...call(), command: "eval" }), /UNKNOWN_COMMAND/);
    assert.throws(() => parseWorkspaceCall({ ...call(), payload: { rootUuid: binding.scope.rootUuid } }), /UNSUPPORTED_FIELD/);
    broker.revoke();
});
test("real loopback server uses private separate capabilities, instance identity, host and browser-origin checks", async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), "agent-server-"))), server = await startWorkspaceServer({ stateDirectory: join(root, "private") });
    try {
        assert.equal((await stat(server.descriptorPath)).mode & 0o077, 0);
        assert.equal((await stat(server.pluginDescriptorPath)).mode & 0o077, 0);
        const request = (path: string, headers: Record<string, string>, input: unknown) => fetch(server.descriptor.baseUrl + path, { method: "POST", headers: { "content-type": "application/json", "x-workspace-instance": server.descriptor.instanceId, ...headers }, body: JSON.stringify(input) });
        assert.equal((await request("/plugin/connect", { authorization: `Bearer ${server.descriptor.token}` }, { connectionId: "forged", binding })).status, 401);
        const origin = await request("/call", { authorization: `Bearer ${server.descriptor.token}`, origin: "https://hostile.example" }, {});
        assert.equal((await origin.json() as {
            error: {
                code: string;
            };
        }).error.code, "ORIGIN_REJECTED");
        const stale = await request("/call", { authorization: `Bearer ${server.descriptor.token}`, "x-workspace-instance": "old" }, call());
        assert.equal((await stale.json() as {
            error: {
                code: string;
            };
        }).error.code, "DESCRIPTOR_STALE");
        await assert.rejects(startWorkspaceServer({ stateDirectory: join(root, "private") }), /EEXIST/);
    }
    finally {
        await server.close();
        await rm(root, { recursive: true, force: true });
    }
});
test("concurrent explicit session writes preserve both references and entry identity uses the Registry manifest", async () => {
    const { writeFile, readFile } = await import("node:fs/promises"), { workspaceEntry } = await import("../src/workspace-cli.ts");
    const root = await realpath(await mkdtemp(join(tmpdir(), "agent-sessions-"))), directory = join(root, "work");
    await (await import("node:fs/promises")).mkdir(directory);
    const server = await startWorkspaceServer({ stateDirectory: join(root, "private") }), bound = { ...binding, directory, provider: "workspace" as const, workspaceId: crypto.randomUUID() };
    const headers = { "content-type": "application/json", "x-workspace-instance": server.descriptor.instanceId };
    const request = (path: string, input: unknown, plugin = false) => fetch(server.descriptor.baseUrl + path, { method: "POST", headers: { ...headers, ...(plugin ? { "x-workspace-plugin": server.descriptor.pluginToken } : { authorization: `Bearer ${server.descriptor.token}` }) }, body: JSON.stringify(input) });
    let poller: ReturnType<typeof setInterval> | undefined;
    try {
        assert.equal((await request("/plugin/connect", { connectionId: "connection", binding: bound }, true)).status, 200);
        const manifest = { schemaVersion: 1, workspaceId: bound.workspaceId, primarySource: bound.scope, organization: "flat", entryFile: "WORKSPACE.task-copilot.md", associations: [], updatedAt: new Date().toISOString() };
        await writeFile(join(directory, ".task-workspace/manifest.json"), JSON.stringify(manifest));
        await writeFile(join(directory, manifest.entryFile), "Entry owned by Registry");
        assert.equal((await workspaceEntry(directory)).binding.workspaceId, bound.workspaceId);
        poller = setInterval(() => {
            const delivery = server.broker.poll("connection");
            if (delivery)
                server.broker.complete("connection", delivery.requestId, delivery.clientId, { channel: "online" });
        }, 10);
        const results = await Promise.all(["first", "second"].map(id => request("/call", { ...call(), instanceId: server.descriptor.instanceId, requestId: id, command: "sessions.add", payload: { platform: "codex", externalId: id } })));
        assert.ok(results.every(reply => reply.status === 200));
        const response = await request("/call", { ...call(), instanceId: server.descriptor.instanceId, requestId: "list", command: "sessions.list" });
        assert.equal(((await response.json()) as {
            value: {
                references: unknown[];
            };
        }).value.references.length, 2);
        const reused = await request("/call", { ...call(), instanceId: server.descriptor.instanceId, requestId: "first", command: "sessions.add", payload: { platform: "codex", externalId: "changed" } });
        assert.equal((await reused.json() as {
            error: {
                code: string;
            };
        }).error.code, "IDEMPOTENCY_KEY_REUSED");
        clearInterval(poller);
        await writeFile(join(directory, ".task-workspace/manifest.json"), JSON.stringify({ ...manifest, workspaceId: crypto.randomUUID() }));
        await assert.rejects(workspaceEntry(directory), /WORKSPACE_MANIFEST_MISMATCH/);
        assert.equal(await readFile(join(directory, manifest.entryFile), "utf8"), "Entry owned by Registry");
    }
    finally {
        if (poller)
            clearInterval(poller);
        await server.close();
        await rm(root, { recursive: true, force: true });
    }
});
