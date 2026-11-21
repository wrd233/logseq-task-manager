import type { SourceScope } from "./source-protocol.ts";

type IdentityStorage = Pick<Storage, "getItem" | "setItem">;
const nameOf = (scope: SourceScope) => scope.pageName?.toLocaleLowerCase();
// A page route is a work identity in the current Graph. Its native page UUID
// is still required for every live source read and every connection.
export const samePageWork = (a: SourceScope, b: SourceScope) =>
  a.kind === "page" && b.kind === "page" && a.graphId === b.graphId && nameOf(a) === nameOf(b);
export const workPositionKey = (scope: SourceScope) =>
  `workbench:reading-position:${JSON.stringify([scope.graphId,scope.kind??"block",scope.pageName??scope.rootUuid])}`;
const pageKey = (scope: SourceScope) => `workbench:page-work:${JSON.stringify([scope.graphId,nameOf(scope)])}`;
const aliasKey = (graph: string, uuid: string) => `workbench:page-work-aliases:${JSON.stringify([graph,uuid])}`;

export function pageWorkIds(scope: SourceScope, storage: IdentityStorage): string[] {
  if (scope.kind !== "page") return [scope.rootUuid];
  try {
    const known = JSON.parse(storage.getItem(pageKey(scope)) ?? "[]") as string[];
    // The previous product already saved an independent page-name bookmark.
    const prior = JSON.parse(storage.getItem(workPositionKey(scope)) ?? "null")?.scope as SourceScope | undefined;
    return [...new Set([...known, ...(prior && samePageWork(prior,scope) ? [prior.rootUuid] : []), scope.rootUuid])];
  } catch { return [scope.rootUuid]; }
}

/** Call only after resolving a real page in the current Graph. Aliases are
 * local presentation/directory metadata, never a grant to write source blocks. */
export function rememberPageWork(scope: SourceScope, materialGraph: string, storage: IdentityStorage = localStorage, previous?:SourceScope): void {
  if (scope.kind !== "page") return;
  try {
    const ids = pageWorkIds(scope,storage);
    if(previous&&samePageWork(previous,scope)&&!ids.includes(previous.rootUuid)){
      if(ids.length===1)ids.unshift(previous.rootUuid);else ids.push(previous.rootUuid);
    }
    storage.setItem(pageKey(scope),JSON.stringify(ids));
    for (const id of ids) for(const graph of new Set([scope.graphId,materialGraph])) {
      storage.setItem(aliasKey(graph,id),JSON.stringify(ids));
    }
  } catch { /* A saved source remains readable without local preferences. */ }
}

export function pageAliases(graph: string, uuid: string, storage: IdentityStorage): string[] {
  try { return JSON.parse(storage.getItem(aliasKey(graph,uuid)) ?? "null") ?? [uuid]; }
  catch { return [uuid]; }
}
