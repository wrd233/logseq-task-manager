import { KernelClient } from "@task-copilot/client/browser";
import type { ConsoleSearchResponse, ConsoleWorldSnapshot, WorkObject } from "@task-copilot/contracts";
import { clear, el } from "./dom.ts";
import { attentionItems, childrenOf, coldObjects, contextFor, currentSituation, evidenceFor, independentMiniProjects, independentTasks, kindLabel, meaningfulChanges, parentOf, projectCards } from "./read-model.ts";

interface ConsoleBootstrap { token: string; profile: string }

type View = "formal" | "attention" | "search" | "history";

interface AppState {
  world: ConsoleWorldSnapshot | null;
  view: View;
  expandedProjectId: string | null;
  deepChildId: string | null;
  searchQuery: string;
  searchResults: ConsoleSearchResponse | null;
  technicalIds: Set<string>;
  error: string | null;
}

const state: AppState = {
  world: null,
  view: "formal",
  expandedProjectId: null,
  deepChildId: null,
  searchQuery: "",
  searchResults: null,
  technicalIds: new Set(),
  error: null,
};

let api: KernelClient | null = null;
const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("APP_ROOT_MISSING");

async function bootstrap(): Promise<KernelClient> {
  const response = await fetch("/v1/console/bootstrap");
  if (!response.ok) throw new Error("Kernel Console bootstrap failed");
  const value = await response.json() as ConsoleBootstrap;
  return new KernelClient({ schemaVersion: 1, baseUrl: location.origin, token: value.token, pid: 0, startedAt: new Date().toISOString() });
}

async function loadWorld(): Promise<void> {
  if (!api) api = await bootstrap();
  state.world = await api.consoleWorld();
  render();
}

function setView(view: View): void {
  state.view = view;
  if (view !== "search") state.searchResults = null;
  render();
}

function envLabel(): string {
  if (!state.world) return "连接中";
  return state.world.environment.profile === "sandbox" ? "Sandbox" : state.world.environment.profile === "development" ? "Development" : "生产环境";
}

function graphStatusText(): string {
  const world = state.world;
  if (!world) return "";
  const g = world.environment.graphStatus;
  if (!g.available) return "工作区离线";
  if (world.environment.expectedGraphId && g.graphId !== world.environment.expectedGraphId) return "Graph 不匹配";
  return "工作区在线";
}

function openInLogseq(workObjectId: string): void {
  const world = state.world;
  if (!world) return;
  const entry = world.objects.find((item) => item.object.id === workObjectId);
  const g = world.environment.graphStatus;
  if (!entry?.anchor || !g.available || (world.environment.expectedGraphId && g.graphId !== world.environment.expectedGraphId)) {
    alert("当前无法打开工作位置：Logseq 不可用或 Graph 不匹配。");
    return;
  }
  void navigator.clipboard?.writeText(entry.anchor.externalId).then(() => {
    alert(`已复制 Block UUID：${entry.anchor?.externalId}\n请在 Logseq 中搜索该 UUID 以定位原文。`);
  }).catch(() => {
    alert(`Block UUID：${entry.anchor?.externalId}`);
  });
}

function markViewed(workObjectId: string): void {
  if (!api) return;
  void api.markConsoleObjectViewed(workObjectId).then(({ baseline }) => {
    if (!state.world) return;
    state.world = {
      ...state.world,
      objects: state.world.objects.map((entry) => entry.object.id === workObjectId ? { ...entry, baseline } : entry),
    };
  }).catch(() => undefined);
}

function renderHeader(): HTMLElement {
  const nav = (key: View, label: string) => el("button", {
    class: `tc-nav ${state.view === key ? "tc-nav-active" : ""}`,
    onclick: () => setView(key),
  }, label);
  const attentionCount = state.world ? attentionItems(state.world).length : 0;
  return el("header", { class: "tc-header" },
    el("div", { class: "tc-brand" },
      el("div", { class: "tc-title" }, "Task Copilot"),
      el("div", { class: "tc-subtitle" }, "Formal World Observer"),
    ),
    el("nav", { class: "tc-navbar" },
      nav("formal", "正式事项"),
      nav("attention", attentionCount ? `需要注意 ${attentionCount}` : "需要注意"),
      nav("search", "搜索"),
      nav("history", "历史"),
    ),
    el("div", { class: "tc-env" },
      el("span", { class: "tc-env-name" }, envLabel()),
      el("span", { class: "tc-env-graph" }, graphStatusText()),
    ),
  );
}

