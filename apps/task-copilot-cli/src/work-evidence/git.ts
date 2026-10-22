import type { SyncRange } from './sync.ts';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import { join, isAbsolute } from 'node:path';
import { authorizedRoot } from '../workspace-files.ts';

export const limits = { milliseconds: 5000, outputBytes: 1_048_576, files: 500, diffBytes: 65536, fileBytes: 262144 };
export const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export type Change = { path: string; originalPath: string | null; staged: string; unstaged: string; untracked: boolean; modes: string[]; stamp: string; restricted: boolean };
export type Observation = { schemaVersion: 1; id: string; scopeId: string; directory: string; startedAt: string; observedAt: string; state: 'changes' | 'clean' | 'failed'; error: string | null; branch: string | null; head: string | null; sourceVersion: string | null; consistent: boolean; truncated: boolean; files: Change[]; historyIncomplete?: boolean; sync?: SyncRange; comparison: { previousId: string | null; new: string[]; existing: string[]; uncertain: string[]; absent: string[] }; limits: typeof limits; caveat: string };
export class EvidenceError extends Error { constructor(public code: string) { super(code); } }
export const sensitive = (path: string) => path.split('/').some(p => /^(?:\.git|\.env(?:\..*)?|\.ssh|\.aws|\.gnupg|\.npmrc|\.netrc|\.pypirc|\.kube|private|vault|certificates|config\.json|credentials?(?:\..*)?|secrets?(?:\..*)?|id_(?:rsa|ed25519)|.*\.(?:pem|key|p12|pfx|kdbx))$/iu.test(p));
export async function git(directory: string, args: string[], options: { milliseconds?: number; bytes?: number } = {}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['--no-optional-locks', '--literal-pathspecs', '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false', ...args], { cwd: directory, env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))), GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GIT_PAGER: 'cat' }, stdio: ['ignore', 'pipe', 'ignore'] });
    const chunks: Buffer[] = []; let size = 0, problem: string | null = null;
    const timer = setTimeout(() => { problem = 'GIT_TIMEOUT'; child.kill('SIGKILL'); }, options.milliseconds ?? limits.milliseconds);
    child.stdout.on('data', (data: Buffer) => { size += data.length; if (size > (options.bytes ?? limits.outputBytes)) { problem = 'RESULT_LIMIT'; child.kill('SIGKILL'); } else chunks.push(data); });
    child.on('error', () => { clearTimeout(timer); reject(new EvidenceError('GIT_UNAVAILABLE')); });
    child.on('close', code => { clearTimeout(timer); if (problem || code !== 0) reject(new EvidenceError(problem ?? 'GIT_FAILED')); else resolve(Buffer.concat(chunks)); });
  });
}
export async function rootDirectory(directory: string): Promise<string> {
  const root = await authorizedRoot(directory);
  const top = (await git(root, ['rev-parse', '--show-toplevel'])).toString('utf8').replace(/\n$/u, '');
  if (top !== root) throw new EvidenceError('SELECT_REPOSITORY_ROOT');
  return root;
}
function parse(raw: Buffer): { files: Change[]; head: string | null; branch: string | null } {
  const parts = raw.toString('utf8').split('\0'), files: Change[] = []; let head = null, branch = null;
  for (let i = 0; i < parts.length; i++) {
    const line = parts[i]!;
    if (line.startsWith('# branch.oid ')) { head = line.slice(13); if (head === '(initial)') head = null; continue; }
    if (line.startsWith('# branch.head ')) { branch = line.slice(14); continue; }
    if (line.startsWith('# ') || !line) continue;
    let path: string, originalPath: string | null = null, xy = '??', modes: string[] = [];
    if (line.startsWith('? ')) path = line.slice(2);
    else {
      const count = line[0] === '1' ? 8 : line[0] === '2' ? 9 : line[0] === 'u' ? 10 : 0;
      if (!count) throw new EvidenceError('UNSUPPORTED_GIT_STATUS');
      const fields: string[] = []; let offset = 0;
      for (let n = 0; n < count; n++) { const end = line.indexOf(' ', offset); if (end < 0) throw new EvidenceError('INVALID_GIT_STATUS'); fields.push(line.slice(offset, end)); offset = end + 1; }
      path = line.slice(offset); xy = fields[1]!; modes = fields.slice(3, line[0] === 'u' ? 7 : 6);
      if (line[0] === '2') originalPath = parts[++i] ?? null;
    }
    // UTF-8 replacement is ambiguous; never address a different filesystem path.
    if (path.includes('\ufffd') || originalPath?.includes('\ufffd')) throw new EvidenceError('NON_UTF8_PATH_UNSUPPORTED');
    files.push({ path, originalPath, staged: xy[0]!, unstaged: xy[1]!, untracked: xy === '??', modes, restricted: sensitive(path) || !!originalPath && sensitive(originalPath), stamp: digest(line + (originalPath ?? '')) });
  }
  return { files, head, branch };
}
async function stamp(root: string, file: Change): Promise<string> {
  const facts = [];
  for (const path of [file.path, file.originalPath].filter((p): p is string => p !== null)) {
    const parts = (path.endsWith('/') ? path.slice(0, -1) : path).split('/'); let current = root;
    if (isAbsolute(path) || parts.some(p => !p || p === '..' || p === '.' || p === '.git')) throw new EvidenceError('PATH_OUTSIDE_SCOPE');
    for (const part of parts) {
      current = join(current, part);
      try { const s = await lstat(current, { bigint: true }); if (s.isSymbolicLink()) { facts.push('symlink'); break; } if (current === join(root, path)) facts.push([s.mode, s.ino, s.size, s.mtimeNs, s.ctimeNs].map(String).join(':')); }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; facts.push('missing'); break; }
    }
  }
  return digest(file.stamp + facts.join('|'));
}
const statusArgs = ['status', '--porcelain=v2', '-z', '--branch', '--untracked-files=all', '--ignore-submodules=all'];
export async function source(root: string, options: { milliseconds?: number; bytes?: number } = {}) {
  const raw = await git(root, statusArgs, options), parsed = parse(raw), truncated = parsed.files.length > limits.files;
  const files = parsed.files.slice(0, limits.files), deadline = Date.now() + (options.milliseconds ?? limits.milliseconds);
  for (const file of files) { if (Date.now() > deadline) throw new EvidenceError('GIT_TIMEOUT'); file.stamp = await stamp(root, file); }
  return { ...parsed, files, truncated, version: digest(Buffer.concat([raw, Buffer.from(JSON.stringify(files))])) };
}
export async function observe(scopeId: string, directory: string, previous?: Observation, options: { milliseconds?: number; bytes?: number } = {}): Promise<Observation> {
  const startedAt = new Date().toISOString();
  const record: Observation = { schemaVersion: 1, id: randomUUID(), scopeId, directory, startedAt, observedAt: startedAt, state: 'failed', error: null, branch: null, head: null, sourceVersion: null, consistent: false, truncated: false, files: [], comparison: { previousId: previous?.id ?? null, new: [], existing: [], uncertain: [], absent: [] }, limits, caveat: '只保存元数据，不保存历史正文。前后校验不是原子快照；已有变化只表示相同元数据，不能证明正文相同。子模块内部变化未观察。' };
  try {
    await rootDirectory(directory);
    const before = await source(directory, options), after = await source(directory, options);
    Object.assign(record, { state: before.files.length || before.truncated ? 'changes' : 'clean', branch: before.branch, head: before.head, sourceVersion: before.version, consistent: before.version === after.version, truncated: before.truncated, files: before.files });
    const old = new Map(previous?.files.map(f => [f.path, f]) ?? []);
    const comparable = previous?.scopeId === scopeId && previous.directory === directory && previous.consistent && !previous.truncated && previous.state !== 'failed' && previous.head === record.head && previous.branch === record.branch && record.consistent && !record.truncated;
    for (const file of record.files) {
      if (!comparable) record.comparison.uncertain.push(file.path);
      else if (!old.has(file.path) || old.get(file.path)?.stamp !== file.stamp) record.comparison.new.push(file.path);
      else record.comparison.existing.push(file.path);
    }
    if (comparable) record.comparison.absent = [...old.keys()].filter(path => !record.files.some(f => f.path === path));
  } catch (e) { record.error = (e as EvidenceError).code ?? 'OBSERVATION_FAILED'; record.truncated = record.error === 'RESULT_LIMIT'; }
  record.observedAt = new Date().toISOString(); return record;
}
export async function textDiff(record: Observation, path: string, side: 'staged' | 'unstaged') {
  if (!['staged', 'unstaged'].includes(side)) throw new EvidenceError('INVALID_DIFF_SIDE');
  const file = record.files.find(f => f.path === path);
  if (!file || file.restricted || file.untracked || file.modes.includes('120000') || file.modes.includes('160000')) throw new EvidenceError('TEXT_DIFF_RESTRICTED');
  await rootDirectory(record.directory);
  const before = await source(record.directory);
  if (!record.consistent || record.truncated || before.truncated || before.version !== record.sourceVersion) throw new EvidenceError('SOURCE_CHANGED');
  for (const candidate of [file.path, file.originalPath].filter((p): p is string => p !== null)) {
    let current = record.directory;
    for (const part of candidate.split('/')) {
      current = join(current, part);
      try { const s = await lstat(current); if (s.isSymbolicLink()) throw new EvidenceError('SYMLINK_RESTRICTED'); if (s.size > limits.fileBytes && !s.isDirectory()) throw new EvidenceError('FILE_SIZE_LIMIT'); }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; break; }
    }
  }
  let raw: Buffer;
  try { raw = await git(record.directory, ['diff', '--no-ext-diff', '--no-textconv', '--no-color', '--no-renames', ...(side === 'staged' ? ['--cached'] : []), '--', file.path, ...(file.originalPath ? [file.originalPath] : [])], { bytes: limits.diffBytes }); }
  catch (e) { if ((e as EvidenceError).code === 'RESULT_LIMIT') return { state: 'truncated', text: null }; throw e; }
  const after = await source(record.directory);
  if (before.version !== after.version) throw new EvidenceError('SOURCE_CHANGED');
  const text = raw.toString('utf8');
  if (raw.includes(0) || text.includes('\ufffd') || /(?:Binary files|GIT binary patch|PRIVATE KEY-----|(?:api[_-]?key|password|secret|token)\s*[=:]\s*\S+)/iu.test(text)) return { state: 'restricted', text: null };
  return { state: 'current-text', text, persisted: false, sourceVersion: before.version };
}
