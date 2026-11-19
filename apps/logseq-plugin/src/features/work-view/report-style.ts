import { element } from "../../host/panel-host.ts";

export function installReportStyle(): () => void {
  const style = element("style"); style.dataset.nativeReportStyle="true";
  style.textContent = `
    [data-workbench-feature=work] .wb-report-section{
      font-size:14px;font-weight:650;line-height:1.4;margin:10px 0 3px;
      margin-inline-start:calc(min(var(--report-depth),5)*7px);color:var(--wb-accent)
    }
    [data-workbench-feature=work] .wb-report-row{
      position:relative;grid-template-columns:minmax(0,1fr) auto;column-gap:0;row-gap:3px;
      padding:2px 0;line-height:1.55;border:0;margin-inline-start:calc(min(var(--depth),5)*7px);opacity:1
    }
    .wb-report-row>.wb-row-content{grid-column:1;grid-row:1;display:flow-root;margin-inline-end:4px}
    .wb-report-row .wb-body{
      display:block!important;-webkit-line-clamp:unset;max-height:none;overflow:visible;
      font-size:14px;line-height:1.55;color:var(--wb-ink)
    }
    .wb-report-row .wb-body :is(h1,h2,h3,h4,h5,h6){line-height:1.32;margin:.5em 0 .22em;font-weight:650}
    .wb-report-row .wb-body>:is(h1,h2,h3,h4,h5,h6):first-child{margin-top:0}
    .wb-report-row .wb-body>:is(p,h1,h2,h3,h4,h5,h6):last-child{margin-bottom:0}
    .wb-report-row .wb-body h1{font-size:1.29em}
    .wb-report-row .wb-body h2{font-size:1.14em}
    .wb-report-row .wb-body h3{font-size:1.04em}
    .wb-report-row .wb-body :is(h4,h5,h6){font-size:1em;color:var(--wb-muted)}
    .wb-report-row .wb-local-heading{
      float:left;margin-inline-end:6px;font-size:11px;font-weight:650;line-height:21.7px;color:var(--wb-accent)
    }
    .wb-report-row>.wb-fold{position:absolute;inset-inline-end:100%;inset-block-start:2px;width:16px;min-height:24px;margin-inline-end:1px}
    .wb-report-row>.wb-grip{display:none}
    .wb-report-row>.wb-row-actions{
      grid-column:2;grid-row:1;display:flex;align-items:flex-start;
      opacity:0;pointer-events:none;color:var(--wb-muted)
    }
    .wb-report-row:hover>.wb-row-actions,
    .wb-report-row:focus-within>.wb-row-actions,
    .wb-report-row>.wb-row-actions:has(details[open]){opacity:1;pointer-events:auto}
    .wb-row-actions>.wb-edit-block,.wb-report-row .wb-row-menu>summary{
      display:grid;place-items:center;box-sizing:border-box;min-width:24px;min-height:24px;
      padding:0 2px;font-size:11px;border:0;white-space:nowrap
    }
    .wb-report-row .wb-row-menu>summary{font-size:15px}
    .wb-report-row .wb-row-menu>summary:hover,.wb-report-row .wb-fold:hover{background:var(--wb-soft)}
    @media (hover:none), (any-pointer:coarse){
      .wb-report-row>.wb-row-actions{opacity:1;pointer-events:auto}
      .wb-row-actions>.wb-edit-block,.wb-report-row .wb-row-menu>summary,.wb-report-row .wb-fold{min-height:28px}
    }
    .wb-report-row>.wb-review-info,.wb-report-row>.wb-review-editor,.wb-report-row>pre{grid-column:1 / -1!important;min-width:0}
    .wb-report-row .wb-body pre{font-size:13px;line-height:1.55;max-width:100%;overflow:auto;white-space:pre;padding:8px;background:var(--wb-soft);border-radius:6px}
    .wb-report-row .wb-body table{display:block;max-width:100%;overflow-x:auto;font-size:13px}
    .wb-report-row .wb-body blockquote{margin:4px 0;padding:0 9px;border-left:2px solid var(--wb-edge)}
    .wb-report-row .wb-body :is(ul,ol){margin:3px 0;padding-left:19px}
    .wb-report-row[data-report-marker=note]>.wb-row-content{padding:4px 7px;border-left:2px solid var(--wb-edge);background:var(--wb-soft);border-radius:0 4px 4px 0}
    .wb-report-row[data-object-kind]{margin-top:8px}
    .wb-report-row[data-object-kind] .wb-body>p:first-child{font-weight:650}
    .wb-report-row[data-report-root]{margin-inline-start:0;margin-top:0;padding-top:0}
    .wb-report-row[data-report-root] .wb-body>p:first-child{font-weight:400}
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
  `;
  document.head.append(style); return () => style.remove();
}
