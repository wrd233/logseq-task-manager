const workbenchTheme = `
--wx-bg:var(--dsw-alias-bg-base,light-dark(#ffffff,#171a1f));
--wx-surface:var(--dsw-alias-fill-tsp-secondary,light-dark(#f5f7fa,#22262e));
--wx-surface-2:var(--dsw-alias-fill-tertiary,light-dark(#eef2f7,#272c35));
--wx-line:var(--dsw-alias-border-l2,light-dark(#e3e7ed,#343b46));
--wx-line-strong:var(--dsw-alias-border-l3,light-dark(#cbd2dd,#4a5463));
--wx-text:var(--dsw-alias-label-primary,light-dark(#202833,#e6eaf0));
--wx-secondary:var(--dsw-alias-label-secondary,light-dark(#4b5565,#b7c1cf));
--wx-muted:var(--dsw-alias-label-tertiary,light-dark(#6b7687,#9aa6b8));
--wx-faint:var(--dsw-alias-label-quaternary,light-dark(#8a95a5,#7d8999));
--wx-hover:var(--dsw-alias-interactive-bg-hover,light-dark(#f2f5f9,#262b33));
--wx-active:var(--dsw-alias-interactive-bg-active,light-dark(#e9eef6,#2c333d));
--wx-accent:var(--dsw-alias-label-primary-bluish,light-dark(#2f5fbe,#93b7ff));
--wx-accent-soft:light-dark(#eaf1fe,#1d304e);
--wx-green:light-dark(#1c7a55,#6fd3a7);
--wx-green-soft:light-dark(#e8f7f0,#173b2d);
--wx-amber:light-dark(#956000,#e2b56a);
--wx-amber-soft:light-dark(#fff4e3,#3b2d17);
--wx-red:light-dark(#b23a3a,#ef8d8d);
--wx-red-soft:light-dark(#fdeeee,#3b2020);
`;