function renderFormal(): HTMLElement {
  const world = state.world!;
  const cards = projectCards(world);
  const minis = independentMiniProjects(world);
  const tasks = independentTasks(world);
  const coldCount = world.objects.filter((entry) => entry.object.lifecycle !== "OPEN").length;
  return el("main", { class: "tc-main" },
    el("section", { class: "tc-section" },
      el("h2", { class: "tc-section-title" }, "正式事项"),
      ...cards.map((card) => renderProjectCard(card)),
      cards.length === 0 ? el("p", { class: "tc-empty" }, "还没有正式 Project。") : null,
    ),
    (minis.length || tasks.length) ? el("section", { class: "tc-section" },
      el("h2", { class: "tc-section-title" }, "独立事项"),
      ...minis.map((card) => renderIndependentMini(card)),
      ...tasks.map((item) => renderIndependentTask(item)),
    ) : null,
    el("section", { class: "tc-section tc-history" },
      el("button", { class: "tc-history-link", onclick: () => setView("history") },
        `历史 · 已完成/已取消 ${coldCount}`,
      ),
    ),
  );
}

function renderProjectCard(card: ReturnType<typeof projectCards>[number]): HTMLElement {
  const expanded = state.expandedProjectId === card.object.id;
  const body = el("div", { class: "tc-card-body" },
    el("div", { class: "tc-card-block" },
      el("div", { class: "tc-block-label" }, "当前局面"),
      el("p", { class: "tc-situation" }, card.currentSituation),
    ),
    card.frontier.length ? el("div", { class: "tc-card-block" },
      el("div", { class: "tc-block-label" }, "当前前沿"),
      ...card.frontier.map((item) => el("div", { class: "tc-frontier-item" },
        el("span", { class: "tc-kind" }, item.kind === "MINI_PROJECT" ? "MP" : "T"),
        el("span", { class: "tc-frontier-title" }, item.title),
        el("span", { class: "tc-frontier-reason" }, item.reason),
      )),
    ) : null,
    card.meaningfulChanges.length ? el("div", { class: "tc-card-block" },
      el("div", { class: "tc-block-label" }, "上次以来"),
      ...card.meaningfulChanges.map((change) => el("div", { class: "tc-change" }, change)),
    ) : null,
    card.anomalies.length ? el("div", { class: "tc-card-block tc-anomalies" },
      ...card.anomalies.map((anomaly) => el("div", { class: "tc-anomaly" }, anomaly.message)),
    ) : null,
  );
  const cardEl = el("article", {
    class: `tc-card ${expanded ? "tc-card-expanded" : ""}`,
    onclick: () => {
      if (expanded) {
        state.expandedProjectId = null;
        state.deepChildId = null;
      } else {
        state.expandedProjectId = card.object.id;
        state.deepChildId = null;
        markViewed(card.object.id);
      }
      render();
    },
  },
    el("div", { class: "tc-card-head" },
      el("h3", { class: "tc-project-name" }, card.object.title),
      el("span", { class: "tc-card-chevron" }, expanded ? "▾" : "▸"),
    ),
    body,
  );
  if (expanded) {
    const tree = renderProjectTree(card.object.id);
    cardEl.append(tree);
  }
  return cardEl;
}

function renderProjectTree(projectId: string): HTMLElement {
  const world = state.world!;
  const children = childrenOf(world, projectId);
  return el("div", { class: "tc-tree", onclick: (event: Event) => event.stopPropagation() },
    ...children.map((child) => renderTreeChild(child)),
    children.length === 0 ? el("p", { class: "tc-empty" }, "该项目还没有正式子对象。") : null,
  );
}

