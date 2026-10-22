/** Only the native input insertion API is reachable here; no submission API. */
export async function insertEvidence(inputActions, loadQuote) {
  const span = inputActions.captureInsertion();
  const text = await loadQuote();
  if (!inputActions.insertText(text, span)) throw Object.assign(Error('草稿正在提交或位置已失效，请重试。'), { code: 'INPUT_BUSY' });
}
