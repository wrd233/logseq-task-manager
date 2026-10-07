import { element } from "../../host/panel-host.ts";

export function installReportStyle(): () => void {
  const style = element("style"); style.dataset.nativeReportStyle="true";
  style.textContent = `
    [data-workbench-feature=work] .wb-report-section{font-size:15px;font-weight:650;line-height:1.5;margin:16px 0 5px;margin-left:calc(min(var(--report-depth),8)*12px);padding:4px 0;color:var(--wb-accent)}
    [data-workbench-feature=work] .wb-report-row{grid-template-columns:18px minmax(0,1fr) 30px;gap:3px 5px;padding:4px 0;line-height:1.75;border:0;margin-left:calc(min(var(--depth),12)*12px);opacity:1}
    [data-workbench-feature=work] .wb-report-row>.wb-body{grid-column:2;min-width:0;display:block!important;-webkit-line-clamp:unset;max-height:none;overflow:visible;font-size:15px;line-height:1.8;color:var(--wb-ink)}
    [data-workbench-feature=work] .wb-local-heading{grid-column:2;grid-row:1;font-size:14px;font-weight:650;line-height:1.6;color:var(--wb-accent);margin:7px 0 1px}
    [data-workbench-feature=work] .wb-report-row>.wb-body>p:last-child{margin-bottom:0}
    [data-workbench-feature=work] .wb-report-row>button{grid-column:1;grid-row:1}
    [data-workbench-feature=work] .wb-report-row>.wb-row-menu{grid-column:3}
    [data-workbench-feature=work] .wb-report-row>.wb-grip{display:none}
    [data-workbench-feature=work] .wb-report-row>.wb-review-info,[data-workbench-feature=work] .wb-report-row>.wb-review-editor,[data-workbench-feature=work] .wb-report-row>pre{grid-column:2 / -1!important;min-width:0}
    [data-workbench-feature=work] .wb-report-row .wb-body pre{font-size:13px;line-height:1.6;max-width:100%;overflow:auto;white-space:pre;padding:10px;background:var(--wb-soft);border-radius:6px}
    [data-workbench-feature=work] .wb-report-row .wb-body table{display:block;max-width:100%;overflow-x:auto;font-size:14px}
    [data-workbench-feature=work] .wb-report-row .wb-body blockquote{margin:6px 0;padding:0 12px;border-left:2px solid var(--wb-edge)}
    [data-workbench-feature=work] .wb-report-row .wb-body ul,[data-workbench-feature=work] .wb-report-row .wb-body ol{margin:4px 0;padding-left:24px}
    [data-workbench-feature=work] .wb-report-row[data-report-marker=note]>.wb-body{padding:7px 10px;border-left:2px solid var(--wb-edge);background:var(--wb-soft);border-radius:0 6px 6px 0}
    [data-workbench-feature=work] .wb-report-row[data-object-kind]{margin-top:14px;padding-top:5px}
    [data-workbench-feature=work] .wb-report-row[data-object-kind]>.wb-body>p:first-child{font-size:16px;font-weight:650}
    [data-workbench-feature=work] .wb-report-row[data-report-root]{margin-left:0;margin-top:0;padding-top:0}
    [data-workbench-feature=work] .wb-report-row[data-report-root]>.wb-body>p:first-child{font-size:15px;font-weight:400}
    [data-workbench-feature=work] .wb-report-section[hidden]{display:none}
    [data-workbench-feature=work] .wb-reading-heading{font-size:15px;line-height:1.5;color:var(--wb-accent);margin:14px 0 8px;cursor:pointer}
    [data-workbench-feature=work] .wb-reading-columns{display:grid;grid-template-columns:repeat(var(--reading-columns,2),minmax(0,1fr));gap:16px;align-items:start}
    [data-workbench-feature=work] .wb-reading-column{min-width:0;padding:0 10px;border-left:2px solid var(--wb-edge)}
    [data-workbench-feature=work] .wb-reading-paragraphs>.wb-report-row{margin:0 0 5px;border:0}
    [data-workbench-feature=work] .wb-reading-context{margin:8px 0 12px;padding:7px 10px;border-left:2px solid var(--wb-edge);background:var(--wb-soft);font-size:13px;line-height:1.7;overflow-wrap:anywhere}
    [data-workbench-feature=work] .wb-reading-context-label{font-size:11px;color:var(--wb-muted);margin-bottom:5px}
    [data-workbench-feature=work] .wb-reading-context-body p{margin:4px 0}
    [data-workbench-feature=work] .wb-reading-material{font:inherit;cursor:pointer;max-width:100%;white-space:normal;overflow-wrap:anywhere;color:var(--wb-accent);background:var(--wb-soft);border:1px solid var(--wb-edge);border-radius:5px;padding:7px 10px;margin:8px 0}
    [data-workbench-feature=work] .wb-reading-heading:focus-visible,[data-workbench-feature=work] .wb-reading-context-body:focus-visible{outline:2px solid var(--wb-accent);outline-offset:3px}
    @media(max-width:700px){[data-workbench-feature=work] .wb-reading-columns{grid-template-columns:minmax(0,1fr)}}
    @media(max-width:480px){[data-workbench-feature=work] .wb-report-row{margin-left:calc(min(var(--depth),12)*9px)}}
  `;
  document.head.append(style); return () => style.remove();
}