function renderTreeChild(entry: ConsoleWorldSnapshot["objects"][number]): HTMLElement {
  const object = entry.object;
  const deep = state.deepChildId === object.id;
  const row = el("div", {
    class: `tc-tree-row ${deep ? "tc-tree-row-deep" : ""}`,
    onclick: () => {
      state.deepChildId = deep ? null : object.id;
      markViewed(object.id);
      render();
    },
  },
    el("span", { class: "tc-kind" }, object.kind === "MINI_PROJECT" ? "MP" : "T"),
    el("span", { class: "tc-tree-title" }, object.title),
    el("span", { class: "tc-tree-state" }, object.lifecycle === "COMPLETED" ? "已完成" : object.engagement === "WAITING" ? "等待" : object.engagement === "PARKED" ? "暂缓" : "可推进"),
    el("span", { class: "tc-card-chevron" }, deep ? "▾" : "▸"),
  );
  const container = el("div", { class: "tc-tree-child" }, row);
  if (deep) {
    const detail = object.kind === "MINI_PROJECT" ? renderMiniDetail(object) : renderTaskDetail(object);
    container.append(detail);
  } else {
    const grandchildren = childrenOf(state.world!, object.id);
    if (grandchildren.length) {
      container.append(el("div", { class: "tc-tree-grandchildren" },
        ...grandchildren.map((grand) => el("div", { class: "tc-tree-compact" },
          el("span", { class: "tc-kind" }, grand.object.kind === "MINI_PROJECT" ? "MP" : "T"),
          el("span", {}, grand.object.title),
        )),
      ));
    }
  }
  return container;
}

function renderMiniDetail(object: WorkObject): HTMLElement {
  const world = state.world!;
  const entry = world.objects.find((item) => item.object.id === object.id)!;
  const parentId = parentOf(world, object.id);
  const parent = parentId ? world.objects.find((item) => item.object.id === parentId)?.object : null;
  const checks = object.completionChecks;
  const children = childrenOf(world, object.id);
  const evidence = evidenceFor(world, object.id);
  const context = contextFor(world, object.id);
  const changes = meaningfulChanges(object, entry.baseline);
  const technicalOpen = state.technicalIds.has(object.id);
  return el("div", { class: "tc-detail tc-mini-detail" },
    el("div", { class: "tc-detail-head" },
      el("h4", {}, object.title),
      el("span", { class: "tc-kind" }, "MiniProject"),
    ),
    object.desiredOutcome ? el("div", { class: "tc-detail-block" },
      el("div", { class: "tc-block-label" }, "预期成果"),
      el("p", {}, object.desiredOutcome),
    ) : null,
    el("div", { class: "tc-detail-block" },
      el("div", { class: "tc-block-label" }, "当前局面"),
      el("p", {}, currentSituation(object, world)),
    ),
    checks.length ? el("div", { class: "tc-detail-block" },
      el("div", { class: "tc-block-label" }, "完成条件"),
      ...checks.map((check) => el("div", { class: "tc-check" }, `○ ${check}`)),
    ) : null,
    changes.length ? el("div", { class: "tc-detail-block" },
      el("div", { class: "tc-block-label" }, "上次以来"),
      ...changes.map((change) => el("div", { class: "tc-change" }, change)),
    ) : null,
    children.length ? el("div", { class: "tc-detail-block" },
      el("div", { class: "tc-block-label" }, "内部行动"),
      ...children.map((child) => el("div", { class: "tc-internal" }, `• ${child.object.title}`)),
    ) : null,
    parent ? el("div", { class: "tc-detail-block" },
      el("div", { class: "tc-block-label" }, "所属"),
      el("span", {}, parent.title),
    ) : el("div", { class: "tc-detail-block" },
      el("div", { class: "tc-block-label" }, "所属"),
      el("span", {}, "独立事项"),
    ),
    el("div", { class: "tc-detail-actions" },
      el("button", { class: "tc-button", onclick: () => openInLogseq(object.id) }, "在 Logseq 中打开"),
      el("button", { class: "tc-button", onclick: () => { toggleTechnical(object.id); render(); } }, technicalOpen ? "收起技术详情" : "技术详情"),
      el("span", { class: "tc-evidence-count" }, `依据 ${evidence.length + context.length}`),
    ),
    renderEvidenceSection(object.id),
    technicalOpen ? renderTechnical(object, entry.anchor ?? null) : null,
  );
}

