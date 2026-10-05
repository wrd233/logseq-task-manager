/** Desktop file capability shared by the host implementation and material storage. */
export interface FileIO {
  read(path: string): Promise<string>;
  write(path: string, text: string): Promise<void>;
  mkdir(path: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  list(path: string): Promise<string[]>;
  stat?(path: string): Promise<{ type: "file" | "directory"; size: number }>;
  /** Host-observed filesystem identity, or null when the host cannot supply it.
   * Must not be synthesized from size, name, content or modification time. */
  identity?(path: string): Promise<string | null>;
  /** Copy a regular file without replacing an existing target. */
  copy?(from: string, to: string): Promise<void>;
  writeBytes?(path: string, bytes: ArrayBuffer): Promise<void>;
}
