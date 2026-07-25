const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/iu;
const LONG_HEX = /\b[0-9a-f]{24,}\b/iu;
const MACHINE_REFERENCE = /\b(?:answer|anchor|block|commit|contract|graph|object|page|proposal|receipt|session):[^\s，。；！？,;!?）)\]}]+/u;
const OPAQUE_ID = /\b(?:anchor|block|candidate|commit|graph|obj|object|page|project|proposal|receipt|semantic_commit)_[a-z0-9_-]{6,}\b/iu;

/**
 * LLM prose is rendered in the user's work surface. Machine references remain
 * available in the structured evidence fields, but must never be copied into
 * prose that the user has to read.
 */
export function assertFrontstageProse(value: string, name: string): string {
  if (UUID.test(value) || LONG_HEX.test(value) || MACHINE_REFERENCE.test(value) || OPAQUE_ID.test(value)) {
    throw new Error(`${name} exposes a machine identity in user-visible prose.`);
  }
  return value;
}
