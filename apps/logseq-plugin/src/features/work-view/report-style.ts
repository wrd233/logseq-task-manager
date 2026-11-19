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
    .wb-progressive{font-size:14px;line-height:1.62;max-width:68ch;margin:0 auto;color:var(--wb-ink);overflow-wrap:anywhere}
    .wb-progressive [hidden]{display:none!important}
    .wb-progressive-meta{font-size:11px;color:var(--wb-muted);margin:0 0 13px;line-height:1.4}
    .wb-progressive-unit{margin:0 0 15px}
    .wb-progressive-line{margin:0;font-size:15px;line-height:1.65}
    .wb-progressive button.wb-progressive-disclose{display:inline;text-align:start;white-space:normal;border:0;padding:0;min-height:0;line-height:inherit;border-radius:2px;user-select:text;color:var(--wb-accent);background:transparent;text-decoration:underline;text-decoration-color:color-mix(in srgb,var(--wb-accent) 42%,transparent);text-underline-offset:3px;text-decoration-thickness:1px}
    .wb-progressive button.wb-progressive-phrase{font:inherit;color:var(--wb-ink);text-decoration-color:color-mix(in srgb,var(--wb-accent) 45%,transparent)}
    .wb-progressive [data-tone=attention]>.wb-progressive-line>.wb-progressive-phrase{text-decoration-color:var(--wb-accent);font-weight:500}.wb-progressive [data-tone=attention]>.wb-progressive-line>.wb-progressive-phrase strong{color:var(--wb-accent);font-weight:600}
    .wb-progressive button.wb-progressive-disclose:hover{color:var(--wb-accent);text-decoration-color:var(--wb-accent);background:transparent}
    .wb-progressive button.wb-progressive-disclose:focus-visible{outline:2px solid var(--wb-focus);outline-offset:3px}
    .wb-progressive-caret{font-size:.82em;margin-inline-start:5px;color:var(--wb-accent);user-select:none;display:inline-block}
    .wb-progressive-context{border-inline-start:1px solid var(--wb-edge);padding-inline-start:11px;margin:8px 0 0 2px;font-size:14px}
    .wb-progressive-detail{margin:0 0 10px;line-height:1.6}
    .wb-progressive-detail:last-child{margin-bottom:0}
    .wb-progressive-detail h3{font-size:13px;line-height:1.45;margin:7px 0 5px;font-weight:650}
    .wb-progressive-markdown>:first-child{margin-top:0}.wb-progressive-markdown>:last-child{margin-bottom:0}
    .wb-progressive-markdown p{margin:0 0 6px}.wb-progressive-markdown :is(ul,ol){padding-inline-start:19px;margin:5px 0}
    .wb-progressive-changed{color:var(--wb-error)!important;font-size:11px;display:block;margin:3px 0;font-weight:500}
    .wb-progressive-tag{font-size:11px;color:var(--wb-muted);margin-inline-end:6px;border:1px solid var(--wb-edge);padding:1px 4px;border-radius:3px;white-space:nowrap}
    .wb-progressive-evidence{font-size:12px;margin:8px 0 0;background:var(--wb-soft);border:1px solid var(--wb-edge);border-radius:6px;padding:8px;line-height:1.5;min-width:0}
    .wb-progressive-evidence :is(h1,h2,h3,h4){font-size:1em;line-height:1.5;margin:4px 0}
    .wb-progressive-source+.wb-progressive-source{border-top:1px solid var(--wb-edge);margin-top:9px;padding-top:8px}
    .wb-progressive-source-head{display:flex;align-items:baseline;gap:6px;flex-wrap:wrap;justify-content:space-between;margin-bottom:4px}
    .wb-progressive-source-head button{padding:0 2px;min-height:24px;font-size:11px;color:var(--wb-accent)}
    .wb-progressive-version,.wb-progressive-label{font-size:11px;color:var(--wb-muted)}
    .wb-progressive-version{display:block;margin:3px 0 4px}
    .wb-progressive-original{margin-bottom:7px}.wb-progressive-original pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;margin:5px 0}
    .wb-progressive-original details,.wb-progressive-parent{color:var(--wb-muted);font-size:11px;margin-top:5px}.wb-progressive-original summary,.wb-progressive-parent summary{cursor:pointer}
    .wb-progressive table{border-collapse:collapse;width:100%;font-size:12px;margin:4px 0;table-layout:auto}.wb-progressive :is(td,th){text-align:start;border-bottom:1px solid var(--wb-edge);padding:3px 5px;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
    .wb-progressive-chart{margin:5px 0 9px}.wb-progressive-chart-label{display:flex;justify-content:space-between;gap:5px;font-variant-numeric:tabular-nums}.wb-progressive-measure{margin:3px 0 5px}
    .wb-progressive-track{height:5px;border-radius:3px;background:var(--wb-edge);overflow:hidden}.wb-progressive-track>span{height:100%;background:var(--wb-accent);display:block;border-radius:3px}
    .wb-progressive-extra{border-top:1px solid var(--wb-edge);margin-top:19px;padding-top:8px;font-size:12px}.wb-progressive-full{margin:6px 0}
    @media(max-width:360px){.wb-progressive-line{font-size:14px}.wb-progressive-context{padding-inline-start:7px;margin-inline-start:0}.wb-progressive-evidence{padding:6px}.wb-progressive-source-head{gap:2px}}
    .wb-reading-ai{flex:none;padding:4px 12px 3px;border-bottom:1px solid var(--wb-edge);background:var(--wb-bg);font-size:12px;color:var(--wb-muted)}
    .wb-reading-ai[hidden],.wb-reading-ai [hidden]{display:none!important}.wb-ai-bar,.wb-ai-tools{display:flex;flex-wrap:wrap;align-items:center;gap:4px}
    .wb-reading-ai button{padding:3px 6px;min-height:25px;color:var(--wb-accent);font-size:12px}.wb-reading-ai button:first-child{font-weight:600}
    .wb-ai-form{overflow:auto;max-height:43vh;min-height:0;margin:3px 0 5px}.wb-ai-form textarea{width:100%;min-height:47px;resize:vertical;box-sizing:border-box;padding:6px 8px;font:inherit;line-height:1.5;border:1px solid var(--wb-edge);border-radius:5px;background:var(--wb-paper);color:var(--wb-ink)}
    .wb-ai-selection{display:flex;align-items:baseline;justify-content:space-between;gap:5px;font-size:11px;overflow-wrap:anywhere}.wb-ai-selection span{min-width:0}
    .wb-ai-status{font-size:11px;line-height:1.4;color:var(--wb-muted);margin:2px 0}.wb-ai-status:empty{display:none}
    .wb-ai-result{margin-top:5px;padding:8px;border:1px solid var(--wb-edge);border-radius:5px;background:var(--wb-paper);color:var(--wb-ink);font-size:13px;overflow-wrap:anywhere}
    .wb-ai-answer>:first-child{margin-top:0}.wb-ai-answer>:last-child{margin-bottom:4px}.wb-ai-answer p{margin:4px 0}.wb-ai-result pre{white-space:pre-wrap;font:inherit;overflow-wrap:anywhere}.wb-ai-references summary{font-size:11px;color:var(--wb-accent);cursor:pointer}.wb-ai-confirm{border-inline-start:2px solid var(--wb-error);padding-inline-start:7px}
  `;
  document.head.append(style); return () => style.remove();
}
