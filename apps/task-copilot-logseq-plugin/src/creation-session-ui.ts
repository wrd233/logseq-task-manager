import type { CreationDraftNode, CreationDraftRevision, CreationSession, CreationSessionRound } from "@task-copilot/domain";

import type { PluginCreationSessionState } from "./creation-session-controller.ts";

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function attr(value: string): string {
  return escapeHtml(value);
}

function button(label: string, action: string, value = "", kind: "primary" | "quiet" | "danger" = "quiet", disabled = false): string {
  return `<button type="button" class="button ${kind}" data-action="${attr(action)}" data-value="${attr(value)}"${disabled ? " disabled aria-disabled=\"true\"" : ""}>${escapeHtml(label)}</button>`;
}

function inlineMarkup(text: string): string {
  const safe = escapeHtml(text);
  return safe
    .replace(/\*\*([^*]+)\*\*/gu, "<strong>$1</strong>")
    .replace(/\[\[([^\]]+)\]\]/gu, '<span class="creation-page-ref">[[$1]]</span>');
}

function targetLabel(session: CreationSession): string {
  return session.targetType === "MINI_PROJECT" ? "MiniProject" : "Project";
}

function statusLabel(session: CreationSession): string {
  if (session.status === "PREVIEW_READY") return "可预览";
  if (session.status === "CREATED") return "已创建";
  if (session.status === "ABANDONED") return "已放弃";
  return "讨论中";
}

function sourceLabel(session: CreationSession): string {
  const primary = session.sources.find(({ role }) => role === "PRIMARY")!;
  if (primary.kind === "BLANK") return "空白想法";
  return primary.pageName ?? (primary.kind === "PAGE" ? "当前 Page" : "Block 子树");
}

function latestRound(session: CreationSession): CreationSessionRound | undefined {
  return session.rounds.at(-1);
}

function answerableRound(session: CreationSession): CreationSessionRound | undefined {
  return [...session.rounds].reverse().find(({ providerStatus }) => providerStatus === "NOT_REQUESTED");
}

function renderSessionList(state: PluginCreationSessionState): string {
  const list = state.sessions.length
    ? `<div class="creation-session-list">${state.sessions.map((session) => `<button type="button" class="creation-session-row" data-action="creation-session-resume" data-value="${attr(session.sessionId)}"><span><strong>${escapeHtml(session.userTitle ?? session.suggestedObjectTitle ?? `未命名 ${targetLabel(session)}`)}</strong><small>${escapeHtml(sourceLabel(session))} · ${escapeHtml(statusLabel(session))}</small></span><time>${escapeHtml(new Date(session.updatedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }))}</time></button>`).join("")}</div>`
    : `<div class="creation-empty"><strong>还没有进行中的创建会话</strong><p>从一个小结果或持续项目开始。离开后仍可回来继续。</p></div>`;
  return `<section class="creation-start"><div class="creation-start-head"><div><p class="creation-kicker">创建中的事项</p><h3>把想法整理成可继续的工作</h3></div><div class="actions">${button("新建 MiniProject", "creation-session-create", "MINI_PROJECT:BLANK", "primary")}${button("新建 Project", "creation-session-create", "PROJECT:BLANK")}</div></div>${list}</section>`;
}