function renderTaskDetail(object: WorkObject): HTMLElement {
  const world = state.world!;
  const entry = world.objects.find((item) => item.object.id === object.id)!;
  const parentId = parentOf(world, object.id);
  const parent = parentId ? world.objects.find((item) => item.object.id === parentId)?.object : null;
  const evidence = evidenceFor(world, object.id);
  const context = contextFor(world, object.id);
  const technicalOpen = state.technicalIds.has(object.id);
  const stateText = object.engagement === "WAITING" ? `等待：${object.waitingCondition?.description ?? "外部条件"}` : object.engagement === "PARKED" ? "暂缓" : object.lifecycle === "COMPLETED" ? "已完成" : object.lifecycle === "CANCELLED" ? "已取消" : "可推进";
  return el("div", { class: "tc-detail tc-task-detail" },
    el("div", { class: "tc-detail-head" },
      el("h4", {}, object.title),
      el("span", { class: "tc-kind" }, "Task"),
    ),
    el("div", { class: "tc-detail-block" },
      el("div", { class: "tc-block-label" }, "当前状态"),
      el("p", {}, stateText),
    ),
    object.currentFocus ? el("div", { class: "tc-detail-block" },
      el("div", { class: "tc-block-label" }, "当前推进"),
      el("p", {}, object.currentFocus),
    ) : null,
    parent ? el("div", { class: "tc-detail-block" },
      el("div", { class: "tc-block-label" }, "所属"),
      el("span", {}, parent.title),
    ) : el("div", { class: "tc-detail-block" },
      el("div", { class: "tc-block-label" }, "所属"),
      el("span", {}, "独立事项"),
    ),
    el("div", { class: "tc-detail-actions" },
      el("button", { class: "tc-button", onclick: () => openInLogseq(object.id) }, "在 Logseq 中打开"),
      el("button", { class: "tc-button", onclick: () => { toggleTechnical(object.id); render(); } }, technicalOpen ? "收起技术详情" : "技术详情"),
      el("span", { class: "tc-evidence-count" }, `依据 ${evidence.length + context.length}`),
    ),
    renderEvidenceSection(object.id),
    technicalOpen ? renderTechnical(object, entry.anchor ?? null) : null,
  );
}

function renderIndependentMini(card: ReturnType<typeof independentMiniProjects>[number]): HTMLElement {
  return el("article", { class: "tc-card tc-independent" },
    el("div", { class: "tc-card-head" },
      el("h3", { class: "tc-project-name" }, card.object.title),
      el("span", { class: "tc-kind" }, "MiniProject"),
    ),
    el("p", { class: "tc-situation" }, card.currentSituation),
    card.anomalies.length ? el("div", { class: "tc-anomalies" }, ...card.anomalies.map((a) => el("div", { class: "tc-anomaly" }, a.message))) : null,
  );
}

function renderIndependentTask(item: ReturnType<typeof independentTasks>[number]): HTMLElement {
  return el("article", { class: "tc-card tc-independent tc-task-item" },
    el("div", { class: "tc-card-head" },
      el("span", { class: "tc-kind" }, "T"),
      el("span", { class: "tc-task-title" }, item.object.title),
    ),
    el("p", { class: "tc-situation" }, item.currentSituation),
    item.anomalies.length ? el("div", { class: "tc-anomaly" }, item.anomalies[0]!.message) : null,
  );
}

function renderAttention(): HTMLElement {
  const world = state.world!;
  const items = attentionItems(world);
  return el("main", { class: "tc-main" },
    el("section", { class: "tc-section" },
      el("h2", { class: "tc-section-title" }, "需要注意"),
      items.length === 0 ? el("p", { class: "tc-empty" }, "没有需要你注意的系统一致性问题。") : null,
      ...items.map((item) => {
        const object = item.workObjectId ? world.objects.find((entry) => entry.object.id === item.workObjectId)?.object : null;
        return el("article", { class: "tc-card tc-attention" },
          el("div", { class: "tc-card-head" },
            el("span", { class: "tc-attention-message" }, item.message),
            el("span", { class: "tc-kind" }, object ? kindLabel(object.kind) : "System"),
          ),
          object ? el("div", { class: "tc-attention-object" }, object.title) : null,
          el("div", { class: "tc-attention-tech" }, item.technical),
        );
      }),
    ),
  );
}

