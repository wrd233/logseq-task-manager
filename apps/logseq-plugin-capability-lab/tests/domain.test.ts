import assert from "node:assert/strict";
import test from "node:test";
import {
  CAPABILITY_MARKER, DEFAULT_EXPERIMENT_PAGE, LAB_PAGE_NAMESPACE, OWNER_MARKER, PLUGIN_ID,
  canDeleteBlock, checkPageOwnership, formatError, isCapabilityLabContent, makeExperimentContent,
  makeLabPageProperties, matchesContentWithHostIdentityProperty, normalizeSettings, parsePageReference, summarizeText, validateExperimentPageName,
} from "../src/domain.ts";

test("settings default to the fixed lab namespace", () => {
  assert.equal(normalizeSettings(undefined).experimentPageName, DEFAULT_EXPERIMENT_PAGE);
  assert.ok(DEFAULT_EXPERIMENT_PAGE.startsWith(LAB_PAGE_NAMESPACE));
  assert.equal(normalizeSettings({ experimentPageName: "   " }).experimentPageName, "", "an explicit empty setting must remain invalid");
});

test("page name validation rejects business, Journal-like, empty, and bare namespace targets", () => {
  for (const name of ["", "Project/Real", "Area/Health", "2026-07-17", "Task Copilot Lab/"]) {
    assert.equal(validateExperimentPageName(name).valid, false, name);
  }
  assert.equal(validateExperimentPageName("Task Copilot Lab/Capability Lab 2").valid, true);
});

test("page ownership requires UUID and all three plugin properties", () => {
  const page = { uuid: "page-uuid", name: "task copilot lab/capability lab", originalName: DEFAULT_EXPERIMENT_PAGE, properties: makeLabPageProperties("lab-page-page-uuid", "page-uuid") };
  assert.equal(checkPageOwnership(page).owned, true);
  assert.equal(checkPageOwnership({
    ...page,
    properties: { id: "page-uuid", capabilityLab: true, capabilityLabOwner: PLUGIN_ID, capabilityLabPageId: "lab-page-page-uuid" },
  }).owned, true, "Logseq Desktop exposes kebab-case page properties as camelCase runtime keys");
  assert.equal(checkPageOwnership({ ...page, properties: { ...page.properties, id: "different-page-uuid" } }).owned, true,
    "File Graph page UUID is session-scoped even when a distinct id property is visible; stable lab ownership does not equate them");
  assert.equal(checkPageOwnership({ ...page, properties: { "capability-lab": true } }).owned, false);
  assert.equal(checkPageOwnership({ ...page, properties: { ...makeLabPageProperties("lab-page-page-uuid", "page-uuid"), "capability-lab-owner": "other" } }).owned, false);
  assert.equal(makeLabPageProperties("lab-page-page-uuid", "page-uuid")["capability-lab-owner"], PLUGIN_ID);
  assert.equal(checkPageOwnership({ ...page, originalName: "Project/Renamed Lab" }).owned, false);
});

test("page reference parser supports number, id, UUID, name, and structured failure", () => {
  assert.deepEqual(parsePageReference(42).identities, [42]);
  assert.deepEqual(parsePageReference({ id: 42 }).identities, [42]);
  assert.deepEqual(parsePageReference({ uuid: "page-u", id: 42 }).identities, ["page-u", 42]);
  assert.deepEqual(parsePageReference({ name: "Task Copilot Lab/X" }).identities, ["Task Copilot Lab/X"]);
  const failure = parsePageReference({ unexpected: true });
  assert.equal(failure.resolved, false);
  assert.match(failure.observedShape, /unexpected/);
});

test("experiment content always includes both deletion safety markers", () => {
  const content = makeExperimentContent("Block CRUD", "run-1");
  assert.ok(content.includes(CAPABILITY_MARKER));
  assert.ok(content.includes(OWNER_MARKER));
  assert.equal(isCapabilityLabContent(content), true);
});

