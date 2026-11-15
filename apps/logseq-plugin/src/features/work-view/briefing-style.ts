export const briefingStyle=`
.work-briefing{--brief-muted:var(--ls-secondary-text-color,#6b7273);--brief-border:var(--ls-border-color,#dce2df);box-sizing:border-box;width:min(880px,calc(100vw - 48px));height:min(800px,calc(100vh - 64px));max-width:none;max-height:none;padding:0;border:1px solid var(--brief-border);border-radius:16px;background:var(--ls-primary-background-color,#fafbf9);color:var(--ls-primary-text-color,#26332e);box-shadow:0 24px 100px #0003;font:15px/1.85 system-ui,sans-serif;overflow:hidden}
.work-briefing::backdrop{background:#14231d66;backdrop-filter:blur(3px)}
.work-briefing[open]{display:flex;flex-direction:column}
.work-briefing *{box-sizing:border-box}
.work-briefing button{font:inherit;line-height:1.5;color:inherit;background:transparent;border:1px solid var(--brief-border);border-radius:7px;padding:6px 12px;cursor:pointer}
.work-briefing button:hover{background:var(--ls-secondary-background-color,#eef2ec)}
.work-briefing button:focus-visible,.work-briefing summary:focus-visible{outline:2px solid var(--ls-link-text-color,#487660);outline-offset:3px}
.work-briefing button:disabled{opacity:.35;cursor:default}
.brief-header,.brief-footer{display:flex;align-items:center;gap:12px;padding:16px 24px;flex:none}
.brief-header{border-bottom:1px solid var(--brief-border)}
.brief-header>span:first-child{font-size:13px;font-weight:600;letter-spacing:.08em}
.brief-navigation{margin-left:auto;display:flex;gap:10px;align-items:center}
.brief-counter{font-size:12px;color:var(--brief-muted);min-width:42px;text-align:center;font-variant-numeric:tabular-nums}
.brief-scroll{overflow:auto;overscroll-behavior:contain;flex:1;min-height:0;padding:34px 64px 48px;scrollbar-gutter:stable}
.work-briefing h1{font-size:27px;font-weight:650;line-height:1.4;letter-spacing:-.025em;margin:0 0 12px;overflow-wrap:anywhere}
.brief-meta{font-size:12px;color:var(--brief-muted);margin:0 0 26px}
.brief-meta time{font-variant-numeric:tabular-nums}
.brief-body{font-size:17px;line-height:1.95;overflow-wrap:anywhere}
.brief-paragraph{margin:0 0 24px}
.brief-markdown>*{margin:0 0 .6em}.brief-markdown>*:last-child{margin-bottom:0}
.brief-markdown strong{font-weight:650}
.brief-progress .brief-markdown strong{color:var(--ls-link-text-color,#397857)}
.brief-attention .brief-markdown strong{color:var(--ls-warning-text-color,#b07626)}
.brief-kind{display:inline-block;font-size:11px;line-height:1.6;color:var(--brief-muted);border-bottom:1px dotted currentColor;margin-bottom:6px}
.brief-citations{font-size:12px;color:var(--brief-muted);margin-top:7px;line-height:1.6}
.brief-citations summary{cursor:pointer;width:fit-content}
.brief-source{margin:12px 0;padding:12px 16px;border-left:2px solid var(--brief-border);font-size:14px;line-height:1.8;overflow-wrap:anywhere}
.brief-source button{font-size:12px;border:0;padding:4px 0;color:var(--ls-link-text-color,#487660)}
.brief-source pre{overflow:auto;white-space:pre-wrap}.brief-source table{display:block;overflow:auto}
.brief-notice{font-size:13px;line-height:1.7;color:var(--brief-muted);padding:12px 16px;border-left:2px solid var(--brief-border);margin-bottom:26px}
.brief-stale{border-color:var(--ls-warning-text-color,#b07626)}
.brief-followups{font-size:14px;border-top:1px solid var(--brief-border);padding-top:22px;margin-top:30px}
.brief-followups>p{font-size:12px;color:var(--brief-muted);margin:0 0 16px}
.brief-followups .brief-paragraph{margin-bottom:16px}
.brief-footer{border-top:1px solid var(--brief-border);font-size:13px;flex-wrap:wrap}
.brief-footer .brief-resume{margin-left:auto;background:var(--ls-link-text-color,#487660);color:var(--ls-primary-background-color,#fff);border-color:transparent}
.brief-footer .brief-resume:hover{filter:brightness(1.1);background:var(--ls-link-text-color,#487660)}
.brief-footer-message{width:100%;font-size:12px;line-height:1.6;color:var(--brief-muted)}
.brief-raw{margin-top:24px}.brief-raw[hidden]{display:none}.brief-raw>p{font-size:12px;color:var(--brief-muted)}
.work-briefing .brief-raw .brief-source{margin-left:calc(var(--depth,0) * 14px)}
@media(max-width:640px){.work-briefing{width:calc(100vw - 16px);height:calc(100dvh - 24px);border-radius:12px}.brief-header,.brief-footer{padding:12px 16px;gap:8px}.brief-scroll{padding:26px 24px 32px}.work-briefing h1{font-size:23px}.brief-body{font-size:16px}.brief-navigation{gap:6px}.work-briefing button{padding:6px 10px}}
`;
