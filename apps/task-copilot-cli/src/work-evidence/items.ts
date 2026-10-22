import { digest, git, limits, sensitive, rootDirectory, EvidenceError, type Observation, type Change } from './git.ts';

export type FileItem = { id: string; path: string; aliases: string[]; restricted: boolean; workspace: Change | null; commits: string[] };
/** Keep a file entry, rather than one duplicate row per commit/status layer. All source refs survive. */
export function fileItems(record: Observation): FileItem[] {
  const rows: FileItem[] = [];
  const add = (path: string, original: string | null, restricted: boolean) => {
    let row = rows.find(item => item.aliases.includes(path) || !!original && item.aliases.includes(original));
    if (!row) { row = { id: '', path, aliases: [], restricted, workspace: null, commits: [] }; rows.push(row); }
    row.path = path; row.restricted ||= restricted;
    for (const alias of [path, original]) if (alias && !row.aliases.includes(alias)) row.aliases.push(alias);
    return row;
  };
  for (const file of record.sync?.files ?? []) {
    const row = add(file.path, file.originalPath, file.restricted);
    row.commits = [...new Set([...row.commits, ...file.commits])];
  }
  for (const file of record.files) add(file.path, file.originalPath, file.restricted).workspace = file;
  for (const row of rows) row.id = digest(`${record.scopeId}:${record.id}:${row.aliases.slice().sort().join('\0')}`);
  return rows;
}

export async function commitDiff(record: Observation, itemId: string, sha: string) {
  const item = fileItems(record).find(file => file.id === itemId);
  if (!item || item.restricted || !item.commits.includes(sha) || !/^[a-f\d]{40,64}$/u.test(sha)) throw new EvidenceError('INVALID_COMMIT_SELECTION');
  await rootDirectory(record.directory);
  const parents = (await git(record.directory, ['rev-list', '--parents', '-n', '1', sha])).toString('utf8').trim().split(' ');
  const parent = parents[1];
  const paths = item.aliases.filter(path => !sensitive(path));
  // Tree entries and sizes are metadata. Symlinks, gitlinks and oversized blobs never reach diff output.
  for (const revision of [parent, sha].filter((s): s is string => !!s)) {
    const raw = await git(record.directory, ['ls-tree', '-z', revision, '--', ...paths]);
    for (const entry of raw.toString('utf8').split('\0').filter(Boolean)) {
      const match = /^(\d+) (\w+) ([a-f\d]+)\t/u.exec(entry);
      if (!match || !['100644', '100755'].includes(match[1]!) || match[2] !== 'blob') throw new EvidenceError('TEXT_DIFF_RESTRICTED');
      const size = Number((await git(record.directory, ['cat-file', '-s', match[3]!])).toString('utf8').trim());
      if (!Number.isSafeInteger(size) || size > limits.fileBytes) throw new EvidenceError('FILE_SIZE_LIMIT');
    }
  }
  let bytes: Buffer;
  try {
    bytes = await git(record.directory, parent
      ? ['diff', '--no-ext-diff', '--no-textconv', '--no-color', '--no-renames', parent, sha, '--', ...paths]
      : ['show', '--format=', '--no-ext-diff', '--no-textconv', '--no-color', '--no-renames', sha, '--', ...paths], { bytes: limits.diffBytes });
  } catch (error) { if ((error as EvidenceError).code === 'RESULT_LIMIT') return { state: 'truncated', text: null }; throw error; }
  const text = bytes.toString('utf8');
  if (bytes.includes(0) || text.includes('\ufffd') || /(?:Binary files|GIT binary patch|PRIVATE KEY-----|(?:api[_-]?key|password|secret|token)\s*[=:]\s*\S+)/iu.test(text)) return { state: 'restricted', text: null };
  return { state: 'commit-text', text, persisted: false, commit: sha, observationId: record.id };
}
