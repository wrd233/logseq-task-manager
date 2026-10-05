/** Call only in a verified, empty isolated Logseq Graph. No write permission is granted here. */
export function records(referenceUuid = null) {
  const notes = Array.from({length:80},(_,i)=>({
    content:(["[注] ","[想法] ","[目标] ",""][i%4])+`记录 ${i+1}：先核验引用与数据条件，保留这项不确定判断。相同现象可能由不同因素造成，需要对照反例；未说明适用范围前，不把个人观察写成确定结论。`,
  }));
  notes[0].content="[注] **目前说得比较啰嗦**，先保留口吻和条件。只有样本来自同一时期时才比较；反例是同内容的两份文件，不能仅凭名字断言同一来源。链接与 "+String.fromCharCode(96)+"原始代码"+String.fromCharCode(96)+" 不丢失。";
  notes[1]={content:"[想法] 把反例与验证方法放近一点，但没有授权前不改状态。",children:[
    {content:`普通子树：移动时保留引用 ${referenceUuid?`((${referenceUuid}))`:"及来源"} 与 UUID。`,children:[
      {content:"第四层条件：仅在同一工作对象内整理位置，保留限制和普通 TODO。"},
    ]},
  ]};
  notes[2].content="[目标] 核对证据以后再形成判断，疑问保持疑问。";
  notes[3].content="TODO 查看第二份资料，不要自动完成。";
  notes[5]={content:"**[MiniProject]** 核对条件 #MiniProject",children:[{content:"这个对象自己的记录，不能因整理上层而改变归属。"}]};
  notes[6]={content:"TODO **[事务]** 核对引用资料",children:[{content:"普通工作记录：引用缺少日期，需要用户核验。"}]};
  notes[7]={content:"TODO **[事务]** 比较样本边界",children:[{content:"先保留这项条件，不触发正式状态变更。"}]};
  return notes;
}

export async function createFixture(editor) {
  if(await editor.getPage("个人工具")||await editor.getPage("资料工作台"))throw Error("Use an empty isolated Graph; preserve existing pages.");
  await editor.createPage("个人工具",{}, {redirect:false,createFirstBlock:false});
  await editor.appendBlockInPage("个人工具","[[资料工作台]]");
  await editor.createPage("资料工作台",{}, {redirect:false,createFirstBlock:false});
  const root=await editor.appendBlockInPage("资料工作台","**[MiniProject]** 整理一份调研材料 #MiniProject");
  const first=await editor.insertBlock(root.uuid,records()[0].content,{sibling:false});
  await editor.insertBatchBlock(first.uuid,records(first.uuid).slice(1),{sibling:true});
  const tree=await editor.getBlock(root.uuid,{includeChildren:true});
  if(tree.children.length!==80)throw Error("Host did not create the expected subtree; do not continue.");
  return {synthetic:true,root:root.uuid,polish:first.uuid,move:tree.children[1].uuid,destination:tree.children[12].uuid,todo:tree.children[3].uuid};
}
