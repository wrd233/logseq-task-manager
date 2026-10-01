interface PrivateStorageReader {
  getItem(key: string): Promise<unknown>;
}

// Desktop 0.10.9 rejects a missing FileStorage file instead of returning null.
// Keep IO/permission failures visible; only absence permits the settings fallback.
export async function readOptionalPrivateItem(storage: PrivateStorageReader, key: string): Promise<unknown> {
  try { return await storage.getItem(key); }
  catch (error) {
    const message = error instanceof Error ? error.message : error;
    if (message === "file not existed") return null;
    throw error;
  }
}
