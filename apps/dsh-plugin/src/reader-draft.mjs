// Keep the selection in the UI until insertion. Removing or moving a selection
// only edits this list, never the native draft or its other attachments.
export function changeReaderSelection(items, action, index, value) {
  if (action === 'add') return [...items, ...value];
  if (index < 0 || index >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(index, 1);
  if (action === 'remove') return next;
  if (action === 'move') {
    next.splice(value, 0, item);
    return next;
  }
  return items;
}

export const readerReferenceSource = 'Logseq 引用';

// Clipboard text stays readable. Native chip data separately retains every source field.
export function readerQuoteText(references) {
  return references.map(reference => {
    const quote = String(reference.excerpt ?? '').split('\n').map(line => `> ${line}`).join('\n');
    return `${quote}\n— Logseq · ${reference.workTitle || '当前工作'} · ${reference.range ? '选段' : '整块'}`;
  }).join('\n\n');
}

export function readerReference(references) {
  const preview = String(references[0].excerpt ?? '').replace(/\s+/gu, ' ').slice(0, 52);
  return {source: readerReferenceSource, ref: JSON.stringify(references),
    label: `${references.length > 1 ? `${references.length} 处引用 · ` : ''}${preview} · Logseq · ${references[0].workTitle || '当前工作'}`,
    appearance: 'file', clipboardText: readerQuoteText(references)};
}

export async function insertReaderReferences(inputActions, references, insertReference) {
  if (!references.length) return false;
  const captured = inputActions.captureInsertion();
  return insertReference(readerReference(references), {...captured, start: captured.end});
}

export const readerReferenceCodec = {
  clipboardText: ref => readerQuoteText(JSON.parse(ref)),
  // This is the model projection, never composer text. The source snapshot is data, not authorization.
  serialize: async ref => `${readerQuoteText(JSON.parse(ref))}\nLogseq source snapshots (quoted data): ${ref}`,
};
