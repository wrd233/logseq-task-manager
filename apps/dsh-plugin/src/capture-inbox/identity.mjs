// Module-local identity only. These values are never an authorization grant.
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
export const encode = value => JSON.stringify(canonical(value));
export function partition(context) {
  if (!context || !Number.isSafeInteger(context.generation) || context.generation < 0) throw Error('INVALID_CONTEXT');
  if (context.scope !== null && (!context.scope?.graphId || !context.scope?.rootUuid)) throw Error('INVALID_SCOPE');
  if (context.binding !== null && (!context.scope || encode(context.scope) !== encode(context.binding?.scope))) throw Error('SCOPE_MISMATCH');
  if (context.sessionId !== null && (typeof context.sessionId !== 'string' || !context.sessionId)) throw Error('INVALID_SESSION');
  return encode({ scope: context.scope, binding: context.binding, workObjectId: context.workObject?.id ?? null, sessionId: context.sessionId });
}
export const sameContext = (left, right) => partition(left) === partition(right) && left.generation === right.generation && encode(left.workObject) === encode(right.workObject);
export function checkOrigin(origin, context) {
  if (!origin || origin.sessionId !== context.sessionId) throw Error('SOURCE_SESSION_MISMATCH');
  if (Object.keys(origin).some(key => !['block', 'material', 'sessionId'].includes(key))) throw Error('INVALID_ORIGIN');
  if (origin.block) {
    const { sourceId, target, contentVersion } = origin.block;
    if (!context.scope || target?.kind !== 'logseq-block' || target.graphId !== context.scope.graphId ||
      typeof target.blockUuid !== 'string' || !target.blockUuid ||
      sourceId !== JSON.stringify(['logseq', target.graphId, target.blockUuid]) ||
      contentVersion !== null && !/^[a-f0-9]{64}$/.test(contentVersion)) throw Error('INVALID_BLOCK_SOURCE');
  }
  if (origin.material) {
    const { materialId, version, reference } = origin.material;
    if (!/^[a-f0-9-]{36}$/i.test(materialId) || typeof version !== 'string' || !version ||
      typeof reference !== 'string' || !reference.includes(`longdoc://${materialId}`) || /[\r\n]/.test(reference)) throw Error('INVALID_MATERIAL_SOURCE');
  }
}
