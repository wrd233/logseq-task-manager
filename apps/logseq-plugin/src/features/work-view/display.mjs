import {parse} from './model.mjs';
export const levels=['auto','emphasis','normal','quiet','compact'];
export function displayLevel(content,override='auto',{root=false,missing=false}={}) {
 if(root||missing)return {level:'normal',reason:root?'对象标题':'来源不可用'};
 if(levels.includes(override)&&override!=='auto')return {level:override,reason:'手动或 Agent 设置'};
 const {task,role}=parse(content.trimStart());
 if(['TODO','DOING','NOW'].includes(task)||['现状','决定','问一下'].includes(role))return {level:'emphasis',reason:'待办或当前工作信息'};
 if(content.length>160||content.split('\n').length>8)return {level:'compact',reason:'长内容，展开可查看全部'};
 if(['注','想法'].includes(role)||['DONE','CANCELED'].includes(task))return {level:'quiet',reason:'背景或已完成信息'};
 return {level:'normal',reason:'普通内容'};
}
export function savedLevels(value){return Object.fromEntries(Object.entries(value&&typeof value==='object'?value:{}).filter(([id,level])=>id&&levels.includes(level)&&level!=='auto'));}
