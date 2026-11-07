import { readFile, mkdir, readdir, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { WorkspaceError, parseWorkBinding, workRecord, workText, parseWorkRef, type WorkRef, type AgentWorkBinding } from "@task-copilot/contracts";
import { atomicJson } from "./workspace-files.ts";

export type DshMode = "continue" | "new";
export interface DshHandoff {
  schemaVersion: 1; ticket: string; createdAt: number; mode: DshMode; title: string;
  entry: {instanceId: string; connectionId: string; binding: AgentWorkBinding; directory: string};
  sessionId?: string; workRef?: WorkRef;
}
export const browserDescriptor = (state: string) => join(state, "dsh-browser.json");
export const handoffPath = (state: string, ticket: string) => {
  if (!/^[0-9a-f-]{36}$/u.test(ticket)) throw new WorkspaceError("DSH_HANDOFF_INVALID");
  return join(state, "dsh-handoffs", `${ticket}.json`);
};
const offerDirectory = (state: string) => join(state, "dsh-browser-offers");

/** One authenticated existing browser consumes an offer. Explicit new-tab entries bypass this. */
export async function claimDshBrowserOffer(state: string): Promise<string | null> {
  const directory = offerDirectory(state);
  const names = await readdir(directory).catch(error => {if (error.code === "ENOENT") return []; throw error;});
  for (const name of names) {
    const match = /^(\d+)-([0-9a-f-]{36})(\.claimed)?$/u.exec(name);
    if (!match) continue;
    const path = join(directory, name);
    if (Date.now() - Number(match[1]) > (match[3] ? 30_000 : 2500)) {
      await unlink(path).catch(error => {if (error.code !== "ENOENT") throw error;});
      continue;
    }
    if (match[3]) continue;
    try {
      await rename(path, `${path}.claimed`);
      return match[2]!;
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  return null;
}

async function offerDshBrowser(state: string, ticket: string): Promise<boolean> {
  const directory = offerDirectory(state);
  await mkdir(directory, {recursive: true, mode: 0o700});
  const path = join(directory, `${Date.now()}-${ticket}`);
  await atomicJson(path, {});
  const claimed = async () => {
    try {await unlink(`${path}.claimed`); return true;}
    catch (error) {if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error;}
  };
  for (let attempt = 0; attempt < 15; attempt++) {
    await delay(100);
    if (await claimed()) return true;
  }
  try {await unlink(path); return false;}
  catch (error) {if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; return claimed();}
}

export function localDshUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.username || url.password)
    throw new WorkspaceError("DSH_LOCAL_URL_REQUIRED");
  return url;
}
/** Local click creates a short-lived locator, never an Agent prompt or a new grant. */
export async function createDshHandoff(state: string, input: Omit<DshHandoff, "schemaVersion" | "ticket" | "createdAt">, newTab = false): Promise<{url: string | null; ticket: string}> {
  let browser: {url: string; pid: number};
  try {
    browser = JSON.parse(await readFile(browserDescriptor(state), "utf8"));
    process.kill(browser.pid, 0);
  } catch { throw new WorkspaceError("DSH_NOT_RUNNING", "请先启动 DSH；本机协作启动器可自动启动两端服务。"); }
  const url = localDshUrl(browser.url), ticket = randomUUID();
  await mkdir(join(state, "dsh-handoffs"), {recursive: true, mode: 0o700});
  await atomicJson(handoffPath(state, ticket), {...input, schemaVersion: 1, ticket, createdAt: Date.now()});
  if (!newTab && input.mode === "continue" && await offerDshBrowser(state, ticket)) return {url: null, ticket};
  url.hash = `logseq-work=${ticket}`;
  return {url: url.href, ticket};
}
export async function readDshHandoff(state: string, ticket: string): Promise<DshHandoff> {
  const value = workRecord(JSON.parse(await readFile(handoffPath(state, ticket), "utf8")), ["schemaVersion", "ticket", "createdAt", "mode", "title", "entry", "sessionId", "workRef"]);
  if (value.schemaVersion !== 1 || value.ticket !== ticket || typeof value.createdAt !== "number" || Date.now() - value.createdAt > 600_000 || value.createdAt > Date.now() + 1000)
    throw new WorkspaceError("DSH_HANDOFF_EXPIRED", "请在 Logseq 再点一次 DSH 协作。");
  if (!["continue", "new"].includes(String(value.mode))) throw new WorkspaceError("DSH_HANDOFF_INVALID");
  const raw = workRecord(value.entry, ["instanceId", "connectionId", "binding", "directory"]), binding = parseWorkBinding(raw.binding);
  if (raw.directory !== binding.directory) throw new WorkspaceError("DSH_HANDOFF_INVALID");
  return {schemaVersion: 1, ticket, createdAt: value.createdAt, mode: value.mode as DshMode, title: workText(value.title, 800),
    entry: {instanceId: workText(raw.instanceId), connectionId: workText(raw.connectionId), binding, directory: binding.directory},
    ...(value.workRef ? {workRef: parseWorkRef(value.workRef)} : {}),
    ...(value.sessionId ? {sessionId: workText(value.sessionId)} : {})};
}
