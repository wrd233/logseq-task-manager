/* Shared, UI-only vocabulary for the unified work view. Source identity stays with the host. */

export const workTypeLabel = type => ({
  PROJECT: 'Project',
  MINI_PROJECT: 'MiniProject',
  TASK: 'Task',
  PAGE: '页面',
  WORK: '工作',
}[type] ?? '工作');

export const statusLabel = status => ({
  TODO: '待办',
  DOING: '进行中',
  NOW: '进行中',
  DONE: '已完成',
  LATER: '稍后',
  WAITING: '等待',
  CANCELED: '已取消',
  CANCELLED: '已取消',
}[status] ?? status);

export const statusTone = status => ({
  TODO: 'todo',
  DOING: 'doing',
  NOW: 'doing',
  DONE: 'done',
  LATER: 'later',
  WAITING: 'waiting',
  CANCELED: 'canceled',
  CANCELLED: 'canceled',
}[status] ?? 'plain');

export const semanticTone = kind => ({ note: 'note', conclusion: 'conclusion', pending: 'pending', risk: 'risk' }[kind] ?? 'note');

/** A flat list is not a hierarchy. Parents outside the authorized slice become roots. */
export function buildTree(nodes) {
  const byId = new Map(nodes.map(node => [node.blockUuid, node]));
  const children = new Map();
  const roots = [];
  const depth = new Map();
  for (const node of nodes) {
    const parent = byId.get(node.parentUuid);
    if (parent) {
      if (!children.has(parent.blockUuid)) children.set(parent.blockUuid, []);
      children.get(parent.blockUuid).push(node);
    } else roots.push(node);
  }
  const position = new Map(nodes.map((node, index) => [node.blockUuid, index]));
  const sort = list => list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || position.get(a.blockUuid) - position.get(b.blockUuid));
  for (const list of children.values()) sort(list);
  sort(roots);
  const visit = (node, level) => {
    depth.set(node.blockUuid, level);
    for (const child of children.get(node.blockUuid) ?? []) visit(child, level + 1);
  };
  roots.forEach(node => visit(node, 0));
  return { roots, children, byId, depth };
}

export function flattenTree(tree) {
  const rows = [];
  const visit = (node, depth) => {
    rows.push({ node, depth });
    for (const child of tree.children.get(node.blockUuid) ?? []) visit(child, depth + 1);
  };
  tree.roots.forEach(node => visit(node, 0));
  return rows;
}

/** Display-only plain text. Never changes source text or offsets used by references. */
export function previewText(markdown, max = 140) {
  const text = String(markdown ?? '')
    .replace(/```[\s\S]*?```/gu, ' ')
    .replace(/^ {0,3}#{1,6}[ \t]+/gmu, '')
    .replace(/^ {0,3}[-*+][ \t]+/gmu, '')
    .replace(/^ {0,3}\d+[.)][ \t]+/gmu, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/gu, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, '$1')
    .replace(/^(?:\*\*)?\[(Project|MiniProject|事务|事项|任务)\](?:\*\*)?[ \t]*/u, '')
    .replace(/\[\[([^\][\n]+)\]\]/gu, '$1')
    .replace(/(\*\*|__|~~|`)/gu, '')
    .replace(/[*_]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

export function localNow(date = new Date()) {
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export const timeOf = value => typeof value === 'string' && value.length >= 16 ? value.slice(11, 16) : '';
export const dateOf = value => typeof value === 'string' ? value.slice(0, 10) : '';

export function selectionKey(item) {
  return `${item.sourceId}:${item.range ? `${item.range.start}-${item.range.end}` : 'block'}`;
}

export function mergeSelections(current, incoming, limit = 32) {
  let rows = [...current];
  const seen = () => new Set(rows.map(selectionKey));
  for (const item of incoming) {
    if (!item.range) rows = rows.filter(row => row.sourceId !== item.sourceId);
    else if (rows.some(row => row.sourceId === item.sourceId && !row.range)) continue;
    const seenKeys = seen();
    if (seenKeys.has(selectionKey(item))) continue;
    rows.push(item);
    if (rows.length >= limit) break;
  }
  return rows;
}

/** The recoverable states are product states, not protocol states. */
export function connectionCopy(connection) {
  const state = connection?.state;
  if (state === 'waiting_for_logseq') return {
    title: 'Logseq 暂时不可用',
    body: '打开 Logseq 后，这里会自动恢复到原来的工作和阅读位置。',
    action: 'retry',
  };
  if (state === 'companion_unavailable') return {
    title: 'Logseq 工作服务还没启动',
    body: '启动 Logseq 并打开工作台后会自动恢复；不需要重新关联。',
    action: 'retry',
  };
  if (state === 'directory_moved') return {
    title: '工作目录已移动',
    body: '在 Logseq 打开这件工作原来的目录，或重新关联当前对话所在目录。',
    action: 'rebind',
  };
  if (state === 'source_mismatch') return {
    title: '当前 Graph 与这件工作不一致',
    body: '在 Logseq 切回这件工作所属的 Graph，然后重试。',
    action: 'retry',
  };
  if (state === 'read_confirmation_required') return {
    title: '等待 Logseq 允许只读连接',
    body: '在 Logseq 对这件工作允许 agent 只读连接，然后重试。不会扩大权限。',
    action: 'retry',
  };
  return null;
}
