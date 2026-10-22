const messages = {
  CAPTURE_TEXT_LIMIT: '正文超过 100 万字符，输入仍保留。请手动分段后重试。',
  CAPTURE_FILE_SIZE_LIMIT: '当前草稿内容合计超过本机保存容量，输入仍保留。请手动分段；不会自动删除历史。',
  CAPTURE_INPUT_TOO_LARGE: '当前草稿超过传输容量，输入仍保留。请手动分段后重试。',
  CAPTURE_DRAFT_HISTORY_LIMIT: '本分区草稿已达 10000 个版本，输入仍保留。不会自动删除历史，请先复制保存当前输入。',
  CAPTURE_HISTORY_LIMIT: '记录已达历史版本上限，输入仍保留。不会自动删除历史。',
  CAPTURE_RECORD_LIMIT: '本分区已达记录容量上限，输入仍保留。不会自动删除记录。',
  CAPTURE_SOURCE_NOT_VERIFIED: '来源已变化、删除或不在当前授权范围，正文和原请求已保留。请返回原现场核对。',
  CAPTURE_SOURCE_UNAVAILABLE: '来源连接不可用，正文和原请求已保留。请返回原现场重连后重试。',
  CAPTURE_SOURCE_TEXT_UNAVAILABLE: '该来源没有可捕获的文本，请在来源中明确选择可读正文。',
  CAPTURE_CONTEXT_STALE: '工作连接或绑定已改变，正文和原请求已保留，不会搬到新现场。',
};
export function captureIssue(value, fallback) {
  const code = typeof value === 'string' ? value : value?.code ?? value?.message;
  return messages[code] ?? fallback;
}