function renderRound(session: CreationSession, busy: boolean): string {
  const round = answerableRound(session) ?? latestRound(session);
  if (!round) return `<section class="creation-main-empty"><h3>从来源形成第一轮问题</h3><p>系统会先读取材料，再把强相关的问题放在同一轮。</p>${button("开始整理", "creation-session-round-start", session.sessionId, "primary", busy)}</section>`;
  if (["FAILED", "CANCELLED"].includes(round.providerStatus)) return `<section class="creation-main-empty"><h3>${round.providerStatus === "CANCELLED" ? "上次请求已取消" : "上次整理没有完成"}</h3><p>你的回答已经保存，最后稳定草稿没有变化。</p>${button("安全重试", "creation-session-round-retry", round.roundId, "primary", busy)}</section>`;
  if (round.providerStatus === "REQUESTING") return `<section class="creation-main-empty" aria-live="polite"><span class="creation-spinner" aria-hidden="true"></span><h3>正在保存回答并整理下一轮…</h3><p>可以离开此窗口；回答已经先写入会话。</p></section>`;
  if (round.providerStatus === "COMPLETED" && !answerableRound(session)) return `<section class="creation-main-empty"><h3>这一轮已经整理完成</h3><p>${escapeHtml(round.summary?.nextSuggestion ?? "可以先查看当前草稿，也可以继续补充材料。")}</p>${button(session.currentDraftRevisionId ? "更新当前草稿" : "生成当前草稿", "creation-session-draft-generate", session.sessionId, "primary", busy)}</section>`;
  const questions = round.questions.map((question, index) => {
    const option = (value: string, label: string) => `<option value="${value}"${question.answerState === value ? " selected" : ""}>${label}</option>`;
    return `<fieldset class="creation-question"><legend><span>${index + 1}</span>${escapeHtml(question.text)}</legend><p class="creation-why">${escapeHtml(question.rationale)}</p><div class="creation-recommendation"><span>建议</span><p>${escapeHtml(question.recommendation)}</p>${question.alternativeImpact ? `<small>${escapeHtml(question.alternativeImpact)}</small>` : ""}</div><label class="creation-answer-label" for="creation-answer-${attr(question.questionId)}">你的回答</label><textarea id="creation-answer-${attr(question.questionId)}" data-field="creation-answer:${attr(question.questionId)}" maxlength="4000" placeholder="直接说明你的选择；也可以先标记暂不确定">${escapeHtml(question.userAnswer ?? "")}</textarea><label class="creation-state-label">回答状态<select data-field="creation-answer-state:${attr(question.questionId)}">${option("ANSWERED", "已回答")}${option("ACCEPTED_RECOMMENDATION", "接受建议")}${option("UNCERTAIN", "暂不确定")}${option("SKIPPED", "明确跳过")}${option("UNANSWERED", "暂未回答")}</select></label><p class="creation-answer-requirement">${escapeHtml(question.answerRequirement)}</p></fieldset>`;
  }).join("");
  return `<section class="creation-round"><div class="creation-round-head"><div><p class="creation-kicker">本轮主题</p><h3>${escapeHtml(round.theme)}</h3></div><span>${round.questions.length} 个相关问题</span></div><form class="creation-questions" data-creation-round="${attr(round.roundId)}">${questions}<div class="creation-round-actions">${button("接受本轮全部建议", "creation-session-round-accept-all", round.roundId, "quiet", busy)}${button("保存回答并继续", "creation-session-round-submit", round.roundId, "primary", busy)}</div></form></section>`;
}

function childMap(revision: CreationDraftRevision): Map<string, CreationDraftNode[]> {
  const children = new Map<string, CreationDraftNode[]>();
  for (const node of revision.nodes) {
    const key = node.parentNodeId ?? "ROOT";
    children.set(key, [...(children.get(key) ?? []), node].sort((left, right) => left.order - right.order));
  }
  return children;
}

function provenanceLabel(node: CreationDraftNode): string {
  if (node.userEdited) return "用户编辑";
  if (node.provenance === "SOURCE_FACT") return "来源事实";
  if (node.provenance === "USER_CONFIRMED") return "用户确认";
  if (node.provenance === "AGENT_SUGGESTION") return "建议";
  if (node.provenance === "UNCONFIRMED") return "待确认";
  return "归纳";
}

