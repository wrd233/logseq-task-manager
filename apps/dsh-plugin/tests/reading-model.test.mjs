import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readingModel} from '../src/reading-model.mjs';

test('model reading updates project semantic fields and never accept generated chart values',async()=>{
  const model=readingModel({agentDefaultModel:{currentSelection:()=>({provider:'fixture',model:'fixture'})},llm:{async *stream(){
    yield {type:'text-delta',text:JSON.stringify({paragraphs:[{key:'counts',markdown:'复核计数',kind:'fact',sourceIds:['s1'],heading:'额外字段',details:[{key:'data',markdown:'查看原表',sourceIds:['s1'],display:'chart',materialIds:['m1'],chartData:[99]}]}]})};
    yield {type:'finish',reason:{kind:'stop'}};
  }}});
  const result=await model({mode:'organize',question:'更新读法',source:{blocks:[{sourceId:'source-1',target:{blockUuid:'block-1'},availability:'available',content:'| 区域 | 台数 |\n| --- | --- |\n| 北 | 4 台 |'}]},materials:[{id:'material-1',availability:'available',filename:'复核表'}]});
  assert.deepEqual(result,{paragraphs:[{key:'counts',markdown:'复核计数',kind:'fact',sourceIds:['source-1'],details:[{key:'data',markdown:'查看原表',sourceIds:['source-1'],display:'chart',materialIds:['material-1']}]}]});
});
