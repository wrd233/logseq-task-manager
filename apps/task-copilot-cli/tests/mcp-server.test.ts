import test from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startWorkspaceServer } from "../src/workspace-server.ts";
import { runWorkspaceCli } from "../src/workspace-cli.ts";
import { collaborateConfigPath, workKeyForScope } from "../src/collaborate.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const launcherEntry = join(repoRoot, "apps/task-copilot-cli/src/workspace-launcher.ts");
const sha = (value: string) => createHash("sha256").update(value).digest("hex");

class StdioMcpClient {
  private readonly child: ChildProcessWithoutNullStreams;
  private nextId = 1;
  private buffer: Buffer = Buffer.alloc(0);
  private readonly pending = new Map<number, { resolve: (msg: Record<string, unknown>) => void; reject: (err: Error) => void }>();
  private readonly framing: "ndjson" | "content-length";
  stderr = "";

  constructor(stateDir: string, clientId = "codex", framing: "ndjson" | "content-length" = "ndjson") {
    this.framing = framing;
    this.child = spawn(
      process.execPath,
      ["--import", "tsx", launcherEntry, "workspace", "mcp", "--state-dir", stateDir, "--client", clientId],
      {
        cwd: repoRoot,
        stdio: ["pipe", "pipe", "pipe"],
      }
    );
    this.child.stderr.on("data", (chunk: Buffer) => {
      this.stderr += chunk.toString("utf8");
    });
    this.child.stdout.on("data", (chunk: Buffer) => {
      this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : Buffer.from(chunk);
      this.drain();
    });
    this.child.once("exit", (code) => {
      for (const item of this.pending.values()) {
        item.reject(new Error(`MCP process exited early with code ${code}: ${this.stderr}`));
      }
      this.pending.clear();
    });
  }

  private drain() {
    while (this.buffer.length > 0) {
      let offset = 0;
      while (offset < this.buffer.length && (this.buffer[offset] === 0x0a || this.buffer[offset] === 0x0d)) offset++;
      if (offset > 0) this.buffer = this.buffer.subarray(offset);
      if (this.buffer.length === 0) break;

      if (this.framing === "content-length") {
        const headerEnd = this.buffer.indexOf("\r\n\r\n");
        if (headerEnd === -1) break;
        const headers = this.buffer.subarray(0, headerEnd).toString("ascii");
        const match = /^content-length:\s*(\d+)$/imu.exec(headers);
        if (!match) break;
        const len = Number(match[1]);
        if (this.buffer.length < headerEnd + 4 + len) break;
        const text = this.buffer.subarray(headerEnd + 4, headerEnd + 4 + len).toString("utf8");
        this.buffer = this.buffer.subarray(headerEnd + 4 + len);
        this.dispatch(text);
      } else {
        const nl = this.buffer.indexOf(0x0a);
        if (nl === -1) break;
        const text = this.buffer.subarray(0, nl).toString("utf8");
        this.buffer = this.buffer.subarray(nl + 1);
        this.dispatch(text);
      }
    }
  }

  private dispatch(text: string) {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (typeof parsed.id === "number" && this.pending.has(parsed.id)) {
      const waiter = this.pending.get(parsed.id)!;
      this.pending.delete(parsed.id);
      waiter.resolve(parsed);
    }
  }

  private write(payload: Record<string, unknown>) {
    const json = JSON.stringify(payload);
    if (this.framing === "content-length") {
      this.child.stdin.write(`Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n${json}`);
    } else {
      this.child.stdin.write(`${json}\n`);
    }
  }

  notify(method: string, params?: Record<string, unknown>) {
    this.write({ jsonrpc: "2.0", method, ...(params ? { params } : {}) });
  }

