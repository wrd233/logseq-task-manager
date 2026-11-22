import { button, disclosureMenu, element } from "../../host/panel-host.ts";
import { taskMarkerFromContent } from "../../canonical-writing.ts";
import { workObject } from "./focus.mjs";
import type { SourceScope } from "../../workspace/source-protocol.ts";

export interface WorkShellIdentity { scope: SourceScope; title: string; kind: string; sourceId?: string; contentVersion?: string }
export interface WorkShellAction { group?: string; selected?: boolean; label: string; run(): void | Promise<void>; description?: string; disabled?: boolean; preserveInputFocus?: boolean }
export interface WorkShellState {
  identity: WorkShellIdentity | null; content: "body" | "materials";
  native: boolean; draft: boolean; historical: boolean; review: boolean;
  parent?: {title:string;run():Promise<void>} | undefined;
  reviewAvailable: boolean; attention: boolean; notice: string; actions: WorkShellAction[];
  browsing?:string;
}

/** Work-level chrome only. The existing modules retain source, bookmarks, drafts and permissions. */
export class WorkViewShell {
  readonly root = element("header", "", "wb-work-shell");
  private readonly title = element("strong", "选择一份工作", "wb-work-title");
  private readonly browsing = element("small", "", "wb-work-browsing");
  private readonly native: HTMLButtonElement;
  private readonly zoomOutBtn: HTMLButtonElement | null = null;
  private readonly body: HTMLButtonElement;
  private readonly materials: HTMLButtonElement;
  private readonly review: HTMLButtonElement;
  private readonly parent = button("", () => undefined);
  private readonly notice = element("div", "", "wb-work-notice");
  private readonly menu = disclosureMenu("···", "更多工作选项");
  private actionSignature = "";
  constructor(actions: { body(): void; materials(): void; native(): void; review(): void; zoomOut?(): void; changed(): void; fail(error: unknown): void }) {
    this.native = button("写作", actions.native); this.native.className = "wb-write-entry";
    this.native.onpointerdown = event => event.preventDefault();
    this.menu.trigger.onpointerdown = event => event.preventDefault();
    this.menu.root.classList.add("wb-icon-menu");
    this.body = button("文章", actions.body); this.body.onpointerdown = event => { if (this.body.textContent === "返回文章") event.preventDefault(); };
    this.materials = button("材料", actions.materials);
    this.review = button("审阅与历史", actions.review); this.review.className = "wb-review-entry";
    const identity = element("div", "", "wb-work-identity"); identity.append(this.title);
    const line = element("div", "", "wb-work-line");
    if (actions.zoomOut) {
      this.zoomOutBtn = button("拉远", actions.zoomOut);
      this.zoomOutBtn.className = "wb-zoomout-entry";
      this.zoomOutBtn.title = "从当前工作拉远到全局领域星图";
      this.zoomOutBtn.onpointerdown = event => event.preventDefault();
      line.append(identity, this.zoomOutBtn, this.native, this.menu.root);
    } else {
      line.append(identity, this.native, this.menu.root);
    }
    const tabs = element("nav", "", "wb-content-navigation"); tabs.setAttribute("aria-label", "当前工作内容");
    tabs.append(this.body, this.materials, this.parent, this.review);
    this.body.dataset.workContent = "body"; this.materials.dataset.workContent = "materials";
    this.notice.setAttribute("role", "status"); this.notice.hidden = true;
    this.root.append(line, tabs, this.browsing, this.notice);
    this.menu.content.addEventListener("click", event => {
      const target = (event.target as Element).closest("button"); if (!target || target.disabled) return;
      this.menu.close(target.dataset.preserveInputFocus !== "true");
    });
    this.fail = actions.fail; this.changed = actions.changed;
    this.menu.root.addEventListener("toggle", () => { if (this.menu.root.open) this.changed(); });
  }
  private readonly changed: () => void;
  private readonly fail: (error: unknown) => void;
  mount(surface: HTMLElement): void { if (this.root.parentElement !== surface) surface.prepend(this.root); }
  render(state: WorkShellState): void {
    const set = (node: HTMLElement, text: string) => { if (node.textContent !== text) node.textContent = text; };
    set(this.title, state.identity?.title ?? "当前工作");
    this.title.title = state.identity?.title ?? "";
    this.root.dataset.workRoot = state.identity?.scope.rootUuid ?? "";
    this.title.dataset.sourceId = state.identity?.sourceId ?? "";
    this.title.dataset.contentVersion = state.identity?.contentVersion ?? "";
    this.body.disabled = !state.identity; this.materials.disabled = !state.identity;
    this.materials.title=state.identity?.scope.kind === "page" ? "当前页面的材料" : "当前工作的材料";
    this.parent.hidden=!state.parent;set(this.parent,state.parent ? `返回：${state.parent.title}` : "");
    this.parent.onclick=()=>{if(state.parent)void state.parent.run().catch(this.fail);};
    this.browsing.hidden=!state.browsing;set(this.browsing,state.browsing?`正在参阅 · ${state.browsing}`:"");
    this.body.setAttribute("aria-current", String(state.content === "body"));
    this.materials.setAttribute("aria-current", String(state.content === "materials"));
    set(this.body, state.native && state.content === "body" ? "返回文章" : "文章");
    set(this.native, state.draft ? "继续写作" : "写作");
    this.native.disabled = !state.identity || state.historical || state.content === "materials";
    this.native.hidden = state.content === "materials";
    this.menu.root.hidden = state.content === "materials";
    const pendingReview=state.attention&&!state.review;
    this.menu.trigger.classList.toggle("wb-attention",pendingReview);
    this.menu.trigger.setAttribute("aria-label",pendingReview?"更多工作选项（有阶段记录待核对）":"更多工作选项");
    this.native.title = state.draft ? "回到当前 Logseq 原生输入" : state.identity?.scope.kind === "page" ? "在 Logseq 编辑页面的第一个块" : "在 Logseq 编辑当前工作的根块";
    this.review.hidden = !state.reviewAvailable || !state.review; this.review.disabled = !state.identity;
    set(this.review, "结束审阅");
    this.review.setAttribute("aria-expanded", String(state.review)); this.review.classList.toggle("wb-attention", state.attention);
    this.notice.hidden = !state.notice; set(this.notice, state.notice);
    const signature = JSON.stringify([state.identity?.scope, state.historical, state.actions.map(({ label, description, disabled, group, selected, preserveInputFocus }) => [label, description, disabled, group, selected, preserveInputFocus])]);
    if (signature !== this.actionSignature) {
      this.actionSignature = signature; const focused = document.activeElement as HTMLElement | null;
      const focusedLabel = this.root.contains(focused) ? focused?.dataset.actionLabel : null;
      const opened = new Set(Array.from(this.menu.content.querySelectorAll<HTMLDetailsElement>("details[open]")).map(group => group.querySelector("summary")?.textContent));
      this.menu.content.replaceChildren();
      const groups = new Map<string, HTMLElement>();
      for (const action of state.actions) {
        const item = button(action.label, () => {
          void Promise.resolve().then(action.run).catch(this.fail).finally(()=>{this.actionSignature="";this.changed();});
        });
        item.dataset.actionLabel = action.label; item.disabled = !!action.disabled;
        if (action.preserveInputFocus) {
          item.dataset.preserveInputFocus = "true";
          item.onpointerdown = event => event.preventDefault();
        }
        if (action.description) item.title = action.description;
        if (action.selected !== undefined) item.setAttribute("aria-current", String(action.selected));
        let container: HTMLElement = this.menu.content;
        if (action.group) {
          let group = groups.get(action.group);
          if (!group) {const section = element("details", "", "wb-menu-group"); section.open = opened.has(action.group); section.append(element("summary", action.group)); group = section; groups.set(action.group, group); this.menu.content.append(group);}
          container = group;
        }
        container.append(item);
      }
      if (focusedLabel) {
        const replacement = Array.from(this.root.querySelectorAll<HTMLButtonElement>("button")).find(item => item.dataset.actionLabel === focusedLabel && !item.disabled);
        (replacement ?? this.menu.trigger).focus({ preventScroll: true });
      }
    }
  }
  closeMenu(): void { this.menu.close(); }
  focusReview(): void { this.menu.trigger.focus({ preventScroll: true }); }
  dispose(): void { this.menu.dispose(); this.root.remove(); }
}

export function workIdentity(scope: SourceScope, content: string, formal?: { title?: string; objectKind?: string } | null): WorkShellIdentity {
  const line = content.split("\n").find(line => line.trim() && !/^\s*[\w-]+::/.test(line)) ?? "工作";
  const object = workObject(line);
  const title = (formal?.title || object?.title || line).replace(/^[#\s]+|\*\*|__/g, "").trim() || "工作";
  const kind = formal?.objectKind?.toLowerCase() ?? object?.type;
  const marker = taskMarkerFromContent(line);
  return { scope: { ...scope }, title, kind: kind === "miniproject" || kind === "mini_project" ? "MiniProject" : kind === "task" ? `${/\[事务\]/.test(line) ? "事务" : "任务"}${marker ? ` · ${marker}` : ""}` : kind === "project" ? "Project" : kind === "area" ? "Area" : "工作" };
}
