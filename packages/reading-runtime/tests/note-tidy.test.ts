import test from "node:test";
import assert from "node:assert/strict";
import {
  buildNoteTidyPlanFromOperations,
  detectBlockProtection,
  detectExistingStructure,
  runNoteTidyTask,
  type NoteTidySourceBlock,
  type ReadingRuntimeConfig,
} from "../src/index.ts";

const sampleConfig: ReadingRuntimeConfig = {
  schemaVersion: 1,
  routes: { fast: "ds", deep: "ds", local: null },
  budget: { maxStepsPerRun: 8, timeoutMs: 30_000, backgroundMaxPerHour: 12, backgroundMaxPerDay: 60 },
  profiles: {
    ds: {
      label: "DeepSeek",
      kind: "openai-compatible",
      baseUrl: "https://api.deepseek.com/v1",
      model: "deepseek-chat",
      apiKey: "env:DEEPSEEK_API_KEY",
      locality: "remote",
    },
  },
};

const sampleBlocks: NoteTidySourceBlock[] = [
  {
    sourceId: "s-1",
    blockUuid: "00000000-0000-4000-8000-000000000001",
    parentUuid: null,
    depth: 0,
    content: "**[MiniProject]** Q4 客户端重构",
    contentVersion: "v-1",
  },
  {
    sourceId: "s-2",
    blockUuid: "00000000-0000-4000-8000-000000000002",
    parentUuid: "00000000-0000-4000-8000-000000000001",
    depth: 1,
    content: "登录态迁移完成了 80%，参考 [[缓存方案对比]] 和 ((00000000-0000-4000-8000-000000000099))，定位编号 QPA-9472；目前冷启动白屏还没复现，周五前不能定发布窗口。",
    contentVersion: "v-2",
  },
  {
    sourceId: "s-3",
    blockUuid: "00000000-0000-4000-8000-000000000003",
    parentUuid: "00000000-0000-4000-8000-000000000001",
    depth: 1,
    content: "TODO 明天上午找测试复现低内存白屏日志",
    contentVersion: "v-3",
  },
];

test("detectBlockProtection identifies formal markers, TODOs, properties, and leaves ordinary prose editable", () => {
  assert.equal(detectBlockProtection("**[MiniProject]** 项目").protected, true);
  assert.equal(detectBlockProtection("TODO 找测试复现").protected, true);
  assert.equal(detectBlockProtection("id:: 1234-5678\n普通行").protected, true);
  assert.equal(detectBlockProtection("登录态迁移完成了 80%，参考 [[缓存方案对比]]").protected, false);
});

test("buildNoteTidyPlanFromOperations enforces hard protection, detects omitted links, and computes deterministic high-prior anchors", () => {
  // Reject editing protected formal or TODO block
  assert.throws(
    () =>
      buildNoteTidyPlanFromOperations({
        sourceSetVersion: "ss-1",
        structureVersion: "sv-1",
        summary: "尝试修改 TODO",
        blocks: sampleBlocks,
        operations: [
          {
            operationId: "op-bad",
            type: "replace-text",
            sourceId: "s-3",
            blockUuid: sampleBlocks[2]!.blockUuid,
            expectedContentVersion: "v-3",
            beforeText: sampleBlocks[2]!.content,
            afterText: "DONE 已完成",
          },
        ],
        origin: "external-mcp",
      }),
    { code: "PROTECTED_TARGET_FORBIDDEN" }
  );

  // Reject injecting TODO or property into ordinary block
  assert.throws(
    () =>
      buildNoteTidyPlanFromOperations({
        sourceSetVersion: "ss-1",
        structureVersion: "sv-1",
        summary: "尝试注入 TODO",
        blocks: sampleBlocks,
        operations: [
          {
            operationId: "op-inject",
            type: "replace-text",
            sourceId: "s-2",
            blockUuid: sampleBlocks[1]!.blockUuid,
            expectedContentVersion: "v-2",
            beforeText: sampleBlocks[1]!.content,
            afterText: "TODO 登录态迁移完成了 80%",
          },
        ],
        origin: "external-mcp",
      }),
    { code: "PROTECTED_TARGET_FORBIDDEN" }
  );

  // Valid edit that keeps links/metrics vs one that drops a [[link]] -> omittedAnchorIds flags the omission!
  const withOmission = buildNoteTidyPlanFromOperations({
    sourceSetVersion: "ss-1",
    structureVersion: "sv-1",
    summary: "理顺进度说明",
    blocks: sampleBlocks,
    operations: [
      {
        operationId: "op-1",
        type: "replace-text",
        sourceId: "s-2",
        blockUuid: sampleBlocks[1]!.blockUuid,
        expectedContentVersion: "v-2",
        beforeText: sampleBlocks[1]!.content,
        afterText: "登录态迁移已达 80%（编号 QPA-9472），因冷启动白屏尚未复现，需先修复再定发布窗口。",
      },
    ],
    origin: "external-mcp",
  });
  assert.equal(withOmission.protectedBlockCount, 2);
  assert.ok(withOmission.anchors.some((a) => a.before.exactText === "[[缓存方案对比]]" && a.after === null));
  assert.ok(withOmission.anchors.some((a) => a.before.exactText === "((00000000-0000-4000-8000-000000000099))" && a.after === null));
  assert.ok(withOmission.anchors.some((a) => a.before.exactText === "QPA-9472" && a.after?.exactText === "QPA-9472"));
  assert.ok(withOmission.omittedAnchorIds.length >= 2);
});

