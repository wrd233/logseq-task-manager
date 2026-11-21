import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import {
  BackgroundBudgetTracker,
  defaultReadingConfig,
  filterReadingMaterialsForLocality,
  isSensitiveMaterialName,
  parseReadingConfig,
  runReadingTask,
  sanitizeReadingProviders,
  type ReadingModelInput,
} from "../src/index.ts";

function shortInput(): ReadingModelInput {
  return {
    mode: "organize",
    question: "整理短事项",
    source: {
      scope: { graphId: "g1", rootUuid: "r1", pageName: "短事项" },
      structureVersion: "sv1",
      sourceSetVersion: "ss1",
      blocks: [
        {
          sourceId: "src-1",
          target: { blockUuid: "blk-1" },
          availability: "available",
          content: "明天下午三点发复核提醒。",
        },
      ],
    },
  };
}

function longInputWithMaterials(): ReadingModelInput {
  const longText = `${"前文记录说明。".repeat(700)}\n现场核对唯一编号 QPA-9472；仅作查找线索。`;
  return {
    mode: "organize",
    question: "核实记录和长附件尾部编号",
    source: {
      scope: { graphId: "g1", rootUuid: "r2", pageName: "验收交接计划" },
      structureVersion: "sv2",
      sourceSetVersion: "ss2",
      blocks: [
        { sourceId: "src-1", target: { blockUuid: "b1" }, availability: "available", content: "北侧仍有两台待核验。" },
        { sourceId: "src-2", target: { blockUuid: "b2" }, availability: "available", content: "南侧已取得签字回执。" },
        { sourceId: "src-3", target: { blockUuid: "b3" }, availability: "available", content: "核查关联附件末尾编号。" },
      ],
    },
    materials: [
      {
        id: "mat-long",
        filename: "验收核对长附件.md",
        version: "v1",
        availability: "available",
        excerpt: longText.slice(0, 400),
        text: longText,
        truncated: false,
      },
      {
        id: "mat-secret",
        filename: ".env.production",
        version: "v1",
        availability: "available",
        excerpt: "SECRET_TOKEN=super-secret-value",
        text: "SECRET_TOKEN=super-secret-value",
        truncated: false,
      },
    ],
  };
}

test("sensitive material filter blocks secrets for remote providers while keeping them for local models", () => {
  assert.equal(isSensitiveMaterialName(".env"), true);
  assert.equal(isSensitiveMaterialName(".env.local"), true);
  assert.equal(isSensitiveMaterialName("config/prod.key"), true);
  assert.equal(isSensitiveMaterialName("id_ed25519"), true);
  assert.equal(isSensitiveMaterialName("api-secrets.json"), true);
  assert.equal(isSensitiveMaterialName("验收核对长附件.md"), false);

  const remote = filterReadingMaterialsForLocality(longInputWithMaterials().materials, "remote");
  assert.deepEqual(remote.redactedMaterials, [".env.production"]);
  const redacted = remote.materials.find((m) => m.id === "mat-secret")!;
  assert.equal(redacted.text, undefined);
  assert.equal(redacted.excerpt, undefined);
  assert.equal(redacted.sensitiveRedacted, true);

  const local = filterReadingMaterialsForLocality(longInputWithMaterials().materials, "local");
  assert.deepEqual(local.redactedMaterials, []);
  assert.match(local.materials.find((m) => m.id === "mat-secret")!.text!, /super-secret-value/);
});

test("config validation enforces loopback URLs for local profiles and sanitization never leaks API keys", () => {
  assert.throws(
    () =>
      parseReadingConfig({
        schemaVersion: 1,
        routes: { fast: "bad-local", deep: "bad-local", local: "bad-local" },
        profiles: {
          "bad-local": {
            label: "Bad Local",
            kind: "openai-compatible",
            baseUrl: "https://api.deepseek.com/v1",
            model: "deepseek-chat",
            locality: "local",
          },
        },
      }),
    /loopback/i
  );

  const config = parseReadingConfig({
    schemaVersion: 1,
    routes: { fast: "deepseek-flash", deep: "deepseek-flash", local: "ollama" },
    profiles: {
      "deepseek-flash": {
        label: "DeepSeek",
        kind: "openai-compatible",
        baseUrl: "https://api.deepseek.com/v1",
        model: "deepseek-chat",
        apiKey: "sk-inline-secret-must-never-leak",
        locality: "remote",
      },
      ollama: {
        label: "Ollama",
        kind: "openai-compatible",
        baseUrl: "http://127.0.0.1:11434/v1",
        model: "qwen3:14b",
        locality: "local",
      },
    },
  });

  const safe = sanitizeReadingProviders(config, {}, { dshAvailable: false, source: "file", backgroundUsedLastHour: 2, backgroundUsedLastDay: 5 });
  assert.equal(JSON.stringify(safe).includes("sk-inline-secret"), false);
  assert.equal(safe.profiles.find((p) => p.id === "deepseek-flash")?.configured, true);
  assert.equal(safe.profiles.find((p) => p.id === "ollama")?.configured, true);
});

