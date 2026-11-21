import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { chmod, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startWorkspaceServer } from "../src/workspace-server.ts";
import { runWorkspaceCli } from "../src/workspace-cli.ts";
import { installWorkspaceLaunchAgent, renderWorkspaceLaunchAgentPlist, uninstallWorkspaceLaunchAgent } from "../src/workspace-service.ts";

function sampleInput(content = "今天确认北侧仍有两台待核验。") {
  return {
    mode: "organize" as const,
    question: "整理当前工作",
    source: {
      scope: { graphId: "g1", rootUuid: "r1", pageName: "机房交接" },
      structureVersion: "sv1",
      sourceSetVersion: "ss1",
      blocks: [
        {
          sourceId: "src-1",
          target: { blockUuid: "b1" },
          availability: "available",
          content,
        },
      ],
    },
  };
}

test("companion server runs decoupled reading jobs asynchronously, survives client switch, hot-reloads providers, and enforces 0600 privacy", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "reading-hub-")));
  const stateDir = join(root, "state");
  let callCount = 0;
  let releaseModel!: () => void;
  let modelDelay = new Promise<void>((resolve) => {
    releaseModel = resolve;
  });

  const fakeDeepSeek = createServer(async (req, res) => {
    callCount++;
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { model: string };
    await modelDelay;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: JSON.stringify({
                paragraphs: [
                  {
                    key: "summary",
                    markdown: `由 ${body.model} 完成整理。`,
                    kind: "fact",
                    sourceIds: ["s1"],
                  },
                ],
              }),
            },
          },
        ],
      })
    );
  });
  await new Promise<void>((resolve) => fakeDeepSeek.listen(0, "127.0.0.1", resolve));
  const modelPort = (fakeDeepSeek.address() as AddressInfo).port;

  const server = await startWorkspaceServer({
    stateDirectory: stateDir,
    reading: {
      env: { DEEPSEEK_API_KEY: "ds-secret-token" },
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
    return { status: response.status, body: (await response.json()) as { value?: unknown; error?: { code: string; message: string } } };
  };

  try {
    // 1. Write 0600 providers.json pointing to fakeDeepSeek + local loopback profile
    const providersFile = join(stateDir, "providers.json");
    await writeFile(
      providersFile,
      JSON.stringify({
        schemaVersion: 1,
        routes: { fast: "deepseek-flash", deep: "deepseek-flash", local: "ollama-local" },
        budget: { maxStepsPerRun: 8, timeoutMs: 30000, backgroundMaxPerHour: 1, backgroundMaxPerDay: 5 },
        profiles: {
          "deepseek-flash": {
            label: "DeepSeek 默认",
            kind: "openai-compatible",
            baseUrl: `http://127.0.0.1:${modelPort}/v1`,
            model: "deepseek-chat",
            apiKey: "env:DEEPSEEK_API_KEY",
            locality: "remote",
          },
          "ollama-local": {
            label: "本地模型",
            kind: "openai-compatible",
            baseUrl: `http://127.0.0.1:${modelPort}/v1`,
            model: "qwen3:14b",
            locality: "local",
          },
        },
      }),
      { mode: 0o600 }
    );

    // 2. Providers endpoint returns sanitized list without leaking API keys
    const listRes = await postPlugin("/plugin/reading-providers", {});
    assert.equal(listRes.status, 200);
    assert.equal(JSON.stringify(listRes.body).includes("ds-secret-token"), false);

    // 3. Start async background job (simulating user leaving page right after start)
    const startRes = await postPlugin("/plugin/reading-jobs/start", {
      workKey: "work-A",
      planId: "progressive-reading",
      refreshKey: "rk-1",
      trigger: "background",
      privacyMode: "default",
      input: sampleInput(),
    });
    assert.equal(startRes.status, 200);
    const started = startRes.body.value as { job: { jobId: string; status: string }; deduplicated: boolean };
    assert.equal(started.job.status, "running");
    assert.equal(started.deduplicated, false);

    // Duplicate background start with same refreshKey deduplicates instead of hitting API twice
    const dupRes = await postPlugin("/plugin/reading-jobs/start", {
      workKey: "work-A",
      planId: "progressive-reading",
      refreshKey: "rk-1",
      trigger: "background",
      privacyMode: "default",
      input: sampleInput(),
    });
    assert.equal((dupRes.body.value as { deduplicated: boolean }).deduplicated, true);

    // Release fake DeepSeek response while user is "away"
    releaseModel();
    let polled: { job: { status: string; jobId: string; result?: { paragraphs: Array<{ markdown: string }>; agentRun: { model: string } } } | null } = { job: null };
    for (let i = 0; i < 30; i++) {
      const check = await postPlugin("/plugin/reading-jobs/status", { workKey: "work-A" });
      polled = check.body.value as typeof polled;
      if (polled.job?.status === "completed") break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.equal(polled.job?.status, "completed");
    assert.equal(polled.job?.result?.agentRun.model, "deepseek-chat");
    assert.equal(callCount, 1);

    // Ack staged job clears it
    const ackRes = await postPlugin("/plugin/reading-jobs/ack", { jobId: started.job.jobId });
    assert.equal((ackRes.body.value as { acknowledged: boolean }).acknowledged, true);
    const afterAck = await postPlugin("/plugin/reading-jobs/status", { workKey: "work-A" });
    assert.equal((afterAck.body.value as { job: unknown }).job, null);

    // 4. Second background job with new refreshKey hits hourly budget limit (=1), while manual still works!
    modelDelay = Promise.resolve();
    const pausedBg = await postPlugin("/plugin/reading-jobs/start", {
      workKey: "work-A",
      refreshKey: "rk-2",
      trigger: "background",
      privacyMode: "default",
      input: sampleInput(),
    });
    assert.equal(pausedBg.status, 400);
    assert.equal(pausedBg.body.error?.code, "READING_BACKGROUND_BUDGET_PAUSED");

    // Manual local-only request routes to ollama-local even while background budget is paused!
    const localManual = await postPlugin("/plugin/reading-model", {
      trigger: "manual",
      privacyMode: "local-only",
      input: sampleInput(),
    });
    assert.equal(localManual.status, 200);
    assert.equal((localManual.body.value as { agentRun: { providerId: string; model: string } }).agentRun.providerId, "ollama-local");
    assert.equal((localManual.body.value as { agentRun: { model: string } }).agentRun.model, "qwen3:14b");

    // 5. Hot-reload route switch via /plugin/reading-providers/route without server restart
    const switched = await postPlugin("/plugin/reading-providers/route", { defaultProfileId: "ollama-local" });
    assert.equal(switched.status, 200);
    assert.equal((switched.body.value as { routes: { fast: string } }).routes.fast, "ollama-local");

    // 6. Reject non-private providers.json (0644)
    await chmod(providersFile, 0o644);
    const unsafe = await postPlugin("/plugin/reading-providers", {});
    assert.equal(unsafe.status, 400);
    assert.equal(unsafe.body.error?.code, "READING_CONFIG_NOT_PRIVATE");
  } finally {
    await server.close();
    await new Promise<void>((resolve) => fakeDeepSeek.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});

test("workspace provider CLI manages profiles safely and LaunchAgent plist renders cleanly without secrets", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "reading-cli-")));
  const stateDir = join(root, "state");
  const launchDir = join(root, "LaunchAgents");
  const outputs: string[] = [];
  const errors: string[] = [];
  const io = { out: (line: string) => outputs.push(line), err: (line: string) => errors.push(line) };

  try {
    assert.equal(
      await runWorkspaceCli(
        [
          "workspace",
          "provider",
          "set",
          "ollama-local",
          "--kind",
          "openai-compatible",
          "--base-url",
          "http://127.0.0.1:11434/v1",
          "--model",
          "qwen3:14b",
          "--locality",
          "local",
          "--label",
          "本机 Ollama",
          "--state-dir",
          stateDir,
          "--json",
        ],
        io
      ),
      0
    );
    assert.equal((await stat(join(stateDir, "providers.json"))).mode & 0o077, 0);

    assert.equal(
      await runWorkspaceCli(["workspace", "provider", "route", "--local", "ollama-local", "--state-dir", stateDir, "--json"], io),
      0
    );
    const routed = JSON.parse(outputs.at(-1)!) as { routes: { local: string } };
    assert.equal(routed.routes.local, "ollama-local");

    // LaunchAgent plist install & uninstall with mocked launchctl (never mutating real user LaunchAgents)
    const calls: string[][] = [];
    const installed = await installWorkspaceLaunchAgent(stateDir, {
      platform: "darwin",
      launchAgentsDir: launchDir,
      nodePath: "/opt/homebrew/opt/node@20/bin/node",
      entryArgs: ["/app/workspace.mjs"],
      uid: 501,
      runLaunchctl: (args) => {
        calls.push(args);
        return { status: 0, stdout: "", stderr: "" };
      },
    });
    assert.equal(installed.loaded, true);
    const plistText = await readFile(installed.plistPath, "utf8");
    assert.match(plistText, /com\.task-copilot\.workspace-companion/);
    assert.match(plistText, /workspace\.mjs/);
    assert.equal(plistText.includes("DEEPSEEK_API_KEY"), false);
    assert.ok(calls.some((args) => args[0] === "bootstrap"));

    const removed = await uninstallWorkspaceLaunchAgent(stateDir, {
      platform: "darwin",
      launchAgentsDir: launchDir,
      uid: 501,
      runLaunchctl: () => ({ status: 0, stdout: "", stderr: "" }),
    });
    assert.equal(removed.removed, true);

    const rendered = renderWorkspaceLaunchAgentPlist({
      nodePath: "/usr/local/bin/node",
      entryArgs: ["/path/to/workspace.mjs"],
      stateDir: "/Users/test/.task-copilot-workspace",
      logPath: "/Users/test/.task-copilot-workspace/companion.log",
    });
    assert.match(rendered, /RunAtLoad/);
    assert.equal(errors.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
