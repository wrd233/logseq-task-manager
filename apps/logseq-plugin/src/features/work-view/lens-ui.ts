import { button, element } from "../../host/panel-host.ts";
import type { LensStatus } from "./lens-state.ts";

const notices: Record<string, string> = {
  "editing-in-progress": "正在编辑，结束后可重新应用范围。",
  "selection-required": "请先选择一个来源块。",
  "source-not-in-scope": "选定内容不在当前工作范围。",
  "source-unavailable": "必要来源暂不可读，保留当前阅读。",
  "stale-content": "计划依据的原文已变化，保留当前阅读。",
  "stale-structure": "来源结构已变化，保留当前阅读。",
  "stale-source-set": "来源集合已变化，保留当前阅读。",
  "ancestor-version-required": "缺少必要标题的来源版本，保留当前阅读。",
  "source-read-failed": "来源读取失败，保留当前阅读。",
  "source-changed-during-read": "读取期间来源变化，请重新选取。",
};
const setText = (node: HTMLElement, text: string): void => { if (node.textContent !== text) node.textContent = text; };
export class LensBar {
  readonly root = element("aside", "", "wb-lens-bar");
  private readonly question = element("span", "", "wb-lens-question");
  private readonly state = element("span", "", "wb-lens-state");
  private readonly notice = element("div", "", "wb-lens-notice");
  private readonly inference = element("div", "", "wb-lens-inference");
  private readonly gaps = element("div", "", "wb-lens-gaps");
  private readonly previous: HTMLButtonElement;
  private readonly cancel: HTMLButtonElement;
  private readonly exit: HTMLButtonElement;
  constructor(actions: { back(): void; cancel(): void; exit(): void }) {
    this.previous = button("上一问题", actions.back);
    this.cancel = button("取消等待", actions.cancel);
    this.exit = button("完整内容", actions.exit);
    const line = element("div", "", "wb-lens-line");
    line.append(this.question, this.state, this.previous, this.cancel, this.exit);
    this.root.setAttribute("aria-label", "当前阅读范围");
    this.notice.setAttribute("role", "status");
    this.root.append(line, this.notice, this.inference, this.gaps);
    this.root.hidden = true;
  }
  render(status: LensStatus): void {
    this.root.hidden = !status.pending && !status.plan && !status.notice;
    this.root.dataset.lensPhase = status.phase;
    setText(this.question, status.pending?.question ?? status.plan?.question ?? "");
    setText(this.state, status.notice ? "" : status.pending ? "等待范围选择" : status.basisChanged ? "依据已变化" : "");
    this.previous.hidden = !status.history.length;
    this.cancel.hidden = !status.pending;
    this.exit.hidden = !status.pending && !status.plan;
    this.notice.hidden = !status.notice;
    setText(this.notice, status.notice ? notices[status.notice] ?? "计划不可用，保留当前阅读。" : "");
    this.inference.hidden = !status.plan?.temporaryInference || status.basisChanged || !!status.pending;
    setText(this.inference, this.inference.hidden ? "" : "临时推断：" + status.plan!.temporaryInference);
    this.gaps.hidden = !status.plan?.gaps?.length || status.basisChanged || !!status.pending;
    setText(this.gaps, this.gaps.hidden ? "" : "缺口：" + status.plan!.gaps!.join("；"));
  }
}
/** Local feature styles; full selected blocks never inherit the normal three-line clamp. */
export function installLensStyle(): () => void {
  const style = element("style");
  style.textContent = [
    '[data-workbench-feature=work] .wb-lens-bar{padding:6px 14px;border-bottom:1px solid var(--ls-border-color,#ddd);flex:none;font-size:12px}',
    '[data-workbench-feature=work] .wb-lens-line{display:flex;gap:7px;align-items:center;flex-wrap:wrap}',
    '[data-workbench-feature=work] .wb-lens-question{flex:1;overflow-wrap:anywhere}',
    '[data-workbench-feature=work] .wb-lens-state{opacity:.7}',
    '[data-workbench-feature=work] .wb-lens-notice,[data-workbench-feature=work] .wb-lens-inference,[data-workbench-feature=work] .wb-lens-gaps{margin-top:3px;opacity:.8}',
    '[data-workbench-feature=work] .wb-lens-emphasis .wb-body{background:var(--ls-selection-background-color,#eef3e8);border-radius:2px}',
    '[data-workbench-feature=work] .wb-row .wb-body{transition:background-color 120ms ease}',
    '@media(prefers-reduced-motion:reduce){[data-workbench-feature=work] .wb-row .wb-body{transition:none}}',
  ].join("\n");
  document.head.append(style); return () => style.remove();
}
