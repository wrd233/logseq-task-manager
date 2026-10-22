import { mkdir, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { atomicJson } from '../../../task-copilot-cli/src/workspace-files.ts';
import { structure } from './model.mjs';
export const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
/** Project-scoped immutable records. One queue and one content hash, no event framework. */
export class HistoryStore {
    constructor(directory) { this.directory = directory; this.queues = new Map(); }
    folder(project) { return join(this.directory, hash(project)); }
    async records(project) {
        let names;
        try {
            names = await readdir(this.folder(project));
        }
        catch (e) {
            if (e.code === 'ENOENT')
                return { records: [], problems: [] };
            throw e;
        }
        const records = [], problems = [];
        await Promise.all(names.filter(n => n.endsWith('.json')).map(async (name) => {
            try {
                const envelope = JSON.parse(await readFile(join(this.folder(project), name), 'utf8'));
                if (envelope.hash !== hash(envelope.record) || envelope.record.project !== project)
                    throw Error('HISTORY_RECORD_CORRUPT');
                records.push(envelope.record);
            }
            catch (e) {
                problems.push({ id: name.slice(0, -5), message: `记录不可读：${e.code ?? e.message}` });
            }
        }));
        records.sort((a, b) => a.sequence - b.sequence);
        return { records, problems };
    }
    async get(project, id) {
        if (!/^[\da-f-]{36,64}$/i.test(id))
            throw Error('HISTORY_RECORD_MISSING');
        const envelope = JSON.parse(await readFile(join(this.folder(project), `${id}.json`), 'utf8'));
        if (envelope.hash !== hash(envelope.record) || envelope.record.project !== project)
            throw Error('HISTORY_RECORD_CORRUPT');
        return envelope.record;
    }
    append(project, input) {
        const task = (this.queues.get(project) ?? Promise.resolve()).catch(() => { }).then(async () => {
            const { records, problems } = await this.records(project);
            if (problems.length)
                throw Error('HISTORY_STORAGE_NEEDS_ATTENTION');
            const payload = { ...input, ...structure(input) };
            const digest = hash(payload);
            const previous = records.find(r => r.requestId === input.requestId);
            if (previous) {
                if (previous.inputHash !== digest)
                    throw Error('HISTORY_REQUEST_REUSED');
                return previous;
            }
            const latest = records.filter(r => r.track === input.track && r.kind === 'snapshot').at(-1);
            if (input.expectedParent !== undefined && input.expectedParent !== (latest?.id ?? null))
                throw Error('HISTORY_PARENT_CHANGED');
            if (input.dedupe && latest?.fingerprint === payload.fingerprint)
                return latest;
            const now = new Date().toISOString(), record = { ...payload, id: randomUUID(), project, inputHash: digest,
                sequence: (records.at(-1)?.sequence ?? 0) + 1, parentId: latest?.id ?? null, recordedAt: now,
                reconstructedAt: input.origin === 'reconstructed' ? now : null };
            if (JSON.stringify(record).length > 8000000)
                throw Error('HISTORY_RECORD_TOO_LARGE');
            await mkdir(this.folder(project), { recursive: true, mode: 0o700 });
            await atomicJson(join(this.folder(project), `${record.id}.json`), { record, hash: hash(record) });
            return record;
        });
        this.queues.set(project, task);
        return task;
    }
}
