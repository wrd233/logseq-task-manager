import { button, disclosureMenu, element } from "../../host/panel-host.ts";
import { taskMarkerFromContent } from "../../canonical-writing.ts";
import { workObject } from "./focus.mjs";
import type { SourceScope } from "../../workspace/source-protocol.ts";

export interface WorkShellIdentity { scope: SourceScope; title: string; kind: string; sourceId?: string; contentVersion?: string }
export interface WorkShellAction { group?: string; label: string; run(): void | Promise<void>; description?: string; disabled?: boolean; preserveInputFocus?: boolean }
export interface WorkShellState {
  identity: WorkShellIdentity | null; content: "body" | "materials"; structure: boolean;
  native: boolean; draft: boolean; historical: boolean; review: boolean; reviewLabel: string;
  reviewAvailable: boolean; attention: boolean; notice: string; actions: WorkShellAction[];
}

/** Work-level chrome only. The existing modules retain source, bookmarks, drafts and permissions. */
export class WorkViewShell {
  readonly root = element("header", "", "wb-work-shell");
  private readonly title = element("strong", "选择一份工作", "wb-work-title");
  private readonly kind = element("small", "", "wb-work-kind");
  private readonly native: HTMLButtonElement;
  private readonly body: HTMLButtonElement;
  private readonly materials: HTMLButtonElement;
  private readonly review: HTMLButtonElement;
  private readonly notice = element("div", "", "wb-work-notice");
  private readonly menu = disclosureMenu("工作选项", "当前工作的阅读与设置");
  private actionSignature = "";
  constructor(actions: { body(): void; materials(): void; native(): void; review(): void; changed(): void; fail(error: unknown): void }) {
    this.native = button("在 Logseq 写作", actions.native); this.native.className = "wb-primary";
    this.native.onpointerdown = event => event.preventDefault();
    this.menu.trigger.onpointerdown = event => event.preventDefault();
    this.body = button("正文", actions.body); this.materials = button("材料", actions.materials);
    this.review = button("审阅与历史", actions.review); this.review.className = "wb-review-entry";
    const identity = element("div", "", "wb-work-identity"); identity.append(this.kind, this.title);
    const line = element("div", "", "wb-work-line"); line.append(identity, this.native, this.menu.root);
    const tabs = element("nav", "", "wb-content-navigation"); tabs.setAttribute("aria-label", "当前工作内容");
    tabs.append(this.body, this.materials, this.review);
    this.body.dataset.workContent = "body"; this.materials.dataset.workContent = "materials";
    this.notice.setAttribute("role", "status"); this.notice.hidden = true;
    this.root.append(line, tabs, this.notice);
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
    set(this.title, state.identity?.title ?? "选择一份工作"); set(this.kind, state.identity?.kind ?? "工作台");
    this.title.title = state.identity?.title ?? "";
    this.root.dataset.workRoot = state.identity?.scope.rootUuid ?? "";
    this.title.dataset.sourceId = state.identity?.sourceId ?? "";
    this.title.dataset.contentVersion = state.identity?.contentVersion ?? "";
    this.body.disabled = !state.identity; this.materials.disabled = !state.identity;
    this.body.setAttribute("aria-current", String(state.content === "body"));
    this.materials.setAttribute("aria-current", String(state.content === "materials"));
    set(this.body, state.structure ? "正文 · 原结构" : "正文");
    set(this.native, state.draft ? "继续原生输入" : state.native ? "继续在 Logseq 写作" : "在 Logseq 写作");
    this.native.disabled = !state.identity || state.historical || state.content === "materials";
    this.native.title = state.content === "materials" ? "返回正文后，在 Logseq 原生页面写作" : "打开真实来源块；阅读层保留当前位置";
    this.review.hidden = !state.reviewAvailable; this.review.disabled = !state.identity;
    set(this.review, state.review ? "收起审阅" : state.reviewLabel);
    this.review.setAttribute("aria-expanded", String(state.review)); this.review.classList.toggle("wb-attention", state.attention);
    this.notice.hidden = !state.notice; set(this.notice, state.notice);
    const signature = JSON.stringify([state.identity?.scope, state.actions.map(({ label, description, disabled, group, preserveInputFocus }) => [label, description, disabled, group, preserveInputFocus])]);
    if (signature !== this.actionSignature) {
      this.actionSignature = signature; const focused = document.activeElement as HTMLElement | null;
      const focusedLabel = this.menu.content.contains(focused) ? focused?.dataset.actionLabel : null;
      this.menu.content.replaceChildren();
      const groups = new Map<string, HTMLElement>();
      for (const action of state.actions) {
        const item = button(action.label, () => { void Promise.resolve().then(action.run).then(this.changed).catch(this.fail); });
        item.dataset.actionLabel = action.label; item.disabled = !!action.disabled;
        if (action.preserveInputFocus) {
          item.dataset.preserveInputFocus = "true";
          item.onpointerdown = event => event.preventDefault();
        }
        if (action.description) item.append(element("small", action.description));
        let container: HTMLElement = this.menu.content;
        if (action.group) {
          let group = groups.get(action.group);
          if (!group) { group = element("details", "", "wb-menu-group"); group.append(element("summary", action.group)); groups.set(action.group, group); this.menu.content.append(group); }
          container = group;
        }
        container.append(item);
      }
      if (focusedLabel) {
        const replacement = Array.from(this.menu.content.querySelectorAll<HTMLButtonElement>("button")).find(item => item.dataset.actionLabel === focusedLabel && !item.disabled);
        (replacement ?? this.menu.trigger).focus({ preventScroll: true });
      }
    }
  }
  closeMenu(): void { this.menu.close(); }
  focusReview(): void { this.review.focus({ preventScroll: true }); }
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
