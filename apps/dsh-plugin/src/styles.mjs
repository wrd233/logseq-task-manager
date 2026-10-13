export const styles = `
.lq-source,.lq-files{--lq-bg:light-dark(#fff,#191b20);--lq-text:light-dark(#292d33,#e1e3e9);--lq-muted:light-dark(#69717e,#a0a7b3);--lq-line:light-dark(#eceef2,#2d3037);--lq-hover:light-dark(#f3f5f8,#272c34);--lq-blue:light-dark(#5077cb,#93b6ff);font:14px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;color:var(--lq-text)}
.lq-source,.lq-files,.lq-source *,.lq-files *{box-sizing:border-box}.lq-source button,.lq-files button,.lq-header,.lq-row-action{font:inherit;color:inherit;cursor:pointer}.lq-source button,.lq-files button{background:none;border:0;border-radius:5px;padding:4px 7px}.lq-source button:hover,.lq-files button:hover{background:var(--lq-hover)}.lq-source button:disabled,.lq-files button:disabled{opacity:.5;cursor:default}.lq-source{pointer-events:auto;position:absolute;left:12px;top:130px;width:min(360px,calc(100% - 24px));max-height:calc(100% - 150px);overflow:auto;background:var(--lq-bg);border:1px solid var(--lq-line);border-radius:12px;padding:16px;box-shadow:0 6px 24px light-dark(#14203412,#0006)}
.lq-source header,.lq-file-title{display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:12px;color:var(--lq-muted)}.lq-source header>div{display:flex;align-items:center}.lq-source header a{color:inherit;text-decoration:none;padding:4px 7px}.lq-source h2{font-size:16px;font-weight:500;margin:18px 0 12px;overflow-wrap:anywhere}.lq-block{margin:0 0 14px;overflow-wrap:anywhere}.lq-block p{white-space:pre-wrap;margin:0}.lq-root-block{font-weight:500}.lq-block .lq-link{font-weight:400;font-size:11px;color:var(--lq-blue);padding:0;margin-top:4px}.lq-source-menu,.lq-file-menu{display:flex;flex-direction:column;align-items:stretch;padding:5px;background:var(--lq-bg);border:1px solid var(--lq-line);border-radius:7px;margin:4px 0 10px}.lq-source-menu button,.lq-file-menu button{text-align:left;font-size:12px}.lq-error{font-size:12px;color:var(--lq-muted);margin:12px 0;overflow-wrap:anywhere}.lq-muted{font-size:12px;color:var(--lq-muted)}.lq-binding{display:flex;flex-direction:column;gap:9px;margin-top:18px}.lq-binding input{font:inherit;min-width:0;width:100%;background:var(--lq-bg);color:var(--lq-text);border:1px solid var(--lq-line);padding:7px;border-radius:6px}.lq-binding button{border:1px solid var(--lq-line);align-self:flex-start}.lq-binding p{font-size:12px;color:var(--lq-muted);margin:0}.lq-header,.lq-row-action{border:0;background:none;color:light-dark(#5077cb,#93b6ff);padding:5px 7px;border-radius:6px;font-size:12px}.lq-header:hover,.lq-row-action:hover{background:light-dark(#eef3fd,#253248)}.lq-dot{display:inline-block;width:5px;height:5px;background:currentColor;border-radius:50%;margin-left:5px}.lq-files{padding:14px 10px}.lq-file-title{padding:0 4px 10px}.lq-file-title>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.lq-files h3{font-size:11px;font-weight:400;color:var(--lq-muted);margin:12px 7px 5px}.lq-file-row{display:flex;align-items:center;gap:2px;min-width:0}.lq-file-open{display:flex;align-items:center;gap:8px;flex:1;min-width:0;text-align:left;padding:7px!important;font-size:12px!important}.lq-file-open span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.lq-file-open span:first-child{color:var(--lq-muted)}.lq-more{flex:none}.lq-link{color:var(--lq-blue)!important}.lq-files .lq-file-menu{margin-left:7px}.lq-files .lq-muted{margin-left:7px}
@media(min-width:1100px){.lq-frame-open:not([data-rightbar-fullscreen]){grid-template-columns:360px minmax(400px,1fr) 280px!important}.lq-frame-open[data-rightbar-collapsed]{grid-template-columns:360px minmax(0,1fr) 0!important}.lq-frame-open>[data-side]{display:none}.lq-frame-open:not([data-rightbar-fullscreen]) [data-sidebar-right-panel="push"]{width:280px!important;--dsh-sidebar-width:280px!important}.lq-frame-open .lq-source{width:336px;height:calc(100% - 150px)}}
@media(max-width:600px){.lq-source{top:72px;left:10px;width:calc(100% - 20px);max-height:calc(100% - 92px)}}
`;
export const readingStyles = `
.lq-handoff{left:50%;top:20%;transform:translateX(-50%);width:min(440px,calc(100% - 24px));z-index:2}.lq-handoff button{border:1px solid var(--lq-line);margin:4px}
.lq-reading-picker{display:flex;align-items:center;gap:8px;margin:10px 0 5px}.lq-reading-picker select{font:inherit;color:var(--lq-text);background:var(--lq-bg);border:1px solid var(--lq-line);border-radius:6px;padding:6px 9px;width:100%;min-width:0;font-size:13px}.lq-reading-version{color:var(--lq-muted);font-size:11px;margin:0 0 18px}.lq-reading-unit{margin-bottom:18px;min-width:0}.lq-reading-unit h3{font-size:14px;font-weight:500;margin:16px 0 10px}.lq-reading-context{border-left:2px solid var(--lq-line);padding-left:10px;color:var(--lq-muted);margin:8px 0 14px}.lq-reading-context>span{font-size:11px}.lq-markdown{white-space:normal}.lq-markdown p{white-space:normal;margin:0 0 8px}.lq-markdown pre{white-space:pre-wrap;overflow-wrap:anywhere;background:var(--lq-hover);padding:8px;border-radius:5px}.lq-markdown a{color:var(--lq-blue)}.lq-markdown table{width:100%;border-collapse:collapse;font-size:12px}.lq-markdown th,.lq-markdown td{border-bottom:1px solid var(--lq-line);padding:4px;text-align:left;overflow-wrap:anywhere}.lq-markdown h1,.lq-markdown h2,.lq-markdown h3{font-size:15px;font-weight:500;margin:12px 0 8px}.lq-markdown ul,.lq-markdown ol{padding-left:20px}.lq-marker{display:inline-block;font-size:11px;color:var(--lq-muted);margin-bottom:4px}.lq-structure .lq-block{border-left:1px solid var(--lq-line);padding-left:10px}.lq-reading-material{color:var(--lq-blue)!important;font-size:12px!important;text-align:left;overflow-wrap:anywhere}

/* Compact reading: actions sit beside text and consume no paragraph height. */
.lq-source{font-size:13px;line-height:1.5;padding:12px;border-radius:7px;box-shadow:none}
.lq-source h2{font-size:15px;margin:12px 0 8px}
.lq-reading-picker{margin:6px 0 8px;display:inline-flex;width:calc(100% - 38px)}
.lq-reading-picker select{padding:3px 6px;border:0;background:var(--lq-hover);font-size:12px}
.lq-reading-version{display:inline-block;font-size:10px;max-width:38px;vertical-align:middle;overflow:hidden;white-space:nowrap;margin:0;color:var(--lq-muted)}
.lq-block{position:relative;margin:0 0 5px;padding-right:27px}
.lq-markdown p{margin:0 0 3px}.lq-markdown p:last-child{margin-bottom:0}
.lq-markdown h1,.lq-markdown h2,.lq-markdown h3{font-size:14px;margin:10px 0 4px}
.lq-markdown ul,.lq-markdown ol{margin:3px 0;padding-left:18px}
.lq-markdown pre{margin:5px 0;padding:6px}
.lq-marker{float:left;line-height:1.5;margin:1px 5px 0 0;font-size:10px}
.lq-block-action{position:absolute;right:0;top:0;opacity:0;pointer-events:none}
.lq-block:hover>.lq-block-action,.lq-block:focus-within>.lq-block-action{opacity:1;pointer-events:auto}
.lq-block .lq-link{margin:0;padding:1px;font-size:10px}
.lq-reading-unit{margin-bottom:7px}.lq-reading-unit h3{margin:12px 0 5px;font-size:13px}
.lq-reading-context{margin:4px 0 6px;padding-left:7px}
.lq-selection-action{position:sticky;top:0;z-index:1;display:flex;justify-content:flex-end;height:0}
.lq-selection-action button{background:var(--lq-bg);border:1px solid var(--lq-line);box-shadow:0 2px 6px #0001;align-self:flex-start;font-size:11px}
.lq-file-open{padding:5px 7px!important}.lq-opening{font-size:10px;color:var(--lq-muted);white-space:nowrap;margin-left:auto}
@media(hover:none){.lq-block-action{opacity:1;pointer-events:auto}}

@media(min-width:850px) and (max-width:1099px){
 .lq-frame-open:not([data-rightbar-fullscreen]){grid-template-columns:300px minmax(300px,1fr) 240px!important}
 .lq-frame-open[data-rightbar-collapsed]{grid-template-columns:300px minmax(0,1fr) 0!important}
 .lq-frame-open>[data-side]{display:none}
 .lq-frame-open:not([data-rightbar-fullscreen]) [data-sidebar-right-panel="push"]{width:240px!important;--dsh-sidebar-width:240px!important}
 .lq-frame-open .lq-source{width:276px}
}
@media(min-width:850px){.lq-frame-open .lq-source{top:16px;height:calc(100% - 32px);max-height:calc(100% - 32px)}}
`;