  request(method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>> {
    const id = this.nextId++;
    return new Promise((resolveReq, rejectReq) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rejectReq(new Error(`MCP request timed out: ${method} (stderr=${this.stderr})`));
      }, 15_000);
      this.pending.set(id, {
        resolve: (msg) => {
          clearTimeout(timer);
          resolveReq(msg);
        },
        reject: (err) => {
          clearTimeout(timer);
          rejectReq(err);
        },
      });
      this.write({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) });
    });
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<{ isError: boolean; data: Record<string, unknown> }> {
    const response = await this.request("tools/call", { name, arguments: args });
    assert.equal(response.error, undefined, `Unexpected JSON-RPC error: ${JSON.stringify(response.error)}`);
    const result = response.result as { isError?: boolean; content: Array<{ type: string; text: string }> };
    return {
      isError: result.isError === true,
      data: JSON.parse(result.content[0]!.text) as Record<string, unknown>,
    };
  }

  async close() {
    this.child.stdin.end();
    await new Promise<void>((resolveClose) => {
      if (this.child.exitCode !== null) {
        resolveClose();
        return;
      }
      const timer = setTimeout(() => {
        this.child.kill("SIGTERM");
        resolveClose();
      }, 2000);
      this.child.once("exit", () => {
        clearTimeout(timer);
        resolveClose();
      });
    });
  }
}

