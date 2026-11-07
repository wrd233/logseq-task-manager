import { historyStyles as graphStyles } from '../structure-view/styles.mjs';

const workbenchStyles = `
.sh-workbench{--sh-bg:light-dark(#ffffff,#171a1f);--sh-panel:light-dark(#f6f7f9,#20242b);--sh-panel-2:light-dark(#eef1f5,#272c35);--sh-line:light-dark(#e3e7ed,#343b46);--sh-line-strong:light-dark(#cbd2dd,#4a5463);--sh-text:light-dark(#202833,#e6eaf0);--sh-muted:light-dark(#6b7687,#9aa6b8);--sh-accent:light-dark(#2f5fbe,#93b7ff);--sh-accent-soft:light-dark(#eaf1fe,#1d304e);--sh-add:light-dark(#1c7a55,#6fd3a7);--sh-add-soft:light-dark(#e8f7f0,#173b2d);--sh-mod:light-dark(#956000,#e2b56a);--sh-mod-soft:light-dark(#fff4e3,#3b2d17);--sh-del:light-dark(#b23a3a,#ef8d8d);--sh-del-soft:light-dark(#fdeeee,#3b2020);--sh-move:light-dark(#2a63a9,#8bbcf5);--sh-move-soft:light-dark(#eaf3fd,#1b3049);--wh-bg:var(--sh-bg);--wh-panel:var(--sh-panel);--wh-text:var(--sh-text);--wh-muted:var(--sh-muted);--wh-line:var(--sh-line);--wh-accent:var(--sh-accent);--wh-warm:var(--sh-mod);--wh-green:var(--sh-add);display:flex;flex-direction:column;height:100%;min-height:0;color:var(--sh-text);background:var(--sh-bg);font:13px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC',sans-serif;position:relative;overflow:hidden}
.sh-workbench *{box-sizing:border-box}
.sh-workbench button,.sh-workbench input,.sh-workbench select{font:inherit;color:inherit}
.sh-workbench button{cursor:pointer;background:none;border:1px solid transparent;border-radius:6px;padding:4px 8px}
.sh-workbench button:hover:not(:disabled){background:var(--sh-panel)}
.sh-workbench button:disabled{opacity:.38;cursor:default}
.sh-workbench :is(button,input,select,summary):focus-visible{outline:2px solid var(--sh-accent);outline-offset:2px}
.sh-workbench .sh-icon{width:26px;height:26px;padding:0;display:inline-grid;place-items:center;color:var(--sh-muted);font-size:14px;line-height:1}
.sh-workbench .sh-icon:hover{color:var(--sh-text)}
.sh-workbench .sh-text{font-size:11px;color:var(--sh-muted);padding:3px 5px;white-space:nowrap}
.sh-workbench .sh-text:hover{color:var(--sh-text)}
.sh-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 12px 8px;border-bottom:1px solid var(--sh-line);flex:0 0 auto}
.sh-head-title{display:flex;align-items:baseline;gap:7px;min-width:0}
.sh-head-title strong{font-size:14px;font-weight:650;letter-spacing:.01em;white-space:nowrap}
.sh-project{font-size:11px;color:var(--sh-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:210px}
.sh-readonly{font-size:10px;color:var(--sh-muted);border:1px solid var(--sh-line);border-radius:4px;padding:0 4px;line-height:15px;white-space:nowrap}
.sh-head-actions{display:flex;align-items:center;gap:1px;flex-shrink:0}
.sh-menu{position:relative}
.sh-menu>summary{list-style:none}
.sh-menu>summary::-webkit-details-marker{display:none}
.sh-menu-pop{position:absolute;right:0;top:28px;z-index:20;min-width:150px;padding:4px;background:var(--sh-bg);border:1px solid var(--sh-line);border-radius:8px;box-shadow:0 8px 24px #0000001f;display:flex;flex-direction:column;gap:1px}
.sh-menu-pop button{text-align:left;font-size:12px;padding:7px 9px;white-space:nowrap}
.sh-notice{display:flex;align-items:flex-start;gap:8px;margin:7px 12px 0;padding:6px 9px;border-radius:6px;background:var(--sh-accent-soft);color:var(--sh-text);font-size:11px;line-height:1.5;overflow-wrap:anywhere;flex:0 0 auto}
.sh-notice span{flex:1;min-width:0}
.sh-notice button{flex:0 0 auto;width:18px;height:18px;padding:0;line-height:1;color:var(--sh-muted);font-size:13px}
.sh-error{display:flex;align-items:flex-start;gap:10px;margin:7px 12px 0;padding:7px 9px;border:1px solid color-mix(in srgb,var(--sh-del) 28%,var(--sh-line));background:var(--sh-del-soft);border-radius:6px;font-size:11px;color:var(--sh-text);flex:0 0 auto}
.sh-error span{flex:1;overflow-wrap:anywhere}
.sh-error button{flex:0 0 auto;color:var(--sh-del);font-size:11px;padding:2px 5px}
.sh-history{flex:0 0 auto;padding:9px 12px 7px;border-bottom:1px solid var(--sh-line);min-width:0}
.sh-history-head{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}
.sh-history-title{display:flex;align-items:baseline;gap:7px;min-width:0;flex-wrap:wrap}
.sh-kicker{font-size:11px;font-weight:600;letter-spacing:.04em;color:var(--sh-muted);text-transform:uppercase}
.sh-latest{font-size:11px;color:var(--sh-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.sh-latest b{color:var(--sh-text);font-weight:600}
.sh-live{font-size:10px;color:var(--sh-muted);border:1px dashed var(--sh-line-strong);border-radius:4px;padding:0 5px;line-height:16px;white-space:nowrap}
.sh-history-actions{display:flex;align-items:center;gap:6px;flex-shrink:0}
.sh-track{display:flex;align-items:center;gap:4px;font-size:10px;color:var(--sh-muted)}
.sh-track select{background:var(--sh-bg);border:1px solid var(--sh-line);border-radius:5px;padding:2px 4px;font-size:11px;max-width:150px}
.sh-latest-button{font-size:11px;color:var(--sh-accent);border:1px solid var(--sh-line);padding:2px 6px}
.sh-rail-wrap{display:flex;align-items:stretch;gap:2px;margin-top:8px;min-width:0}
.sh-rail-nav{flex:0 0 20px;align-self:center;width:20px;height:28px;padding:0;font-size:18px;color:var(--sh-muted);line-height:1}
.sh-rail{display:flex;align-items:stretch;gap:7px;overflow-x:auto;overflow-y:hidden;min-width:0;flex:1;padding:2px 2px 4px;scrollbar-width:thin;scroll-snap-type:x proximity}
.sh-point{position:relative;flex:0 0 132px;min-width:0;min-height:80px;text-align:left;padding:9px 8px 7px 13px;border:1px solid var(--sh-line);border-radius:8px;background:var(--sh-bg);display:flex;flex-direction:column;gap:2px;scroll-snap-align:center;transition:background .12s ease,border-color .12s ease}
.sh-point:hover{background:var(--sh-panel)}
.sh-point.is-selected{border-color:var(--sh-accent);background:var(--sh-accent-soft)}
.sh-point-dot{position:absolute;left:5px;top:12px;width:6px;height:6px;border-radius:50%;background:var(--sh-line-strong);box-shadow:0 0 0 2px var(--sh-bg)}
.sh-point.is-selected .sh-point-dot{background:var(--sh-accent);box-shadow:0 0 0 2px var(--sh-accent-soft)}
.sh-point-top{display:flex;align-items:center;justify-content:space-between;gap:4px;font-size:10px;color:var(--sh-muted);font-variant-numeric:tabular-nums}
.sh-point-latest{font-size:9px;color:var(--sh-accent);border:1px solid color-mix(in srgb,var(--sh-accent) 32%,var(--sh-line));border-radius:3px;padding:0 3px;line-height:13px}
.sh-point-title{font-size:12px;font-weight:550;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere;color:var(--sh-text)}
.sh-point-bottom{display:flex;justify-content:space-between;gap:4px;font-size:9.5px;color:var(--sh-muted);white-space:nowrap;overflow:hidden;margin-top:auto;padding-top:3px}
.sh-point-bottom span{min-width:0;overflow:hidden;text-overflow:ellipsis}
.sh-point-bottom span:last-child{flex:0 0 auto;color:var(--sh-muted)}
.sh-load-more{flex:0 0 78px;border:1px dashed var(--sh-line-strong)!important;color:var(--sh-muted)!important;font-size:11px;align-self:stretch;min-height:83px;white-space:normal;line-height:1.4}
.sh-chain-note{margin:2px 0 0;font-size:10px;color:var(--sh-mod);line-height:1.4}
.sh-snapshot-note{display:flex;align-items:baseline;gap:6px;flex-wrap:wrap;padding:6px 12px;border-bottom:1px solid var(--sh-line);font-size:11px;color:var(--sh-text);background:var(--sh-panel);flex:0 0 auto;min-width:0}
.sh-snapshot-kind{font-weight:600;color:var(--sh-accent);white-space:nowrap}
.sh-snapshot-kind.reconstructed{color:var(--sh-mod)}
.sh-snapshot-title{font-weight:550;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:42ch}
.sh-muted{color:var(--sh-muted)}
.sh-warn{color:var(--sh-mod)}
.sh-live-note{margin-left:auto;font-size:10px;white-space:nowrap}
.sh-issues{margin:0;padding:3px 12px 4px;border-bottom:1px solid var(--sh-line);font-size:10px;color:var(--sh-muted);flex:0 0 auto}
.sh-issues summary{cursor:pointer;padding:2px 0}
.sh-issues ul{margin:3px 0 4px;padding-left:16px;max-height:72px;overflow:auto}
.sh-issues li{overflow-wrap:anywhere;margin:1px 0}
.sh-body{display:flex;flex:1;min-height:0;position:relative;overflow:hidden}
.sh-main{display:flex;flex-direction:column;flex:1;min-width:0;min-height:0}
.sh-tree-head{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:7px 12px 5px;flex:0 0 auto;flex-wrap:wrap}
.sh-tree-title{display:flex;align-items:baseline;gap:6px;min-width:0}
.sh-tree-title strong{font-size:12px;font-weight:600}
.sh-tree-title span{font-size:10px;color:var(--sh-muted);white-space:nowrap}
.sh-change-count{color:var(--sh-mod)!important}
.sh-tree-tools{display:flex;align-items:center;gap:3px;flex-wrap:nowrap;justify-content:flex-end;min-width:0}
.sh-search{display:flex;align-items:center;gap:2px;border-bottom:1px solid var(--sh-line);padding:1px 2px;color:var(--sh-muted);min-width:86px;flex:0 1 150px}
.sh-search span{font-size:12px;line-height:1}
.sh-search input{width:100%;min-width:0;background:none;border:0;outline:none;padding:2px 0;font-size:11px;color:var(--sh-text)}
.sh-search input::placeholder{color:var(--sh-muted)}
.sh-search button{width:16px;height:16px;padding:0;font-size:12px;line-height:1;color:var(--sh-muted)}
.sh-seg{display:inline-flex;border:1px solid var(--sh-line);border-radius:5px;overflow:hidden}
.sh-seg button{border:0;border-radius:0;font-size:10px;padding:2px 6px;color:var(--sh-muted);white-space:nowrap}
.sh-seg button[aria-pressed=true]{background:var(--sh-panel-2);color:var(--sh-text)}
.sh-zoom{display:flex;align-items:center;gap:1px}
.sh-zoom button{font-size:10px;padding:1px 4px;color:var(--sh-muted)}
.sh-tree-scroll{flex:1;min-height:120px;overflow:auto;padding:2px 8px 10px;scroll-behavior:auto;overscroll-behavior:contain}
.sh-tree{display:flex;flex-direction:column;gap:1px;min-height:100%}
.sh-tree-item{margin:0;border-radius:6px}
.sh-tree-item.is-context{opacity:.5}
.sh-node-row{display:flex;align-items:flex-start;gap:2px;border-radius:6px;min-height:30px;padding-top:1px;padding-bottom:1px}
.sh-node-row:hover{background:var(--sh-panel)}
.sh-tree-item.is-selected>.sh-node-row{background:var(--sh-accent-soft);box-shadow:inset 2px 0 var(--sh-accent)}
.sh-disclosure{flex:0 0 18px;width:18px;height:26px;display:grid;place-items:center;padding:0;border:0;border-radius:4px;color:var(--sh-muted);font-size:10px;background:none!important}
.sh-disclosure:hover{color:var(--sh-text)}
.sh-node-main{flex:1;min-width:0;display:flex;align-items:flex-start;gap:5px;text-align:left;padding:4px 6px 4px 2px;border:0;border-radius:5px;background:none!important}
.sh-node-main:hover{background:none!important}
.sh-node-title{font-size:12.5px;line-height:1.45;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;color:var(--sh-text);flex:0 1 auto;min-width:0}
.sh-tree-item.is-selected .sh-node-title{font-weight:600}
.sh-node-marks{display:flex;align-items:center;gap:3px;flex:0 0 auto;padding-top:1px}
.sh-node-side{display:flex;align-items:center;gap:3px;flex:0 0 auto;margin-left:auto;padding-top:1px}
.sh-mark{display:inline-flex;align-items:center;border-radius:3px;padding:0 4px;line-height:15px;font-size:9.5px;white-space:nowrap;border:1px solid transparent}
.sh-mark.add{color:var(--sh-add);background:var(--sh-add-soft);border-color:color-mix(in srgb,var(--sh-add) 22%,transparent)}
.sh-mark.move{color:var(--sh-move);background:var(--sh-move-soft);border-color:color-mix(in srgb,var(--sh-move) 22%,transparent)}
.sh-mark.mod{color:var(--sh-mod);background:var(--sh-mod-soft);border-color:color-mix(in srgb,var(--sh-mod) 22%,transparent)}
.sh-mark.del{color:var(--sh-del);background:var(--sh-del-soft);border-color:color-mix(in srgb,var(--sh-del) 22%,transparent)}
.sh-status{font-size:9.5px;color:var(--sh-muted);border:1px solid var(--sh-line);border-radius:3px;padding:0 4px;line-height:14px;white-space:nowrap;text-transform:uppercase;letter-spacing:.02em}
.sh-unknown{font-size:9.5px;color:var(--sh-mod);border:1px dashed var(--sh-line-strong);border-radius:3px;padding:0 4px;line-height:14px;white-space:nowrap}
.sh-empty{padding:28px 12px;text-align:center;color:var(--sh-muted);font-size:11px}
.sh-changes{flex:0 0 auto;border-top:1px solid var(--sh-line);background:var(--sh-bg)}
.sh-changes-head{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:4px 8px 4px 12px;min-height:36px}
.sh-changes-toggle{display:flex;align-items:center;gap:5px;min-width:0;flex:1;text-align:left;padding:4px 2px;font-size:11px;color:var(--sh-muted);border:0!important;background:none!important}
.sh-changes-toggle:hover{color:var(--sh-text)}
.sh-changes-toggle strong{font-size:11.5px;color:var(--sh-text);font-weight:600;white-space:nowrap}
.sh-chev{width:10px;color:var(--sh-muted);font-size:9px;flex:0 0 auto}
.sh-compared{white-space:nowrap;font-variant-numeric:tabular-nums}
.sh-change-total{white-space:nowrap;color:var(--sh-mod);font-variant-numeric:tabular-nums}
.sh-change-summary{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px;color:var(--sh-muted);min-width:0}
.sh-changes-actions{display:flex;align-items:center;gap:2px;flex-shrink:0}
.sh-explain{font-size:10.5px;color:var(--sh-accent)!important;border:1px solid var(--sh-line)!important;padding:2px 6px!important;white-space:nowrap}
.sh-changes-body{border-top:1px solid var(--sh-line);max-height:min(280px,34vh);overflow:auto;padding:2px 8px 7px}
.sh-changes-empty{padding:12px 6px;color:var(--sh-muted);font-size:11px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.sh-changes-empty button{font-size:10px;color:var(--sh-accent);border:1px solid var(--sh-line);padding:2px 5px}
.sh-change-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:1px}
.sh-change-row{display:flex;align-items:flex-start;gap:7px;width:100%;text-align:left;padding:6px 5px!important;border:0!important;border-radius:5px!important;border-left:2px solid transparent!important}
.sh-change-row:hover{background:var(--sh-panel)!important}
.sh-change-row.is-selected{background:var(--sh-accent-soft)!important;border-left-color:var(--sh-accent)!important}
.sh-change-row.is-add{border-left-color:var(--sh-add)!important}
.sh-change-row.is-move{border-left-color:var(--sh-move)!important}
.sh-change-row.is-mod{border-left-color:var(--sh-mod)!important}
.sh-change-row.is-del{border-left-color:var(--sh-del)!important}
.sh-change-mark{flex:0 0 auto;display:inline-flex;align-items:center;border-radius:3px;padding:0 4px;line-height:16px;font-size:9.5px;white-space:nowrap;margin-top:1px}
.sh-change-mark.add{color:var(--sh-add);background:var(--sh-add-soft)}
.sh-change-mark.move{color:var(--sh-move);background:var(--sh-move-soft)}
.sh-change-mark.mod{color:var(--sh-mod);background:var(--sh-mod-soft)}
.sh-change-mark.del{color:var(--sh-del);background:var(--sh-del-soft)}
.sh-change-content{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1}
.sh-change-title{font-size:11.5px;font-weight:550;line-height:1.4;overflow-wrap:anywhere}
.sh-change-desc{display:flex;flex-direction:column;gap:0;font-size:10px;line-height:1.45;color:var(--sh-muted);overflow-wrap:anywhere}
.sh-change-desc span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sh-change-kinds{flex:0 0 auto;max-width:30%;font-size:9.5px;color:var(--sh-muted);text-align:right;line-height:1.5;overflow-wrap:anywhere}
.sh-ai{margin:6px 0 0;padding:5px 6px;border-top:1px dashed var(--sh-line);font-size:10.5px;color:var(--sh-muted)}
.sh-ai summary{cursor:pointer;color:var(--sh-muted)}
.sh-ai summary span{color:var(--sh-mod);font-size:9.5px;margin-left:4px}
.sh-ai p{margin:5px 0 0;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--sh-text);font-size:11px;line-height:1.6}
.sh-main-loading{flex:1;min-height:0;display:flex;flex-direction:column;padding:18px 16px}
.sh-loading-label{font-size:11px;color:var(--sh-muted);margin:0 0 10px}
.sh-skeleton{display:flex;flex-direction:column;gap:7px;padding:4px 0}
.sh-skeleton span{display:block;height:25px;border-radius:5px;background:var(--sh-panel);opacity:.8}
.sh-skeleton span:nth-child(2){width:82%}.sh-skeleton span:nth-child(3){width:64%}.sh-skeleton span:nth-child(4){width:76%}.sh-skeleton span:nth-child(5){width:52%}
.sh-no-history{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:24px;text-align:center}
.sh-no-history strong{font-size:13px;font-weight:600}
.sh-no-history p{margin:0;font-size:11px;color:var(--sh-muted);line-height:1.6;max-width:36ch}
.sh-no-history button{margin-top:4px;font-size:11px;border:1px solid var(--sh-line);padding:3px 8px;color:var(--sh-accent)}
.sh-graph-wrap{flex:1;min-height:140px;padding:0 12px 8px;display:flex;flex-direction:column}
.sh-graph-wrap .wh-structure{flex:1;min-height:0;border-color:var(--sh-line);border-radius:8px}
.sh-graph-wrap .wh-viewport{background:var(--sh-bg)}
.sh-graph-wrap .wh-node{border-radius:6px!important;background:var(--sh-bg)!important;border-color:var(--sh-line)!important;font-size:11px}
.sh-graph-wrap .wh-node.is-selected{outline-color:var(--sh-accent)}
.sh-graph-wrap .wh-node.is-changed{border-color:var(--sh-mod)!important}
.sh-graph-wrap .wh-node.is-added{border-color:var(--sh-add)!important}
.sh-graph-wrap .wh-node.is-ghost{display:none}
.sh-graph-wrap .wh-canvas-caption{border-color:var(--sh-line);color:var(--sh-muted)}
.sh-detail{flex:0 0 370px;width:370px;min-width:0;border-left:1px solid var(--sh-line);background:var(--sh-bg);overflow:auto;padding:12px 14px 16px;display:flex;flex-direction:column;gap:0}
.sh-detail-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
.sh-detail-head>div{min-width:0}
.sh-detail-kicker{display:flex;align-items:baseline;gap:6px;font-size:10px;color:var(--sh-muted);min-width:0}
.sh-detail-kicker span:first-child{color:var(--sh-accent);font-weight:600;white-space:nowrap}
.sh-detail-kicker span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sh-detail h2{font-size:16px;line-height:1.4;font-weight:650;margin:4px 0 0;overflow-wrap:anywhere}
.sh-detail-close{flex:0 0 auto;font-size:18px!important;line-height:1!important;margin-top:-2px}
.sh-detail-banner{margin:8px 0 0;padding:6px 8px;border-radius:5px;font-size:10.5px;line-height:1.55;border:1px solid var(--sh-line)}
.sh-detail-banner.is-deleted{color:var(--sh-del);background:var(--sh-del-soft);border-color:color-mix(in srgb,var(--sh-del) 24%,var(--sh-line))}
.sh-detail-banner.is-unknown{color:var(--sh-mod);background:var(--sh-mod-soft);border-color:color-mix(in srgb,var(--sh-mod) 24%,var(--sh-line))}
.sh-detail-banner.is-added{color:var(--sh-add);background:var(--sh-add-soft);border-color:color-mix(in srgb,var(--sh-add) 24%,var(--sh-line))}
.sh-lineage{display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-top:9px;font-size:10.5px;color:var(--sh-muted);line-height:1.5;overflow-wrap:anywhere}
.sh-lineage .is-current{color:var(--sh-text);font-weight:550}
.sh-sep{color:var(--sh-line-strong);font-size:9px}
.sh-detail-meta{display:flex;flex-wrap:wrap;gap:3px 10px;margin-top:4px;font-size:10px;color:var(--sh-muted);line-height:1.5}
.sh-change-line{display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-top:8px;font-size:10.5px;color:var(--sh-text)}
.sh-detail-section{margin-top:12px;border-top:1px solid var(--sh-line);padding-top:8px}
.sh-section-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;flex-wrap:wrap}
.sh-section-head h3{font-size:11px;font-weight:600;margin:0;color:var(--sh-text);letter-spacing:.01em}
.sh-section-source{font-size:9.5px;color:var(--sh-muted)}
.sh-history-body{font-family:inherit;font-size:12px;line-height:1.75;white-space:pre-wrap;overflow-wrap:anywhere;margin:6px 0 2px;padding:8px 9px;border-radius:6px;background:var(--sh-panel);max-height:260px;overflow:auto}
.sh-fields{margin-top:10px;border-top:1px solid var(--sh-line);padding-top:6px;font-size:10.5px}
.sh-fields summary{cursor:pointer;color:var(--sh-muted);font-size:10.5px}
.sh-fields .wh-fields{margin:6px 0 0;font-size:10px}
.sh-fields .wh-fields :is(th,td){border-color:var(--sh-line);padding:4px 3px}
.sh-fields .wh-fields th{color:var(--sh-muted)}
.sh-inline{margin:6px 0 2px;padding:6px 8px;border-radius:5px;background:var(--sh-panel);font-size:11px;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere;max-height:180px;overflow:auto}
.sh-inline mark{background:light-dark(#d9f4df,#284c36);color:inherit}
.sh-detail-note{margin:6px 0 0;font-size:10px;color:var(--sh-muted);line-height:1.5}
.sh-sources .sh-source-item{border-bottom:1px solid var(--sh-line);padding:5px 0}
.sh-source-row{display:flex;align-items:center;gap:5px;flex-wrap:wrap;font-size:10.5px;min-width:0}
.sh-source-kind{flex:0 0 auto;font-size:9px;border:1px solid var(--sh-line);border-radius:3px;padding:0 4px;line-height:14px;color:var(--sh-muted)}
.sh-source-kind.logseq{color:var(--sh-accent)}
.sh-source-name{flex:1 1 80px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--sh-text)}
.sh-source-version{flex:0 0 auto;color:var(--sh-muted);font-variant-numeric:tabular-nums}
.sh-source-check{flex:0 0 auto;font-size:9.5px!important;color:var(--sh-accent)!important;border:1px solid var(--sh-line)!important;padding:1px 5px!important}
.sh-source-result{margin:5px 0 2px;padding:7px 8px;border-radius:5px;background:var(--sh-panel);font-size:10.5px;line-height:1.5}
.sh-source-result.is-error{background:var(--sh-del-soft);color:var(--sh-del)}
.sh-source-result p{margin:0 0 4px;overflow-wrap:anywhere}
.sh-source-notice{color:var(--sh-text)}
.sh-source-notice.is-warn{color:var(--sh-mod)}
.sh-version-row{display:flex;flex-wrap:wrap;gap:4px 10px;font-size:9.5px;color:var(--sh-muted);font-variant-numeric:tabular-nums;margin-bottom:4px}
.sh-current-source summary{cursor:pointer;color:var(--sh-muted);font-size:10px;margin:3px 0}
.sh-current-source pre{font-family:inherit;font-size:10.5px;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere;margin:3px 0 0;padding:6px 7px;background:var(--sh-bg);border:1px solid var(--sh-line);border-radius:4px;max-height:170px;overflow:auto}
.sh-current-source small{color:var(--sh-muted);font-size:9.5px}
.sh-logseq-link{display:inline-block;margin-top:3px;font-size:10.5px;color:var(--sh-accent);text-decoration:none;border-bottom:1px solid color-mix(in srgb,var(--sh-accent) 40%,transparent);padding-bottom:1px}
.sh-logseq-link:hover{text-decoration:none;border-bottom-color:var(--sh-accent)}
.sh-no-jump{margin-top:3px!important;font-size:9.5px}
.sh-detail-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:12px;padding-top:9px;border-top:1px solid var(--sh-line);font-size:9.5px;color:var(--sh-muted)}
.sh-secondary{font-size:10.5px!important;color:var(--sh-accent)!important;border:1px solid var(--sh-line)!important;padding:3px 8px!important;white-space:nowrap}
.sh-workbench.is-compact .sh-detail{position:absolute;z-index:12;right:0;top:0;bottom:0;width:min(390px,96%);max-width:96%;border-left:1px solid var(--sh-line);box-shadow:-14px 0 30px #0000001c;background:var(--sh-bg);padding:11px 12px 14px}
.sh-workbench.is-compact .sh-head{padding:8px 10px}
.sh-workbench.is-compact .sh-history{padding:7px 10px 6px}
.sh-workbench.is-compact .sh-head-title strong{font-size:13px}
.sh-workbench.is-compact .sh-project{max-width:130px}
.sh-workbench.is-compact .sh-snapshot-note{padding:5px 10px}
.sh-workbench.is-compact .sh-snapshot-title{max-width:30ch}
.sh-workbench.is-compact .sh-live-note{margin-left:0;flex-basis:100%;text-align:left}
.sh-workbench.is-compact .sh-point{flex-basis:118px}
.sh-workbench.is-compact .sh-rail{gap:6px}
.sh-workbench.is-compact .sh-node-side{max-width:30%;overflow:hidden}
.sh-workbench.is-compact .sh-tree-head{padding:6px 10px 4px}
.sh-workbench.is-compact .sh-tree-tools{width:100%;justify-content:flex-start;flex-wrap:wrap}
.sh-workbench.is-compact .sh-search{flex:1 1 120px}
.sh-workbench.is-compact .sh-tree-scroll{padding:2px 6px 8px}
.sh-workbench.is-compact .sh-changes-body{max-height:min(240px,30vh)}
.sh-workbench.is-compact .sh-node-marks{max-width:38%;overflow:hidden}
@media(max-width:520px){.sh-head-title .sh-project{display:none}.sh-history-title .sh-live{display:none}.sh-history-actions .sh-track{display:none}.sh-changes-toggle .sh-change-summary{display:none}.sh-detail{width:100%!important;max-width:100%!important}}
@media(prefers-reduced-motion:reduce){.sh-workbench *{scroll-behavior:auto!important;transition:none!important}}
`;

export const historyStyles = `${graphStyles}\n${workbenchStyles}`;
