import { element } from "../../host/panel-host.ts";

export function installReportStyle(): () => void {
  const style = element("style"); style.dataset.nativeReportStyle="true";
  style.textContent = `
    [data-workbench-feature=work] .wb-report-section{font-size:14px;font-weight:650;line-height:1.5;margin:16px 0 3px;margin-left:calc(min(var(--report-depth),8)*12px);padding:4px 0 3px;border-bottom:1px solid var(--ls-border-color,#ddd);color:var(--ls-primary-text-color,#222)}
    [data-workbench-feature=work] .wb-report-row{grid-template-columns:18px minmax(0,1fr) 24px;gap:4px;padding:4px 0;line-height:1.7;border:0;margin-left:calc(min(var(--depth),12)*12px);opacity:1}
    [data-workbench-feature=work] .wb-report-row>.wb-body{grid-column:2;min-width:0;display:block!important;-webkit-line-clamp:unset;max-height:none;overflow:visible;font-size:15px;line-height:1.8;color:var(--ls-primary-text-color,#222)}
    [data-workbench-feature=work] .wb-report-row>button{grid-column:1}
    [data-workbench-feature=work] .wb-report-row>.wb-row-menu{grid-column:3}
    [data-workbench-feature=work] .wb-report-row>.wb-grip{display:none}
    [data-workbench-feature=work] .wb-report-row>.wb-review-info,[data-workbench-feature=work] .wb-report-row>.wb-review-editor,[data-workbench-feature=work] .wb-report-row>pre{grid-column:2 / -1!important;min-width:0}
    [data-workbench-feature=work] .wb-report-row .wb-body p{margin:0 0 4px}
    [data-workbench-feature=work] .wb-report-row .wb-body pre{font-size:13px;line-height:1.6;max-width:100%;overflow:auto}
    [data-workbench-feature=work] .wb-report-row .wb-body table{display:block;max-width:100%;overflow-x:auto;font-size:14px}
    [data-workbench-feature=work] .wb-report-row .wb-body blockquote{margin:6px 0;padding:0 12px;border-left:2px solid var(--ls-border-color,#bbb)}
    [data-workbench-feature=work] .wb-report-row .wb-body ul,[data-workbench-feature=work] .wb-report-row .wb-body ol{margin:4px 0;padding-left:24px}
    [data-workbench-feature=work] .wb-report-row .wb-body a{overflow-wrap:anywhere}
    [data-workbench-feature=work] .wb-report-row[data-object-kind]{border-top:1px solid var(--ls-border-color,#ddd);margin-top:12px;padding-top:10px}
    [data-workbench-feature=work] .wb-report-row[data-object-kind]>.wb-body>p:first-child{font-size:16px;font-weight:650}
    [data-workbench-feature=work] .wb-report-row[data-report-root]{margin-left:0;border-top:0;margin-top:0;padding-top:0}
    [data-workbench-feature=work] .wb-report-row[data-report-root]>.wb-body>p:first-child{font-size:18px}
    [data-workbench-feature=work] .wb-report-mode[aria-pressed=true]{font-weight:650;background:var(--ls-secondary-background-color,#eef2ef)}
    [data-workbench-feature=work] .wb-report-row .wb-grip{visibility:hidden}
    [data-workbench-feature=work] .wb-report-section[hidden]{display:none}
    @media(prefers-reduced-motion:reduce){[data-workbench-feature=work] .wb-report-row{transition:none}}
  `;
  document.head.append(style); return () => style.remove();
}
