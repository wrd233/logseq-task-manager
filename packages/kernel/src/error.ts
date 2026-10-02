export class KernelError extends Error {
  readonly code: string;
  readonly commitId: string | null;
  constructor(code: string, message: string, commitId: string | null = null) {
    super(`${code}: ${message}`); this.name = "KernelError"; this.code = code; this.commitId = commitId;
  }
}
