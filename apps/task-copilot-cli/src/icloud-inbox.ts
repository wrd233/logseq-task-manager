import { createHash } from "node:crypto";
import { watch, type FSWatcher } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import {
  COOLED_INBOX_DAYS,
  recencyDays,
  type StageInboxRawItem,
  type StageInboxSourceDiagnostic,
} from "@task-copilot/stage-runtime";
import { atomicJson } from "./workspace-files.ts";

export const MACOS_ICLOUD_TCC_GUIDANCE =
  "请在 macOS「系统设置 -> 隐私与安全性 -> 文件与文件夹」中，为当前终端或宿主应用开启「iCloud 云盘」访问权限；也可通过环境变量 TASK_COPILOT_ICLOUD_INBOX_DIR 指定备用目录。";

export interface StageInboxStateFile {
  schemaVersion: 1;
  archivedIds: string[];
  archivedSignatures: string[];
  updatedAt: number;
}

export interface IcloudInboxFsOps {
  readdir: typeof readdir;
  readFile: typeof readFile;
  stat: typeof stat;
}

export interface IcloudInboxScanResult {
  items: StageInboxRawItem[];
  signatureById: Map<string, string>;
  diagnostic: StageInboxSourceDiagnostic;
}

const DEFAULT_FS_OPS: IcloudInboxFsOps = {
  readdir,
  readFile,
  stat,
};

export function defaultIcloudInboxDirectory(): string {
  const configured = process.env.TASK_COPILOT_ICLOUD_INBOX_DIR?.trim();
  const home = homedir();
  if (configured) {
    if (configured === "~") return home;
    if (configured.startsWith("~/") || configured.startsWith("~\\")) {
      return join(home, configured.slice(2));
    }
    return resolve(configured);
  }
  return join(home, "Library", "Mobile Documents", "com~apple~CloudDocs", "TaskCopilotInbox");
}

export function emptyStageInboxState(now = Date.now()): StageInboxStateFile {
  return {
    schemaVersion: 1,
    archivedIds: [],
    archivedSignatures: [],
    updatedAt: now,
  };
}

export async function readStageInboxState(statePath: string): Promise<StageInboxStateFile> {
  try {
    const raw = JSON.parse(await readFile(statePath, "utf8")) as Record<string, unknown>;
    if (!raw || typeof raw !== "object" || raw.schemaVersion !== 1) {
      return emptyStageInboxState();
    }
    const archivedIds = Array.isArray(raw.archivedIds)
      ? [...new Set(raw.archivedIds.filter((v): v is string => typeof v === "string" && v.length > 0))]
      : [];
    const archivedSignatures = Array.isArray(raw.archivedSignatures)
      ? [...new Set(raw.archivedSignatures.filter((v): v is string => typeof v === "string" && v.length > 0))]
      : [];
    return {
      schemaVersion: 1,
      archivedIds,
      archivedSignatures,
      updatedAt: typeof raw.updatedAt === "number" && Number.isFinite(raw.updatedAt) ? raw.updatedAt : Date.now(),
    };
  } catch {
    return emptyStageInboxState();
  }
}

export async function writeStageInboxState(statePath: string, state: StageInboxStateFile): Promise<void> {
  await atomicJson(statePath, state);
}

/**
 * Strips iCloud sync conflict copy suffix (e.g. "20261121-103000 2.md" -> "20261121-103000.md")
 * so conflict duplicates share the same canonical stem for idempotent deduplication.
 */
function canonicalFilename(name: string): string {
  return name.replace(/\s+\d+(\.(?:md|txt))$/iu, "$1");
}

/** Parses iPhone Shortcut "yyyyMMdd-HHmmss.md" (or underscore variant) into local epoch ms. */
export function parseShortcutFilenameTimestamp(filename: string): number | null {
  const match = /^(\d{4})(\d{2})(\d{2})[-_](\d{2})(\d{2})(\d{2})\b/u.exec(filename);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) {
    return null;
  }
  const ts = new Date(year, month - 1, day, hour, minute, second).getTime();
  return Number.isFinite(ts) ? ts : null;
}

function parseSourceAndText(
  filename: string,
  rawContent: string,
): { sourceType: string; sourceLabel: string; text: string } {
  const stripped = rawContent.replace(/^\uFEFF/u, "").trim();
  if (!stripped) {
    return { sourceType: "ios-shortcut", sourceLabel: "iPhone 随口记", text: "" };
  }

  let sourceType = "ios-shortcut";
  let sourceLabel = "iPhone 随口记";
  let body = stripped;

  const lines = stripped.split(/\r?\n/u);
  const firstLine = lines[0]?.trim() ?? "";
  const sourceHeader = /^(?:source|来源)\s*[:：]\s*(flomo|ios-shortcut|voice|manual)\s*$/iu.exec(firstLine);
  if (sourceHeader) {
    const tag = sourceHeader[1]!.toLowerCase();
    body = lines.slice(1).join("\n").trim();
    if (tag === "flomo") {
      sourceType = "flomo";
      sourceLabel = "Flomo";
    } else if (tag === "manual") {
      sourceType = "manual";
      sourceLabel = "手动捕获";
    }
  } else if (/^flomo[-_]/iu.test(filename)) {
    sourceType = "flomo";
    sourceLabel = "Flomo";
  }

  const normalized = body.replace(/\s+/gu, " ").trim().slice(0, 400);
  return { sourceType, sourceLabel, text: normalized };
}

function isPermissionError(code: string | undefined): boolean {
  return code === "EPERM" || code === "EACCES";
}