function renderHistory(): HTMLElement {
  const world = state.world!;
  const cold = coldObjects(world);
  return el("main", { class: "tc-main" },
    el("section", { class: "tc-section" },
      el("h2", { class: "tc-section-title" }, "历史"),
      cold.length === 0 ? el("p", { class: "tc-empty" }, "暂无已完成或已取消事项。") : null,
      ...cold.map((entry) => {
        const object = entry.object;
        const technicalOpen = state.technicalIds.has(object.id);
        return el("article", { class: "tc-card tc-history-item" },
          el("div", { class: "tc-card-head" },
            el("span", { class: "tc-kind" }, kindLabel(object.kind)),
            el("h3", { class: "tc-project-name" }, object.title),
            el("span", { class: "tc-tree-state" }, object.lifecycle === "COMPLETED" ? "已完成" : "已取消"),
          ),
          el("p", { class: "tc-situation" }, currentSituation(object, world)),
          el("div", { class: "tc-detail-actions" },
            el("button", { class: "tc-button", onclick: () => openInLogseq(object.id) }, "在 Logseq 中打开"),
            el("button", { class: "tc-button", onclick: () => { toggleTechnical(object.id); render(); } }, technicalOpen ? "收起技术详情" : "技术详情"),
          ),
          technicalOpen ? renderTechnical(object, entry.anchor ?? null) : null,
        );
      }),
    ),
  );
}

function renderSearch(): HTMLElement {
  const world = state.world!;
  const input = el("input", {
    class: "tc-search-input",
    type: "search",
    placeholder: "搜索正式事项、预期成果、依据……",
    value: state.searchQuery,
    oninput: (event: Event) => {
      const value = (event.target as HTMLInputElement).value;
      state.searchQuery = value;
      void runSearch(value);
    },
  });
  return el("main", { class: "tc-main" },
    el("section", { class: "tc-section" },
      el("h2", { class: "tc-section-title" }, "搜索"),
      input,
      state.searchResults ? el("div", { class: "tc-search-results" },
        state.searchResults.results.length === 0 ? el("p", { class: "tc-empty" }, "没有找到正式事项。") : null,
        ...state.searchResults.results.map((result) => {
          const entry = world.objects.find((item) => item.object.id === result.workObjectId);
          return el("article", { class: "tc-card tc-search-result" },
            el("div", { class: "tc-card-head" },
              el("span", { class: "tc-kind" }, kindLabel(result.kind)),
              el("h3", { class: "tc-project-name" }, result.title),
            ),
            el("div", { class: "tc-match-fields" }, result.matchedFields.join(" · ")),
            result.snippet ? el("p", { class: "tc-snippet" }, result.snippet) : null,
            entry ? el("div", { class: "tc-detail-actions" },
              el("button", { class: "tc-button", onclick: () => { state.view = "formal"; state.expandedProjectId = entry.object.kind === "PROJECT" ? entry.object.id : parentOf(world, entry.object.id); state.deepChildId = entry.object.kind === "PROJECT" ? null : entry.object.id; render(); } }, "定位"),
            ) : null,
          );
        }),
      ) : null,
    ),
  );
}

async function runSearch(query: string): Promise<void> {
  if (!api) return;
  if (!query.trim()) { state.searchResults = null; render(); return; }
  state.searchResults = await api.consoleSearch(query);
  render();
}

