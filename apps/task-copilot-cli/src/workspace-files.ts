import { constants } from "node:fs";
import { lstat, realpath, opendir, open, readFile, mkdir, rename, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { isAbsolute, join, relative, sep, resolve, dirname } from "node:path";
import { WorkspaceError, workRecord, workText, type AgentWorkBinding } from "@task-copilot/contracts";
export const fileLimits = { depth: 8, entries: 1000, directories: 128, previewBytes: 262144, configBytes: 8192, concurrency: 1 } as const;
const ignored = new Set([".task-workspace", ".longdoc", ".git", "node_modules", "dist", "build", "coverage", ".cache", ".parcel-cache", ".vite", ".DS_Store"]);
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
export type FileFact = {
    path: string;
    kind: "file" | "directory" | "symlink" | "other";
    size: number | null;
    modifiedAt: string | null;
    availability: "available" | "unavailable" | "restricted";
    materialId: string | null;
    change: "added" | "observed-change" | "same-metadata" | "missing";
    problem: string | null;
};
export type FileObservation = {
    observedAt: string;
    files: FileFact[];
    truncated: Array<{
        path: string;
        reason: string;
    }>;
    limits: typeof fileLimits;
};
export interface KnownMaterial {
    id: string;
    path: string;
}
export async function authorizedRoot(directory: string): Promise<string> {
    if (!isAbsolute(directory))
        throw new WorkspaceError("ABSOLUTE_DIRECTORY_REQUIRED");
    const root = await realpath(directory);
    if (root !== resolve(directory))
        throw new WorkspaceError("SYMLINK_RESTRICTED");
    if (!(await lstat(root)).isDirectory())
        throw new WorkspaceError("DIRECTORY_UNAVAILABLE");
    return root;
}
/** Reject every symlink component, including links that happen to point inside. */
export async function scopedPath(root: string, input: unknown): Promise<string> {
    const path = workText(input, 4096);
    if (isAbsolute(path) || path.split(/[\\/]/u).some(part => !part || part === "." || part === ".." || ignored.has(part)))
        throw new WorkspaceError("PATH_OUTSIDE_SCOPE");
    let current = root;
    for (const part of path.split(/[\\/]/u)) {
        current = join(current, part);
        if ((await lstat(current)).isSymbolicLink())
            throw new WorkspaceError("SYMLINK_RESTRICTED");
    }
    const actual = await realpath(current), rel = relative(root, actual);
    if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel))
        throw new WorkspaceError("PATH_OUTSIDE_SCOPE");
    return actual;
}
/** Preflight existing write-path components without creating or owning material files. */
export async function materialWritePaths(root: string, paths: string[]): Promise<void> {
    for (const path of paths) {
        const rel = relative(root, resolve(path));
        if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel))
            throw new WorkspaceError("PATH_OUTSIDE_SCOPE");
        let current = root;
        for (const part of rel.split(sep).filter(Boolean)) {
            current = join(current, part);
            try {
                if ((await lstat(current)).isSymbolicLink())
                    throw new WorkspaceError("SYMLINK_RESTRICTED");
            }
            catch (error) {
                if ((error as {
                    code?: string;
                }).code !== "ENOENT")
                    throw error;
                break;
            }
        }
    }
}
async function exclusions(root: string): Promise<Set<string>> {
    const found = new Set(ignored), path = join(root, ".task-workspace", "files-ignore-v1.json");
    try {
        const parent = await lstat(join(root, ".task-workspace"));
        if (!parent.isDirectory() || parent.isSymbolicLink())
            throw new WorkspaceError("METADATA_PATH_RESTRICTED");
        const stat = await lstat(path);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > fileLimits.configBytes)
            throw new WorkspaceError("FILES_CONFIG_INVALID");
        const raw = workRecord(JSON.parse(await readFile(path, "utf8")), ["schemaVersion", "exclude"]);
        if (raw.schemaVersion !== 1 || !Array.isArray(raw.exclude) || raw.exclude.length > 64)
            throw new WorkspaceError("FILES_CONFIG_INVALID");
        for (const value of raw.exclude) {
            const name = workText(value, 128);
            if (/[\\/]/u.test(name) || name === "." || name === "..")
                throw new WorkspaceError("FILES_CONFIG_INVALID");
            found.add(name);
        }
    }
    catch (error) {
        if ((error as {
            code?: string;
        }).code !== "ENOENT")
            throw error;
    }
    return found;
}
export async function discoverFiles(root: string, materials: KnownMaterial[], previous?: FileObservation): Promise<FileObservation> {
    const files: FileFact[] = [], truncated: FileObservation["truncated"] = [], exclude = await exclusions(root);
    const old = new Map(previous?.files.filter(item => item.change !== "missing").map(item => [item.path, item]) ?? []), known = new Map(materials.map(item => [resolve(item.path), item.id]));
    let directories = 0, visited = 0;
    const walk = async (directory: string, depth: number): Promise<void> => {
        if (directory !== root)
            await scopedPath(root, relative(root, directory));
        if (++directories > fileLimits.directories) {
            truncated.push({ path: relative(root, directory), reason: "directory-limit" });
            return;
        }
        const handle = await opendir(directory).catch(error => {
            truncated.push({ path: relative(root, directory), reason: String((error as {
                    code?: string;
                }).code ?? "unreadable") });
            return null;
        });
        if (!handle)
            return;
        for await (const entry of handle) {
            if (++visited > fileLimits.entries) {
                truncated.push({ path: relative(root, directory), reason: "entry-limit" });
                break;
            }
            if (exclude.has(entry.name))
                continue;
            const path = join(directory, entry.name), rel = relative(root, path);
            const fact: FileFact = { path: rel, kind: "other", size: null, modifiedAt: null, availability: "unavailable", materialId: known.get(path) ?? null, change: old.has(rel) ? "observed-change" : "added", problem: null };
            try {
                const stat = await lstat(path);
                fact.kind = stat.isSymbolicLink() ? "symlink" : stat.isDirectory() ? "directory" : stat.isFile() ? "file" : "other";
                fact.size = stat.size;
                fact.modifiedAt = stat.mtime.toISOString();
                fact.availability = fact.kind === "symlink" || fact.kind === "other" ? "restricted" : "available";
                const before = old.get(rel);
                if (before && before.kind === fact.kind && before.size === fact.size && before.modifiedAt === fact.modifiedAt)
                    fact.change = "same-metadata";
                files.push(fact);
                if (fact.kind === "directory") {
                    if (depth >= fileLimits.depth)
                        truncated.push({ path: rel, reason: "depth-limit" });
                    else if (visited <= fileLimits.entries)
                        await walk(path, depth + 1);
                }
            }
            catch (error) {
                fact.problem = String((error as {
                    code?: string;
                }).code ?? "stat-unavailable");
                files.push(fact);
            }
            if (visited > fileLimits.entries)
                break;
        }
    };
    await walk(root, 0);
    // In a truncated scan absence is unknown; never infer deletion from an incomplete observation.
    if (!truncated.length)
        for (const [path, before] of old)
            if (!files.some(item => item.path === path))
                files.push({ ...before, availability: "unavailable", change: "missing", problem: "not-observed" });
    return { observedAt: new Date().toISOString(), files, truncated, limits: fileLimits };
}
export async function previewFile(root: string, input: unknown): Promise<unknown> {
    const path = await scopedPath(root, input), stat = await lstat(path);
    if (!stat.isFile())
        throw new WorkspaceError("REGULAR_FILE_REQUIRED");
    const metadata = { path: relative(root, path), size: stat.size, modifiedAt: stat.mtime.toISOString() };
    if (stat.size > fileLimits.previewBytes)
        return { ...metadata, read: "metadata", reason: "file-size-limit", content: null, version: null };
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
        const bytes = Buffer.alloc(fileLimits.previewBytes + 1), { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
        if (bytesRead > fileLimits.previewBytes)
            return { ...metadata, read: "metadata", reason: "file-size-limit", content: null, version: null };
        const body = bytes.subarray(0, bytesRead);
        let text: string;
        try {
            text = new TextDecoder("utf-8", { fatal: true }).decode(body);
        }
        catch {
            return { ...metadata, read: "metadata", reason: "binary-or-non-utf8", content: null, version: null };
        }
        if (Array.from(text).some(char => { const code = char.charCodeAt(0); return code < 9 || code > 13 && code < 32; }))
            return { ...metadata, read: "metadata", reason: "binary", content: null, version: null };
        return { ...metadata, read: "text-preview", content: text, version: hash(body), editing: "read-only" };
    }
    finally {
        await handle.close();
    }
}
/** This extension owns only explicit links. It contains no transcript, run, Stage or permissions. */
export type SessionReference = {
    platform: string;
    externalId: string;
    url: string | null;
    description: string | null;
};
export function sessionReference(input: unknown): SessionReference {
    const raw = workRecord(input, ["platform", "externalId", "url", "description"]);
    const platform = workText(raw.platform, 64), externalId = workText(raw.externalId, 256);
    const url = raw.url === undefined || raw.url === null ? null : workText(raw.url, 2048);
    if (url) {
        let parsed: URL;
        try {
            parsed = new URL(url);
        }
        catch {
            throw new WorkspaceError("UNSUPPORTED_SESSION_URL");
        }
        if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password)
            throw new WorkspaceError("UNSUPPORTED_SESSION_URL");
    }
    return { platform, externalId, url, description: raw.description === undefined || raw.description === null ? null : workText(raw.description, 500) };
}
export async function metadataDirectory(root: string): Promise<string> {
    const path = join(root, ".task-workspace");
    await mkdir(path, { recursive: true });
    if ((await lstat(path)).isSymbolicLink() || await realpath(path) !== path)
        throw new WorkspaceError("METADATA_PATH_RESTRICTED");
    return path;
}
export async function atomicJson(path: string, value: unknown, mode = 0o600): Promise<void> {
    const temp = join(dirname(path), `.agent-${randomUUID()}.tmp`);
    await writeFile(temp, JSON.stringify(value), { flag: "wx", mode });
    await rename(temp, path);
}
export async function sessionRecords(binding: AgentWorkBinding, operation: "list" | "add" | "remove", input: unknown): Promise<SessionReference[]> {
    const root = await authorizedRoot(binding.directory), metadata = await metadataDirectory(root);
    const identity = binding.workspaceId ? { workspaceId: binding.workspaceId } : { scope: binding.scope };
    const path = join(metadata, `agent-sessions-v1-${hash(JSON.stringify(identity))}.json`);
    let references: SessionReference[] = [];
    try {
        const stat = await lstat(path);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 131072)
            throw new WorkspaceError("SESSION_RECORD_INVALID");
        const raw = workRecord(JSON.parse(await readFile(path, "utf8")), ["schemaVersion", "identity", "references"]);
        if (raw.schemaVersion !== 1 || JSON.stringify(raw.identity) !== JSON.stringify(identity) || !Array.isArray(raw.references) || raw.references.length > 64)
            throw new WorkspaceError("SESSION_RECORD_INVALID");
        references = raw.references.map(sessionReference);
    }
    catch (error) {
        if ((error as {
            code?: string;
        }).code !== "ENOENT")
            throw error;
    }
    if (operation !== "list") {
        const next = sessionReference(input);
        references = references.filter(item => item.platform !== next.platform || item.externalId !== next.externalId);
        if (operation === "add")
            references.push(next);
        if (references.length > 64)
            throw new WorkspaceError("SESSION_LIMIT");
        await atomicJson(path, { schemaVersion: 1, identity, references });
    }
    return references;
}
