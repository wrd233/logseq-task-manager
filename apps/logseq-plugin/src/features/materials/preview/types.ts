import type { MaterialAssociation } from "../store.ts";

export type PreviewFormat = "markdown" | "docx" | "image" | "pdf" | "spreadsheet" | "legacy-doc" | "unsupported";
export interface PreviewScope { graph: string; ownerUuid: string | null }
export interface MaterialPreviewTarget {
  key: string; scope: PreviewScope; materialId: string | null;
  path: string; fileName: string; format: PreviewFormat;
  origin: "material" | "graph-asset";
  associations: MaterialAssociation[]; reference: string | null;
  identity: "verified" | "unverified";
}
export interface MaterialPreviewSnapshot {
  target: MaterialPreviewTarget;
  /** Digest of the exact original bytes read, not a size/mtime cache key. */
  version: string; bytes: ArrayBuffer;
  identityNotice?: string;
}
export type PreviewErrorCode = "unavailable" | "identity-changed" | "scope-changed" | "target-changed" | "unsupported" | "limit" | "damaged";
export class MaterialPreviewError extends Error {
  constructor(readonly code: PreviewErrorCode, message: string) {super(message); this.name = "MaterialPreviewError";}
}
export interface PreviewRenderContext {
  signal: AbortSignal;
  /** Every object URL is owned by this view/window and revoked on disposal. */
  objectURL(blob: Blob): string;
  ownsURL(url: string): boolean;
  resourceBase: string;
  localImage(path: string): Promise<string>;
}
export interface PreviewRendered {
  element: HTMLElement;
  complete: boolean;
  notices: string[];
  dispose(): void;
}