test("L1 fast path calls OpenAI-compatible API directly and strips unknown fields", async () => {
  const receivedHeaders: Array<string | undefined> = [];
  const server = createServer(async (req, res) => {
    receivedHeaders.push(req.headers.authorization);
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { tools?: unknown };
    assert.equal(body.tools, undefined);
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
                    key: "reminder",
                    markdown: "明天下午三点发送复核提醒。",
                    kind: "fact",
                    sourceIds: ["s1"],
                    extraField: "ignored",
                  },
                ],
              }),
            },
          },
        ],
      })
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const port = (server.address() as AddressInfo).port;
    const config = parseReadingConfig({
      schemaVersion: 1,
      routes: { fast: "deepseek-flash", deep: "deepseek-flash", local: null },
      profiles: {
        "deepseek-flash": {
          label: "DeepSeek",
          kind: "openai-compatible",
          baseUrl: `http://127.0.0.1:${port}/v1`,
          model: "deepseek-chat",
          apiKey: "env:TEST_DS_KEY",
          locality: "remote",
        },
      },
    });
    const result = await runReadingTask({
      input: shortInput(),
      config,
      env: { TEST_DS_KEY: "ds-test-key" },
    });
    assert.equal(receivedHeaders[0], "Bearer ds-test-key");
    assert.equal(result.agentRun.path, "fast");
    assert.equal("paragraphs" in result && result.paragraphs[0]?.sourceIds[0], "src-1");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("L2 4-tool loop enforces unread-citation rejection, redacts remote secrets, and reads long material tail", async () => {
  let turn = 0;
  let sawSecretInPayload = false;
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const rawBody = Buffer.concat(chunks).toString("utf8");
    if (rawBody.includes("super-secret-value")) sawSecretInPayload = true;
    const body = JSON.parse(rawBody) as { messages: Array<{ role: string; content: string }> };
    turn++;
    res.writeHead(200, { "content-type": "application/json" });
    if (turn === 1) {
      // First try reading index + attempt premature submit (which must fail!)
      res.end(
        JSON.stringify({
          choices: [
            {
              finish_reason: "tool_calls",
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  { id: "c1", type: "function", function: { name: "logseq_reading_request", arguments: "{}" } },
                  {
                    id: "c2",
                    type: "function",
                    function: {
                      name: "logseq_reading_submit",
                      arguments: JSON.stringify({
                        paragraphs: [{ key: "bad", markdown: "未读先引", kind: "fact", sourceIds: ["s1"] }],
                      }),
                    },
                  },
                ],
              },
            },
          ],
        })
      );
      return;
    }
    if (turn === 2) {
      // Verify previous submit was rejected
      const submitReply = body.messages.at(-1)?.content ?? "";
      assert.match(submitReply, /Read the exact cited sources/);
      res.end(
        JSON.stringify({
          choices: [
            {
              finish_reason: "tool_calls",
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  { id: "c3", type: "function", function: { name: "logseq_source_read", arguments: JSON.stringify({ sourceIds: ["s1", "s2", "s3"] }) } },
                  { id: "c4", type: "function", function: { name: "logseq_file_read", arguments: JSON.stringify({ materialId: "m1" }) } },
                  { id: "c5", type: "function", function: { name: "logseq_file_read", arguments: JSON.stringify({ materialId: "m2" }) } },
                ],
              },
            },
          ],
        })
      );
      return;
    }
    // Verify m2 (.env.production) returned unavailable instead of secret
    const m2Reply = body.messages.at(-1)?.content ?? "";
    assert.match(m2Reply, /Sensitive file content is blocked/);
    res.end(
      JSON.stringify({
        choices: [
          {
            finish_reason: "tool_calls",
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "c6",
                  type: "function",
                  function: {
                    name: "logseq_reading_submit",
                    arguments: JSON.stringify({
                      paragraphs: [
                        {
                          key: "status",
                          markdown: "南侧已签字，北侧尚余两台待核验。",
                          cue: "待核验",
                          kind: "fact",
                          sourceIds: ["s1", "s2"],
                          details: [
                            {
                              key: "code",
                              markdown: "长附件末尾定位编号为 QPA-9472。",
                              sourceIds: ["s3"],
                              materialIds: ["m1"],
                              materialQuotes: [{ materialId: "m1", quote: "现场核对唯一编号 QPA-9472" }],
                            },
                          ],
                        },
                      ],
                    }),
                  },
                },
              ],
            },
          },
        ],
      })
    );
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const port = (server.address() as AddressInfo).port;
    const config = parseReadingConfig({
      schemaVersion: 1,
      routes: { fast: "ds", deep: "ds", local: null },
      profiles: {
        ds: {
          label: "DeepSeek",
          kind: "openai-compatible",
          baseUrl: `http://127.0.0.1:${port}/v1`,
          model: "deepseek-chat",
          apiKey: "test-key",
          locality: "remote",
        },
      },
    });
    const result = await runReadingTask({ input: longInputWithMaterials(), config });
    assert.equal(sawSecretInPayload, false, "Secret file content must never enter remote HTTP payload");
    assert.equal(result.agentRun.path, "agent");
    assert.equal(result.agentRun.steps, 3);
    assert.deepEqual(result.agentRun.redactedMaterials, [".env.production"]);
    assert.equal("paragraphs" in result && result.paragraphs[0]?.details?.[0]?.materialIds?.[0], "mat-long");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("Anthropic provider adapter supports tool loop and local-only privacy fails closed when unconfigured", async () => {
  const defaultCfg = defaultReadingConfig({ DEEPSEEK_API_KEY: "test-key" });
  await assert.rejects(
    runReadingTask({ input: shortInput(), config: defaultCfg, env: { DEEPSEEK_API_KEY: "test-key" }, privacyMode: "local-only" }),
    { code: "READING_LOCAL_MODEL_REQUIRED" }
  );

  let step = 0;
  const server = createServer(async (req, res) => {
    assert.equal(req.headers["x-api-key"], "ant-key");
    step++;
    res.writeHead(200, { "content-type": "application/json" });
    if (step === 1) {
      res.end(
        JSON.stringify({
          stop_reason: "tool_use",
          content: [
            { type: "tool_use", id: "tu1", name: "logseq_source_read", input: { sourceIds: ["s1", "s2", "s3"] } },
          ],
        })
      );
      return;
    }
    res.end(
      JSON.stringify({
        stop_reason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "tu2",
            name: "logseq_reading_submit",
            input: {
              paragraphs: [{ key: "p1", markdown: "核对完毕。", kind: "fact", sourceIds: ["s1"] }],
            },
          },
        ],
      })
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const port = (server.address() as AddressInfo).port;
    const config = parseReadingConfig({
      schemaVersion: 1,
      routes: { fast: "claude", deep: "claude", local: null },
      profiles: {
        claude: {
          label: "Claude",
          kind: "anthropic",
          baseUrl: `http://127.0.0.1:${port}`,
          model: "claude-sonnet",
          apiKey: "ant-key",
          locality: "remote",
        },
      },
    });
    const result = await runReadingTask({ input: longInputWithMaterials(), config });
    assert.equal(result.agentRun.providerId, "claude");
    assert.equal(result.agentRun.steps, 2);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("background budget pauses auto revisions after limit while manual requests still succeed", async () => {
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: JSON.stringify({
                paragraphs: [{ key: "k1", markdown: "已整理。", kind: "fact", sourceIds: ["s1"] }],
              }),
            },
          },
        ],
      })
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const port = (server.address() as AddressInfo).port;
    const config = parseReadingConfig({
      schemaVersion: 1,
      routes: { fast: "ds", deep: "ds", local: null },
      budget: { backgroundMaxPerHour: 1, backgroundMaxPerDay: 5 },
      profiles: {
        ds: {
          label: "DeepSeek",
          kind: "openai-compatible",
          baseUrl: `http://127.0.0.1:${port}/v1`,
          model: "deepseek-chat",
          apiKey: "key",
          locality: "remote",
        },
      },
    });
    const budget = new BackgroundBudgetTracker();
    await runReadingTask({ input: shortInput(), config, trigger: "background", budget });
    await assert.rejects(
      runReadingTask({ input: shortInput(), config, trigger: "background", budget }),
      { code: "READING_BACKGROUND_BUDGET_PAUSED" }
    );
    // Manual run MUST still succeed!
    const manual = await runReadingTask({ input: shortInput(), config, trigger: "manual", budget });
    assert.equal(manual.agentRun.path, "fast");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
