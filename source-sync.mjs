// UUID-only organization; content is compared, never rewritten.
export function validate(source, items) {
  if (!source.length || items.length !== source.length || items[0]?.uuid !== source[0].uuid) throw Error('scope-membership-changed');
  const ids = new Set(source.map(x => x.uuid)), seen = new Set();
  items.forEach((x, i) => {
    if (!ids.has(x.uuid) || seen.has(x.uuid)) throw Error('invalid-membership');
    seen.add(x.uuid);
    if (!Number.isInteger(x.depth) || (i === 0 ? x.depth !== 0 : x.depth < 1 || x.depth > items[i-1].depth + 1)) throw Error('invalid-hierarchy');
  });
}
export function organization(rows) { return rows.map(({uuid,depth}) => ({uuid,depth})); }
export function signature(rows) { return JSON.stringify(rows.map(({uuid,depth,content}) => ({uuid,depth,content}))); }
export function targets(items) {
  const stack=[], previous=new Map();
  return items.slice(1).map((item,i) => {
    const prior=items[i]; stack[prior.depth]=prior.uuid;
    const parent=stack[item.depth-1], sibling=previous.get(parent);
    previous.set(parent,item.uuid);
    return {uuid:item.uuid,parent,target:sibling??parent,children:!sibling};
  });
}
export async function synchronize({plan,read,move,check}) {
  let expected=await read(); validate(expected,plan.items);
  if(signature(expected)!==plan.source) throw Error('source-changed-since-preview');
  const applied=[];
  try {
    for(const step of targets(plan.items)) {
      await check();
      const actual=await read();
      if(signature(actual)!==signature(expected)) throw Error('source-changed-during-sync');
      const i=actual.findIndex(x=>x.uuid===step.uuid), depth=actual[i].depth;
      let parent=null,prev=null;
      for(let j=i-1;j>=0;j--) {if(actual[j].depth<depth){parent=actual[j].uuid;break;}if(actual[j].depth===depth&&!prev)prev=actual[j].uuid;}
      if(parent===step.parent && (step.children ? !prev : prev===step.target)) continue;
      await move(step); applied.push(step.uuid);
      const next=await read();
      if(next.length!==expected.length || next.some(x=>!expected.some(y=>y.uuid===x.uuid&&y.content===x.content))) throw Error('source-content-or-membership-changed');
      expected=next;
    }
    if(JSON.stringify(organization(expected))!==JSON.stringify(plan.items)) throw Error('source-order-verification-failed');
    return {ok:true,applied,items:organization(expected)};
  } catch(e) {return {ok:false,reason:String(e.message??e),applied,partial:applied.length>0};}
}
