# MiniProject Natural Curation v1

Supported intent: `ADD_REFERENCE` only.

Input is closed: Formal MiniProject, active MiniProject AgentRun, referenced block UUID, section enum (`资源` or `支撑交付物`), and optional existing section UUID. Kernel derives the root from PrimaryAnchor and generates section/reference UUIDs from the receipt identity.

Safety sequence:

```text
read root + direct children
-> bind root content hash + topology hash
-> Plugin validates target/section/reference/UUID absence
-> insert section if needed + block reference
-> re-read root and section
-> verify source text unchanged and reference present
-> store CurationReceipt
```

A concurrent root or topology edit, mislabeled/moved section, duplicate reference, UUID collision, missing reference block, or readback mismatch fails closed. There is no raw Graph endpoint. Original material is linked, not copied, moved, or deleted.