test("Companion stdio MCP server enforces single-work scope, sensitive blocking, privacy, candidate validation, writeback safety, and audit logging", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "companion-mcp-e2e-")));
  const stateDir = join(root, "state");
  const workADir = join(root, "work-a");
  await mkdir(workADir, { recursive: true });

  const server = await startWorkspaceServer({
    stateDirectory: stateDir,
    reading: {
      env: { DEEPSEEK_API_KEY: "super-secret-api-key-never-leak" },
      dshAvailable: async () => false,
    },
  });

  const postPlugin = async (path: string, input: unknown) => {
    const response = await fetch(server.descriptor.baseUrl + path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-workspace-instance": server.descriptor.instanceId,
        "x-workspace-plugin": server.descriptor.pluginToken,
      },
      body: JSON.stringify(input),
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };

  const workARootUuid = "00000000-0000-4000-8000-0000000000a1";
  const workBRootUuid = "00000000-0000-4000-8000-0000000000b2";
  const bindingA = {
    scope: { graphId: "graph:/test-vault", rootUuid: workARootUuid },
    directory: workADir,
    organization: "flat" as const,
    provider: "workspace" as const,
    workspaceId: randomUUID(),
  };
  const workAKey = workKeyForScope(bindingA.scope);

  let block1Text = "当前主线：登录态迁移已完成 80%，但冷启动白屏尚未复现。";
  const block2Text = "TODO 明天上午找测试复现低内存设备上的白屏日志。";
  let sourceRevision = 1;
  let rawWriteCalls = 0;

  const longSpecText = `${"接口联调说明前文。".repeat(80)}\n【关键定位码】QPA-9472 需要与测试组核对。`;
  const secretEnvText = "DB_PASSWORD=TOP_SECRET_ENV_VALUE_8888\nAPI_TOKEN=LEAK_FORBIDDEN";
  const assocNoteText = "关联会议笔记：客户端必须在周五前锁定白屏修复窗口。";

  const makeSnapshot = () => ({
    scope: bindingA.scope,
    capturedAt: "2026-11-20T12:00:00.000Z",
    structureVersion: `sv-a-${sourceRevision}`,
    sourceSetVersion: `ss-a-${sourceRevision}`,
    blocks: [
      {
        sourceId: "src-a-1",
        target: { blockUuid: workARootUuid },
        parentUuid: null,
        depth: 0,
        order: 0,
        availability: "available",
        content: block1Text,
        contentVersion: sha(block1Text),
      },
      {
        sourceId: "src-a-2",
        target: { blockUuid: "00000000-0000-4000-8000-0000000000a2" },
        parentUuid: workARootUuid,
        depth: 1,
        order: 1,
        availability: "available",
        content: block2Text,
        contentVersion: sha(block2Text),
      },
    ],
  });

  const connectionId = "conn-work-a";
  let poller: ReturnType<typeof setInterval> | null = null;
  const startPoller = () => {
    poller = setInterval(() => {
      if (!server.broker.online()) return;
      let delivery;
      try {
        delivery = server.broker.poll(connectionId);
      } catch {
        return;
      }
      if (!delivery) return;
      const fail = (code: string, message = code) =>
        server.broker.complete(connectionId, delivery.requestId, delivery.clientId, undefined, { code, message });
      const ok = (value: unknown) =>
        server.broker.complete(connectionId, delivery.requestId, delivery.clientId, value);

      if (delivery.command === "status") {
        ok({
          channel: "online",
          binding: bindingA,
          capabilities: { read: true, files: true, fileWrite: false, materials: true, reading: true, content: false, stage: false },
          authorizesTodo: false,
        });
      } else if (delivery.command === "refresh") {
        const snapshot = makeSnapshot();
        ok({
          freshness: "checked",
          snapshot,
          binding: bindingA,
          workspace: {
            observed: {
              primary: snapshot,
              sources: [
                {
                  association: { kind: "logseq-page", graphId: bindingA.scope.graphId, pageUuid: "page-note-1", pageName: "客户端周会纪要" },
                  availability: "available",
                  snapshot: {
                    scope: { graphId: bindingA.scope.graphId, rootUuid: "page-note-1", kind: "page", pageName: "客户端周会纪要" },
                    structureVersion: "sv-note-1",
                    sourceSetVersion: "ss-note-1",
                    blocks: [{ sourceId: "note-b-1", target: { blockUuid: "nb-1" }, availability: "available", content: assocNoteText }],
                  },
                },
              ],
            },
          },
        });
      } else if (delivery.command === "guidance.read") {
        ok({
          loadedAt: "2026-11-20T12:00:00.000Z",
          common: { text: "保持自然人话，不改写原块。", version: sha("保持自然人话，不改写原块。") },
          project: { text: "优先追踪白屏日志。", version: sha("优先追踪白屏日志。") },
        });
      } else if (delivery.command === "materials.list") {
        ok({
          status: "success",
          materials: [
            { id: "mat-spec", path: join(workADir, "spec.md"), availability: "available", version: sha(longSpecText), content: longSpecText },
            { id: "mat-env", path: join(workADir, ".env.production"), availability: "available", version: sha(secretEnvText), content: secretEnvText },
          ],
        });
      } else if (delivery.command === "materials.read") {
        if (delivery.payload.id === "mat-spec") {
          ok({ id: "mat-spec", path: join(workADir, "spec.md"), availability: "available", version: sha(longSpecText), content: longSpecText });
        } else if (delivery.payload.id === "mat-env") {
          ok({ id: "mat-env", path: join(workADir, ".env.production"), availability: "available", version: sha(secretEnvText), content: secretEnvText });
        } else {
          fail("MATERIAL_OUTSIDE_SCOPE");
        }
      } else if (delivery.command === "reading.view") {
        ok({
          source: makeSnapshot(),
          reading: {
            briefing: {
              planId: "work-resume-briefing",
              basisVersion: `ss-a-${sourceRevision}`,
              paragraphs: [{ key: "old-main", markdown: "旧版简报摘要。", kind: "fact", sourceIds: ["src-a-1"] }],
            },
          },
        });
      } else if (delivery.command === "formatting.preview") {
        ok({
          schemaVersion: 1,
          proposalId: delivery.payload.requestId,
          scope: bindingA.scope,
          sourceSetVersion: `ss-a-${sourceRevision}`,
          structureVersion: `sv-a-${sourceRevision}`,
          sourceIds: delivery.payload.sourceIds,
          labels: ["想法"],
          changes: [{ sourceId: "src-a-1", blockUuid: workARootUuid, line: 1, before: "[想法]", after: "**[想法]**", lineText: "[想法] 测试", formattedLine: "**[想法]** 测试" }],
          skipped: [],
          writesSource: false,
        });
      } else if (delivery.command === "content.apply") {
        rawWriteCalls++;
        fail("CONTENT_WRITE_AUTHORIZATION_REQUIRED");
      } else {
        fail("UNKNOWN_COMMAND");
      }
    }, 10);
  };

  const client = new StdioMcpClient(stateDir, "codex", "ndjson");
  const clClient = new StdioMcpClient(stateDir, "antigravity", "content-length");

  try {
    // 1. Initialize & tools/list on BOTH NDJSON and Content-Length framing
    const init = await client.request("initialize", { protocolVersion: "2025-03-26", clientInfo: { name: "codex-test", version: "1.0" }, capabilities: {} });
    assert.equal((init.result as { protocolVersion: string }).protocolVersion, "2025-03-26");
    client.notify("notifications/initialized");
    assert.deepEqual((await client.request("ping")).result, {});

    const clInit = await clClient.request("initialize", { protocolVersion: "2024-11-05", clientInfo: { name: "antigravity-test", version: "1.0" }, capabilities: {} });
    assert.equal((clInit.result as { protocolVersion: string }).protocolVersion, "2024-11-05");

    const listed = await client.request("tools/list");
    const toolNames = ((listed.result as { tools: Array<{ name: string }> }).tools).map((t) => t.name);
    assert.deepEqual(toolNames, [
      "workbench_list_works",
      "workbench_get_active_work",
      "workbench_read_sources",
      "workbench_read_material",
      "workbench_submit_reading_candidate",
      "workbench_propose_writeback",
    ]);

    // 2. Publish catalog and verify workbench_list_works (read-only metadata, zero secrets/body)
    const pub = await postPlugin("/plugin/catalog", {
      schemaVersion: 1,
      graphId: "graph:/test-vault",
      graphName: "Test Vault",
      refreshedAt: 1732100000000,
      works: [
        {
          workRef: { kind: "logseq", graphId: "graph:/test-vault", rootUuid: workARootUuid, sourceKind: "block" },
          title: "Q4 客户端重构",
          objectType: "MiniProject",
          location: "项目总览",
          updatedAt: 1732100000000,
          directory: workADir,
        },
        {
          workRef: { kind: "logseq", graphId: "graph:/test-vault", rootUuid: workBRootUuid, sourceKind: "block" },
          title: "另一份机密工作 B",
          objectType: "Project",
          location: "私有目录",
          updatedAt: 1732090000000,
        },
      ],
    });
    assert.equal(pub.status, 200);

    const worksRes = await client.callTool("workbench_list_works", {});
    assert.equal(worksRes.isError, false);
    const worksJson = JSON.stringify(worksRes.data);
    assert.equal(worksRes.data.total, 2);
    assert.equal(worksJson.includes("super-secret-api-key"), false);
    assert.equal(worksJson.includes(server.descriptor.token), false);
    assert.equal(worksJson.includes("登录态迁移"), false);

    // 3. Unbound / offline -> Fail Closed!
    const offlineActive = await client.callTool("workbench_get_active_work", {});
    assert.equal(offlineActive.isError, true);
    assert.equal((offlineActive.data.error as { code: string }).code, "WORKSPACE_OFFLINE");

    const offlineSources = await client.callTool("workbench_read_sources", {});
    assert.equal(offlineSources.isError, true);
    assert.equal((offlineSources.data.error as { code: string }).code, "WORKSPACE_OFFLINE");

    // 4. Connect Work A + test multi-target collaboration targets & handoff
    assert.equal((await postPlugin("/plugin/connect", { connectionId, binding: bindingA, workKey: workAKey, title: "Q4 客户端重构" })).status, 200);
    startPoller();

    const targetsDefault = await postPlugin("/plugin/collaborate/targets", {});
    assert.equal(targetsDefault.status, 200);
    assert.equal((targetsDefault.body.value as { defaultTarget: string }).defaultTarget, "dsh");

    const switchedTarget = await postPlugin("/plugin/collaborate/targets", { defaultTarget: "codex" });
    assert.equal(switchedTarget.status, 200);
    assert.equal((switchedTarget.body.value as { defaultTarget: string }).defaultTarget, "codex");
    assert.equal((await stat(collaborateConfigPath(stateDir))).mode & 0o077, 0);

    // Non-private collaborate.json (0644) must fail closed
    await chmod(collaborateConfigPath(stateDir), 0o644);
    const unsafeCollab = await postPlugin("/plugin/collaborate/targets", {});
    assert.equal(unsafeCollab.status, 400);
    assert.equal((unsafeCollab.body.error as { code: string }).code, "COLLABORATE_CONFIG_NOT_PRIVATE");
    await chmod(collaborateConfigPath(stateDir), 0o600);

    // Stage collaboration handoff to Codex (works with zero DSH running!)
    const handoffRes = await postPlugin("/plugin/collaborate", {
      connectionId,
      mode: "continue",
      title: "Q4 客户端重构",
      workKey: workAKey,
      intent: {
        request: "请结合附件核对定位码 QPA-9472 并整理新版渐进式文章候选。",
        sourceIds: ["src-a-1"],
        selection: "冷启动白屏尚未复现",
        basisVersion: "ss-a-1",
        result: "旧版简报摘要。",
      },
    });
    assert.equal(handoffRes.status, 200);
    const handoffVal = handoffRes.body.value as { target: string; handoffPrompt: string; permissions: { writeEscalated: boolean } };
    assert.equal(handoffVal.target, "codex");
    assert.equal(handoffVal.permissions.writeEscalated, false);
    assert.match(handoffVal.handoffPrompt, /workbench_get_active_work/);

    // Verify /plugin/dsh remains backward-compatible when DSH browser descriptor exists
    await writeFile(join(stateDir, "dsh-browser.json"), JSON.stringify({ url: "http://127.0.0.1:49999/", pid: process.pid }), { mode: 0o600 });
    const dshCompat = await postPlugin("/plugin/dsh", {
      connectionId,
      mode: "continue",
      title: "Q4 客户端重构",
      newTab: true,
    });
    assert.equal(dshCompat.status, 200);
    assert.match(String(dshCompat.body.url), /^http:\/\/127\.0\.0\.1:49999\/#logseq-work=/);
    assert.ok(typeof dshCompat.body.ticket === "string");

    // 5. workbench_get_active_work returns live version, guidance, materials (marking .env sensitive), and staged handoff
    const activeRes = await clClient.callTool("workbench_get_active_work", {});
    assert.equal(activeRes.isError, false);
    const activeJson = JSON.stringify(activeRes.data);
    assert.equal(activeJson.includes("TOP_SECRET_ENV_VALUE_8888"), false);
    assert.equal((activeRes.data.versions as { sourceSetVersion: string }).sourceSetVersion, "ss-a-1");
    assert.equal((activeRes.data.handoff as { request: string; selection: string }).request, "请结合附件核对定位码 QPA-9472 并整理新版渐进式文章候选。");
    assert.equal((activeRes.data.handoff as { selection: string }).selection, "冷启动白屏尚未复现");
    const mats = activeRes.data.materials as Array<{ id: string; sensitiveBlocked: boolean; kind: string }>;
    assert.equal(mats.find((m) => m.id === "mat-env")?.sensitiveBlocked, true);
    assert.equal(mats.find((m) => m.id === "mat-spec")?.sensitiveBlocked, false);
    assert.equal(mats.find((m) => m.id === "note:page-note-1")?.kind, "note");

    // 6. workbench_read_sources pagination + single-work cross-scope rejection
    const srcRead = await client.callTool("workbench_read_sources", { sourceIds: ["src-a-1", "src-a-2"] });
    assert.equal(srcRead.isError, false);
    assert.equal((srcRead.data.blocks as Array<{ sourceId: string }>).length, 2);

    const crossSrc = await client.callTool("workbench_read_sources", { sourceIds: ["src-work-b-999"] });
    assert.equal(crossSrc.isError, true);
    assert.equal((crossSrc.data.error as { code: string }).code, "SOURCE_OUTSIDE_SCOPE");

    const crossWorkKey = await client.callTool("workbench_read_sources", { rootUuid: workBRootUuid });
    assert.equal(crossWorkKey.isError, true);
    assert.equal((crossWorkKey.data.error as { code: string }).code, "SCOPE_MISMATCH");

    // 7. workbench_read_material pagination + .env sensitive blocking + associated note + local-only privacy
    const matPage1 = await client.callTool("workbench_read_material", { materialId: "mat-spec", offset: 0, maxChars: 300 });
    assert.equal(matPage1.isError, false);
    assert.ok(typeof matPage1.data.nextOffset === "number");
    const matPage2 = await client.callTool("workbench_read_material", { materialId: "mat-spec", offset: matPage1.data.nextOffset as number, maxChars: 2000 });
    assert.equal(matPage2.isError, false);
    assert.match(String(matPage2.data.content), /QPA-9472/);

    const noteRead = await client.callTool("workbench_read_material", { materialId: "note:page-note-1" });
    assert.equal(noteRead.isError, false);
    assert.match(String(noteRead.data.content), /周五前锁定白屏修复窗口/);

    const envBlocked = await client.callTool("workbench_read_material", { materialId: "mat-env" });
    assert.equal(envBlocked.isError, true);
    assert.equal((envBlocked.data.error as { code: string }).code, "SENSITIVE_MATERIAL_BLOCKED");
    assert.equal(JSON.stringify(envBlocked.data).includes("TOP_SECRET_ENV_VALUE_8888"), false);

    const foreignMat = await client.callTool("workbench_read_material", { materialId: "mat-from-work-b" });
    assert.equal(foreignMat.isError, true);
    assert.equal((foreignMat.data.error as { code: string }).code, "MATERIAL_OUTSIDE_SCOPE");

    // Enable local-only privacy on Work A -> remote MCP content reads fail closed!
    assert.equal((await postPlugin("/plugin/work-privacy", { workKey: workAKey, privacyMode: "local-only" })).status, 200);
    const localBlockedMat = await client.callTool("workbench_read_material", { materialId: "mat-spec" });
    assert.equal(localBlockedMat.isError, true);
    assert.equal((localBlockedMat.data.error as { code: string }).code, "WORK_LOCAL_ONLY_RESTRICTED");
    const localBlockedSrc = await client.callTool("workbench_read_sources", { sourceIds: ["src-a-1"] });
    assert.equal(localBlockedSrc.isError, true);
    assert.equal((localBlockedSrc.data.error as { code: string }).code, "WORK_LOCAL_ONLY_RESTRICTED");
    // Restore default privacy for candidate tests
    assert.equal((await postPlugin("/plugin/work-privacy", { workKey: workAKey, privacyMode: "default" })).status, 200);

    // 8. workbench_submit_reading_candidate: valid submission, invalid ref rejection, sensitive citation rejection, stale version rejection
    const badRef = await client.callTool("workbench_submit_reading_candidate", {
      sourceSetVersion: "ss-a-1",
      structureVersion: "sv-a-1",
      paragraphs: [{ key: "p1", markdown: "伪造引用测试。", kind: "fact", sourceIds: ["non-existent-source"] }],
    });
    assert.equal(badRef.isError, true);
    assert.equal((badRef.data.error as { code: string }).code, "READING_MODEL_REFERENCE_INVALID");

    const envCited = await client.callTool("workbench_submit_reading_candidate", {
      sourceSetVersion: "ss-a-1",
      structureVersion: "sv-a-1",
      paragraphs: [
        {
          key: "p-env",
          markdown: "试图引用敏感文件。",
          kind: "fact",
          sourceIds: ["src-a-1"],
          details: [{ key: "d-env", markdown: "引用 .env。", sourceIds: ["src-a-1"], materialIds: ["mat-env"] }],
        },
      ],
    });
    assert.equal(envCited.isError, true);
    assert.equal((envCited.data.error as { code: string }).code, "SENSITIVE_MATERIAL_BLOCKED");

    const validCandidate = await client.callTool("workbench_submit_reading_candidate", {
      sourceSetVersion: "ss-a-1",
      structureVersion: "sv-a-1",
      summary: "Codex 核对 QPA-9472 后的候选更新",
      paragraphs: [
        {
          key: "main",
          markdown: "登录态迁移已达 **80%**，但 **冷启动白屏** 尚未复现，需结合 **QPA-9472** 排查后再定发布窗口。",
          kind: "fact",
          tone: "attention",
          cue: "冷启动白屏",
          sourceIds: ["src-a-1", "src-a-2"],
          details: [
            {
              key: "detail-spec",
              markdown: "接口联调附件末尾已标明定位码 **QPA-9472**，明天上午仍需找测试复现低内存白屏日志。",
              sourceIds: ["src-a-2"],
              materialIds: ["mat-spec"],
              materialQuotes: [{ materialId: "mat-spec", quote: "【关键定位码】QPA-9472 需要与测试组核对。" }],
            },
          ],
        },
      ],
    });
    assert.equal(validCandidate.isError, false);
    assert.equal(validCandidate.data.staged, true);
    assert.equal(validCandidate.data.writesSource, false);

    const stagedJob = await postPlugin("/plugin/reading-jobs/status", { workKey: workAKey });
    assert.equal(stagedJob.status, 200);
    const job = (stagedJob.body.value as { job: { origin: string; requireReview: boolean; status: string; sourceSetVersion: string } }).job;
    assert.equal(job.origin, "external-mcp");
    assert.equal(job.requireReview, true);
    assert.equal(job.status, "completed");
    assert.equal(job.sourceSetVersion, "ss-a-1");

    // Mutate raw source -> stale candidate submission MUST fail closed!
    sourceRevision = 2;
    block1Text = "当前主线：登录态迁移 95%，已拿到低内存白屏日志。";
    const staleSubmit = await client.callTool("workbench_submit_reading_candidate", {
      sourceSetVersion: "ss-a-1",
      structureVersion: "sv-a-1",
      paragraphs: [{ key: "p-stale", markdown: "过时候选。", kind: "fact", sourceIds: ["src-a-1"] }],
    });
    assert.equal(staleSubmit.isError, true);
    assert.equal((staleSubmit.data.error as { code: string }).code, "STALE_SOURCE_VERSION");

    // 9. workbench_propose_writeback: preview / pending-review / read-only denial / protected TODO denial / forged field denial
    const formatPreview = await client.callTool("workbench_propose_writeback", {
      kind: "formatting-preview",
      sourceIds: ["src-a-1"],
      labels: ["想法"],
    });
    assert.equal(formatPreview.isError, false);
    assert.equal(formatPreview.data.writesSource, false);

    const contentProposal = await client.callTool("workbench_propose_writeback", {
      kind: "content-proposal",
      sourceSetVersion: "ss-a-2",
      structureVersion: "sv-a-2",
      summary: "建议补充白屏日志定位码",
      operations: [
        {
          operationId: "op-1",
          type: "replace-text",
          sourceId: "src-a-1",
          expectedContentVersion: sha(block1Text),
          text: "当前主线：登录态迁移 95%，已拿到低内存白屏日志（QPA-9472）。",
        },
      ],
    });
    assert.equal(contentProposal.isError, false);
    assert.equal(contentProposal.data.writesSource, false);
    assert.equal(contentProposal.data.status, "pending-review");

    const proposalsListed = await postPlugin("/plugin/writeback-proposals", { workKey: workAKey });
    const proposalsArr = (proposalsListed.body.value as {
      proposals: Array<{ proposalId: string; plan?: { anchors: Array<{ before: { exactText: string } }>; beforeBlocks: unknown[]; afterBlocks: unknown[] } }>;
    }).proposals;
    assert.equal(proposalsArr.length, 1);
    assert.ok(proposalsArr[0]!.plan, "staged content-proposal must include enriched NoteTidyPlan for FLIP anchor preview");
    assert.ok(proposalsArr[0]!.plan!.beforeBlocks.length >= 2);
    assert.ok(proposalsArr[0]!.plan!.anchors.length >= 1);

    // Consuming proposal clears it cleanly
    const consumed = await postPlugin("/plugin/writeback-proposals", { action: "consume", proposalId: proposalsArr[0]!.proposalId });
    assert.equal(consumed.status, 200);
    assert.equal((consumed.body.value as { dismissed: boolean }).dismissed, true);
    const afterConsume = await postPlugin("/plugin/writeback-proposals", { workKey: workAKey });
    assert.equal(((afterConsume.body.value as { proposals: unknown[] }).proposals).length, 0);

    // /plugin/note-tidy respects local-only fail-closed privacy when no local profile is configured
    const localTidyDenied = await postPlugin("/plugin/note-tidy", {
      privacyMode: "local-only",
      input: {
        scope: bindingA.scope,
        structureVersion: "sv-a-2",
        sourceSetVersion: "ss-a-2",
        blocks: [
          { sourceId: "src-a-1", blockUuid: workARootUuid, parentUuid: null, depth: 0, content: block1Text, contentVersion: sha(block1Text) },
        ],
      },
    });
    assert.equal(localTidyDenied.status, 400);
    assert.equal((localTidyDenied.body.error as { code: string }).code, "READING_LOCAL_MODEL_REQUIRED");

    // Attempting to touch TODO block in content-proposal fails closed!
    const todoProtected = await client.callTool("workbench_propose_writeback", {
      kind: "content-proposal",
      sourceSetVersion: "ss-a-2",
      structureVersion: "sv-a-2",
      operations: [
        {
          operationId: "op-todo",
          type: "replace-text",
          sourceId: "src-a-2",
          expectedContentVersion: sha(block2Text),
          text: "DONE 已擅自完成任务",
        },
      ],
    });
    assert.equal(todoProtected.isError, true);
    assert.equal((todoProtected.data.error as { code: string }).code, "PROTECTED_TARGET_FORBIDDEN");

    // Attempting authorized-content-patch without explicit bodyWrite grant fails closed!
    const unauthorizedApply = await client.callTool("workbench_propose_writeback", {
      kind: "authorized-content-patch",
      patch: { schemaVersion: 1, requestId: "r-unauth", scope: bindingA.scope, operations: [], metadata: null },
    });
    assert.equal(unauthorizedApply.isError, true);
    assert.equal((unauthorizedApply.data.error as { code: string }).code, "CONTENT_WRITE_AUTHORIZATION_REQUIRED");

    // Forged approved field fails closed!
    const forgedApproval = await client.callTool("workbench_propose_writeback", {
      kind: "formatting-preview",
      sourceIds: ["src-a-1"],
      approved: true,
    });
    assert.equal(forgedApproval.isError, true);
    assert.equal((forgedApproval.data.error as { code: string }).code, "UNSUPPORTED_FIELD");
    assert.equal(rawWriteCalls, 0);

    // 10. Audit log records every MCP call with zero secret leakage
    const auditRaw = await readFile(join(stateDir, "connection-facts.jsonl"), "utf8");
    const auditRows = auditRaw.trim().split("\n").map((line) => JSON.parse(line) as { command: string; outcome: string; clientId: string });
    assert.ok(auditRows.some((r) => r.command === "mcp.workbench_list_works" && r.outcome === "returned"));
    assert.ok(auditRows.some((r) => r.command === "mcp.workbench_read_material" && r.outcome === "SENSITIVE_MATERIAL_BLOCKED"));
    assert.ok(auditRows.some((r) => r.command === "mcp.workbench_read_sources" && r.outcome === "SOURCE_OUTSIDE_SCOPE"));
    assert.ok(auditRows.some((r) => r.command === "mcp.workbench_submit_reading_candidate" && r.outcome === "returned"));
    assert.ok(auditRows.some((r) => r.command === "mcp.workbench_submit_reading_candidate" && r.outcome === "STALE_SOURCE_VERSION"));
    assert.ok(auditRows.some((r) => r.command === "mcp.workbench_propose_writeback" && r.outcome === "CONTENT_WRITE_AUTHORIZATION_REQUIRED"));
    assert.equal(auditRaw.includes("TOP_SECRET_ENV_VALUE_8888"), false);
    assert.equal(auditRaw.includes("super-secret-api-key"), false);
    assert.equal(auditRaw.includes(server.descriptor.token), false);

    // 11. CLI `workspace mcp config` for all 4 clients (valid format, absolute path, zero secrets)
    for (const targetClient of ["codex", "antigravity", "claude-code", "cursor"] as const) {
      const outs: string[] = [];
      const errs: string[] = [];
      const code = await runWorkspaceCli(
        ["workspace", "mcp", "config", "--client", targetClient, "--state-dir", stateDir],
        { out: (line) => outs.push(line), err: (line) => errs.push(line) }
      );
      assert.equal(code, 0, errs.join("\n"));
      const snippet = outs.join("\n");
      assert.ok(snippet.includes("task-copilot-workbench"));
      assert.ok(snippet.includes(stateDir));
      assert.equal(snippet.includes("DEEPSEEK_API_KEY"), false);
      assert.equal(snippet.includes("super-secret-api-key"), false);
      assert.equal(snippet.includes(server.descriptor.token), false);
      if (targetClient === "codex") {
        assert.match(snippet, /^\[mcp_servers\.task-copilot-workbench\]/m);
      } else {
        const parsed = JSON.parse(snippet) as { mcpServers: Record<string, { command: string; args: string[] }> };
        assert.ok(parsed.mcpServers["task-copilot-workbench"]);
        assert.ok(parsed.mcpServers["task-copilot-workbench"].args[0]!.startsWith("/"));
      }
    }
  } finally {
    if (poller) clearInterval(poller);
    await client.close();
    await clClient.close();
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});
