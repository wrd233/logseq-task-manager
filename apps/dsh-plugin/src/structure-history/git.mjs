import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { hash } from './store.mjs';
const exec = promisify(execFile);
const excluded = ['.task-workspace', '.longdoc', 'node_modules', '.env', '.env.*', '*.pem', '*.key', '*credentials*', '*secret*'];
const safe = path => !path.split('/').some(p => /^\.env(?:\.|$)|credentials|secrets?/i.test(p) || ['.task-workspace', '.longdoc', 'node_modules'].includes(p)) && !/\.(?:pem|key)$/i.test(path);
async function fileVersion(path) {
    try {
        const info = await stat(path);
        if (!info.isFile())
            return { version: null, stamp: 'directory' };
        if (info.size > 32 * 1024 * 1024)
            return { version: null, stamp: [info.size, info.mtimeMs] };
        const digest = createHash('sha256');
        for await (const chunk of createReadStream(path))
            digest.update(chunk);
        const version = digest.digest('hex');
        return { version, stamp: version };
    }
    catch (error) {
        if (error.code === 'ENOENT')
            return { version: null, stamp: 'missing' };
        throw error;
    }
}
/** Observe the selected directory's Git projection; no semantic project-tree inference. */
export async function observeGit(directory, previous) {
    const git = async (args) => (await exec('git', ['--no-optional-locks', '-C', directory, ...args], { maxBuffer: 4194304, timeout: 10000 })).stdout;
    let head, prefix, repository;
    try {
        repository = (await git(['rev-parse', '--show-toplevel'])).trim();
        prefix = (await git(['rev-parse', '--show-prefix'])).trim();
        head = (await git(['rev-parse', 'HEAD'])).trim();
    }
    catch (e) {
        if (e.code === 128)
            return { unavailable: '此工作尚无可读取的 Git 提交。' };
        throw e;
    }
    const commit = await git(['show', '-s', '--format=%H%n%cI%n%s', head]);
    const parts = (await git(['status', '--porcelain=v1', '-z', '--untracked-files=all'])).split('\0'), paths = [];
    for (let i = 0; i < parts.length; i++) {
        const row = parts[i];
        if (!row)
            continue;
        const code = row.slice(0, 2), full = row.slice(3), oldPath = /[RC]/.test(code) ? parts[++i] : null;
        if (full.startsWith(prefix) && safe(full.slice(prefix.length)))
            paths.push({ path: full.slice(prefix.length), code, ...(oldPath ? { previousPath: oldPath } : {}) });
    }
    const committed = previous?.facts?.repository === repository && previous.facts.head !== head;
    const committedPaths = committed ? (await git(['diff', '--name-only', '-z', '--relative', previous.facts.head, head, '--', '.'])).split('\0').filter(p => p && safe(p)) : [];
    const selected = [...new Set([...paths.map(p => p.path), ...committedPaths])], spec = selected.map(p => `:(literal)${p}`);
    const patch = spec.length ? await git(['diff', '--no-ext-diff', '--no-textconv', '--no-renames', 'HEAD', '--', ...spec]) : '';
    const since = committed && spec.length ? await git(['diff', '--no-ext-diff', '--no-textconv', '--no-renames', previous.facts.head, head, '--', ...spec]) : '';
    const versions = await Promise.all(selected.map(path => fileVersion(join(directory, path))));
    const fingerprint = hash([repository, head, paths, patch, paths.map(p => versions[selected.indexOf(p.path)].stamp)]);
    const nodes = selected.map((path, order) => {
        const change = paths.find(p => p.path === path), code = change?.code ?? 'committed';
        return { id: `file:${path}`, title: path, body: code === '??' ? '未跟踪文件；仅保留正文指纹。' : `Git 状态：${code}${change?.previousPath ? `；原路径：${change.previousPath}` : ''}`, order, parentId: null, status: code, dependencies: [],
            sources: [{ kind: 'file', ref: path, version: versions[order].version, excerpt: '' }], availability: 'available' };
    });
    return { kind: 'snapshot', track: 'git-changes', origin: 'observed', title: since ? '提交与工作区有新变化' : paths.length ? `${paths.length} 个路径有工作区变化` : '当前提交与干净工作区',
        summary: '工具记录 Git 可核查的变化，不推断工作是否完成。', occurredAt: null, requestId: `git:${previous?.id ?? 'initial'}:${fingerprint}`, dedupe: true, fingerprint,
        coverage: 'partial', nodes, facts: { repository, head, commit, paths, patch: patch.slice(0, 262144), since: since.slice(0, 262144), truncated: patch.length > 262144 || since.length > 262144,
            contentRetention: 'Git patch and current file fingerprints; untracked contents not retained', exclusions: excluded } };
}