function renderEvidenceSection(workObjectId: string): HTMLElement | null {
  const world = state.world!;
  const evidence = evidenceFor(world, workObjectId);
  const context = contextFor(world, workObjectId);
  if (!evidence.length && !context.length) return null;
  return el("details", { class: "tc-evidence" },
    el("summary", {}, `依据 (${evidence.length + context.length})`),
    ...evidence.map((item) => el("div", { class: "tc-evidence-item" },
      el("div", { class: "tc-evidence-meta" }, `Frozen · ${new Date(item.frozenAt).toLocaleDateString()}`),
      el("p", { class: "tc-snippet" }, item.frozenContent.slice(0, 200)),
    )),
    ...context.map((item) => el("div", { class: "tc-evidence-item" },
      el("div", { class: "tc-evidence-meta" }, `Context · ${item.origin} · ${item.sourceRef.blockUuid.slice(0, 8)}…`),
      el("p", { class: "tc-snippet" }, `来源 Block：${item.sourceRef.blockUuid}`),
    )),
  );
}

function toggleTechnical(workObjectId: string): void {
  if (state.technicalIds.has(workObjectId)) state.technicalIds.delete(workObjectId);
  else state.technicalIds.add(workObjectId);
}

function renderTechnical(object: WorkObject, anchor: ConsoleWorldSnapshot["objects"][number]["anchor"]): HTMLElement {
  const world = state.world!;
  const entry = world.objects.find((item) => item.object.id === object.id)!;
  const obligations = world.obligations.filter((item) => item.workObjectId === object.id);
  return el("details", { class: "tc-technical", open: "" },
    el("summary", {}, "技术详情"),
    el("dl", { class: "tc-tech-list" },
      el("dt", {}, "WorkObject ID"), el("dd", {}, object.id),
      el("dt", {}, "Revision"), el("dd", {}, String(object.version)),
      el("dt", {}, "Anchor UUID"), el("dd", {}, anchor?.externalId ?? "无"),
      el("dt", {}, "Graph ID"), el("dd", {}, anchor?.graphId ?? "无"),
      el("dt", {}, "Read Baseline"), el("dd", {}, entry.baseline ? `${entry.baseline.lastViewedAt} · v${entry.baseline.lastViewedFormalVersion}` : "未读"),
      el("dt", {}, "Projection Obligations"), el("dd", {}, obligations.length ? obligations.map((o) => `${o.status}${o.lastError ? ` ${o.lastError}` : ""}`).join("; ") : "无"),
    ),
  );
}

