# Task Copilot formal Logseq plugin

Load this directory with Logseq Desktop `Load unpacked plugin`; do not load `dist/` directly.

## Runtime troubleshooting

All operational Console entries start with `[Task Copilot]`. Inbox actions expose loading, success or an error with a `TC-...` diagnostic ID. On failure, open **Diagnostics** to copy the complete snapshot, export bounded JSONL, run the read-only Source Resolver Probe, or run the non-writing Inbox Action Probe.

Numeric Logseq page IDs are retained only as technical evidence. The Inbox must show a human page name, formatted Journal date, `未知来源`, or `无法解析的 Logseq 页面`—never a bare internal ID such as `19`.

Diagnostics does not log full Block text by default. It records only content length/hash and bounded runtime shape metadata. Do not repeatedly submit an action after a SemanticCommit reports `PENDING` or `RECOVERY_REQUIRED`; copy Diagnostics and inspect Audit / Recovery first.
