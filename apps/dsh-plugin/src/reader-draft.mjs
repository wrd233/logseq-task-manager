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

export function insertReaderReferences(inputActions, references) {
  if (!references.length) return false;
  const captured = inputActions.captureInsertion();
  const span = { ...captured, start: captured.end };
  const text = references.map(reference => `[Logseq 引用 ${JSON.stringify(reference)}]\n`).join('');
  return inputActions.insertText((span.start > 0 ? '\n' : '') + text, span);
}