export async function scanIcloudInbox(options: {
  directory: string;
  archivedIds: ReadonlySet<string>;
  archivedSignatures: ReadonlySet<string>;
  now?: number;
  fsOps?: Partial<IcloudInboxFsOps>;
}): Promise<IcloudInboxScanResult> {
  const now = options.now ?? Date.now();
  const dir = resolve(options.directory);
  const fsOps: IcloudInboxFsOps = { ...DEFAULT_FS_OPS, ...options.fsOps };
  const signatureById = new Map<string, string>();

  let entries: string[];
  try {
    entries = (await fsOps.readdir(dir)) as string[];
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (isPermissionError(code)) {
      return {
        items: [],
        signatureById,
        diagnostic: {
          source: "icloud",
          directory: dir,
          status: "permission-denied",
          itemCount: 0,
          cooledCount: 0,
          ...(code ? { errorCode: code } : {}),
          message: "读取 iCloud 语音收件箱目录被系统权限拦截（Fail Open，未影响主流程）。",
          guidance: MACOS_ICLOUD_TCC_GUIDANCE,
          checkedAt: now,
        },
      };
    }
    if (code === "ENOENT") {
      return {
        items: [],
        signatureById,
        diagnostic: {
          source: "icloud",
          directory: dir,
          status: "missing",
          itemCount: 0,
          cooledCount: 0,
          errorCode: "ENOENT",
          message: "尚未发现 iCloud 语音收件箱目录，首次通过 iPhone 快捷指令写入后会自动出现。",
          checkedAt: now,
        },
      };
    }
    return {
      items: [],
      signatureById,
      diagnostic: {
        source: "icloud",
        directory: dir,
        status: "error",
        itemCount: 0,
        cooledCount: 0,
        ...(code ? { errorCode: code } : {}),
        message: error instanceof Error ? error.message.slice(0, 200) : "读取 iCloud 收件箱目录失败。",
        checkedAt: now,
      },
    };
  }

  const items: StageInboxRawItem[] = [];
  const seenSignatures = new Set<string>();
  const seenContentHashes = new Set<string>();
  let cooledCount = 0;

  // Sort filenames deterministically so canonical file precedes conflict copies ("foo.md" before "foo 2.md")
  const candidateNames = entries
    .filter((name) => !name.startsWith(".") && /\.(?:md|txt)$/iu.test(name))
    .sort((a, b) => a.localeCompare(b));

  for (const name of candidateNames) {
    const fullPath = join(dir, name);
    try {
      const info = await fsOps.stat(fullPath);
      if (!info.isFile()) continue;
      if (info.size === 0 || info.size > 256 * 1024) continue;

      const rawContent = String(await fsOps.readFile(fullPath, "utf8"));
      const { sourceType, sourceLabel, text } = parseSourceAndText(name, rawContent);
      if (!text) continue;

      const contentHash = createHash("sha256").update(text).digest("hex").slice(0, 16);
      const stem = canonicalFilename(name);
      const signature = `${stem}:${contentHash}`;
      const id = `icloud:${createHash("sha256").update(`${stem}\0${contentHash}`).digest("hex").slice(0, 16)}`;

      signatureById.set(id, signature);

      if (options.archivedIds.has(id) || options.archivedSignatures.has(signature)) continue;
      if (seenSignatures.has(signature)) continue;
      // Deduplicate identical-content conflict copies in the same scan
      if (stem !== name && seenContentHashes.has(contentHash)) continue;

      seenSignatures.add(signature);
      seenContentHashes.add(contentHash);

      const parsedTs = parseShortcutFilenameTimestamp(name);
      const mtimeMs = Number.isFinite(info.mtimeMs) && info.mtimeMs > 0 ? info.mtimeMs : now;
      const birthtimeMs = Number.isFinite(info.birthtimeMs) && info.birthtimeMs > 0 ? info.birthtimeMs : mtimeMs;
      const createdAt = parsedTs ?? birthtimeMs;
      const effectiveUpdatedAt = parsedTs ?? mtimeMs;

      if (recencyDays(effectiveUpdatedAt, now) >= COOLED_INBOX_DAYS) {
        cooledCount++;
      }

      items.push({
        id,
        text,
        status: "open",
        createdAt,
        updatedAt: effectiveUpdatedAt,
        sourceType,
        sourceLabel,
        sourcePath: name,
      });
    } catch {
      // Fail open on individual unreadable, evicted, or partially synced iCloud files.
    }
  }

  items.sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));

  return {
    items,
    signatureById,
    diagnostic: {
      source: "icloud",
      directory: dir,
      status: "ok",
      itemCount: items.length,
      cooledCount,
      checkedAt: now,
    },
  };
}

export function watchIcloudInbox(directory: string, onChange: () => void): { close(): void } {
  let watcher: FSWatcher | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const schedule = () => {
    if (closed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (!closed) onChange();
    }, 350);
  };

  try {
    watcher = watch(resolve(directory), { persistent: false }, (_eventType, filename) => {
      if (typeof filename === "string" && filename.startsWith(".")) return;
      schedule();
    });
    watcher.on("error", () => {
      // Fail open: macOS TCC or directory removal must never crash Companion.
      try {
        watcher?.close();
      } catch {
        // ignore
      }
      watcher = null;
    });
  } catch {
    // Fail open when directory does not exist yet or macOS TCC denies access.
    watcher = null;
  }

  return {
    close() {
      closed = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (watcher) {
        try {
          watcher.close();
        } catch {
          // ignore
        }
        watcher = null;
      }
    },
  };
}
