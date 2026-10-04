import { element } from "../../host/panel-host.ts";

export function installReportStyle(): () => void {
  const style = element("style"); style.dataset.nativeReportStyle="true";
  style.textContent = `
    [data-workbench-feature=work] .wb-report-section{font-size:14px;font-weight:650;line-height:1.5;margin:16px 0 3px;margin-left:calc(min(var(--report-depth),8)*12px);padding:4px 0 3px;border-bottom:1px solid var(--ls-border-color,#ddd);color:var(--ls-primary-text-color,#222)}
    [data-workbench-feature=work] .wb-report-row{padding:5px 2px;line-height:1.7;border:0}
    [data-workbench-feature=work] .wb-report-row .wb-body{font-size:14px;line-height:1.75}
    [data-workbench-feature=work] .wb-report-row .wb-body p{margin:0 0 5px}
    [data-workbench-feature=work] .wb-report-row .wb-body pre{font-size:13px;line-height:1.6}
    [data-workbench-feature=work] .wb-report-row[data-object-kind]{border-top:1px solid var(--ls-border-color,#ddd);margin-top:7px;padding-top:8px}
    [data-workbench-feature=work] .wb-report-mode[aria-pressed=true]{font-weight:650;background:var(--ls-secondary-background-color,#eef2ef)}
    [data-workbench-feature=work] .wb-report-row .wb-grip{visibility:hidden}
    [data-workbench-feature=work] .wb-report-section[hidden]{display:none}
    @media(prefers-reduced-motion:reduce){[data-workbench-feature=work] .wb-report-row{transition:none}}
  `;
  document.head.append(style); return () => style.remove();
}