test("runNoteTidyTask aligns model anchors, respects local-only fail-closed privacy, and preserves structure awareness", async () => {
  assert.equal(detectExistingStructure(sampleBlocks), false);
  const deepStructured: NoteTidySourceBlock[] = [
    ...sampleBlocks,
    { sourceId: "s-4", blockUuid: "00000000-0000-4000-8000-000000000004", parentUuid: sampleBlocks[1]!.blockUuid, depth: 2, content: "子细节", contentVersion: "v-4" },
  ];
  assert.equal(detectExistingStructure(deepStructured), true);

  // Fail closed when privacyMode is local-only and routes.local is null
  await assert.rejects(
    runNoteTidyTask({
      input: {
        scope: { graphId: "g1", rootUuid: sampleBlocks[0]!.blockUuid },
        structureVersion: "sv-1",
        sourceSetVersion: "ss-1",
        blocks: sampleBlocks,
      },
      config: sampleConfig,
      env: { DEEPSEEK_API_KEY: "k" },
      privacyMode: "local-only",
    }),
    { code: "READING_LOCAL_MODEL_REQUIRED" }
  );

  let capturedPayload = "";
  const mockFetch: typeof fetch = (async (_url, init) => {
    capturedPayload = String(init?.body ?? "");
    return new Response(
      JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: JSON.stringify({
                summary: "理顺了进度表述，完整保留页面链接、块引用与编号 QPA-9472。",
                structuralChanges: [],
                edits: [
                  {
                    blockId: "b2",
                    afterText:
                      "登录态迁移已达 80%（编号 QPA-9472，详见 [[缓存方案对比]] 与 ((00000000-0000-4000-8000-000000000099))）；由于冷启动白屏尚未复现，需先排查再定发布窗口。",
                  },
                ],
                inserts: [],
                anchors: [
                  {
                    label: "80% 进度",
                    category: "metric",
                    beforeBlockId: "b2",
                    beforeText: "80%",
                    afterBlockId: "b2",
                    afterText: "80%",
                  },
                  {
                    label: "核心卡点",
                    category: "blocker",
                    beforeBlockId: "b2",
                    beforeText: "冷启动白屏",
                    afterBlockId: "b2",
                    afterText: "冷启动白屏",
                  },
                ],
              }),
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }) as typeof fetch;

  const plan = await runNoteTidyTask({
    input: {
      scope: { graphId: "g1", rootUuid: sampleBlocks[0]!.blockUuid },
      structureVersion: "sv-1",
      sourceSetVersion: "ss-1",
      blocks: sampleBlocks,
    },
    config: sampleConfig,
    env: { DEEPSEEK_API_KEY: "test-key" },
    fetchImpl: mockFetch,
  });

  assert.ok(capturedPayload.includes("protected"));
  assert.equal(plan.operations.length, 1);
  assert.equal(plan.operations[0]!.type, "replace-text");
  assert.equal(plan.omittedAnchorIds.length, 0);
  assert.ok(plan.anchors.some((a) => a.before.exactText === "[[缓存方案对比]]" && a.after?.exactText === "[[缓存方案对比]]"));
  assert.ok(plan.anchors.some((a) => a.before.exactText === "冷启动白屏" && a.after?.exactText === "冷启动白屏"));
  assert.equal(plan.meta.origin, "local-model");
});
