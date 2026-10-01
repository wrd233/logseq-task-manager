import { BlockIdentityCache, type BlockIdentity } from "./block-context.ts";

// One presentation cache per plugin instance. The task module still owns refresh
// and revalidation; readers do not start a Kernel connection or Graph worker.
export const blockIdentityCache = new BlockIdentityCache();

export function lookupBlockIdentity(uuid: string): BlockIdentity {
  return blockIdentityCache.lookup(uuid);
}
