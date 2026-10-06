/** Small shared visual vocabulary; selectors stay within plugin-owned surfaces. */
export const workbenchTokens = `
:where(.wb-panel,#workbench-navigation,.wb-dialog,.wb-material-capture){
 --wb-bg:#efeeea;--wb-paper:#faf9f6;--wb-soft:#e9eee9;--wb-ink:#29332f;--wb-muted:#656f6a;
 --wb-edge:#d8dfd8;--wb-accent:#376e60;--wb-on-accent:#fff;--wb-focus:#367968;--wb-error:#9d4938;
 --wb-attention:#805b24;--wb-shadow:0 12px 38px #26352e24;--wb-backdrop:#15241c55;
 --ls-primary-background-color:var(--wb-paper);--ls-secondary-background-color:var(--wb-soft);
 --ls-primary-text-color:var(--wb-ink);--ls-secondary-text-color:var(--wb-muted);--ls-border-color:var(--wb-edge);--ls-link-text-color:var(--wb-accent);
 color-scheme:light;
}
:where(html[data-wb-theme=dark],html[data-theme=dark],html.dark,body[data-theme=dark],body.dark) :where(.wb-panel,#workbench-navigation,.wb-dialog,.wb-material-capture){
 --wb-bg:#202825;--wb-paper:#27312d;--wb-soft:#303f38;--wb-ink:#e3e8e3;--wb-muted:#b0bcb5;
 --wb-edge:#43534a;--wb-accent:#91c7b3;--wb-on-accent:#1e2d25;--wb-focus:#a4d8c1;--wb-error:#f0ad97;
 --wb-attention:#e1c18a;--wb-shadow:0 12px 38px #0005;--wb-backdrop:#09130f88;color-scheme:dark;
}`;

export const workbenchControls = `
:where(.wb-panel,#workbench-navigation,.wb-dialog,.wb-material-capture) button{font:inherit;color:inherit;cursor:pointer;border:1px solid transparent;border-radius:7px;padding:5px 10px;min-height:30px;background:transparent;overflow-wrap:anywhere}
:where(.wb-panel,#workbench-navigation,.wb-dialog,.wb-material-capture) button:hover{background:var(--wb-soft)}
:where(.wb-panel,#workbench-navigation,.wb-dialog,.wb-material-capture) .wb-primary{background:var(--wb-accent);color:var(--wb-on-accent);font-weight:600}
:where(.wb-panel,#workbench-navigation,.wb-dialog,.wb-material-capture) .wb-primary:hover{filter:brightness(.95);background:var(--wb-accent)}
:where(.wb-panel,#workbench-navigation,.wb-dialog,.wb-material-capture) .wb-danger{color:var(--wb-error)}
:where(.wb-panel,#workbench-navigation,.wb-dialog,.wb-material-capture) :is(input,textarea,select){font:inherit;color:var(--wb-ink);background:var(--wb-paper);border:1px solid var(--wb-edge);border-radius:6px;padding:7px 9px;box-sizing:border-box;max-width:100%}
:where(.wb-panel,#workbench-navigation,.wb-dialog,.wb-material-capture) :is(button,summary,input,textarea,select,a):focus-visible{outline:2px solid var(--wb-focus);outline-offset:2px}
:where(.wb-panel,#workbench-navigation,.wb-dialog,.wb-material-capture) button:disabled{opacity:.5;cursor:default}
:where(.wb-panel,.wb-dialog,.wb-material-capture) .wb-error{color:var(--wb-error);overflow-wrap:anywhere}
:where(.wb-panel,.wb-dialog,.wb-material-capture) [hidden]{display:none!important}
.wb-dialog,.wb-material-capture{box-sizing:border-box;width:min(440px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;border:1px solid var(--wb-edge);border-radius:12px;padding:22px;color:var(--wb-ink);background:var(--wb-paper);font:14px/1.65 system-ui;box-shadow:var(--wb-shadow)}
.wb-dialog::backdrop,.wb-material-capture::backdrop{background:var(--wb-backdrop)}
:where(.wb-dialog,.wb-material-capture) :is(h2,h3){font-size:18px;line-height:1.5;margin:0 0 8px}
:where(.wb-dialog,.wb-material-capture) p{margin:8px 0;overflow-wrap:anywhere}
:where(.wb-dialog,.wb-material-capture) label{display:block;margin:14px 0}
:where(.wb-dialog,.wb-material-capture) :is(input,textarea){display:block;width:100%;margin-top:6px}
:where(.wb-dialog,.wb-material-capture) footer{display:flex;justify-content:flex-end;gap:8px;margin-top:18px;flex-wrap:wrap}
`;

