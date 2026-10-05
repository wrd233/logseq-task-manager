import type { SourceRow } from "./model.mjs";
import type { ViewPresentation } from "./operations.ts";
import type { ComposedView } from "./view-composer.ts";

/** Reading text only; permissions and recovery remain in the existing executor. */
export function reviewProblem(problem:string):string {
  const labels:Record<string,string>={
    CONTENT_VERSION_CONFLICT:"当前正文已改变，请保留双方内容并重新读取新版本。",
    PROTECTED_TODO:"TODO 受保护；明确修改请使用既有的「修改当前 TODO 文本」入口。",
    NATIVE_EDITING_ACTIVE:"目标仍在原生输入，请结束输入后再明确提交。",
    SCOPE_REVOKED:"工作范围已失效，请重新确认当前工作。",
    OUTCOME_UNKNOWN:"写入结果未知，请先查询原请求，不要重复提交。",
  };
  return problem.replace(/\b[A-Z][A-Z_]+\b/g,code=>labels[code]??code);
}

// Reading consumes descriptions and a narrow action, never a stage controller.
export type ReviewChange = {
  kind: "added" | "modified" | "removed" | "structure" | "problem";
  before: string | null; after: string | null; version: string | null;
  location?: {before:{parentUuid:string|null;order:number;depth:number};after:{parentUuid:string|null;order:number;depth:number}} | null;
  label: string; problem: string | null;
  inline: {prefix: string; inserted: string; suffix: string} | null;
  submitted?: {content:string|null; revisionId:string|null};
};
export type ReviewContext = {
  scope: {graphId: string; rootUuid: string}; rows: SourceRow[];
  state: ViewPresentation; view: ComposedView; editing: boolean;
};
export type ReviewFrame = {
  rows: SourceRow[]; state: ViewPresentation; view: ComposedView;
  changes: ReadonlyMap<string,ReviewChange>; historical: boolean;
};
export interface ReviewPort {
  readonly bar: HTMLElement;
  scopeChanged(scope: ReviewContext["scope"] | null): void;
  compose(context: ReviewContext): ReviewFrame;
  edit(uuid: string, container: HTMLElement, suggest: boolean): void;
}
