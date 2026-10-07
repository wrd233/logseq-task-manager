import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import process from 'node:process';
import console from 'node:console';

// Portable, deterministic synthetic source only. This does not bind a production
// Graph or manufacture material IDs/references. Real references are inserted by
// the acceptance runner only after the material service returns them.
const destination = resolve(process.argv[2] ?? 'tmp/reading-agent-corpus');
const hash = value => createHash('sha256').update(value).digest('hex');
const uuid = index => `b7261007-0000-4000-8000-${String(index).padStart(12, '0')}`;
const topics = [
  {
    title: '**[事务]** 选择资料整理方式；现在只核验试用，不代表整件事已完成。',
    groups: [
      ['**[目标]** 找到能保留原句和来源的整理方式，先验证取消条款和恢复过程，再决定是否长期采用。', [
        '这次比较只覆盖一个工作目录。另一套资料还没有看过，不能因为这个样本顺利就说所有资料都适合。',
        '**[注]** 如果整理后的记录让条件消失，即使看起来很整齐，我也不接受；理解过程比版面更重要。',
        '不过，读得更顺不等于允许改原文。切换读法时，旧的措辞、疑问和重复句都应当继续在场。']],
      ['TODO 核对取消条款；先读原文，再记录准确依据，不能拿历史完成记录当本次确认。', [
        '[记录] 已查到第二节有取消条件，尚未询问提供方是否有附加限制，当前只能写“找到条款”。',
        '**[问一下]** 能否先取消试用再申请恢复？这是一条待核实问题，不能因为出现“取消”就改变任务状态。',
        '只有得到明确答复并核对现行版本，才考虑完成这一子步骤；本项目的最终选择仍然没有作出。']],
      ['**[记录]** 今天实际完成了两份样本的逐项比较，比较文件还需要通过真实材料服务取得稳定引用。', [
        '详细比较放在实际文件中，正文只保留关键变化和后续落点。材料引用等待服务返回，不能猜一个地址。',
        '**[想法]** 目前偏向保留更朴素的结构，但这个偏向来自小样本，不能写成已经决定采用哪一套。',
        '下一次从原任务继续补充核验结果，不要每轮都新增一棵总结树。重复调用应当查询原请求的结果。']],
      ['**[想法]** 两个方案的成本差异可能来自维护方式，目前缺少连续一周使用后的观察。', [
        '| 观察项 | 方案甲 | 方案乙 |\n| --- | --- | --- |\n| 原句保留 | 样本可读 | 尚待复核 |\n| 恢复过程 | 尚未执行 | 尚未执行 |',
        '表格里的“尚未执行”是未完成事实，不能为了突出对比而把它们丢掉，也不能画成已验证的优势。',
        '如果需要对照阅读，表格和这两条解释必须仍能找到实际来源；对照列标题只是读法，不是可写块。']],
      ['不知道：这个空白到底是遗漏，还是提供方认为不适用？先保留原句和紧邻的说明，稍后再问。', [
        '可能还有第三种解释……这里只写到一半，不能替我补成肯定结论，也不能归入“已经解决”。',
        '[外部标记] 这是未知标记，插件不认识它，也不能因此把它排除在全文或来源集合之外。',
        '同一句话出现在另一段可能承担不同作用。不能只按字面去重，两个 UUID 都有各自的上下文。']],
      ['DONE 历史样本的备份核验；这只是旧样本的完成状态，本次客户正式批复仍然没有收到。', [
        'status-note:: 此处为合成属性，用来核验格式整理保留原属性字节，不代表正式 Kernel 接受事实。',
        '**[注]** 已完成的是历史备份核验；需要客户批复的事项仍然等待，不能用词语“已完成”推导整体结束。',
        '材料链接槽位：doing-comparison。这里暂时是普通文字，最终演练由真实材料关联结果替换为稳定引用。']]
    ]
  },
  {
    title: '**[MiniProject]** 讨论阅读体验；保留可能、目前偏向和尚未询问，不直接变成正式承诺。',
    groups: [
      ['**[想法]** 先把阅读和写作分开说清楚。我希望读起来连贯，但不希望为了连贯失去原来的犹豫。', [
        '如果用户只是想换一种读法，Agent 只能提交来源安排和小标题，不能顺便替换正文或维护 TODO。',
        '目前偏向让标题概括实际来源集合，不过一组内容只要还有反例，标题就不能写成“最终结论”。',
        '还有个问题没想清楚：比较视图里共享解释应该重复展示还是单独放在上方？先留着这个问题。']],
      ['[问一下] 讨论到什么程度才值得保存？不想把每一轮聊天都变成新笔记，也不想丢掉重要转折。', [
        '**[注]** 只保留可继续使用的条件、权衡和真实进展。原讨论没有形成行动，就不要自动添加 TODO。',
        '如果有人说“可以考虑”，保存时仍是“可以考虑”；不能改写成“决定采用”，更不能先行完成。',
        '续接同一个主题的时候，需要看到上次尚未核实的点，而不是只看到一份过于确定的新总结。']],
      ['**[记录]** 第二轮讨论补充了一个限制：共同指导可以共享，项目特有的要求应当继续留在该项目。', [
        '项目甲偏向详细记录，项目乙只保留阶段变化。两者可以共用语气和权限边界，不能互相覆盖差异。',
        '共同来源发生变化后，新的读取需要报告实际加载版本；旧现场仍能辨认自己用的是哪一版。',
        '当前对话不会因为某个文件改变就自动重读，入口应当明确提示重读所需的实际操作，不作魔法承诺。']],
      ['**[想法]** 这条想法被暂时放到一边，不意味着它被否定；之后的新条件可能让它重新值得考虑。', [
        '> “如果试用成本很低，可以先试一周。”\n> 这是一段合成引文。引文中的可能行动不自动成为已授权待办。',
        '反例：即使试用成本很低，退出时如果不能保留记录，试用也可能不合适。这里的“如果”必须保留。',
        '下一轮需要询问退出后的材料和引用如何保存。尚未询问就不能写成对方已确认，也不能标 DONE。']],
      ['同一句话出现在另一段可能承担不同作用。不能只按字面去重，两个 UUID 都有各自的上下文。', [
        '这里的重复句提醒我们保留讨论中的再次强调；前面同句则说明来源身份，两个位置的作用不同。',
        '没有标签的这条记录，也许是临时想法，也许是必要条件。阅读方案不能假装已经知道它的性质。',
        '句中出现 **[目标]** 或 TODO 的字面例子不等于行首语义标记，格式整理不得误改句中内容。']],
      ['TODO 询问提供方退出后是否保留材料；这是讨论后真正打算做的动作，尚未执行。', [
        '**[注]** 普通 TODO 的许可独立于正文润色权限。Agent 能读到这条行动，并不意味着它可以改变状态。',
        '授权只覆盖当前工作的约定目标和操作；Graph 切换、重绑定或撤销后，旧调用不能继续使用旧许可。',
        '完成时需要留下简洁的核验依据。这个询问完成，也不表示试用选择、整个项目或正式阶段得到认可。']]
    ]
  },
  {
    title: '**[事务]** 零散记录；先保留所有来源，再决定是否明确整理格式或继续讨论。',
    groups: [
      ['[目标] 先把散落的片段读完整，看看是否有遗漏条件；旧裸标记仍然可读，不因阅读而写回。', [
        '半句话：也许先从……\n还没想清楚先从哪一份开始，后面这行继续解释前面的停顿，不应该被丢弃。',
        '? 问号单独留在这里：它可能表示疑问，也可能是记录时没写完；系统不能替我决定它已经解决。',
        '如果后续要求整理格式，先显示受限的实际差异，再通过已有版本校验写回，不做大范围重写。']],
      ['**[记录]** 第一遍阅读后发现两条看似重复的记录，其实一个谈成本，一个谈退出后的资料。', [
        '先不要删重复句。整理的目的是让关系更清楚，不是减少来源数量；判断不清时应当保留原来的次序。',
        '先不要删重复句。整理的目的是让关系更清楚，不是减少来源数量；判断不清时应当保留原来的次序。',
        '这两条重复的 UUID 不同。一个来源被高亮时，不能顺便高亮另一个来源，除非标题集合确实包含两者。']],
      ['条件变化：今天又补充一条——退出后需要保留版本记录，而不只是保留最后一次文件。', [
        '**[注]** 这句是并发编辑演练的基础位置。用户追加新条件之后，旧的阅读方案和写回提议必须过期。',
        '重读后继续整理的时候，新补充应当完整在场。不能拿缓存或先前导出的现场盖回用户刚写的内容。',
        '草稿和已保存正文要区分。带现场去协作不能强制结束输入，也不能把还没提交的文字当正式来源。']],
      ['[想法] 用连续段落阅读，也许能更容易看见我的思路是怎样改变的，不过它不适合隐藏层级依赖。', [
        '```text\nTODO 字面代码，不是待办\n[想法] 字面代码，不整理标记\nif (可能) { 保留条件(); }\n```',
        '代码上下文和解释仍然属于这个来源及其子块。行首规范化不能进入代码栅栏改写这些字面内容。',
        '另一种读法可以做局部对照，但对照时需要保留共同父块，以及这些不能单独理解的限定句。']],
      ['**[问一下]** 如果同名材料来自两个目录，怎么知道正文里的引用指向哪一份？不能靠文件名猜。', [
        '材料根甲有嵌套目录，材料根乙也有同名文件；真实关联结果应当给出稳定身份和当前完整文件名。',
        '改名之后旧引用应当仍能找到同一份材料。只在界面上显示一个名称，并不能证明身份没有串工作。',
        '材料链接槽位：scattered-notes。真实演练才写服务返回的 reference，此时不伪造 UUID 或 wiki 链接。']],
      ['这条没有标签，前后两个有标签的块都与它有关。仅凭标签分组会把必要的解释切断。', [
        '**[注]** 原结构和不同阅读方案往返时，应当保留有效的阅读位置、焦点和取消路径，而不是每次回到顶端。',
        '用户选择文字复制时不应触发来源定位。点击材料引用先打开统一预览，也不应误触发整行高亮。',
        '实际原生块如果折叠或没有挂载，要说明当前哪些来源可见；不能把不存在的 DOM 说成已经高亮。']]
    ]
  },
  {
    title: '**[任务]** 正式边界合成样本；此锚点只用来核验自然写回保护，不代表正式 Kernel 注册。',
    groups: [
      ['**[当前推进]** 受管字段示例：正式程序通过正式端口维护，不能由自然正文替换来冒充状态更新。', [
        'task-copilot-id:: synthetic-formal-boundary\n这是合成属性，不是现有生产对象 ID；必须保留，不创建生产任务。',
        '正式任务、事务和认可边界不因普通 TODO 许可而放宽。Agent 可以描述依据，不能代替用户作认可。',
        '正式字段和属性的保护应当以真实范围和版本校验为依据，不依赖隐藏按钮或只在界面上显示警告。']],
      ['**[等待]** 客户正式批复尚未收到；历史记录出现“已完成”也不等于这件等待事项变得可行动。', [
        '已完成：历史备份核验。客户正式批复仍未收到。这条合成反例用于防止把某个完成词推导成整体状态。',
        '**[注]** 若只有部分写回成功，实际结果应当指出成功落点和剩余失败，不能提前标记整个任务完成。',
        '如果 Journal 没确认或传输超时，先按原 requestId 查询结果；盲目生成新请求可能重复保存同一进展。']],
      ['**[目标]** 分别验证读取、编排、正文、文件和普通 TODO 权限，不能将连接成功当作全部授权。', [
        '未经授权的普通 TODO 修改应当被拒绝；授权后仍检查来源版本和完成依据，不能只相信外部 payload。',
        '子项的完成只代表该子项。正式阶段认可、项目闭环和父任务结束仍走各自合法端口与用户决策。',
        '撤销、卸载、切换 Graph 或重新绑定之后，旧外部调用和晚到阅读方案必须失效，不能串到下一份工作。']],
      ['[记录] 断连后保留最后一次可靠资料，但缓存读取应当明确标成 last-known，不冒充现场已经核验。', [
        '重新连接并刷新后才取得新的真实现场。读取入口、原始层级、保存版本和材料集合都需要可追溯来源。',
        '已有用户 WORKSPACE.md 不能覆盖；生成的说明可以使用明确的独立文件，并保留用户原来的入口内容。',
        '外部会话关联只记录用户提供的真实入口。没有可靠链接时如实说明，不编造地址、不自动发消息。']],
      ['**[想法]** 独立预览窗口很有用，但同一材料的目标和版本必须一致，关闭之后也要释放监听资源。', [
        '原文件字节、阅读书签、正文草稿和中文组合输入都需要分别核验。一个截图不能证明这些条件全部成立。',
        '最终包需要在仓库外解压并实际加载，通道和资源从包内启动；不能依赖开发目录或临时注入取得通过。',
        '平台版本、物理输入法、Finder 和普通文件 IO 竞态如未实测就列为未实测，不写“所有场景已验证”。']],
      ['**[注]** 验收只使用合成资料。材料格式待共同契约确认，不把任意五种格式自行当作指定核心文件。', [
        '两个工作区应当实际加载同一份共同指导，新版本重读后可辨认加载版本，同时保留各项目自己的差异。',
        '用户明确编辑共同指导才改变长期来源。某次讨论中的局部偏好不能自动变成其他项目的全局规则。',
        '保留这些反例、条件和未确定记录，是为了继续协作时仍看见真实思路，而不是读到过度确定的摘要。']]
    ]
  }
];
const blocks = [];
const add = (content, depth, parent, order) => {
  const index = blocks.length + 1, block = { uuid: uuid(index), content, depth, parentUuid: parent, order };
  blocks.push(block); return block.uuid;
};
const root = add('**[MiniProject]** 阅读与协作合成验收；这里只保存合成原句和层级，材料与正式注册由真实隔离演练建立。\n我希望这份资料能保留做事时真实的节奏：查到一条事实就续接原任务，改变想法就留下改变的理由，仍然不知道的地方继续写不知道。读者可以换一种顺序理解这些内容，但不能因为版面变得漂亮就误以为我已经作出决定。\n这次只比较两个合成样本，真实业务的资料、客户与审批都没有参与。核验样本可以证明某条路径在这次运行有效，却不能证明所有平台、输入法、文件格式和并发条件都安全。发生不确定结果时，我更希望看到可靠的原请求查询和清楚的失败落点，而不是一句笼统的成功。\n如果需要把详细产物放到材料，先建立实际文件和真实关联，再把完整文件名及稳定引用续接到原来的工作里。没有完成这一步之前，这份资料里的材料槽位只是待接线的普通文字，不是服务已经返回的身份或链接。', 0, null, 0);
for (const [topicOrder, topic] of topics.entries()) {
  const parent = add(topic.title, 1, root, topicOrder);
  for (const [groupOrder, [content, children]] of topic.groups.entries()) {
    const group = add(content, 2, parent, groupOrder);
    for (const [order, child] of children.entries()) add(child, 3, group, order);
  }
}
const chinese = [...blocks.map(b => b.content).join('\n')].filter(c => /\p{Script=Han}/u.test(c)).length;
const contentCounts = new Map();
for (const block of blocks) contentCounts.set(block.content, (contentCounts.get(block.content) ?? 0) + 1);
const manifest = {
  schemaVersion: 1, synthetic: true, rootUuid: root, blocks: blocks.length, chineseCharacters: chinese,
  layers: Math.max(...blocks.map(b => b.depth)) + 1,
  duplicateGroups: [...contentCounts.values()].filter(count => count > 1).length,
  requiredFeatures: ['ordinary-todo', 'formal-syntax-boundary', 'bare-markers', 'bold-markers', 'unknown-markers', 'unlabeled', 'duplicate-text-distinct-uuid', 'conditions', 'counterexamples', 'tables', 'fenced-code', 'quotations', 'multiline', 'properties'],
  materialSlots: ['doing-comparison', 'scattered-notes'],
  unconnected: ['material-reference-resolution', 'five-core-file-formats', 'actual-logseq-host', 'real-formal-registration'],
  sourceDigest: hash(JSON.stringify(blocks)),
  acceptanceStatus: 'fixture-prepared-only'
};
if (blocks.length < 80 || chinese < 4000 || manifest.layers !== 4 || !manifest.duplicateGroups || new Set(blocks.map(b => b.uuid)).size !== blocks.length) throw Error(`Fixture requirements not met: ${JSON.stringify(manifest)}`);
const markdown = blocks.map(block => {
  const indent = '  '.repeat(block.depth), [first, ...rest] = block.content.split('\n');
  return `${indent}- ${first}\n${rest.map(line => `${indent}  ${line}`).join('\n')}${rest.length ? '\n' : ''}${indent}  id:: ${block.uuid}`;
}).join('\n') + '\n';
await mkdir(destination, { recursive: true });
await writeFile(join(destination, '合成阅读与协作.md'), markdown);
await writeFile(join(destination, 'blocks.json'), JSON.stringify(blocks, null, 2) + '\n');
await writeFile(join(destination, 'manifest.json'), JSON.stringify({ ...manifest, markdownDigest: hash(markdown) }, null, 2) + '\n');
console.log(JSON.stringify(manifest));
