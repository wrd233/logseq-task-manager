import test from "node:test";
import assert from "node:assert/strict";
import { Window as HappyWindow } from "happy-dom";
import { desktopFiles, type DesktopBridge } from "../src/host/desktop-files.ts";

test("Desktop missing-stat null is checked against the parent; unreadable existing paths never become absent", async () => {
  const original = globalThis.window;
  let present = false, readable = true, empty: unknown = null;
  Object.assign(globalThis, {window: {top: {apis: {doAction: async ([op]: string[]) => op === "stat" ? empty : readable ? present ? ["/materials/a.md"] : [] : null}}}});
  try {
    const io = desktopFiles(() => "/graph");
    await assert.rejects(io.stat!("/materials/a.md"), /ENOENT/);
    empty = {}; await assert.rejects(io.stat!("/materials/a.md"), /ENOENT/);
    present = true; await assert.rejects(io.stat!("/materials/a.md"), /文件状态不可用/);
    readable = false; await assert.rejects(io.stat!("/materials/a.md"), /文件状态不可用/);
  } finally { if (original) globalThis.window = original; else Reflect.deleteProperty(globalThis, "window"); }
});

test("mode-less Desktop stat requires real readdir or ENOTDIR evidence and never guesses on denied/unknown results",async()=>{
  const previous=globalThis.window;let kind="directory";
  globalThis.window={top:{apis:{doAction:async ([op]:unknown[])=>{
    if(op==="stat")return {size:4};
    if(kind==="directory")return [];
    if(kind==="file")throw {message:"ENOTDIR: not a directory"};
    if(kind==="denied")throw Error("EACCES: denied");return null;
  }}}} as unknown as Window & typeof globalThis;
  try{const io=desktopFiles(()=>"/graph");assert.equal((await io.stat!("/own/dir")).type,"directory");kind="file";assert.equal((await io.stat!("/own/file")).type,"file");kind="denied";await assert.rejects(io.stat!("/own/file"),/EACCES/);kind="unknown";await assert.rejects(io.stat!("/own/file"),/状态不可用/);}
  finally{globalThis.window=previous;}
});

test("Desktop compact stat distinguishes an existing empty directory and a file, and never treats access failure as a file", async () => {
  const previous = globalThis.window, browser = new HappyWindow();
  globalThis.window = browser as unknown as typeof globalThis.window;
  const calls: string[] = [];
  (browser as unknown as {apis: DesktopBridge}).apis = {openPath: async () => undefined, doAction: async ([op, path]) => {
    calls.push(`${op}:${path}`);
    if (path === "/missing") return op === "stat" ? {} : null;
    if (op === "stat") return {size: 64, mtime: {}, ctime: {}};
    if (path === "/empty") return [];
    if (path === "/file") throw new browser.Error("Error invoking remote method 'main': ENOTDIR: not a directory");
    throw Error("EACCES: permission denied");
  }};
  try {
    const io = desktopFiles(() => "/graph");
    assert.deepEqual(await io.stat!("/empty"), {type: "directory", size: 64});
    assert.deepEqual(await io.stat!("/file"), {type: "file", size: 64});
    await assert.rejects(io.stat!("/unreadable"), /EACCES/);
    await assert.rejects(io.stat!("/missing"), /ENOENT/);
    assert.deepEqual(calls, ["stat:/empty", "listdir:/empty", "stat:/file", "listdir:/file", "stat:/unreadable", "listdir:/unreadable", "stat:/missing", "listdir:/missing", "stat:/"]);
  } finally {globalThis.window = previous; await browser.happyDOM.abort();}
});
