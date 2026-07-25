import assert from "node:assert/strict";
import test from "node:test";

import {
  GRILL_TURN_SCHEMA_VERSION,
  grillReadiness,
  materializeGrillTurn,
  requiredGrillFocus,
  type GrillTurnAuthority,
} from "../src/grill-session.ts";

function authority(resolved: string[] = []): GrillTurnAuthority {
  const status = (id: string) => resolved.includes(id) ? "RESOLVED" as const : "OPEN" as const;
  return {
    observedAt: "2026-07-24T12:00:00.000Z",
    contractVersion: "1.0.0",
    promptVersion: "prompt-v1",
    skill: { name: "mini-project-modeling", version: "1.0.0" },
    provider: { providerId: "deepseek", providerVersion: "chat-v1", model: "deepseek-v4-flash" },
    subject: { kind: "MINI_PROJECT", objectId: "mini-1", version: 3 },
    sourceFingerprint: "a".repeat(64),
    facts: [{ factId: "current-material", text: "已有设备清单和厂家参数等待记录。", sourceRefs: ["object:mini-1@v3", "block:block-1"] }],
    uncertainties: [
      { uncertaintyId: "u-outcome", dimension: "OUTCOME", status: status("u-outcome"), priority: 20, critical: true, evidenceRefs: ["object:mini-1@v3"] },
      { uncertaintyId: "u-boundary", dimension: "BOUNDARY", status: status("u-boundary"), priority: 10, critical: true, evidenceRefs: ["block:block-1"] },
      { uncertaintyId: "u-completion", dimension: "COMPLETION_EVIDENCE", status: status("u-completion"), priority: 30, critical: true, evidenceRefs: ["object:mini-1@v3"] },
      { uncertaintyId: "u-material", dimension: "UNCLASSIFIED_MATERIAL", status: status("u-material"), priority: 5, critical: false, evidenceRefs: ["block:block-2"] },
    ],
    unclassifiedMaterialRefs: resolved.includes("u-material") ? [] : ["block:block-2"],
  };
}

function draft(focus = "u-boundary") {
  return {
    schemaVersion: GRILL_TURN_SCHEMA_VERSION,
    understanding: "当前材料说明设备清单已形成，但范围边界还没有明确。",
    factRefs: ["current-material"],
    inferences: [{ text: "可能只需要覆盖本次托管设备。", evidenceRefs: ["block:block-1"] }],
    unknowns: [{ uncertaintyId: focus, text: "纳入哪些设备仍未确认。" }],
    readiness: "CONTINUE",
    focusUncertaintyId: focus,
    questions: [{ uncertaintyId: focus, text: "这次范围只包含当前清单，还是也包含后续新增设备？" }],
    recommendation: { text: "建议先封顶为当前清单，新增设备另行确认。", evidenceRefs: ["block:block-1"], tradeoffs: ["边界清楚，但新增设备需要后续补充"] },
  };
}

test("machine priority selects the largest real uncertainty instead of a fixed questionnaire order", () => {
  assert.equal(requiredGrillFocus(authority())?.uncertaintyId, "u-boundary");
  const first = materializeGrillTurn(draft(), authority());
  assert.equal(first.questionGroup?.focusUncertaintyId, "u-boundary");
  assert.equal(first.authorityBoundary, "SESSION_DRAFT_ONLY");
  assert.deepEqual(first.facts, [{ text: "已有设备清单和厂家参数等待记录。", sourceRefs: ["object:mini-1@v3", "block:block-1"] }]);

  const afterAnswer = authority(["u-boundary"]);
  assert.equal(requiredGrillFocus(afterAnswer)?.uncertaintyId, "u-outcome", "the next branch follows remaining evidence, not field order");
  assert.throws(() => materializeGrillTurn(draft("u-boundary"), afterAnswer), /largest open uncertainty|open machine uncertainties/);
});