export const workbenchStyles = `
.wx-page{${workbenchTheme}display:flex;flex-direction:column;height:100%;min-height:0;color:var(--wx-text);background:var(--wx-bg);font:13px/1.55 var(--dsh-font-family-text,var(--dsh-font-family-text-default,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif));}
.wx-page *{box-sizing:border-box}
.wx-page button,.wx-page input,.wx-page select{font:inherit;color:inherit}
.wx-page button{cursor:pointer;background:none;border:1px solid transparent;border-radius:6px;padding:4px 7px}
.wx-page button:hover:not(:disabled){background:var(--wx-hover)}
.wx-page button:disabled{opacity:.4;cursor:default}
.wx-page :is(button,a,input,summary):focus-visible{outline:2px solid var(--wx-accent);outline-offset:2px}
.wx-head{flex:0 0 auto;padding:15px 18px 9px}
.wx-head-top{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:22px}
.wx-eyebrow{display:flex;align-items:center;gap:6px;font-size:10px;font-weight:600;letter-spacing:.08em;color:var(--wx-muted);white-space:nowrap}
.wx-live-dot{width:5px;height:5px;border-radius:50%;background:var(--wx-line-strong);flex:none}
.wx-live-dot.is-on{background:var(--wx-green);box-shadow:0 0 0 2px color-mix(in srgb,var(--wx-green) 15%,transparent)}
.wx-head-actions{display:flex;align-items:center;gap:1px;flex:none}
.wx-icon{display:inline-grid;place-items:center;width:26px;height:26px;padding:0!important;color:var(--wx-muted);font-size:14px;line-height:1;text-decoration:none;background:none;border:1px solid transparent;border-radius:6px}
.wx-icon:hover{color:var(--wx-text);background:var(--wx-hover)}
.wx-menu-wrap{position:relative}
.wx-menu-pop{position:absolute;right:0;top:29px;z-index:30;min-width:164px;padding:4px;background:var(--wx-bg);border:1px solid var(--wx-line);border-radius:8px;box-shadow:0 10px 30px #00000024;display:flex;flex-direction:column;gap:1px}
.wx-menu-pop button{text-align:left;width:100%;font-size:12px;padding:7px 9px;white-space:nowrap}
.wx-confirm{display:flex;flex-direction:column;gap:5px;margin:3px 2px 2px;padding:7px;border-top:1px solid var(--wx-line);font-size:10px;line-height:1.55;color:var(--wx-muted);white-space:normal;max-width:220px}
.wx-confirm>div{display:flex;gap:4px}
.wx-confirm button{font-size:10.5px!important;padding:3px 7px!important;border:1px solid var(--wx-line)!important;border-radius:5px!important;width:auto!important;white-space:nowrap!important}
.wx-title-row{display:flex;align-items:center;flex-wrap:wrap;gap:7px;margin-top:7px;min-width:0}
.wx-title-row h1{font-size:20px;line-height:1.25;font-weight:650;letter-spacing:-.025em;margin:0;min-width:0;overflow-wrap:anywhere}
.wx-kind{font-size:9.5px;line-height:16px;font-weight:550;color:var(--wx-accent);background:var(--wx-accent-soft);border:1px solid color-mix(in srgb,var(--wx-accent) 22%,transparent);border-radius:4px;padding:0 5px;white-space:nowrap}
.wx-status{font-size:9px;line-height:15px;font-weight:650;letter-spacing:.05em;border-radius:4px;padding:0 4px;border:1px solid var(--wx-line);color:var(--wx-muted);white-space:nowrap}
.wx-status.is-doing{color:var(--wx-accent);border-color:color-mix(in srgb,var(--wx-accent) 32%,var(--wx-line));background:var(--wx-accent-soft)}
.wx-status.is-done{color:var(--wx-green);border-color:color-mix(in srgb,var(--wx-green) 30%,var(--wx-line));background:var(--wx-green-soft)}
.wx-status.is-waiting,.wx-status.is-later{color:var(--wx-amber);border-color:color-mix(in srgb,var(--wx-amber) 30%,var(--wx-line));background:var(--wx-amber-soft)}
.wx-status.is-canceled{text-decoration:line-through;opacity:.65}
.wx-path{display:flex;align-items:center;flex-wrap:wrap;gap:3px;margin-top:6px;font-size:11px;color:var(--wx-muted);max-width:100%}
.wx-path button{font-size:11px;color:var(--wx-muted);padding:1px 3px;border-radius:4px;max-width:26ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wx-path button:hover{color:var(--wx-text)}
.wx-path-current{color:var(--wx-secondary);max-width:34ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wx-path-sep{opacity:.55}
.wx-back{font-size:13px!important;line-height:1!important;padding:1px 4px!important;color:var(--wx-muted)!important}
.wx-subline{display:flex;align-items:center;flex-wrap:wrap;gap:5px;margin-top:4px;font-size:10.5px;color:var(--wx-muted)}
.wx-subline-sep{opacity:.5}
.wx-modes{display:flex;align-items:center;gap:7px;flex:0 0 auto;padding:1px 18px 8px;border-bottom:1px solid var(--wx-line);min-width:0;flex-wrap:wrap}
.wx-seg{display:flex;align-items:center;gap:1px;padding:2px;background:var(--wx-surface);border-radius:7px}
.wx-seg button{font-size:11.5px;line-height:1.5;padding:2px 10px;border-radius:5px;color:var(--wx-muted);border:0}
.wx-seg button[aria-pressed=true]{color:var(--wx-text);background:var(--wx-bg);font-weight:600;box-shadow:0 1px 2px #00000018}
.wx-modes-spacer{flex:1}
.wx-text{font-size:11px;color:var(--wx-muted);padding:2px 4px;border:0;white-space:nowrap}
.wx-text:hover{color:var(--wx-text)!important}
.wx-notice{display:flex;align-items:flex-start;gap:8px;margin:8px 18px 0;padding:6px 9px;border-radius:6px;background:var(--wx-accent-soft);color:var(--wx-text);font-size:11.5px;line-height:1.5;overflow-wrap:anywhere;flex:0 0 auto}
.wx-notice.is-error{background:var(--wx-red-soft);color:var(--wx-red)}
.wx-notice.is-ok{background:var(--wx-green-soft);color:var(--wx-green)}
.wx-notice span{flex:1;min-width:0}
.wx-notice button{width:18px;height:18px;padding:0;line-height:1;font-size:13px;color:inherit;opacity:.7;flex:none}
.wx-scroll{position:relative;flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;padding:14px 18px 40px}
.wx-structure,.wx-reader{max-width:820px;margin:0 auto}
.wx-section-head{display:flex;align-items:baseline;gap:7px;margin:2px 0 4px;font-size:11px;font-weight:600;color:var(--wx-secondary)}
.wx-section-count{font-size:10px;font-weight:400;color:var(--wx-muted)}
.wx-child-list{list-style:none;margin:2px 0 0;padding:0;border-top:1px solid var(--wx-line)}
.wx-child-list li{border-bottom:1px solid var(--wx-line)}
.wx-child-row{display:flex;align-items:center;gap:8px;width:100%;text-align:left;padding:10px 6px!important;border:0!important;border-radius:0!important;min-width:0}
.wx-child-row:hover{background:var(--wx-hover)!important}
.wx-kind.is-task{color:var(--wx-green);background:var(--wx-green-soft);border-color:color-mix(in srgb,var(--wx-green) 24%,transparent)}
.wx-kind.is-mini_project{color:var(--wx-amber);background:var(--wx-amber-soft);border-color:color-mix(in srgb,var(--wx-amber) 24%,transparent)}
.wx-child-copy{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.wx-child-title{font-size:12.5px;line-height:1.45;font-weight:550;color:var(--wx-text);overflow-wrap:anywhere}
.wx-child-preview{font-size:10.5px;line-height:1.45;color:var(--wx-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wx-child-arrow{flex:none;color:var(--wx-faint);font-size:15px;line-height:1;margin-left:2px}
.wx-hint{font-size:10.5px;color:var(--wx-muted);line-height:1.6;margin:12px 0 0}
.wx-reader{position:relative}
.wx-reader-tools{display:flex;align-items:center;gap:3px;margin:0 0 5px;color:var(--wx-muted);font-size:10.5px}
.wx-reader-count{margin-right:auto;white-space:nowrap}
.wx-reader-tools button{font-size:10.5px;color:var(--wx-muted);padding:2px 4px;border:0;white-space:nowrap}
.wx-reader-body{min-width:0}
.wx-block{position:relative;min-width:0}
.wx-block-row{display:flex;gap:1px;min-width:0}
.wx-block-gutter{flex:0 0 16px;display:flex;justify-content:center;padding-top:1px}
.wx-fold{width:16px;height:18px;padding:0!important;border:0!important;border-radius:4px!important;color:var(--wx-faint);font-size:10px;line-height:18px;opacity:.55}
.wx-block:hover>.wx-block-row>.wx-block-gutter>.wx-fold,.wx-block:focus-within>.wx-block-row>.wx-block-gutter>.wx-fold{opacity:1}
.wx-leaf{display:block;width:3px;height:3px;margin-top:9px;border-radius:50%;background:var(--wx-line-strong);opacity:.55}
.wx-block-main{flex:1;min-width:0;padding:1px 0 2px;position:relative}
.wx-block-head{display:flex;align-items:center;gap:4px;flex-wrap:wrap;min-height:18px}
.wx-semantic{font-size:9.5px;line-height:15px;border-radius:4px;padding:0 5px;border:1px solid transparent;font-weight:600;white-space:nowrap}
.wx-semantic.is-note{color:var(--wx-muted);background:var(--wx-surface-2);border-color:var(--wx-line)}
.wx-semantic.is-conclusion{color:var(--wx-green);background:var(--wx-green-soft);border-color:color-mix(in srgb,var(--wx-green) 24%,transparent)}
.wx-semantic.is-pending{color:var(--wx-amber);background:var(--wx-amber-soft);border-color:color-mix(in srgb,var(--wx-amber) 24%,transparent)}
.wx-semantic.is-risk{color:var(--wx-red);background:var(--wx-red-soft);border-color:color-mix(in srgb,var(--wx-red) 24%,transparent)}
.wx-type{font-size:9px;line-height:15px;font-weight:600;letter-spacing:.03em;color:var(--wx-accent);border:1px solid color-mix(in srgb,var(--wx-accent) 20%,transparent);background:var(--wx-accent-soft);border-radius:4px;padding:0 4px;white-space:nowrap}
.wx-focus-chip{font-size:9px;line-height:15px;color:var(--wx-accent);font-weight:600;white-space:nowrap}
.wx-unavailable{font-size:9.5px;color:var(--wx-amber);white-space:nowrap}
.wx-block-actions{position:absolute;right:0;top:-1px;display:flex;align-items:center;gap:0;padding-left:10px;background:linear-gradient(to right,transparent,var(--wx-bg) 20%);opacity:0;pointer-events:none;transition:opacity .12s ease}
.wx-block:hover>.wx-block-row>.wx-block-main>.wx-block-head>.wx-block-actions,.wx-block:focus-within>.wx-block-row>.wx-block-main>.wx-block-head>.wx-block-actions{opacity:1;pointer-events:auto}
.wx-block:has(.wx-block:hover)>.wx-block-row>.wx-block-main>.wx-block-head>.wx-block-actions,.wx-block:has(.wx-block:focus-within)>.wx-block-row>.wx-block-main>.wx-block-head>.wx-block-actions{opacity:0;pointer-events:none}
.wx-block-actions button,.wx-block-actions a{display:inline-grid;place-items:center;width:20px;height:20px;padding:0;border:0;border-radius:4px;color:var(--wx-muted);font-size:12px;line-height:1;text-decoration:none;background:var(--wx-bg)}
.wx-block-actions button:hover,.wx-block-actions a:hover{color:var(--wx-accent);background:var(--wx-hover)}
.wx-children{margin-left:7px;padding-left:14px;border-left:1px solid var(--wx-line);min-width:0}
.wx-collapsed-hint{display:inline-block;margin:1px 0 2px;padding:1px 4px!important;border:1px solid var(--wx-line)!important;border-radius:4px!important;font-size:9.5px;color:var(--wx-muted);line-height:1.4}
.wx-collapsed-hint:hover{color:var(--wx-accent)!important;border-color:color-mix(in srgb,var(--wx-accent) 30%,var(--wx-line))!important}
.wx-block.is-focus>.wx-block-row{background:color-mix(in srgb,var(--wx-accent-soft) 55%,transparent);border-radius:6px;margin:0 -6px;padding:0 6px}
.wx-block.is-focus>.wx-block-row .wx-block-actions{background:linear-gradient(to right,transparent,color-mix(in srgb,var(--wx-accent-soft) 55%,var(--wx-bg)) 20%)}
.wx-props{display:flex;flex-wrap:wrap;gap:3px;margin:3px 0 2px;font-size:10px;line-height:1.5;color:var(--wx-muted)}
.wx-prop{display:inline-flex;align-items:baseline;gap:4px;max-width:100%;background:var(--wx-surface);border:1px solid var(--wx-line);border-radius:4px;padding:0 5px;overflow:hidden}
.wx-prop-name{color:var(--wx-faint);white-space:nowrap}
.wx-prop-value{color:var(--wx-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:30ch}
.wx-md{font-size:13px;line-height:1.72;color:var(--wx-text);overflow-wrap:anywhere;min-width:0}
.wx-md p{margin:0 0 5px;white-space:pre-wrap}
.wx-md p:last-child{margin-bottom:0}
.wx-md strong{font-weight:650}
.wx-md em{font-style:italic}
.wx-md a{color:var(--wx-accent);text-decoration:none;border-bottom:1px solid color-mix(in srgb,var(--wx-accent) 25%,transparent)}
.wx-md a:hover{border-bottom-color:var(--wx-accent)}
.wx-md code{font:12px/1.6 var(--dsh-font-family-code,var(--dsh-font-family-code-default,ui-monospace,SFMono-Regular,Menlo,monospace));background:var(--wx-surface);border:1px solid var(--wx-line);border-radius:4px;padding:0 4px}
.wx-md pre{margin:5px 0 7px;padding:8px 10px;background:var(--wx-surface);border:1px solid var(--wx-line);border-radius:6px;overflow:auto;max-width:100%}
.wx-md pre code{background:none;border:0;padding:0;white-space:pre-wrap;overflow-wrap:anywhere;font-size:11.5px}
.wx-md ul,.wx-md ol{margin:3px 0 6px;padding-left:18px}
.wx-md li{margin:1px 0}
.wx-md li>p{margin:0}
.wx-md blockquote{margin:5px 0 7px;padding:0 0 0 10px;border-left:2px solid var(--wx-line);color:var(--wx-secondary)}
.wx-md hr{border:0;border-top:1px solid var(--wx-line);margin:8px 0}
.wx-md-heading{font-size:13.5px;font-weight:650;line-height:1.5;margin:10px 0 5px}
.wx-md table{width:100%;border-collapse:collapse;font-size:12px;margin:6px 0 8px;display:block;overflow-x:auto}
.wx-md th,.wx-md td{border-bottom:1px solid var(--wx-line);padding:4px 7px;text-align:left;vertical-align:top;min-width:60px}
.wx-md th{font-weight:600;color:var(--wx-secondary);background:var(--wx-surface)}
.wx-md-page{display:inline;color:var(--wx-accent);background:var(--wx-accent-soft);border-radius:3px;padding:0 3px;font-size:12.5px}
.wx-md-image{color:var(--wx-muted);background:var(--wx-surface);border-radius:3px;padding:0 3px;font-size:12px}
.wx-md-html{white-space:pre-wrap}
.wx-md-link{color:var(--wx-muted)}
.wx-md-code{white-space:pre-wrap}
.wx-md-plain{white-space:pre-wrap}
.wx-md-empty{white-space:pre-wrap}
.wx-md input[type=checkbox]{margin:0 4px 0 0;accent-color:var(--wx-accent)}
.wx-select-action{position:absolute;z-index:12;transform:translateX(-50%);background:var(--wx-accent);color:#fff;border:0;border-radius:6px;padding:5px 10px;font-size:11.5px;line-height:1.4;font-weight:550;box-shadow:0 4px 16px #0003;white-space:nowrap}
.wx-select-action:hover{background:color-mix(in srgb,var(--wx-accent) 88%,#000)!important}
.wx-tray{flex:0 0 auto;border-top:1px solid var(--wx-line);background:var(--wx-bg);padding:7px 14px 9px;display:flex;flex-direction:column;gap:4px}
.wx-tray-head{display:flex;align-items:center;gap:7px;font-size:10.5px;color:var(--wx-muted);min-width:0}
.wx-tray-head strong{font-size:11px;color:var(--wx-text);font-weight:600}
.wx-tray-note{flex:1;text-align:right;white-space:nowrap}
.wx-warn{color:var(--wx-amber);font-size:10px;white-space:nowrap}
.wx-tray-list{display:flex;align-items:stretch;gap:4px;overflow-x:auto;padding-bottom:1px;scrollbar-width:thin}
.wx-ref-chip{display:inline-flex;align-items:center;gap:4px;flex:0 0 auto;max-width:250px;border:1px solid var(--wx-line);background:var(--wx-surface);border-radius:5px;padding:1px 3px 1px 5px;font-size:10.5px;line-height:1.5;color:var(--wx-secondary)}
.wx-ref-chip.is-stale{border-color:color-mix(in srgb,var(--wx-amber) 45%,var(--wx-line));background:var(--wx-amber-soft)}
.wx-ref-kind{font-size:8.5px;color:var(--wx-faint);border-right:1px solid var(--wx-line);padding-right:4px;white-space:nowrap}
.wx-ref-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px}
.wx-ref-chip button{width:15px;height:15px;padding:0;line-height:1;font-size:11px;color:var(--wx-faint);border:0;flex:none}
.wx-ref-chip button:hover{color:var(--wx-red);background:transparent}
.wx-tray-actions{display:flex;justify-content:flex-end}
.wx-button{display:inline-flex;align-items:center;justify-content:center;gap:4px;border:1px solid var(--wx-line);border-radius:6px;padding:4px 10px;font-size:11.5px;line-height:1.6;color:var(--wx-text);background:var(--wx-bg);text-decoration:none;white-space:nowrap;cursor:pointer}
.wx-button:hover{background:var(--wx-hover);border-color:var(--wx-line-strong)}
.wx-button-primary{background:var(--wx-accent);border-color:var(--wx-accent);color:light-dark(#fff,#081428);font-weight:600;padding:5px 12px}
.wx-button-primary:hover{background:color-mix(in srgb,var(--wx-accent) 88%,#000);border-color:var(--wx-accent)}
.wx-button-primary:disabled{background:var(--wx-accent-soft);color:var(--wx-muted);border-color:var(--wx-line)}
.wx-recovery{display:flex;align-items:flex-start;gap:9px;flex-wrap:wrap;margin:11px 18px 0;padding:10px 12px;border:1px solid var(--wx-line);border-radius:9px;background:var(--wx-surface);flex:0 0 auto}
.wx-recovery-dot{width:7px;height:7px;border-radius:50%;background:var(--wx-amber);margin-top:6px;flex:none}
.wx-recovery-copy{flex:1;min-width:180px}
.wx-recovery-copy strong{font-size:12.5px;font-weight:600;display:block}
.wx-recovery-copy p{font-size:11px;line-height:1.65;color:var(--wx-muted);margin:2px 0 0}
.wx-recovery-actions{display:flex;align-items:center;flex-wrap:wrap;gap:3px;margin-left:auto}
.wx-recovery-actions a{font-size:11px;color:var(--wx-muted);text-decoration:none;padding:2px 4px;border-radius:4px}
.wx-recovery-actions a:hover{color:var(--wx-text);background:var(--wx-hover)}
.wx-onboarding{max-width:470px;margin:7vh auto 0;padding:0 20px 40px;text-align:left}
.wx-onboarding-mark{font-size:26px;line-height:1;color:var(--wx-accent);opacity:.8}
.wx-onboarding h2{font-size:17px;font-weight:600;letter-spacing:-.02em;line-height:1.4;margin:13px 0 6px}
.wx-onboarding p{font-size:11.5px;line-height:1.75;color:var(--wx-muted);margin:0 0 14px;max-width:44ch}
.wx-onboarding-actions{display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:10px}
.wx-onboarding-path{font-size:10px;color:var(--wx-faint);margin:0 0 12px!important;font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wx-onboarding-more{border-top:1px solid var(--wx-line);padding-top:8px;margin-top:12px}
.wx-onboarding-more summary{font-size:10.5px;color:var(--wx-muted);cursor:pointer;padding:2px 0}
.wx-bind{display:flex;flex-direction:column;gap:6px;margin-top:8px}
.wx-bind label{display:flex;flex-direction:column;gap:4px;font-size:10.5px;color:var(--wx-muted)}
.wx-bind input,.wx-inline-bind input{width:100%;border:1px solid var(--wx-line);border-radius:6px;background:var(--wx-bg);color:var(--wx-text);padding:5px 7px;font-size:11.5px;min-width:0}
.wx-bind button{align-self:flex-start}
.wx-bind p{font-size:10px;color:var(--wx-faint);margin:0!important}
.wx-inline-bind{display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin:8px 18px 0;padding:8px 10px;border:1px solid var(--wx-line);border-radius:7px;background:var(--wx-surface);flex:0 0 auto}
.wx-inline-bind input{flex:1;min-width:160px}
.wx-inline-error{font-size:10.5px;line-height:1.55;color:var(--wx-red);margin:6px 18px 0;overflow-wrap:anywhere}
.wx-inline-error button{color:var(--wx-red);text-decoration:underline;font-size:10.5px;padding:0 2px;border:0}
.wx-empty{padding:38px 20px 44px;text-align:center;color:var(--wx-muted);font-size:12.5px;line-height:1.7;max-width:480px;margin:0 auto}
.wx-empty p{margin:0 0 10px}
.wx-empty-line{font-size:11.5px;color:var(--wx-muted);padding:10px 0}
.wx-skeleton{padding:18px 0;display:flex;flex-direction:column;gap:9px}
.wx-skeleton span{display:block;height:11px;border-radius:4px;background:linear-gradient(90deg,var(--wx-surface) 20%,var(--wx-surface-2) 40%,var(--wx-surface) 60%);background-size:220% 100%;animation:wx-shimmer 1.6s ease infinite}
.wx-skeleton span:nth-child(1){width:46%}.wx-skeleton span:nth-child(2){width:78%}.wx-skeleton span:nth-child(3){width:62%}.wx-skeleton span:nth-child(4){width:38%}
@keyframes wx-shimmer{0%{background-position:120% 0}100%{background-position:-120% 0}}
.wx-toast{position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:80;display:flex;align-items:center;gap:8px;max-width:min(520px,calc(100vw - 32px));padding:8px 11px;border:1px solid var(--dsw-alias-border-l2,light-dark(#e3e7ed,#343b46));border-radius:9px;background:var(--dsw-alias-bg-overlay,light-dark(#fff,#252a33));color:var(--dsw-alias-label-primary,light-dark(#202833,#e6eaf0));font:11.5px/1.55 var(--dsh-font-family-text,var(--dsh-font-family-text-default,system-ui,sans-serif));box-shadow:0 8px 30px #00000030}
.wx-toast.is-error{border-color:color-mix(in srgb,#b23a3a 35%,transparent)}
.wx-toast span{flex:1;min-width:0;overflow-wrap:anywhere}
.wx-toast button{font:inherit;border:1px solid transparent;background:none;color:inherit;padding:2px 5px;border-radius:4px;cursor:pointer}
.wx-toast button:hover{background:light-dark(#0000000a,#ffffff12)}
@media(hover:none){.wx-block-actions{opacity:1;pointer-events:auto;position:static;background:none;padding-left:0;margin-left:auto}}
@media(max-width:520px){.wx-head{padding:12px 12px 8px}.wx-title-row h1{font-size:18px}.wx-modes{padding:1px 12px 7px}.wx-scroll{padding:12px 12px 34px}.wx-notice{margin-left:12px;margin-right:12px}.wx-recovery{margin-left:12px;margin-right:12px}.wx-inline-bind{margin-left:12px;margin-right:12px}.wx-tray{padding:6px 10px 8px}.wx-tray-note{display:none}.wx-ref-text{max-width:140px}.wx-onboarding{margin-top:4vh;padding-left:14px;padding-right:14px}.wx-reader-tools{gap:1px}}
@media(prefers-reduced-motion:reduce){.wx-page *{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
`;
