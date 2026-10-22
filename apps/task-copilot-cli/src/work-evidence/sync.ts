import { git, source, sensitive, type Observation } from './git.ts';

export type CommitFile = { path: string; originalPath: string | null; status: string; restricted: boolean; commits: string[] };
export type SyncRange = { state: 'initial' | 'complete' | 'unknown' | 'unavailable'; fromObservationId: string | null; fromHead: string | null; toHead: string | null; commits: { sha: string; subject: string }[]; files: CommitFile[]; truncated: boolean; reason: string | null };

export function validSync(value: unknown): value is SyncRange {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>, sha = (s: unknown) => typeof s === 'string' && /^[a-f\d]{40,64}$/u.test(s);
  const text = (s: unknown) => typeof s === 'string' && s.length <= 4096;
  return ['initial', 'complete', 'unknown', 'unavailable'].includes(String(row.state)) && typeof row.truncated === 'boolean' &&
    (row.fromObservationId === null || typeof row.fromObservationId === 'string' && /^[a-f\d-]{36}$/u.test(row.fromObservationId)) &&
    (row.fromHead === null || sha(row.fromHead)) && (row.toHead === null || sha(row.toHead)) && (row.reason === null || text(row.reason)) &&
    Array.isArray(row.commits) && row.commits.length <= 100 && row.commits.every(c => c && sha(c.sha) && text(c.subject)) &&
    Array.isArray(row.files) && row.files.length <= 500 && row.files.every(f => f && text(f.path) && (f.originalPath === null || text(f.originalPath)) && text(f.status) && typeof f.restricted === 'boolean' && Array.isArray(f.commits) && f.commits.length <= 100 && f.commits.every(sha));
}

/** Metadata only. A file has one row with all contributing commits, including changes later reverted. */
export async function incremental(record: Observation, previous?: Observation, historyComplete = true): Promise<SyncRange> {
  const result: SyncRange = { state: 'initial', fromObservationId: previous?.id ?? null, fromHead: previous?.head ?? null, toHead: record.head, commits: [], files: [], truncated: false, reason: null };
  if (!historyComplete || record.state === 'failed' || !record.consistent || record.truncated) return { ...result, state: 'unknown', reason: 'INCOMPLETE_CHECKPOINT_OR_OBSERVATION' };
  if (!previous) return result;
  result.state = 'complete';
  if (!record.head) return { ...result, state: previous.head ? 'unknown' : 'complete', reason: previous.head ? 'HEAD_DISAPPEARED' : null };
  if (previous.head === record.head) return result;
  const deadline = Date.now() + 5000;
  const run = (args: string[]) => {
    if (Date.now() >= deadline) throw Object.assign(Error('SYNC_TIMEOUT'), { code: 'SYNC_TIMEOUT' });
    return git(record.directory, args, { milliseconds: Math.max(1, deadline - Date.now()) });
  };
  try {
    if (previous.head) {
      try { await run(['merge-base', '--is-ancestor', previous.head, record.head]); }
      catch { return { ...result, state: 'unknown', reason: 'CHECKPOINT_NOT_ANCESTOR_OR_UNAVAILABLE' }; }
    }
    const ids = (await run(['rev-list', '--topo-order', '--reverse', previous.head ? `${previous.head}..${record.head}` : record.head])).toString('utf8').trim().split('\n').filter(Boolean);
    result.truncated = ids.length > 100;
    const files = new Map<string, CommitFile>();
    for (const sha of ids.slice(0, 100)) {
      if (!/^[a-f\d]{40,64}$/u.test(sha)) throw Error('INVALID_COMMIT_ID');
      const subject = (await run(['show', '-s', '--format=%s', sha])).toString('utf8').trim().slice(0, 500);
      result.commits.push({ sha, subject });
      const parents = (await run(['rev-list', '--parents', '-n', '1', sha])).toString('utf8').trim().split(' ');
      const args = parents[1] ? ['diff', '--name-status', '-z', '-M', parents[1], sha, '--'] : ['diff-tree', '--root', '--no-commit-id', '-r', '--name-status', '-z', '-M', sha, '--'];
      const fields = (await run(args)).toString('utf8').split('\0');
      for (let i = 0; i < fields.length && fields[i];) {
        const status = fields[i++]!, first = fields[i++]!;
        const renamed = /^[RC]/u.test(status), path = renamed ? fields[i++]! : first;
        if (!/^[AMDRCTUXB][\d]*$/u.test(status) || !path || path.includes('\ufffd') || first.includes('\ufffd')) throw Error('INVALID_COMMIT_PATH');
        const existing = files.get(path);
        if (existing) { existing.commits.push(sha); existing.restricted ||= sensitive(first) || sensitive(path); }
        else if (files.size < 500) files.set(path, { path, originalPath: renamed ? first : null, status, restricted: sensitive(first) || sensitive(path), commits: [sha] });
        else result.truncated = true;
      }
    }
    result.files = [...files.values()];
    const after = await source(record.directory, { milliseconds: Math.max(1, deadline - Date.now()) });
    if (after.version !== record.sourceVersion) { result.state = 'unknown'; result.reason = 'SOURCE_CHANGED_DURING_SYNC'; }
    if (result.truncated) { result.state = 'unknown'; result.reason ??= 'SYNC_TRUNCATED'; }
  } catch (error) { result.state = 'unavailable'; result.reason = (error as { code?: string }).code ?? 'COMMIT_METADATA_UNAVAILABLE'; }
  return result;
}
