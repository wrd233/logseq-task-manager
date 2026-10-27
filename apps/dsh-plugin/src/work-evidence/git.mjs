import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { lstat, open, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, join } from 'node:path';
import { hash } from '../project-records.mjs';

const exec = promisify(execFile);
export const fail = code => Object.assign(Error(code), { code });
export const sensitive = path => path.split('/').some(p => /^(?:\.git|\.env(?:\..*)?|\.ssh|\.aws|\.kube|\.gnupg|\.npmrc|\.netrc|\.pypirc|credentials?(?:\..*)?|secrets?(?:\..*)?|id_(?:rsa|ed25519)|.*\.(?:pem|key|p12|pfx|kdbx))$/iu.test(p));
export const hasSecret = text => /PRIVATE KEY-----|(?:api[_-]?key|password|secret|token)["']?\s*[=:]\s*["']?[^\s"']{6,}|Bearer\s+[A-Za-z0-9._-]{16,}/iu.test(text);
const limits = { files: 300, commits: 80, patchBytes: 48000, totalBytes: 3000000 };
const internal = path => path.split('/').some(p => ['.task-workspace', '.longdoc'].includes(p));
export async function git(directory, args) {
  try {
    return (await exec('git', ['--no-optional-locks', '--literal-pathspecs', '-c', 'core.fsmonitor=false', '-C', directory, ...args], { encoding: 'buffer', timeout: 10000, maxBuffer: 4194304 })).stdout;
  } catch (error) { throw fail(error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' ? 'EVIDENCE_GIT_LIMIT' : error.killed ? 'EVIDENCE_GIT_TIMEOUT' : 'EVIDENCE_GIT_UNAVAILABLE'); }
}
const string = async (directory, args) => (await git(directory, args)).toString('utf8').trim();
const patchArgs = ['--no-ext-diff', '--no-textconv', '--no-color'];
function patch(raw, restricted = false) {
  const text = raw.toString('utf8');
  if (restricted || raw.includes(0) || text.includes('\ufffd') || hasSecret(text) || /^(?:Binary files|GIT binary patch)/m.test(text)) return { state: 'restricted', text: '' };
  if (raw.length > limits.patchBytes) return { state: 'too-large', text: '' };
  return { state: 'text', text };
}
async function untracked(directory, path) {
  let current = directory;
  for (const part of path.split('/')) {
    current = join(current, part);
    const info = await lstat(current);
    if (info.isSymbolicLink()) return { state: 'restricted', text: '' };
  }
  const info = await lstat(current);
  if (!info.isFile() || info.size > limits.patchBytes) return { state: 'too-large', text: '' };
  if (await realpath(current) !== current) return { state: 'restricted', text: '' };
  const handle = await open(current, constants.O_RDONLY | constants.O_NOFOLLOW);
  let result;
  try { result = patch(await handle.readFile()); } finally { await handle.close(); }
  return result.state === 'text' ? { ...result, text: `未跟踪文件 ${path}\n${result.text}` } : result;
}
async function working(directory) {
  const prefix = await string(directory, ['rev-parse', '--show-prefix']);
  const fields = (await git(directory, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', '.'])).toString('utf8').split('\0');
  const rows = [];
  for (let i = 0; i < fields.length && fields[i]; i++) {
    const code = fields[i].slice(0, 2), full = fields[i].slice(3), old = /[RC]/.test(code) ? fields[++i] : null;
    if (!full.startsWith(prefix) || full.includes('\ufffd')) throw fail('EVIDENCE_GIT_PATH');
    const path = full.slice(prefix.length), originalPath = old?.startsWith(prefix) ? old.slice(prefix.length) : null;
    if (internal(path)) continue;
    if (rows.length >= limits.files) throw fail('EVIDENCE_GIT_LIMIT');
    const restricted = sensitive(path) || !!old && sensitive(old), paths = [path, ...(originalPath ? [originalPath] : [])];
    const parts = [];
    if (code === '??') parts.push({ kind: 'untracked', ...restricted ? { state: 'restricted', text: '' } : await untracked(directory, path) });
    else {
      if (code[0] !== ' ') parts.push({ kind: 'staged', ...patch(await git(directory, ['diff', ...patchArgs, '--cached', '--relative', '--', ...paths]), restricted) });
      if (code[1] !== ' ') parts.push({ kind: 'unstaged', ...patch(await git(directory, ['diff', ...patchArgs, '--relative', '--', ...paths]), restricted) });
    }
    let metadata = null;
    try { const info = await lstat(join(directory, path)); metadata = [info.size, info.mtimeMs, info.mode, info.ino]; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const index = await string(directory, ['ls-files', '--stage', '--', path]);
    rows.push({ path, originalPath, code, parts, stamp: hash([code, originalPath, parts, metadata, index]) });
  }
  return rows;
}

/** A failed or unstable collection never advances the successful baseline. */
export async function collectGit(directory, previous) {
  const repository = await realpath(await string(directory, ['rev-parse', '--show-toplevel']));
  const common = resolve(directory, await string(directory, ['rev-parse', '--git-common-dir'])), info = await lstat(common);
  const identity = hash([repository, common, info.ino, info.birthtimeMs]);
  const head = async () => {
    const exists = await string(directory, ['rev-parse', '--revs-only', 'HEAD']);
    return exists || null;
  };
  const toHead = await head(), dirty = await working(directory);
  const reset = !previous || previous.identity !== identity;
  if (!reset && previous.head && previous.head !== toHead) {
    if (!toHead) throw fail('EVIDENCE_HISTORY_DIVERGED');
    try { await git(directory, ['merge-base', '--is-ancestor', previous.head, toHead]); }
    catch { throw fail('EVIDENCE_HISTORY_DIVERGED'); }
  }
  const commits = [], files = new Map();
  const add = (path, originalPath, part, code) => {
    // Follow rename chains so committed/staged/unstaged changes stay in one row.
    let row = files.get(path) ?? (originalPath ? files.get(originalPath) : null);
    if (row && row.path !== path) { files.delete(row.path); row.path = path; }
    if (!row) row = { path, originalPath, aliases: [], parts: [], code: '' };
    if (originalPath && !row.aliases.includes(originalPath)) row.aliases.push(originalPath);
    row.originalPath ??= originalPath;
    row.parts.push(part); row.code = code ?? row.code;
    files.set(path, row);
    if (files.size > limits.files) throw fail('EVIDENCE_GIT_LIMIT');
  };
  if (!reset && toHead && previous.head !== toHead) {
    const ids = (await string(directory, ['rev-list', '--topo-order', '--reverse', previous.head ? `${previous.head}..${toHead}` : toHead])).split('\n').filter(Boolean);
    if (ids.length > limits.commits) throw fail('EVIDENCE_GIT_LIMIT');
    for (const sha of ids) {
      const subject = await string(directory, ['show', '-s', '--format=%s', sha]);
      commits.push({ sha, subject: hasSecret(subject) ? '（提交说明含受限内容）' : subject.slice(0, 500) });
      const parents = (await string(directory, ['rev-list', '--parents', '-n', '1', sha])).split(' ');
      const diff = parents[1] ? ['diff', parents[1], sha] : ['diff-tree', '--root', '--no-commit-id', '-r', sha];
      const names = (await git(directory, [...diff, '--relative', '-M', '--name-status', '-z', '--', '.'])).toString('utf8').split('\0');
      for (let i = 0; i < names.length && names[i];) {
        const status = names[i++], first = names[i++], renamed = /^[RC]/.test(status), path = renamed ? names[i++] : first;
        if (!path || path.includes('\ufffd')) throw fail('EVIDENCE_GIT_PATH');
        if (internal(path)) continue;
        const restricted = sensitive(first) || sensitive(path);
        const raw = await git(directory, [...diff, ...patchArgs, '--relative', '-p', '--', path, ...(renamed ? [first] : [])]);
        add(path, renamed ? first : null, { kind: 'commit', sha, status, ...patch(raw, restricted) });
      }
    }
  }
  if (!reset) for (const row of dirty) {
    const prior = previous.dirty.find(f => f.path === row.path || f.path === row.originalPath);
    for (const part of row.parts) add(row.path, row.originalPath, { ...part, existed: prior?.stamp === row.stamp }, row.code);
  }
  const items = [...files.values()].map(row => ({ ...row, id: hash(row.path).slice(0, 24), changed: row.parts.some(p => p.kind === 'commit' || !p.existed) }));
  const result = { identity, repository, head: toHead, fromHead: reset ? null : previous.head, baseline: reset, commits, dirty, items, limits, excluded: ['.task-workspace', '.longdoc'] };
  if (JSON.stringify(result).length > limits.totalBytes) throw fail('EVIDENCE_GIT_LIMIT');
  if (toHead !== await head() || hash(dirty) !== hash(await working(directory))) throw fail('EVIDENCE_SOURCE_CHANGED');
  return result;
}
