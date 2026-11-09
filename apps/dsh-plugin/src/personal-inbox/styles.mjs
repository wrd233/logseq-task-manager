export const personalInboxStyles = `
.pi-scroll{flex:1;min-width:0;min-height:0;overflow:auto}
.pi{
  --pi-bg:var(--dsw-alias-bg-base,light-dark(#fff,#191b20));
  --pi-text:var(--dsw-alias-label-primary,light-dark(#28332e,#e5e9e6));
  --pi-muted:var(--dsw-alias-label-secondary,light-dark(#5e6f65,#a1ada5));
  --pi-line:var(--dsw-alias-border-l2,light-dark(#e1e7e2,#343d37));
  --pi-soft:var(--dsw-alias-fill-tsp-secondary,light-dark(#f3f6f3,#232a25));
  --pi-accent:light-dark(#316444,#a4cdb0);
  --pi-danger:light-dark(#a13232,#f2a2a2);
  color:var(--pi-text);background:var(--pi-bg);padding:20px clamp(14px,3vw,36px) 32px;
  max-width:1120px;margin:auto;box-sizing:border-box;container-type:inline-size;
  font:13px/1.6 var(--dsh-font-family-text,-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif);
}
.pi *{box-sizing:border-box}
.pi h1,.pi h2,.pi h3,.pi p{margin:0}
.pi h1{font-size:23px;font-weight:650;letter-spacing:-.035em}
.pi h2,.pi h3{font-size:13px;font-weight:650}
.pi button,.pi input,.pi select,.pi textarea{font:inherit;color:inherit}
.pi button,.pi input,.pi select,.pi textarea{
  min-width:0;max-width:100%;border:1px solid var(--pi-line);border-radius:6px;
  background:var(--pi-bg);padding:6px 9px;min-height:32px;
}
.pi button,.pi summary{cursor:pointer}
.pi button:hover:not(:disabled){background:var(--pi-soft)}
.pi button:disabled{opacity:.48;cursor:default}
.pi a{color:var(--pi-accent);overflow-wrap:anywhere;text-underline-offset:3px}
.pi :focus-visible{outline:2px solid var(--pi-accent);outline-offset:2px}
.pi label{display:flex;flex-direction:column;gap:4px;font-size:12px}
.pi textarea{width:100%;resize:vertical;line-height:1.55;min-height:100px}
.pi summary{font-size:12px;color:var(--pi-muted);padding:5px 2px}
.pi summary:hover{color:var(--pi-text)}
.pi .pi-primary{background:var(--pi-accent);color:light-dark(#fff,#14251a);border-color:var(--pi-accent);font-weight:650}
.pi .pi-primary:hover:not(:disabled){background:var(--pi-accent);filter:brightness(1.08)}
.pi .pi-link,.pi .pi-back{border:0;background:none;color:var(--pi-accent);padding:4px 6px}
.pi-row,.pi-actions{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
.pi-actions{justify-content:flex-end;margin-top:8px}
.pi-start{justify-content:flex-start}
.pi-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}
.pi-overview{margin-bottom:16px}
.pi-capture-entry{display:flex;align-items:flex-start;gap:7px;max-width:100%}
.pi-capture-entry>textarea{min-height:36px;height:36px;resize:none;flex:1;padding:7px 9px}
.pi-capture-entry>.pi-primary{min-height:36px;flex:none}
.pi-capture-source{margin:4px 0}
.pi-visually-hidden{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.pi-layout{display:grid;grid-template-columns:minmax(0,1fr)}
.pi-has-detail .pi-layout{grid-template-columns:minmax(210px,31%) minmax(0,1fr)}
.pi-has-detail .pi-browser{border-right:1px solid var(--pi-line);padding-right:14px}
.pi-browser,.pi-reading{min-width:0}
.pi-search,.pi-views{display:flex;align-items:center;gap:4px}
.pi-search{margin-bottom:8px}
.pi-search input{width:100%;flex:1}
.pi-views{border-bottom:1px solid var(--pi-line);margin-bottom:3px}
.pi-views>button{border:0;border-radius:0;border-bottom:2px solid transparent;color:var(--pi-muted);white-space:nowrap}
.pi-views>button[aria-pressed=true]{border-bottom-color:var(--pi-accent);color:var(--pi-accent);font-weight:650}
.pi-menu{position:relative;flex:none}
.pi-menu>summary{list-style:none;padding:6px 8px;border-radius:6px;min-height:32px;white-space:nowrap}
.pi-menu>summary::-webkit-details-marker{display:none}
.pi-menu>summary::after{content:' ▾';font-size:10px}
.pi-menu[open]>summary,.pi-menu>summary:hover{background:var(--pi-soft)}
.pi-menu-items,.pi-filter-items{
  position:absolute;z-index:2;right:0;min-width:135px;width:max-content;max-width:220px;
  padding:6px;background:var(--pi-bg);border:1px solid var(--pi-line);border-radius:8px;
  box-shadow:0 5px 18px #0002;
}
.pi-menu-items button{display:block;width:100%;border:0;text-align:left}
.pi-filter-items{display:grid;gap:8px;width:200px}
.pi-detail-actions .pi-menu-items{left:0;right:auto}
.pi .pi-card{
  display:flex;flex-direction:column;align-items:stretch;gap:2px;width:100%;
  text-align:left;border:0;border-bottom:1px solid var(--pi-line);border-radius:0;
  padding:9px 8px;overflow-wrap:anywhere;
}
.pi-card>span{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.pi-card small,.pi-meta,.pi-preview{color:var(--pi-muted);font-size:11px}
.pi-card .pi-preview{-webkit-line-clamp:1}
.pi .pi-card.is-selected{background:var(--pi-soft);box-shadow:inset 2px 0 0 var(--pi-accent)}
.pi-empty{padding:26px 10px;color:var(--pi-muted)}
.pi-empty h2{color:var(--pi-text);margin-bottom:4px}
.pi-empty button{margin:5px 0 0 -6px}
.pi-reading{display:none}
.pi-has-detail .pi-reading{display:block;padding:0 0 0 22px}
.pi-detail{max-width:720px}
.pi-detail>.pi-row{justify-content:flex-start;gap:12px}
.pi-content{font-size:17px;line-height:1.75;white-space:pre-wrap;overflow-wrap:anywhere;margin:10px 0 12px}
.pi-original,.pi-warning pre,.pi-note p{white-space:pre-wrap;overflow-wrap:anywhere}
.pi-original,.pi-warning pre{font:inherit;background:var(--pi-soft);padding:10px;border-radius:6px}
.pi-note{margin:14px 0;padding:8px 12px;border-left:2px solid var(--pi-line);background:var(--pi-soft);border-radius:0 6px 6px 0}
.pi-note h2{color:var(--pi-muted);font-size:11px;margin-bottom:3px}
.pi-note textarea{min-height:112px}
.pi-note .pi-link{margin-left:-6px}
.pi .pi-work-chip{margin:6px 0;background:var(--pi-soft);color:var(--pi-accent)}
.pi-materials,.pi-outcomes{margin-top:12px}
.pi-materials ul{margin:4px 0;padding-left:18px}
.pi-materials li{padding:2px 0;overflow-wrap:anywhere}
.pi-materials li summary{color:var(--pi-accent);padding:0}
.pi-outcomes>.pi-row{padding:5px 0;border-bottom:1px solid var(--pi-line)}
.pi-detail-actions{padding-top:9px;margin-top:10px}
.pi-next,.pi-subform,.pi-conversion,.pi-warning,.pi-picker{
  margin-top:9px;padding:10px;border-radius:7px;background:var(--pi-soft);
}
.pi-subform,.pi-conversion{display:flex;flex-direction:column;gap:9px}
.pi-field select{width:100%}
.pi-fields{align-items:end;justify-content:flex-start}
.pi-fields>label{flex:1;min-width:120px}
.pi-hint{color:var(--pi-muted);font-size:11px;overflow-wrap:anywhere}
.pi-error,.pi-notice{margin:7px 0!important;overflow-wrap:anywhere}
.pi-error{color:var(--pi-danger)}
.pi-notice{color:var(--pi-accent)}
.pi-warning button{margin:5px 5px 0 0}
.pi-source-list{max-height:280px;overflow:auto}
.pi-source-list>button{display:flex;flex-direction:column;width:100%;text-align:left;white-space:pre-wrap;overflow-wrap:anywhere;margin:4px 0}
.pi-source-list small{color:var(--pi-muted)}
@container(max-width:660px){
  .pi-has-detail .pi-layout{grid-template-columns:minmax(0,1fr)}
  .pi-has-detail .pi-overview,.pi-has-detail .pi-browser{display:none}
  .pi-has-detail .pi-reading{padding:0}
  .pi-content{font-size:16px}
}
`;
