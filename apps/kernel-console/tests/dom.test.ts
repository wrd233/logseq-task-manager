import assert from "node:assert/strict";
import test from "node:test";
import { Window } from "happy-dom";

const window = new Window();
// @ts-expect-error happy-dom global assignment for DOM helper tests
globalThis.document = window.document;
// @ts-expect-error happy-dom global assignment for DOM helper tests
globalThis.Node = window.Node;

import { el } from "../src/dom.ts";

test("el creates elements with class, text, and dataset", () => {
  const node = el("button", { class: "tc-nav tc-active", dataset: { tcFormal: "true" }, type: "button" }, "正式事项");
  assert.equal(node.tagName, "BUTTON");
  assert.equal(node.className, "tc-nav tc-active");
  assert.equal(node.dataset.tcFormal, "true");
  assert.equal(node.textContent, "正式事项");
});

test("el attaches event listeners and appends children", () => {
  let clicked = 0;
  const child = el("span", {}, "child");
  const node = el("div", { onclick: () => { clicked += 1; } }, child, " tail");
  assert.equal(node.children.length, 1);
  node.dispatchEvent(new window.Event("click") as unknown as Event);
  assert.equal(clicked, 1);
  assert.equal(node.textContent, "child tail");
});