test("preview readiness is machine-owned and requires every dimension plus unclassified material to be resolved", () => {
  assert.equal(grillReadiness(authority(["u-outcome", "u-boundary", "u-completion"])), "CONTINUE");
  assert.throws(() => materializeGrillTurn({ ...draft("u-material"), readiness: "READY_FOR_PREVIEW", focusUncertaintyId: undefined, questions: [], recommendation: undefined }, authority(["u-outcome", "u-boundary", "u-completion"])), /machine-owned readiness/);

  const readyAuthority = authority(["u-outcome", "u-boundary", "u-completion", "u-material"]);
  const ready = materializeGrillTurn({
    schemaVersion: GRILL_TURN_SCHEMA_VERSION,
    understanding: "成果、范围、完成证据和原始材料去向均已确认，可进入结构预览。",
    factRefs: ["current-material"],
    inferences: [],
    unknowns: [],
    readiness: "READY_FOR_PREVIEW",
    questions: [],
  }, readyAuthority);
  assert.equal(ready.readiness, "READY_FOR_PREVIEW");
  assert.equal(ready.questionGroup, undefined);
});

test("unknown IDs, invented evidence, extra authority fields, and premature focus all fail closed", () => {
  assert.throws(() => materializeGrillTurn({ ...draft(), factRefs: ["invented"] }, authority()), /unknown or duplicate fact/);
  assert.throws(() => materializeGrillTurn({ ...draft(), inferences: [{ text: "越界", evidenceRefs: ["block:invented"] }] }, authority()), /unsupported evidence/);
  assert.throws(() => materializeGrillTurn({ ...draft(), focusUncertaintyId: "u-outcome", questions: [{ uncertaintyId: "u-outcome", text: "先问成果？" }] }, authority()), /largest open uncertainty/);
  assert.throws(() => materializeGrillTurn({
    ...draft(),
    questions: [
      { uncertaintyId: "u-boundary", text: "这次范围只包含当前清单吗？" },
      { uncertaintyId: "u-outcome", text: "最终成果是什么？" },
    ],
  }, authority()), /questions are invalid/);
  assert.throws(() => materializeGrillTurn({ ...draft(), understanding: "The current boundary is unclear." }, authority()), /must use natural Chinese/);
  assert.throws(() => materializeGrillTurn({ ...draft(), recommendation: undefined }, authority()), /recommendation with tradeoffs/);
  assert.throws(() => materializeGrillTurn({ ...draft(), commit: true }, authority()), /unsupported field commit/);
});

test("model provenance and scope are replaced by machine authority without exposing object identity as prose", () => {
  const output = materializeGrillTurn(draft(), authority());
  assert.equal(output.provenance.model, "deepseek-v4-flash");
  assert.match(output.evidenceScope.scopeHash, /^[a-f0-9]{8}$/);
  assert.equal("subject" in output, false);
  assert.equal("proposal" in output, false);
  assert.equal("operations" in output, false);
});

test("user-visible Grill prose rejects opaque Object and Block identities while structured refs remain available", () => {
  assert.throws(
    () => materializeGrillTurn({
      ...draft(),
      understanding: "当前材料属于 obj_7a21df934a63，但范围仍未明确。",
    }, authority()),
    /machine identity.*user-visible prose/i,
  );
  assert.throws(
    () => materializeGrillTurn({
      ...draft(),
      questions: [{
        uncertaintyId: "u-boundary",
        text: "是否继续使用根 Block 6a622050-1ee6-4ef0-95cb-92263be67408？",
      }],
    }, authority()),
    /machine identity.*user-visible prose/i,
  );
});

