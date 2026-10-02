/** Desktop file capability shared by the host implementation and material storage. */
export interface FileIO {
  read(path: string): Promise<string>;
  write(path: string, text: string): Promise<void>;
  mkdir(path: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  list(path: string): Promise<string[]>;
  stat?(path: string): Promise<{ type: "file" | "directory"; size: number }>;
}