function renderDraftNode(node: CreationDraftNode, revision: CreationDraftRevision, children: Map<string, CreationDraftNode[]>, editingNodeId: string | undefined, depth = 0): string {
  const descendants = children.get(node.nodeId) ?? [];
  const conflict = revision.conflicts.find(({ nodeId }) => nodeId === node.nodeId);
  const canDelete = node.operation === "CREATE" && ["AGENT_SYNTHESIS", "AGENT_SUGGESTION", "UNCONFIRMED"].includes(node.provenance) && descendants.length === 0;
  const editing = editingNodeId === node.nodeId;
  const parentOptions = revision.nodes.filter((candidate) => candidate.nodeId !== node.nodeId).map((candidate) => `<option value="${attr(candidate.nodeId)}"${candidate.nodeId === node.parentNodeId ? " selected" : ""}>${escapeHtml(candidate.text.slice(0, 48))}</option>`).join("");
  const editor = editing ? `<div class="creation-node-editor"><label>Block 文本<textarea data-field="creation-draft-text" maxlength="8000">${escapeHtml(node.text)}</textarea></label>${node.parentNodeId ? `<label>父节点<select data-field="creation-draft-parent">${parentOptions}</select></label>` : ""}<div class="actions">${button("取消", "creation-session-draft-edit-cancel", node.nodeId)}${button("保存编辑", "creation-session-draft-edit-save", `${revision.revisionId}|${node.nodeId}`, "primary")}</div></div>` : "";
  return `<li class="creation-draft-item" data-depth="${depth}"><div class="creation-draft-row"><span class="creation-bullet" aria-hidden="true">${node.nodeType === "PAGE_SECTION" ? "▣" : node.nodeType === "TODO" ? "□" : "•"}</span><div class="creation-draft-copy"><div>${inlineMarkup(node.text)}</div><div class="creation-node-meta"><span>${escapeHtml(provenanceLabel(node))}</span><span>${escapeHtml(node.operation)}</span>${node.sourceBlockUuid ? "<span>UUID 保持</span>" : ""}${conflict ? `<span class="creation-conflict">已保留用户版本</span>` : ""}</div></div><div class="creation-node-actions">${button("编辑", "creation-session-draft-edit-open", node.nodeId)}${canDelete ? button("删除", "creation-session-draft-delete", `${revision.revisionId}|${node.nodeId}`, "danger") : ""}</div></div>${conflict ? `<p class="creation-conflict-detail">${escapeHtml(conflict.summary)}</p>` : ""}${editor}<ul>${descendants.map((child) => renderDraftNode(child, revision, children, editingNodeId, depth + 1)).join("")}</ul></li>`;
}

