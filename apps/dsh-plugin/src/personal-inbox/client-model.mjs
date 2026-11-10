import {readerBody} from '../reader-model.mjs';
/* global URL */
export const sourceNames = {manual:'手动', flomo:'Flomo', logseq:'Logseq', dsh:'DSH', browser:'网页', other:'其他'};
export const statusNames = {open:'未处理', waiting:'等待中', resolved:'已处理', archived:'已归档'};
export const localDate = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
export const workIdentity = ref => ref ? JSON.stringify(ref) : '';
export const captureSource = (content,sessionId) => {
  if(/^https?:\/\/\S+$/u.test(content.trim())) return {type:'browser',locator:content.trim()};
  return {type:'dsh',...(sessionId?{sessionId}:{})};
};
export const errorMessage = error => ({
  INBOX_CONFLICT:'这条记录已在别处更新。已保留你的输入，请比较最新内容后再保存。',
  INBOX_BUSY:'正在保存其他操作，请保留输入，稍后重试。',
  INBOX_ID_REUSED:'这次保存的内容已改变，请先找回上次保存结果。',
  INBOX_OPERATION_REUSED:'上次操作的参数与当前不同，请找回上次处理结果。',
  INBOX_CONVERSION_PENDING:'上次转化结果尚未确认，请重试“找回处理结果”。',
  INBOX_KERNEL_UNAVAILABLE:'正式任务服务暂不可用，记录已保留。',
  INBOX_KERNEL_USER_CHANNEL_REQUIRED:'正式任务的用户确认通道尚未连接，记录已保留。',
  INBOX_FORMAL_ANCHOR_REQUIRED:'先导入或选择一条真实的 Logseq 来源，再创建正式任务。',
  INBOX_WORK_SOURCE_REQUIRED:'先关联现有工作，或导入一条 Logseq 来源。',
  INBOX_SOURCE_UNAVAILABLE:'这条 Logseq 来源暂不可读，请连接后重试。',
  INBOX_RESTORE_REQUIRED:'先恢复归档，再继续处理。',
  INBOX_BACKUP_INCOMPLETE:'有记录暂不可读，尚未导出完整备份。请先检查列表中的提示。',
  INBOX_INVALID_BACKUP:'这份文件不是可恢复的 Inbox 备份。',
  INBOX_INVALID:'请检查输入内容。',
  INBOX_LOCATION_UNAVAILABLE:'这里暂时找不到该位置。请选择当前可用的位置。',
  INBOX_LOCATION_OPEN_FAILED:'暂时无法打开。请检查这台主机上的位置，或重新选择。',
  INBOX_NATIVE_PICKER_UNAVAILABLE:'这台主机暂时无法打开系统选择器。可以从已有位置中选择。',
  PLANNER_INVALID:'请检查安排的标题、日期和时间段。',
  PLANNER_CONFLICT:'规划已更新，请重新打开安排后重试。',
  GRAPH_ADAPTER_OFFLINE:'Logseq 来源连接已离线，记录已保留。',
  GRAPH_ID_MISMATCH:'当前连接的 Logseq 图与来源不同，请切回来源所在的图。',
  SOURCE_CONTENT_HASH_MISMATCH:'来源已变化或已有正式对象，请重新核对该来源。',
  TRUSTED_USER_CHANNEL_REQUIRED:'正式任务的用户确认通道尚未连接。',
  ROUTE_NOT_FOUND:'服务版本尚未更新，请更新正式任务服务后重试。',
}[error?.code] ?? '这次操作尚未确认，输入已保留。请检查连接并重试。');
export function safeLink(locator) {
  try {const url=new URL(locator);return ['https:','http:','logseq:'].includes(url.protocol)?url.href:null;} catch{return null;}
}

export function visibleContent(item) {
  if(item.source?.type!=='logseq'||item.editedContent!==null)return item.content;
  const body=readerBody(item.content);
  return (body.status?body.status+' ':'')+body.markdown;
}

export function materialTitle(row) {
  const label = row.label.trim();
  if (!label || label === row.locator && safeLink(label)?.startsWith('logseq:')) return 'Logseq 内容';
  if (/^(?:[\\/]|[A-Z]:[\\/]|file:)/iu.test(label)) return label.split(/[\\/]/u).filter(Boolean).at(-1) || '本机材料';
  return label;
}
