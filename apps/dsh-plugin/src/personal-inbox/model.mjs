import {parseWorkRef, sameWorkRef} from '@task-copilot/contracts';

export const fail = code => {throw Object.assign(Error(code), {code});};
export const uuid = value => typeof value === 'string' && /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/iu.test(value) ? value : fail('INBOX_INVALID_ID');
export const text = (value, max = 100000, empty = false) => typeof value === 'string' && value.length <= max && (empty || value.trim()) ? value : fail('INBOX_INVALID');
export const object = (value, fields) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !fields.includes(key))) fail('INBOX_INVALID');
  return value;
};
export const statuses = ['open', 'waiting', 'resolved'];
export const sourceTypes = ['manual', 'flomo', 'logseq', 'dsh', 'browser', 'other'];
export const source = value => {
  if (value == null) return null;
  object(value, ['type', 'locator', 'sessionId', 'graphId', 'blockUuid', 'pageName', 'contentVersion']);
  if (!sourceTypes.includes(value.type)) fail('INBOX_INVALID_SOURCE');
  const result = {type: value.type};
  for (const key of ['locator', 'sessionId', 'graphId', 'blockUuid', 'pageName', 'contentVersion']) if (value[key] !== undefined) result[key] = text(value[key], 4096);
  if (result.type === 'logseq' && (!result.graphId || !result.blockUuid)) fail('INBOX_INVALID_SOURCE');
  return result;
};
export const materials = value => {
  if (!Array.isArray(value) || value.length > 100) fail('INBOX_INVALID');
  return value.map(item => {object(item, ['label', 'locator']); return {label: text(item.label, 300), locator: text(item.locator, 4096)};});
};
export const patchItem = (item, patch) => {
  object(patch, ['context', 'materials', 'workRef', 'status']);
  if (patch.context !== undefined) item.context = text(patch.context, 100000, true);
  if (patch.materials !== undefined) item.materials = materials(patch.materials);
  if (patch.workRef !== undefined) item.workRef = patch.workRef === null ? null : parseWorkRef(patch.workRef);
  if (patch.status !== undefined) {
    if (!statuses.includes(patch.status) || item.status === 'archived') fail('INBOX_INVALID_STATUS');
    item.status = patch.status;
  }
  return item;
};
export const validateItem = item => {
  object(item, ['schemaVersion', 'id', 'revision', 'originalContent', 'editedContent', 'context', 'source', 'materials', 'workRef', 'status', 'archivedFrom', 'createdAt', 'updatedAt', 'outcomes']);
  if (item.schemaVersion !== 1 || !Number.isSafeInteger(item.revision) || item.revision < 1) fail('INBOX_CORRUPT');
  uuid(item.id); text(item.originalContent); if (item.editedContent !== null) text(item.editedContent);
  text(item.context, 100000, true); source(item.source); materials(item.materials);
  if (item.workRef !== null) parseWorkRef(item.workRef);
  if (![...statuses, 'archived'].includes(item.status) || (item.status === 'archived' ? !statuses.includes(item.archivedFrom) : item.archivedFrom !== null)) fail('INBOX_CORRUPT');
  for (const key of ['createdAt', 'updatedAt']) if (typeof item[key] !== 'string' || !Number.isFinite(Date.parse(item[key]))) fail('INBOX_CORRUPT');
  if (!Array.isArray(item.outcomes)) fail('INBOX_CORRUPT');
  for (const result of item.outcomes) {
    object(result, ['kind', 'operationId', 'inboxId', 'createdAt', 'reference']);
    if (!['work', 'planner', 'formal-task'].includes(result.kind) || result.inboxId !== item.id || !result.reference || typeof result.reference !== 'object') fail('INBOX_CORRUPT');
    uuid(result.operationId); text(result.createdAt, 100);
  }
  return item;
};
export const project = (item, canUndo = false) => ({...item, content: item.editedContent ?? item.originalContent,
  preview: (item.editedContent ?? item.originalContent).replace(/\s+/gu, ' ').slice(0, 160),
  stage: item.context.trim() || item.materials.length || item.workRef ? 'developing' : 'new', canUndo});
export const filterItems = (items, query) => {
  object(query, ['query', 'sourceType', 'status', 'workRef', 'linked']);
  if (query.status !== undefined && !['all', 'archived', ...statuses].includes(query.status)) fail('INBOX_INVALID_STATUS');
  if (query.sourceType !== undefined && !sourceTypes.includes(query.sourceType)) fail('INBOX_INVALID_SOURCE');
  if (query.linked !== undefined && typeof query.linked !== 'boolean') fail('INBOX_INVALID');
  const ref = query.workRef ? parseWorkRef(query.workRef) : null;
  const terms = (query.query === undefined ? '' : text(query.query, 1000, true)).toLocaleLowerCase().split(/\s+/u).filter(Boolean);
  return items.filter(item => (query.status === 'all' || (query.status ? item.status === query.status : item.status !== 'archived')) &&
    (!query.sourceType || item.source?.type === query.sourceType) && (!ref || item.workRef && sameWorkRef(ref, item.workRef)) &&
    (query.linked === undefined || Boolean(item.workRef) === query.linked) && terms.every(term =>
      [item.originalContent, item.editedContent, item.context, JSON.stringify(item.source), JSON.stringify(item.materials)].join('\n').toLocaleLowerCase().includes(term)))
    .sort((a,b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id));
};
