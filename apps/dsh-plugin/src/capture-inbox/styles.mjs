export const captureInboxStyles = `
.tc-capture-inbox {--ci-bg:#f7f6f2;--ci-ink:#343936;--ci-muted:#606963;--ci-line:#d4d9d2;--ci-accent:#365d50;color:var(--ci-ink);background:var(--ci-bg);font:14px/1.6 system-ui,sans-serif;max-width:920px;width:100%;box-sizing:border-box;padding:16px;overflow-wrap:anywhere;container-type:inline-size;}
.tc-capture-inbox *{box-sizing:border-box;}
.tc-capture-inbox header,.tc-capture-inbox .ci-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}
.tc-capture-inbox header{justify-content:space-between;border-bottom:1px solid var(--ci-line);padding-bottom:10px;}
.tc-capture-inbox h2{font-size:16px;font-weight:600;margin:0;}
.tc-capture-inbox h3{font-size:14px;margin:12px 0 6px;}
.tc-capture-inbox button,.tc-capture-inbox input,.tc-capture-inbox textarea,.tc-capture-inbox select{font:inherit;color:inherit;}
.tc-capture-inbox button{background:transparent;border:1px solid var(--ci-line);border-radius:5px;padding:5px 10px;min-height:36px;cursor:pointer;}
.tc-capture-inbox button:disabled{opacity:.55;cursor:default;}
.tc-capture-inbox button.ci-primary{background:var(--ci-accent);color:#fff;border-color:var(--ci-accent);min-height:44px;}
.tc-capture-inbox :focus-visible{outline:2px solid var(--ci-accent);outline-offset:3px;}
.tc-capture-inbox textarea,.tc-capture-inbox input[type=search]{background:transparent;border:1px solid var(--ci-line);border-radius:5px;padding:10px;width:100%;min-width:0;}
.tc-capture-inbox textarea{resize:vertical;line-height:1.7;min-height:132px;}
.tc-capture-inbox label{display:block;}.tc-capture-inbox label.ci-check{display:flex;gap:6px;align-items:center;min-height:36px;}
.tc-capture-inbox input[type=checkbox]{min-width:18px;min-height:18px;accent-color:var(--ci-accent);}
.tc-capture-inbox .ci-capture{padding-top:12px;}.tc-capture-inbox .ci-capture label{margin-bottom:6px;}
.tc-capture-inbox .ci-note{color:var(--ci-muted);font-size:12px;margin:8px 0;white-space:pre-wrap;}
.tc-capture-inbox .ci-status{margin:10px 0;padding:8px 10px;border-left:3px solid var(--ci-accent);white-space:pre-wrap;}
.tc-capture-inbox .ci-search{margin:12px 0 8px;}
.tc-capture-inbox .ci-grid{display:grid;grid-template-columns:minmax(220px,1fr) minmax(220px,1.35fr);gap:18px;margin-top:12px;}
.tc-capture-inbox ul{list-style:none;padding:0;margin:0;max-height:55vh;overflow:auto;}
.tc-capture-inbox li{border-top:1px solid var(--ci-line);padding:8px 2px;}
.tc-capture-inbox .ci-row{display:grid;grid-template-columns:24px minmax(0,1fr);gap:6px;align-items:start;}
.tc-capture-inbox .ci-row button{border:0;text-align:left;width:100%;padding:2px 5px;white-space:pre-wrap;}
.tc-capture-inbox .ci-row button[aria-current=true]{background:#e6ece6;}
.tc-capture-inbox .ci-preview{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;}
.tc-capture-inbox time{display:block;color:var(--ci-muted);font-size:12px;}
.tc-capture-inbox .ci-body{white-space:pre-wrap;margin:8px 0;max-height:42vh;overflow:auto;}
.tc-capture-inbox details{margin-top:10px;}.tc-capture-inbox summary{cursor:pointer;min-height:30px;}
.tc-capture-inbox .ci-history{border-left:1px solid var(--ci-line);padding-left:10px;margin:8px 0;}
.tc-capture-inbox .ci-history pre{font:inherit;white-space:pre-wrap;max-height:18vh;overflow:auto;}
.tc-capture-inbox .ci-quote{margin-top:14px;}.tc-capture-inbox .ci-quote textarea{font-size:12px;}
@media(max-width:600px){.tc-capture-inbox{padding:12px;}.tc-capture-inbox .ci-grid{grid-template-columns:minmax(0,1fr);gap:12px;}.tc-capture-inbox ul{max-height:30vh;}.tc-capture-inbox button{min-height:44px;}.tc-capture-inbox .ci-tools{gap:6px;}}
@container(max-width:600px){.tc-capture-inbox .ci-grid{grid-template-columns:minmax(0,1fr);gap:12px;}.tc-capture-inbox ul{max-height:30vh;}.tc-capture-inbox button{min-height:44px;}.tc-capture-inbox .ci-tools{gap:6px;}}
@media(prefers-color-scheme:dark){.tc-capture-inbox{--ci-bg:#242925;--ci-ink:#e0e5df;--ci-muted:#b3bdb4;--ci-line:#535e55;--ci-accent:#95b6a5;}.tc-capture-inbox button.ci-primary{color:#202b24;}.tc-capture-inbox .ci-row button[aria-current=true]{background:#38483e;}}
@media(prefers-reduced-motion:reduce){.tc-capture-inbox *{animation:none!important;transition:none!important;scroll-behavior:auto!important;}}
`;