function render(): void {
  if (!root) return;
  clear(root);
  if (state.error) {
    root.append(el("div", { class: "tc-error" }, state.error));
    return;
  }
  if (!state.world) {
    root.append(el("div", { class: "tc-loading" }, "正在连接 Kernel……"));
    return;
  }
  root.append(renderHeader());
  const style = el("style", {}, `
    :root{--tc-bg:#fafaf8;--tc-card:#ffffff;--tc-border:#e6e4df;--tc-text:#1f2328;--tc-muted:#6b7280;--tc-accent:#4f6d7a;--tc-warn:#9a6b2f}
    *{box-sizing:border-box}
    body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB",sans-serif;background:var(--tc-bg);color:var(--tc-text);font-size:14px;line-height:1.55}
    #app{max-width:960px;margin:0 auto;padding:20px 24px 80px}
    .tc-header{display:flex;align-items:center;gap:16px;padding:8px 0 16px;border-bottom:1px solid var(--tc-border);margin-bottom:16px}
    .tc-title{font-size:18px;font-weight:700}
    .tc-subtitle{font-size:12px;color:var(--tc-muted)}
    .tc-navbar{display:flex;gap:4px;margin-left:8px}
    .tc-nav{border:1px solid transparent;background:transparent;color:var(--tc-muted);padding:6px 10px;border-radius:6px;cursor:pointer;font-size:13px}
    .tc-nav-active{background:var(--tc-card);border-color:var(--tc-border);color:var(--tc-text);font-weight:600}
    .tc-env{margin-left:auto;text-align:right;font-size:12px;color:var(--tc-muted)}
    .tc-env-name{display:block;font-weight:600}
    .tc-section{margin-bottom:28px}
    .tc-section-title{font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:var(--tc-muted);margin:0 0 8px}
    .tc-card{background:var(--tc-card);border:1px solid var(--tc-border);border-radius:8px;padding:14px 16px;margin-bottom:10px;cursor:pointer}
    .tc-card-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
    .tc-project-name{font-size:16px;font-weight:650;margin:0}
    .tc-card-chevron{color:var(--tc-muted)}
    .tc-card-block{margin-top:10px}
    .tc-block-label{font-size:11px;font-weight:600;color:var(--tc-muted);letter-spacing:.02em;margin-bottom:2px}
    .tc-situation{margin:2px 0 0}
    .tc-frontier-item{display:flex;gap:8px;align-items:baseline;padding:1px 0}
    .tc-frontier-title{font-weight:500}
    .tc-frontier-reason{color:var(--tc-muted);font-size:12px}
    .tc-kind{font-size:11px;font-weight:700;color:var(--tc-accent);background:#eef2f4;border-radius:4px;padding:1px 5px;white-space:nowrap}
    .tc-change{color:var(--tc-text)}
    .tc-anomaly{color:var(--tc-warn);font-size:13px}
    .tc-tree{margin:12px 0 0 8px;border-left:1px solid var(--tc-border);padding-left:12px}
    .tc-tree-row{display:flex;align-items:center;gap:8px;padding:5px 4px;border-radius:5px;cursor:pointer}
    .tc-tree-row:hover{background:#f2f1ed}
    .tc-tree-row-deep{background:#f2f1ed}
    .tc-tree-title{font-weight:500}
    .tc-tree-state{color:var(--tc-muted);font-size:12px;margin-left:auto}
    .tc-tree-grandchildren{margin:2px 0 6px 20px;color:var(--tc-muted);font-size:13px}
    .tc-tree-compact{display:flex;gap:6px;padding:1px 0}
    .tc-detail{margin:8px 0 8px 16px;padding:12px 14px;background:#f5f4f0;border-radius:8px;cursor:default}
    .tc-detail-head{display:flex;align-items:center;gap:8px}
    .tc-detail-head h4{margin:0}
    .tc-detail-block{margin-top:8px}
    .tc-check{color:var(--tc-text)}
    .tc-internal{color:var(--tc-text)}
    .tc-detail-actions{display:flex;gap:8px;align-items:center;margin-top:10px}
    .tc-button{border:1px solid var(--tc-border);background:var(--tc-card);color:var(--tc-text);padding:4px 10px;border-radius:5px;cursor:pointer;font-size:12px}
    .tc-evidence-count{color:var(--tc-muted);font-size:12px}
    .tc-technical{margin-top:8px;font-size:12px;color:var(--tc-muted)}
    .tc-tech-list{display:grid;grid-template-columns:auto 1fr;gap:2px 12px;margin:4px 0 0}
    .tc-tech-list dt{font-weight:600}
    .tc-tech-list dd{margin:0}
    .tc-independent{cursor:default}
    .tc-task-item .tc-card-head{justify-content:flex-start}
    .tc-task-title{font-weight:600}
    .tc-attention .tc-card-head{justify-content:flex-start}
    .tc-attention-message{font-weight:600}
    .tc-attention-object{margin-top:4px}
    .tc-attention-tech{margin-top:4px;font-size:11px;color:var(--tc-muted)}
    .tc-search-input{width:100%;padding:8px 10px;border:1px solid var(--tc-border);border-radius:6px;font-size:14px}
    .tc-match-fields{color:var(--tc-muted);font-size:12px;margin-top:4px}
    .tc-snippet{color:var(--tc-muted);font-size:13px}
    .tc-empty{color:var(--tc-muted)}
    .tc-history-link{border:none;background:transparent;color:var(--tc-muted);cursor:pointer;font-size:13px;padding:0}
    .tc-loading,.tc-error{padding:40px;text-align:center;color:var(--tc-muted)}
  `);
  root.append(style);
  if (state.view === "formal") root.append(renderFormal());
  else if (state.view === "attention") root.append(renderAttention());
  else if (state.view === "history") root.append(renderHistory());
  else root.append(renderSearch());
}

void loadWorld().catch((error) => {
  state.error = error instanceof Error ? error.message : String(error);
  render();
});
