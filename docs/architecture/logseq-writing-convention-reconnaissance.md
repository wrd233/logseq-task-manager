# Logseq Writing Convention Reconnaissance

Status: accepted for Phase 5.5  
Date: 2026-08-13  
Material scope: read-only inspection of the protected real Graph's `pages/`
and `journals/`; raw notes and screenshots remain outside Git.

## Purpose and safety boundary

This study identifies durable authoring conventions before changing the
managed-projection renderer. It does not treat frequency as a template
generator, and it does not copy real titles, page names, paths, quotations, or
screenshots into the repository. The study modified no natural Graph content.

The inspected corpus contained 3,285 Markdown files and 3,088 task-marker
lines. The counts establish breadth only; the decisions below come from
repeated structural shapes across pages and journals.

## Stable writing language

1. A Task is primarily a natural Logseq marker and title, for example the
   synthetic `TODO 配置测试环境`. Extra structure is selective, not mandatory.
2. Semantic labels at the start of a line are overwhelmingly bold bracketed
   labels. Background, goal, current progress/current advance, and result
   labels all have real adoption evidence. Plain bracketed labels are a small
   minority.
3. Journal Tasks are common, often nested, and frequently have natural child
   blocks. A managed summary must therefore be sparse and must not capture or
   reorder unrelated children.
4. The durable MiniProject shape is a bold `[MiniProject]` prefix, commonly
   accompanied by a trailing `#MiniProject` tag. The tag is not uniformly
   present, so the future convention can recommend it but must not infer formal
   identity from it.
5. Project-like pages use selective labelled sections rather than a universal
   form. Background and goal are established; no evidence supports imposing a
   full Project template from Task Copilot.
6. Quote blocks are established for quoted material, but not as the dominant
   representation for operational Task state. A normal child block is the
   lower-density default for managed status.
7. Properties are heavily used by Logseq and other tools. That is not evidence
   that users want Task Copilot's UUIDs, enum values, hashes, or ownership
   markers displayed below every Task.
8. Empty labelled fields exist in natural material and have no information
   value. The renderer must omit them rather than reproduce that weakness.

## Candidate conventions evaluated

| Candidate | Evidence | Phase 5.5 decision |
| --- | --- | --- |
| `**[MiniProject]** title #MiniProject` | Repeated real journal use | Adopt as future authoring guidance only |
| Bold all line-start semantic labels | Strong, broad real use | Adopt |
| Visible title/state/property table | vNext engineering prototype only | Reject |
| Quote every waiting/status field | Quote usage exists, but not as the Task-state norm | Reject for v1 |
| Always render all fields | Conflicts with natural, selective structure | Reject |

The labels `[等待]`, `[复查]`, `[完成]`, and `[取消]` are not established legacy
vocabulary in the corpus. They are deliberately narrow vNext extensions of the
already established bold-label grammar, chosen because the corresponding
formal semantics need a visible human expression.

## Design constraints derived from the Graph

- Preserve the source Task block byte-for-byte except for an explicitly
  governed Logseq task-marker transition.
- Render managed information as direct children of the source Task, alongside
  but never mixed with natural children.
- Use stable UUID identity to distinguish managed children from natural
  children. Visible labels are presentation, not semantic identifiers.
- Render nothing for ordinary `OPEN + ACTIONABLE` with no focus or closure.
- Render only non-empty, information-bearing fields in a deterministic order.
- Keep future MiniProject/Project language documented but outside the current
  Task-only implementation scope.

## Synthetic examples

Ordinary Task:

```text
TODO 配置测试环境
```

Task with managed focus:

```text
TODO 完成测试环境联调
  **[当前推进]** 验证管理网络连通性
```

Future MiniProject guidance (not implemented as a new domain object here):

```text
**[MiniProject]** 完成测试环境验收 #MiniProject
  **[背景]** 需要在演练前验证端到端路径
  **[目标]** 形成可重复的验收结果
```

## Limits

This is a writing-language study, not an inference that every matching natural
block is a formal object. It neither promotes existing content nor changes
MiniProject/Project domain scope. Pixel-level visual acceptance is recorded
separately from this source study.
