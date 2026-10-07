export interface FileReadOptions { signal?: AbortSignal; maxBytes?: number }
export interface DirectoryEntry { name: string; type: "file" | "directory" }
export interface DirectoryReadOptions { signal?: AbortSignal; limit: number; cursor?: string }
/** An incomplete read is observation, never evidence that old entries were deleted. */
export interface DirectorySnapshot {
  entries: DirectoryEntry[];
  complete: boolean;
  nextCursor?: string;
  problem?: string;
}
/** Desktop file capability shared by the host implementation and material storage. */
export interface FileIO {
  read(path: string): Promise<string>;
  write(path: string, text: string): Promise<void>;
  mkdir(path: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  list(path: string): Promise<string[]>;
  /** Genuine immediate children. Must not implement this by scanning the subtree. */
  listDirectory?(path: string, options: DirectoryReadOptions): Promise<DirectorySnapshot>;
  /** Original bytes; never re-encode the text read method. */
  readBytes?(path: string, options?: FileReadOptions): Promise<ArrayBuffer>;
  stat?(path: string): Promise<{ type: "file" | "directory"; size: number }>;
  /** Host-observed filesystem identity, or null when the host cannot supply it.
   * Must not be synthesized from size, name, content or modification time. */
  identity?(path: string): Promise<string | null>;
  /** Copy a regular file without replacing an existing target. */
  copy?(from: string, to: string): Promise<void>;
  writeBytes?(path: string, bytes: ArrayBuffer): Promise<void>;
}