export const workbenchShellStyle = `${workbenchTokens}${workbenchControls}
html,body{margin:0;height:100%;overflow:hidden}
#workbench-navigation{height:32px;display:flex;justify-content:space-between;gap:4px;align-items:center;padding:0 14px;background:var(--wb-bg);box-sizing:border-box;font:12px system-ui;color:var(--wb-muted)}
#workbench-navigation button{min-height:28px;padding:3px 8px}
[data-task-copilot-daily-panel]{height:calc(100% - 32px)!important}
.wb-panel{height:calc(100% - 32px);min-width:0;display:flex;flex-direction:column;color:var(--wb-ink);background:var(--wb-paper);font:14px/1.65 system-ui;box-sizing:border-box}
.wb-panel[hidden]{display:none!important}.wb-heading{padding:9px 16px;flex:none;display:flex;flex-wrap:wrap;gap:8px;align-items:center;background:var(--wb-paper)}.wb-heading strong{flex:1;min-width:0;font-size:15px;overflow-wrap:anywhere}
.wb-scroll{overflow:auto;flex:1;min-height:0;min-width:0;padding:14px 18px 28px;scrollbar-gutter:stable}
.wb-status{padding:7px 16px;color:var(--wb-muted);background:var(--wb-soft);font-size:13px;overflow-wrap:anywhere}.wb-status:empty{display:none}
.wb-work-shell{flex:none;padding:12px 16px 0;background:var(--wb-bg)}.wb-work-line{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.wb-work-identity{flex:1;min-width:150px;overflow-wrap:anywhere}.wb-work-title{display:block;font-size:18px;font-weight:650;line-height:1.5}.wb-work-kind{font-size:12px;color:var(--wb-muted)}.wb-work-line>button,.wb-work-line>.wb-menu>summary{white-space:nowrap}
.wb-content-navigation{display:flex;gap:14px;align-items:center;margin-top:8px;min-height:36px;flex-wrap:wrap}.wb-content-navigation button{border:0;border-bottom:2px solid transparent;border-radius:0;padding:6px 0}.wb-content-navigation button[aria-current=true]{border-bottom-color:var(--wb-accent);color:var(--wb-accent);font-weight:650}.wb-review-entry{margin-left:auto;font-size:12px!important;color:var(--wb-muted)!important}.wb-attention:before{content:'●';font-size:8px;margin-right:5px;color:var(--wb-attention)}.wb-work-notice{padding:7px 0 9px;font-size:13px;color:var(--wb-muted)}
.wb-menu{flex:none}.wb-menu>summary{cursor:pointer;list-style:none;font-size:13px;padding:5px 7px;border-radius:7px;min-height:30px;box-sizing:border-box}.wb-menu>summary::-webkit-details-marker{display:none}.wb-menu>summary:after{content:' ▾';color:var(--wb-muted)}.wb-menu[open]>summary{background:var(--wb-soft)}
.wb-menu:not([open])>.wb-menu-content{display:none}.wb-menu-content{position:fixed;z-index:100;width:264px;max-width:calc(100vw - 24px);overflow:auto;padding:6px;border:1px solid var(--wb-edge);border-radius:9px;background:var(--wb-paper);box-shadow:var(--wb-shadow);box-sizing:border-box;color:var(--wb-ink);font-size:13px}
.wb-menu-content button{display:block;width:100%;text-align:left;white-space:normal;padding:7px 9px}.wb-menu-content small{display:block;font-size:12px;color:var(--wb-muted);font-weight:400;line-height:1.6}.wb-menu-group>summary{font-size:13px;padding:7px 9px;cursor:pointer}.wb-menu-context{display:block;width:100%;font-size:12px;overflow-wrap:anywhere;color:var(--wb-muted);padding:5px 8px}
.wb-row{margin-left:calc(min(var(--depth),8)*12px);padding:6px 2px;display:grid;grid-template-columns:18px 18px minmax(0,1fr) 30px;gap:4px;align-items:start;overflow-wrap:anywhere}.wb-row:focus-visible{outline:2px solid var(--wb-focus);outline-offset:2px}.wb-row[data-display=quiet]{color:var(--wb-muted)}.wb-row[data-display=emphasis] .wb-body{font-weight:600}.wb-row .wb-body p{margin:0 0 4px}.wb-row .wb-body pre{overflow:auto;white-space:pre}.wb-row .wb-body table{display:block;max-width:100%;overflow:auto;border-collapse:collapse}.wb-row :is(td,th){border:1px solid var(--wb-edge);padding:4px 8px}.wb-row[data-display=compact] .wb-body:not(.expanded){display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden}.wb-body{min-width:0}.wb-body a,.wb-reading a{color:var(--wb-accent);overflow-wrap:anywhere}
.wb-row>.wb-grip,.wb-row>button{border:0;padding:0;min-height:30px}.wb-grip{touch-action:none;cursor:grab!important}.wb-row-menu{grid-column:4;grid-row:1}.wb-row-menu>summary{list-style:none;text-align:center;cursor:pointer;min-height:30px;border-radius:6px;color:var(--wb-muted)}.wb-row-menu>summary::-webkit-details-marker{display:none}.wb-row-menu>summary:after{content:none}.wb-row-menu[open]>summary{background:var(--wb-soft)}.wb-controls select{width:100%}.wb-drop{outline:2px solid var(--wb-focus)}
.wb-root-title-in-heading,.wb-root-heading-row{display:none}.wb-empty{max-width:34em;margin:24px auto;padding:0 12px}.wb-empty h2{font-size:18px;margin:0 0 8px}.wb-empty p{margin:6px 0 12px}.wb-review-host{flex:none;max-height:42%;overflow:auto;background:var(--wb-soft)}.wb-review-host>.wb-stage-bar{font-size:13px}.wb-review-host .wb-collaboration-entry{display:none}
.wb-materials-in-work .wb-material-return,.wb-materials-in-work .wb-material-close,.wb-materials-in-work .wb-material-work{display:none}.wb-materials-in-work .wb-heading>strong{display:none}.wb-material{display:block;width:100%;text-align:left}.wb-material small{display:block;color:var(--wb-muted);white-space:normal;overflow-wrap:anywhere}.wb-editor{flex:1;min-height:0;overflow:auto}.wb-conflict{padding:12px 16px;background:var(--wb-soft);border-left:3px solid var(--wb-attention)}.wb-reading{font-size:15px;line-height:1.8;overflow-wrap:anywhere}.wb-reading pre{overflow:auto;background:var(--wb-soft);padding:10px;border-radius:7px}.wb-reading img{max-width:100%}.wb-reading table{display:block;max-width:100%;overflow:auto;border-collapse:collapse}.wb-reading :is(td,th){border:1px solid var(--wb-edge);padding:4px 8px}
.wb-material-form{display:flex;flex-wrap:wrap;gap:8px}.wb-material-form label,.wb-material-form small{width:100%}.wb-material-form :is(input,textarea){display:block;width:100%;margin-top:6px}
@media(max-width:480px){.wb-work-title{font-size:17px}.wb-work-identity{flex-basis:100%;min-width:0}.wb-work-line{gap:6px}.wb-work-line>.wb-menu{margin-left:auto}.wb-content-navigation{gap:12px}.wb-review-host{max-height:38%}.wb-scroll{padding:12px 14px 24px}}
`;