test("custom UUID content accepts only Logseq's exact host identity property", () => {
  const expected = makeExperimentContent("Move", "run-identity");
  assert.equal(matchesContentWithHostIdentityProperty(expected, expected, "block-uuid"), true);
  assert.equal(matchesContentWithHostIdentityProperty(`${expected}\nid:: block-uuid`, expected, "block-uuid"), true);
  assert.equal(matchesContentWithHostIdentityProperty(`${expected}\nid:: other-uuid`, expected, "block-uuid"), false);
  assert.equal(matchesContentWithHostIdentityProperty(`${expected}\nid:: block-uuid\nunexpected:: value`, expected, "block-uuid"), false);
});

test("deletion requires registered creation page UUID and current owned page identity", () => {
  const content = makeExperimentContent("Delete", "run-2");
  const registered = { blockUuid: "safe-uuid", pageUuid: "page-uuid" };
  const registeredPage = { pageUuid: "page-uuid", labPageId: "lab-page-page-uuid" };
  const ownership = checkPageOwnership({ uuid: "page-uuid", name: DEFAULT_EXPERIMENT_PAGE, properties: makeLabPageProperties("lab-page-page-uuid", "page-uuid") });
  assert.equal(canDeleteBlock({ uuid: "safe-uuid", content, resolvedPageUuid: "page-uuid" }, registered, registeredPage, ownership).allowed, true);
  assert.equal(canDeleteBlock({ uuid: "safe-uuid", content, resolvedPageUuid: "other-page" }, registered, registeredPage, ownership).allowed, false);
  assert.equal(canDeleteBlock({ uuid: "safe-uuid", content: "ordinary note", resolvedPageUuid: "page-uuid" }, registered, registeredPage, ownership).allowed, false);
  assert.equal(canDeleteBlock({ uuid: "safe-uuid", content, resolvedPageUuid: "page-uuid" }, null, registeredPage, ownership).allowed, false);
  const drifted = checkPageOwnership({ uuid: "page-uuid", name: DEFAULT_EXPERIMENT_PAGE, properties: makeLabPageProperties("changed-id", "page-uuid") });
  assert.equal(canDeleteBlock({ uuid: "safe-uuid", content, resolvedPageUuid: "page-uuid" }, registered, registeredPage, drifted).allowed, false);
  const renamedOutsideLab = checkPageOwnership({ uuid: "page-uuid", originalName: "Project/Renamed Lab", properties: makeLabPageProperties("lab-page-page-uuid", "page-uuid") });
  assert.equal(canDeleteBlock({ uuid: "safe-uuid", content, resolvedPageUuid: "page-uuid" }, registered, registeredPage, renamedOutsideLab).allowed, false);
});

test("cleanup safety remains tied to page UUID after the configured page name changes", () => {
  const oldPage = checkPageOwnership({
    uuid: "historical-page-uuid",
    name: "Task Copilot Lab/Old Setting",
    properties: makeLabPageProperties("lab-page-historical-page-uuid", "historical-page-uuid"),
  });
  const decision = canDeleteBlock(
    { uuid: "old-block", content: makeExperimentContent("Old", "run-old"), resolvedPageUuid: "historical-page-uuid" },
    { blockUuid: "old-block", pageUuid: "historical-page-uuid" },
    { pageUuid: "historical-page-uuid", labPageId: "lab-page-historical-page-uuid" },
    oldPage,
  );
  assert.equal(decision.allowed, true, "the current settings page name is intentionally not part of deletion authorization");
});

test("legacy pages without a stable lab page ID remain unowned and cannot be upgraded implicitly", () => {
  const legacy = { uuid: "legacy-page", originalName: "Task Copilot Lab/Legacy", properties: { id: "legacy-page", "capability-lab": true, "capability-lab-owner": PLUGIN_ID } };
  assert.equal(checkPageOwnership(legacy).owned, false);
  assert.match(checkPageOwnership(legacy).reason, /stable capability-lab-page-id/);
});

test("errors, empty text, and unavailable text have distinct display forms", () => {
  assert.equal(formatError(new Error("boom")), "Error: boom");
  assert.equal(summarizeText(null), "当前不可用");
  assert.equal(summarizeText(""), "（空字符串）");
  assert.equal(summarizeText("abcde", 4), "abc…");
});