test("Project creation Grill supports blank, Page, and MiniProject sources without inventing an Object identity", () => {
  const projectAuthority: GrillTurnAuthority = {
    observedAt: "2026-07-25T04:30:00.000Z",
    contractVersion: "1.1.0",
    promptVersion: "project-create-v1",
    skill: { name: "project-creation-modeling", version: "1.0.0" },
    provider: { providerId: "deepseek", providerVersion: "chat-v1", model: "deepseek-v4-flash" },
    subject: { kind: "PROJECT_CREATION", sourceKind: "PAGE", sourceRefs: ["page:page-1"] },
    sourceFingerprint: "b".repeat(64),
    facts: [{ factId: "page-material", text: "当前页记录了跨季度交付和多个可独立收口的工作包。", sourceRefs: ["page:page-1"] }],
    uncertainties: [
      { uncertaintyId: "u-outcome", dimension: "OUTCOME", status: "RESOLVED", priority: 20, critical: true, evidenceRefs: ["page:page-1"] },
      { uncertaintyId: "u-boundary", dimension: "BOUNDARY", status: "RESOLVED", priority: 10, critical: true, evidenceRefs: ["page:page-1"] },
      { uncertaintyId: "u-completion", dimension: "COMPLETION_EVIDENCE", status: "RESOLVED", priority: 30, critical: true, evidenceRefs: ["page:page-1"] },
      { uncertaintyId: "u-material", dimension: "UNCLASSIFIED_MATERIAL", status: "RESOLVED", priority: 40, critical: false, evidenceRefs: ["page:page-1"] },
      { uncertaintyId: "u-closure", dimension: "INTERNAL_CLOSURE", status: "OPEN", priority: 5, critical: true, evidenceRefs: ["page:page-1"] },
      { uncertaintyId: "u-interface", dimension: "CURRENT_INTERFACE", status: "OPEN", priority: 15, critical: true, evidenceRefs: ["page:page-1"] },
      { uncertaintyId: "u-page-object", dimension: "PAGE_OBJECT_RELATIONSHIP", status: "OPEN", priority: 16, critical: true, evidenceRefs: ["page:page-1"] },
    ],
    unclassifiedMaterialRefs: [],
  };

  assert.equal(grillReadiness(projectAuthority), "CONTINUE");
  assert.equal(requiredGrillFocus(projectAuthority)?.uncertaintyId, "u-closure");
  assert.equal("objectId" in projectAuthority.subject, false);

  const readyAuthority: GrillTurnAuthority = {
    ...projectAuthority,
    uncertainties: projectAuthority.uncertainties.map((uncertainty) => ({ ...uncertainty, status: "RESOLVED" })),
  };
  assert.equal(grillReadiness(readyAuthority), "READY_FOR_PREVIEW");

  for (const source of [
    { kind: "PROJECT_CREATION" as const, sourceKind: "BLANK" as const, sourceRefs: [] },
    { kind: "PROJECT_CREATION" as const, sourceKind: "MINI_PROJECT" as const, sourceRefs: ["object:mini-1@v3"] },
  ]) {
    assert.doesNotThrow(() => grillReadiness({ ...readyAuthority, subject: source }));
  }
  assert.throws(
    () => grillReadiness({ ...readyAuthority, subject: { kind: "PROJECT_CREATION", sourceKind: "PAGE", sourceRefs: [] } }),
    /retain bounded source evidence/,
  );
  assert.throws(
    () => grillReadiness({ ...readyAuthority, subject: { kind: "PROJECT_CREATION", sourceKind: "BLANK", sourceRefs: ["page:invented"] } }),
    /cannot claim source evidence/,
  );
  assert.throws(
    () => grillReadiness({ ...readyAuthority, uncertainties: readyAuthority.uncertainties.filter((item) => item.dimension !== "CURRENT_INTERFACE") }),
    /missing CURRENT_INTERFACE/,
  );
  assert.throws(
    () => grillReadiness({ ...readyAuthority, uncertainties: readyAuthority.uncertainties.filter((item) => item.dimension !== "PAGE_OBJECT_RELATIONSHIP") }),
    /missing PAGE_OBJECT_RELATIONSHIP/,
  );
});
