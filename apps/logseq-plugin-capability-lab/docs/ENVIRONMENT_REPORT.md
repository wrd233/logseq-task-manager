# Environment Report

Captured 2026-07-17 after separating the outer development repository from the nested Graph fixture.

| Item | Observed value |
|---|---|
| Development Git root | `/Users/wangrundong/work/任务管理中心-logseq插件` |
| Local Graph fixture | `/Users/wangrundong/work/任务管理中心-logseq插件/logseq` (nested Git, ignored by outer Git) |
| OS | Darwin 24.1.0, macOS, arm64 |
| CPU | Apple Silicon arm64 |
| Git | 2.39.5 (Apple Git-154) |
| Default system Node | 25.6.1 |
| Lab Node | Homebrew keg-only Node 20.20.2 via explicit PATH |
| Lab npm | 10.8.2 |
| nvm | Not available in the command environment |
| Other package manager | pnpm exists globally but is not used |
| Graph type | File Graph (Markdown pages/Journals plus EDN configuration/whiteboards) |
| Graph structure | `pages/`, `journals/`, `assets/`, `logseq/`, `whiteboards/` |
| Outer source branch | `main`, no upstream or remote |
| Inner Graph branch | `experiment/logseq-plugin-capability-lab` (informational only) |
| Inner Graph baseline | `3c410da2a3fc7671a778f6bd98b167d5047d4b0a`; remote default `origin/master` |
| Build tool | esbuild 0.28.1 |
| SDK | stable npm `@logseq/libs` 0.0.17 |
| TypeScript | 5.9.3, selected because current `typescript-eslint` rejects TypeScript 7 |
| Lint | ESLint 10.7.0 + typescript-eslint 8.64.0 |
| Tests | Node test runner through tsx 4.23.1 |
| Lockfile | npm `package-lock.json` only |

## Compatibility risks

1. Logseq Desktop GUI/runtime version was not available to command-line checks and must be recorded manually.
2. Stable `@logseq/libs@0.0.17` exposes the required File Graph APIs, but its package pins vulnerable historical versions of DOMPurify and lodash-es. `npm audit` reports 2 high and 1 critical package-level findings. This lab does not accept external HTML/input and escapes its rendered diagnostics, but the SDK dependency risk remains.
3. npm offers `@logseq/libs@0.3.4` as the forced audit fix. That is a compatibility-changing SDK line associated with newer APIs; it was not substituted without File Graph runtime proof.
4. TypeScript 7.0.2 was current on the capture date, but `typescript-eslint@8.64.0` declares `typescript >=4.8.4 <6.1.0`. Version 5.9.3 is therefore the newest conservative stable compiler choice for this lint stack.
5. File Graph and DB Graph have different data/property/query semantics. Nothing in this report proves DB Graph compatibility.
6. Event timing, settings persistence, FileStorage placement, and UUID stability require actual Logseq Desktop testing.

## Repository noise policy

- **Commit:** Lab source, docs, package metadata, `package-lock.json`, tests, `.nvmrc`, and intentional `.gitignore` additions.
- **Do not commit:** `node_modules/`, `dist/`, `.parcel-cache/`, `.vite/`, `coverage/`, logs, `.DS_Store`, runtime temporary files.
- **User decision:** intentional experiment page, Logseq configuration changes, plugin settings/private storage, and any Logseq-generated metadata. These must be reviewed after closing Logseq.
- Existing Logseq configuration and ignore entries are preserved; the Lab does not blanket-ignore the `logseq/` directory.