function renderDraft(session: CreationSession, state: PluginCreationSessionState, busy: boolean): string {
  const revision = session.currentDraftRevisionId ? session.draftRevisions.find(({ revisionId }) => revisionId === session.currentDraftRevisionId) : undefined;
  if (!revision) return `<section class="creation-main-empty"><h3>还没有当前草稿</h3><p>草稿可以随时生成，不代表结束讨论，也不会写入正式事项。</p>${button("生成当前草稿", "creation-session-draft-generate", session.sessionId, "primary", busy)}</section>`;
  const children = childMap(revision);
  const roots = children.get("ROOT") ?? [];
  const operations = revision.nodes.reduce<Record<string, number>>((counts, node) => ({ ...counts, [node.operation]: (counts[node.operation] ?? 0) + 1 }), {});
  const primary = session.sources.find(({ role }) => role === "PRIMARY")!;
  const placement = session.targetType === "PROJECT"
    ? `<label>独立 Project Page<input data-field="creation-project-page-name" maxlength="512" value="${attr(session.placementPlan?.kind === "NEW_PROJECT_PAGE" ? session.placementPlan.pageName : `Project/${session.suggestedObjectTitle ?? session.userTitle ?? revision.nodes[0]!.text}`)}"></label>${button("保存 Page 位置", "creation-session-placement-project", session.sessionId, "quiet", busy)}`
    : primary.kind === "BLOCK_SUBTREE" && primary.externalId
      ? `<p>来源 Block 的默认安全位置：</p><div class="actions">${button("原位整理", "creation-session-placement-mini-in-place", primary.externalId, session.placementPlan?.kind === "SOURCE_BLOCK_IN_PLACE" ? "primary" : "quiet", busy)}${button("作为来源子 Block", "creation-session-placement-mini-child", primary.externalId, session.placementPlan?.kind === "SOURCE_BLOCK_CHILD" ? "primary" : "quiet", busy)}</div>`
      : primary.kind === "PAGE" && primary.externalId
        ? `<p>在来源 Page 末尾创建新的 MiniProject Tree。</p>${button("使用 Page 末尾", "creation-session-placement-page-end", `${primary.externalId}|${primary.pageName ?? primary.externalId}`, session.placementPlan?.kind === "PAGE_END" ? "primary" : "quiet", busy)}`
        : `<p>空白 MiniProject 会在当前 Page 末尾创建一棵独立 Tree。</p>${button("使用当前 Page 末尾", "creation-session-placement-blank-page-end", session.sessionId, session.placementPlan?.kind === "PAGE_END" ? "primary" : "quiet", busy)}`;
  const readyForProposal = revision.maturity.level === "READY" && revision.maturity.missing.length === 0 && revision.conflicts.length === 0 && Boolean(session.placementPlan);
  const formal = `<section class="creation-formal-check"><h4>创建检查</h4>${placement}<p>${session.placementPlan ? "位置已保存。生成方案会先重读来源，再进入 HIGH 审阅；不会立即写入。" : "先保存明确位置，才能生成正式审阅方案。"}</p>${readyForProposal ? button("生成正式审阅方案", "creation-session-proposal-prepare", session.sessionId, "primary", busy) : ""}</section>`;
  return `<section class="creation-draft"><div class="creation-draft-head"><div><p class="creation-kicker">当前草稿</p><h3>${escapeHtml(session.suggestedObjectTitle ?? session.userTitle ?? `未命名 ${targetLabel(session)}`)}</h3></div><div class="creation-maturity"><span>${revision.maturity.level === "READY" ? "可进入创建检查" : revision.maturity.level === "WORKABLE" ? "已可阅读" : "仍在成形"}</span>${button("更新草稿", "creation-session-draft-generate", session.sessionId, "quiet", busy)}</div></div><div class="creation-change-strip"><span>保留 ${operations.KEEP ?? 0}</span><span>移动 ${operations.MOVE ?? 0}</span><span>改写 ${operations.REWRITE ?? 0}</span><span>新建 ${operations.CREATE ?? 0}</span></div>${revision.warnings.length ? `<div class="creation-warning"><strong>创建前仍需留意</strong><ul>${revision.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul></div>` : ""}<ol class="creation-draft-tree">${roots.map((root) => renderDraftNode(root, revision, children, state.editingNodeId)).join("")}</ol>${revision.unusedMaterials.length ? `<details class="creation-unused"><summary>未采用材料（${revision.unusedMaterials.length}）</summary><ul>${revision.unusedMaterials.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></details>` : ""}${formal}</section>`;
}

function renderSummary(session: CreationSession): string {
  const confirmed = session.consensus.filter(({ provenance }) => ["SOURCE_FACT", "USER_CONFIRMED", "USER_EDITED"].includes(provenance)).slice(-8);
  const unresolved = session.consensus.filter(({ provenance }) => ["UNKNOWN", "CONFLICT"].includes(provenance)).slice(-8);
  return `<section class="creation-summary-main"><div><p class="creation-kicker">当前共识</p><h3>回来时先看这一页</h3></div><div class="creation-summary-columns"><section><h4>已确认</h4>${confirmed.length ? `<ul>${confirmed.map(({ text }) => `<li>${escapeHtml(text)}</li>`).join("")}</ul>` : "<p>还没有明确确认项。</p>"}</section><section><h4>仍待确认</h4>${unresolved.length ? `<ul>${unresolved.map(({ text }) => `<li>${escapeHtml(text)}</li>`).join("")}</ul>` : "<p>暂无明确冲突。</p>"}</section></div></section>`;
}

function renderHistory(session: CreationSession): string {
  return `<section class="creation-history"><p class="creation-kicker">重要 Revision</p><h3>只保留值得恢复的版本</h3><div class="creation-history-list">${[...session.draftRevisions].reverse().map((revision) => `<div><span><strong>${escapeHtml(revision.reason)}</strong><small>${escapeHtml(new Date(revision.createdAt).toLocaleString("zh-CN"))} · ${revision.nodes.length} 个节点</small></span>${revision.revisionId === session.currentDraftRevisionId ? "<em>当前采用</em>" : button("采用此版", "creation-session-draft-adopt", revision.revisionId, "quiet")}</div>`).join("") || "<p>生成第一版草稿后，这里会显示重要版本。</p>"}</div></section>`;
}

function renderContext(session: CreationSession): string {
  const latest = latestRound(session);
  const revision = session.currentDraftRevisionId ? session.draftRevisions.find(({ revisionId }) => revisionId === session.currentDraftRevisionId) : undefined;
  const changed = session.sources.filter(({ availability }) => availability !== "AVAILABLE");
  return `<aside class="creation-context" aria-label="创建会话上下文"><section><h4>这次在做什么</h4><dl><div><dt>目标</dt><dd>${escapeHtml(targetLabel(session))}</dd></div><div><dt>主来源</dt><dd>${escapeHtml(sourceLabel(session))}</dd></div><div><dt>状态</dt><dd>${escapeHtml(statusLabel(session))}</dd></div></dl></section><section><h4>重入摘要</h4><p>${escapeHtml(latest?.summary?.confirmed ?? "继续回答当前问题，系统会逐步维护共识。")}</p>${latest?.summary?.unresolved ? `<small>待确认：${escapeHtml(latest.summary.unresolved)}</small>` : ""}</section><section><h4>草稿成熟度</h4><strong>${revision ? revision.maturity.level === "READY" ? "可进入创建检查" : revision.maturity.level === "WORKABLE" ? "已可阅读" : "仍在成形" : "尚未生成"}</strong>${revision?.maturity.missing.length ? `<ul>${revision.maturity.missing.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}</section>${changed.length ? `<section class="creation-context-alert"><h4>来源需要处理</h4><p>${changed.length} 个来源已变化、删除或无法解析。</p></section>` : ""}</aside>`;
}

export function renderCreationSession(state: PluginCreationSessionState): string {
  if (!state.session) return renderSessionList(state);
  const session = state.session;
  const busy = state.status === "loading";
  const main = state.view === "DRAFT" ? renderDraft(session, state, busy)
    : state.view === "SUMMARY" ? renderSummary(session)
      : state.view === "HISTORY" ? renderHistory(session)
        : renderRound(session, busy);
  return `<section class="creation-shell" aria-busy="${busy ? "true" : "false"}"><header class="creation-header"><div><p class="creation-kicker">${escapeHtml(targetLabel(session))} 创建会话 · ${escapeHtml(statusLabel(session))}</p><h2>${escapeHtml(session.userTitle ?? session.suggestedObjectTitle ?? `未命名 ${targetLabel(session)}`)}</h2><p>${escapeHtml(sourceLabel(session))} · 更新于 ${escapeHtml(new Date(session.updatedAt).toLocaleString("zh-CN", { hour: "2-digit", minute: "2-digit" }))}</p></div><div class="creation-header-actions">${button("返回列表", "creation-session-list")}${button("放弃会话", "creation-session-abandon", session.sessionId, "danger", busy)}</div></header>${state.error ? `<div class="creation-banner error" role="alert">${escapeHtml(state.error)}</div>` : ""}${state.notice ? `<div class="creation-banner success" role="status">${escapeHtml(state.notice)}</div>` : ""}<nav class="creation-tabs" aria-label="Creation Session 视图"><button type="button" data-action="creation-session-view" data-value="DISCUSSION" aria-current="${state.view === "DISCUSSION" ? "page" : "false"}">继续讨论</button><button type="button" data-action="creation-session-view" data-value="DRAFT" aria-current="${state.view === "DRAFT" ? "page" : "false"}">当前草稿</button><button type="button" data-action="creation-session-view" data-value="SUMMARY" aria-current="${state.view === "SUMMARY" ? "page" : "false"}">当前共识</button><button type="button" data-action="creation-session-view" data-value="HISTORY" aria-current="${state.view === "HISTORY" ? "page" : "false"}">讨论记录</button></nav><div class="creation-layout"><main class="creation-workspace">${busy ? `<div class="creation-busy" aria-live="polite"><span class="creation-spinner" aria-hidden="true"></span>${state.busy === "DRAFT" ? "正在生成草稿…" : state.busy === "ROUND" ? "正在保存并整理…" : "正在处理…"}</div>` : ""}${main}</main>${renderContext(session)}</div></section>`;
}
