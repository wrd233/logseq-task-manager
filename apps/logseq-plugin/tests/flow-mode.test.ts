import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { Window } from "happy-dom";
import { FlowMode, type PaperAnchor } from "../src/features/stage/flow-mode.ts";

test("only native work editing hides chrome, with a cancellable delay and a safe paragraph toggle", async () => {
  const host = new Window();
  const doc = host.document as unknown as Document;
  doc.body.innerHTML = '<main id="main-content-container"><div class="ls-block" blockid="note"><div class="editor-wrapper"><textarea></textarea></div></div></main>';
  const anchors: PaperAnchor[] = [];
  const flow = new FlowMode(doc, (anchor) => anchors.push(anchor), 15);
  try {
    const native = doc.querySelector<HTMLTextAreaElement>("textarea")!;
    native.focus();
    native.dispatchEvent(new host.Event("input", { bubbles: true }) as unknown as Event);
    await delay(25);
    assert.equal(flow.isHidden, false);
    flow.setScene("work");
    native.value = "继续写";
    native.setSelectionRange(0, 2);
    native.dispatchEvent(new host.Event("input", { bubbles: true }) as unknown as Event);
    assert.equal(flow.isHidden, false);
    await delay(25);
    assert.equal(flow.isHidden, true);
    assert.deepEqual(anchors, [{ uuid: "note", start: 0, end: 2, direction: "none" }]);
    assert.equal(doc.body.classList.contains("tc-para-focus"), true);
    assert.equal(flow.toggleParagraphFocus(), false);
    assert.equal(doc.body.classList.contains("tc-para-focus"), false);

    native.dispatchEvent(new host.CompositionEvent("compositionstart", { bubbles: true }) as unknown as Event);
    native.dispatchEvent(new host.KeyboardEvent("keydown", { key: "Escape", bubbles: true }) as unknown as Event);
    assert.equal(flow.isHidden, true);
    native.dispatchEvent(new host.CompositionEvent("compositionend", { bubbles: true }) as unknown as Event);
    doc.dispatchEvent(new host.MouseEvent("mousemove", { clientY: 6 }) as unknown as Event);
    assert.equal(flow.isHidden, false);
    native.dispatchEvent(new host.Event("input", { bubbles: true }) as unknown as Event);
    flow.setScene(null);
    await delay(25);
    assert.equal(flow.isHidden, false);
    assert.match(doc.head.textContent ?? "", /:not\(:has\(\.editor-wrapper textarea:focus\)\).*block-main-container/u);
  } finally {
    flow.dispose();
    await host.close();
  }
});

test("native anchor waits for the requested route, does not steal composition and returns to the exact selection", async () => {
  const host = new Window();
  const doc = host.document as unknown as Document;
  doc.body.innerHTML = '<main id="main-content-container"><div class="ls-block" blockid="exact"></div></main>';
  const flow = new FlowMode(doc);
  try {
    const uuid = "exact";
    const block = flow.findBlock(uuid)!;
    let edits = 0;
    const edit = async () => {
      edits++;
      block.innerHTML = '<div class="editor-wrapper"><textarea>abcdef</textarea></div>';
      block.querySelector("textarea")!.focus();
    };
    let routeReady = false;
    const jump = flow.jump({ uuid, start: 1, end: 4 }, edit, () => routeReady);
    setTimeout(() => { routeReady = true; }, 25);
    assert.equal(await jump, true);
    assert.ok(block.classList.contains("tc-beacon"));
    assert.equal(edits, 1);
    const input = block.querySelector("textarea")!;
    assert.deepEqual([input.selectionStart, input.selectionEnd], [1, 4]);
    input.dispatchEvent(new host.CompositionEvent("compositionstart", { bubbles: true }) as unknown as Event);
    assert.equal(await flow.jump({ uuid }, edit, () => true), false);
    assert.equal(edits, 1);
  } finally {
    flow.dispose();
    await host.close();
  }
});
