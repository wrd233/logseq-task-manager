/** Untrusted plans/providers have one closed, bounded data boundary. Accessors are not data. */
export class LensInputError extends Error {
  constructor(readonly reason: string) { super(reason); }
}
export function requireLens(condition: unknown, reason: string): asserts condition {
  if (!condition) throw new LensInputError(reason);
}
export function lensRecord(value: unknown, keys: readonly string[], reason = "invalid-input"): Record<string, unknown> {
  requireLens(value && typeof value === "object" && !Array.isArray(value), reason);
  const prototype = Object.getPrototypeOf(value);
  requireLens(prototype === Object.prototype || prototype === null, reason);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  requireLens(Reflect.ownKeys(value).every(key => typeof key === "string" && keys.includes(key)), "unknown-field");
  requireLens(Object.values(descriptors).every(field => "value" in field && field.enumerable), reason);
  return value as Record<string, unknown>;
}
export function lensArray(value: unknown, maximum: number, minimum = 0): unknown[] {
  requireLens(Array.isArray(value), "invalid-array");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  requireLens(Object.values(descriptors).every(field => "value" in field), "invalid-array");
  requireLens(value.length >= minimum && value.length <= maximum, "input-too-large");
  requireLens(Object.keys(value).length === value.length && Object.keys(value).every((key, index) => key === String(index)), "invalid-array");
  requireLens(Reflect.ownKeys(value).every(key => key === "length" || typeof key === "string" && /^(0|[1-9][0-9]*)$/u.test(key)), "invalid-array");
  return value;
}
export function lensText(value: unknown, maximum: number, reason = "invalid-text", empty = false): string {
  requireLens(typeof value === "string" && value.length <= maximum && (empty || value.trim().length > 0), reason);
  return value;
}
export function lensHash(value: unknown): string {
  requireLens(typeof value === "string" && /^[0-9a-f]{64}$/u.test(value), "invalid-version");
  return value;
}
