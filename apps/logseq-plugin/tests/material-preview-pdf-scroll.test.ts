import test from "node:test";
import assert from "node:assert/strict";
import {setTimeout as delay} from "node:timers/promises";
import {Window} from "happy-dom";
import type {PDFDocumentProxy} from "pdfjs-dist/legacy/build/pdf.mjs";
import {renderContinuousPDF} from "../src/features/materials/preview/pdf-pages.ts";

async function until(check: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {if (check()) return; await delay(5);}
  assert.fail("PDF viewport state did not settle");
}
async function fixture(pendingPage = 0) {
  const browser = new Window(), previous = {document: globalThis.document, window: globalThis.window};
  globalThis.document = browser.document as unknown as Document; globalThis.window = browser as unknown as typeof globalThis.window;
  const renders: number[] = [], cancelled: number[] = [];
  let intersection: ((entries: IntersectionObserverEntry[]) => void) | null = null, resized: (() => void) | null = null, disconnected = 0;
  const observing: Element[] = [];
  class Intersection {
    constructor(callback: (entries: IntersectionObserverEntry[]) => void) {intersection = callback;}
    observe(node: Element) {observing.push(node);}
    disconnect() {disconnected++;}
  }
  class Resize {
    constructor(callback: () => void) {resized = callback;}
    observe() {}
    disconnect() {disconnected++;}
  }
  Reflect.set(browser, "IntersectionObserver", Intersection); Reflect.set(browser, "ResizeObserver", Resize);
  Reflect.set(browser.HTMLCanvasElement.prototype, "getContext", () => ({}));
  const pdf = {numPages: 18, getPage: async (number: number) => ({
    getViewport: ({scale}: {scale: number}) => ({width: 600 * scale, height: 800 * scale}),
    render: () => {
      renders.push(number); let reject: (reason: Error) => void = () => {};
      const promise = number === pendingPage ? new Promise<void>((_, no) => {reject = no;}) : Promise.resolve();
      return {promise, cancel: () => {cancelled.push(number); const error = new Error("cancelled"); error.name = "RenderingCancelledException"; reject(error);}};
    },
  })} as unknown as PDFDocumentProxy;
  const abort = new AbortController(), view = await renderContinuousPDF(pdf, abort.signal);
  let width = 320; Object.defineProperty(view.element, "clientWidth", {get: () => width});
  const scroll = document.createElement("div"); scroll.className = "wb-scroll"; scroll.append(view.element); document.body.append(scroll);
  return {view, abort, renders, cancelled, observing,
    width: (value: number) => {width = value; resized?.();}, disconnected: () => disconnected,
    nearby: (pages: number[]) => intersection?.(observing.map(target => ({target, isIntersecting: pages.includes(Number((target as HTMLElement).dataset.pdfPage))}) as IntersectionObserverEntry)),
    close: async () => {view.dispose(); await browser.happyDOM.abort(); globalThis.document = previous.document; globalThis.window = previous.window;},
  };
}

test("PDF exposes every page in one scroll flow, fits the pane and bounds live canvases while scrolling and resizing", async () => {
  const f = await fixture(); try {
    assert.equal(f.view.element.querySelectorAll("[data-pdf-page]").length, 18);
    assert.equal(f.view.element.querySelectorAll("button,input").length, 0);
    assert.deepEqual(f.renders, [1]); f.view.mounted!(); f.nearby([2, 3, 4, 5, 6, 7, 8]);
    await until(() => f.view.element.querySelectorAll("canvas").length === 4 && f.view.element.querySelector<HTMLCanvasElement>("canvas")!.width === 320);
    assert.equal(f.view.element.querySelector('[data-pdf-page="1"] canvas'), null);
    assert.equal(f.view.element.querySelector('[data-pdf-page="18"]')!.textContent!.includes("18 / 18"), true);
    f.width(460); await until(() => Array.from(f.view.element.querySelectorAll<HTMLCanvasElement>("canvas")).every(canvas => canvas.width >= 460 && canvas.width <= 461));
    f.nearby([17, 18]); await until(() => !!f.view.element.querySelector('[data-pdf-page="18"] canvas'));
    assert.equal(f.view.element.querySelectorAll("canvas").length, 2);
    assert.equal(Array.from(f.view.element.querySelectorAll<HTMLCanvasElement>("canvas")).reduce((pixels, canvas) => pixels + canvas.width * canvas.height, 0) < 24_000_000, true);
    f.view.dispose(); assert.equal(f.disconnected(), 2); const count = f.renders.length; f.nearby([1]); f.width(700); await delay(120); assert.equal(f.renders.length, count);
  } finally {await f.close();}
});

test("leaving a PDF cancels an in-flight page and releases observers without rendering late pages", async () => {
  const f = await fixture(2); try {
    f.view.mounted!(); f.nearby([2]); await until(() => f.renders.includes(2)); f.abort.abort();
    await until(() => f.cancelled.includes(2)); assert.equal(f.disconnected(), 2);
    assert.equal(f.view.element.querySelectorAll("canvas").length, 0);
    const count = f.renders.length; f.nearby([3]); await delay(20); assert.equal(f.renders.length, count);
  } finally {await f.close();}
});
