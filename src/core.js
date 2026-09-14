export const docIdPattern = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i;
export function normalizeRoot(root, graph) {
  const clean = p => String(p || '').replace(/\\/g, '/').replace(/\/+$/, '');
  const r = clean(root), g = clean(graph);
  if (!r.startsWith('/') || r === '' || r.split('/').some(x => x === '..' || x === '.')) throw Error('请设置绝对目录，路径不能包含 . 或 ..');
  if (r === '/' || r === g || r.startsWith(g + '/')) throw Error('文档目录必须位于 Graph 外');
  return r;
}
export function isLong(text, chars = 2000, lines = 30) {
  return text.length >= Math.max(100, Number(chars) || 2000) || text.split(/\r?\n/).filter(x => x.trim()).length >= Math.max(5, Number(lines) || 30);
}
export function titleOf(text) {
  return (text.split(/\r?\n/).find(x => x.trim()) || '未命名文档').replace(/^\s{0,3}#{1,6}\s+/, '').replace(/[\[\]<>\n\r]/g, '').trim().slice(0, 64) || '未命名文档';
}
export function makeLink(doc) { return `[📄 ${titleOf(doc.title)}](longdoc://${doc.id})`; }
export function idFrom(text) { const id = String(text).match(/longdoc:\/\/([0-9a-f-]{36})/i)?.[1]; return id && docIdPattern.test(id) ? id : null; }
export function restoreCapture(content, record) {
  const token = makeLink(record);
  const index = content.indexOf(token);
  if (index < 0 || content.indexOf(token, index + token.length) >= 0) throw Error('引用已变化或重复，未替换正文；可从文档库取回原文');
  return content.slice(0, index) + record.original + content.slice(index + token.length);
}
export function replaceSelection(value, start, end, insertion) { return value.slice(0, start) + insertion + value.slice(end); }
export class ConflictError extends Error { constructor(current) { super('外部文件已修改，当前草稿已保留'); this.current = current; this.name = 'ConflictError'; } }

// The adapter owns access to the filesystem. Nothing here touches a Logseq block.
export class DocumentStore {
  constructor(io, root) { this.io = io; this.root = root; this.tail = Promise.resolve(); }
  serial(fn) { const p = this.tail.then(fn); this.tail = p.catch(() => {}); return p; }
  file(id) { if (!docIdPattern.test(id)) throw Error('无效文档 ID'); return `${this.root}/${id}.md`; }
  async init() { await this.io.mkdir(`${this.root}/.longdoc`); await this.io.mkdir(`${this.root}/.longdoc/history`); }
  async catalog() {
    const raw = await this.io.optional(`${this.root}/.longdoc/catalog.json`);
    if (raw === null) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data) || data.some(x => !docIdPattern.test(x.id))) throw Error('文档目录索引损坏，已停止写入');
    return data;
  }
  async verified(path, text) { await this.io.write(path, text); if (await this.io.read(path) !== text) throw Error('文件读回核对失败，未确认保存'); }
  async atomic(path, text) {
    const tmp = `${path}.${crypto.randomUUID()}.pending`;
    await this.verified(tmp, text); await this.io.rename(tmp, path);
    if (await this.io.read(path) !== text) throw Error('保存后文件发生变化，已保留历史快照');
  }
  async create(text, metadata = {}) { return this.serial(async () => {
    await this.init();
    const record = { ...metadata, id: crypto.randomUUID(), title: titleOf(metadata.title || text), createdAt: new Date().toISOString(), original: metadata.original ?? text };
    await this.verified(this.file(record.id), text);
    // Recovery record survives a failure while committing the catalog or Graph link.
    await this.verified(`${this.root}/.longdoc/${record.id}.json`, JSON.stringify(record));
    const catalog = await this.catalog(); catalog.push({ id: record.id, title: record.title, graph: record.graph, createdAt: record.createdAt });
    await this.atomic(`${this.root}/.longdoc/catalog.json`, JSON.stringify(catalog));
    return record;
  }); }
  async record(id) { this.file(id); return JSON.parse(await this.io.read(`${this.root}/.longdoc/${id}.json`)); }
  async read(id) { return this.io.read(this.file(id)); }
  async save(id, base, next) { return this.serial(async () => {
    const current = await this.read(id);
    if (current !== base) throw new ConflictError(current);
    if (current === next) return next;
    await this.verified(`${this.root}/.longdoc/history/${id}.${Date.now()}.${crypto.randomUUID()}.md`, current);
    if (await this.read(id) !== base) throw new ConflictError(await this.read(id));
    await this.atomic(this.file(id), next);
    return next;
  }); }
  async search(query, graph) {
    const q = query.toLocaleLowerCase(); const result = [];
    for (const entry of await this.catalog()) {
      if (entry.graph && entry.graph !== graph) continue;
      try {
        const body = await this.read(entry.id), at = body.toLocaleLowerCase().indexOf(q);
        if (!q || at >= 0 || entry.title.toLocaleLowerCase().includes(q)) result.push({ ...entry, snippet: body.slice(Math.max(0, at - 35), Math.max(0, at) + 100) });
      } catch { if (!q) result.push({ ...entry, snippet: '文件暂不可用' }); }
    }
    return result.reverse();
  }
}
