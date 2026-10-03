import type { SourceRow } from "./model.mjs";
import type { ViewPresentation } from "./operations.ts";
import type { ComposedView } from "./view-composer.ts";

// Reading consumes descriptions and a narrow action, never a stage controller.
export type ReviewChange = {
  kind: "added" | "modified" | "removed" | "structure" | "problem";
  before: string | null; after: string | null; version: string | null;
  label: string; problem: string | null;
  inline: {prefix: string; inserted: string; suffix: string} | null;
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
