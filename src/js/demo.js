/* Novie — 首次启动示例：《斗罗大陆1》早期剧情原创同人重述（非原文） */

import { uid, countChars, plainTextToHtml, dateKey, addDays } from './utils.js';
import { bulkPut, put } from './db.js';

const PROJECT_NAME = '《斗罗大陆1》同人参考';
const AUTHOR = '同人示例';

const RAW = {
  ch1: {
    title: '第一章 鬼见愁的最后一夜',
    summary: '唐门外门弟子唐三因偷学《玄天宝录》被围，在鬼见愁崖顶留下佛怒唐莲，纵身跳崖，带着前世记忆转生斗罗大陆。',
    status: 'done',
    text: `巴蜀的夜，风从崖底往上灌。

唐三站在鬼见愁的峰顶，灰衣下摆被风吹得猎猎作响。他二十九岁，是唐门外门弟子，也是这一代最擅长机括暗器的人。可今夜，他不是来试暗器的。

三天前，他偷入内门，看完了《玄天宝录》。门规写得清楚：外门弟子擅入内门，死。长老们已经封了下山的路。

唐三没有辩白。他把三朵紫金莲花轻轻放在崖边的石头上。那是他耗费数年做出的佛怒唐莲，唐门最顶级的机括暗器之一。

“东西还给你们。”他说，“我学过的，一条命也还得清。”

山风把他的衣角拉直，像一面小小的旗。他想起自己这一生：生在唐门，长在唐门，所有的本事都从这门里来。门规要收回去，那就还干净。

他纵身跃下。

黑暗从四面合拢。没有疼痛，只有很长很长的下坠，像穿过一条没有尽头的走廊。

再醒来时，他听见婴儿的哭声。那声音离得很近，近得像是从他自己的喉咙里发出来的。

他成了一个婴儿。后来他才知道，这里叫斗罗大陆，没有魔法，没有斗气，只有一种东西——武魂。`,
  },
  ch2: {
    title: '第二章 蓝银草与左手的锤',
    summary: '六岁武魂觉醒，唐三被判定为废武魂蓝银草，却测出先天满魂力；左手掌心还藏着一柄不为人知的小锤。',
    status: 'done',
    text: `圣魂村不大，最气派的建筑是武魂殿设在这里的一间木屋。六岁这年，唐三和村里其他孩子一起，排队等待武魂觉醒。

负责仪式的执事叫素云涛，二十多岁，眉间有一点淡金色的印记。他先唤醒自己的武魂，一层白色、一层黄色的魂环从脚下升起，屋里的孩子都安静了。

镰刀、锄头、铁锹。前面的孩子一个个走上前，又一个个失望地退开。农具武魂不算稀奇，没有魂力才最要命。

轮到唐三。

温暖的暖流从小腹升起。他伸出右手，掌心钻出一株细细的蓝银色草叶，在风里轻轻摇晃。

“蓝银草。”素云涛看了一眼，语气平淡，“标准的废武魂。”

唐三没有急着收回手。他问：“叔叔，魂力测试还没做。”

素云涛把蓝色的水晶球递到他面前。唐三的手掌贴上去，安静的水晶球忽然亮了。

先是微弱的一点蓝，接着光从球心涌出来，把整间木屋照得发白。素云涛后退了半步，喉咙里挤出一句几乎变调的话：“先天满魂力？”

屋里没有人说话。

唐三垂下左手。他的左手掌心里，还有一柄极小的黑色锤子，正慢慢沉回皮肤之下。那锤子没有告诉任何人。`,
  },
  ch3: {
    title: '第三章 左手的锤，右手的草',
    summary: '唐昊发现唐三的双生武魂，第一次露出颓废之外的神情，并叮嘱他隐藏昊天锤；随后唐三前往诺丁学院，被大师收为弟子。',
    status: 'done',
    text: `铁匠铺里只有炉火的声音。

唐三摊开左手，一柄乌黑的小锤浮在掌心。锤身很沉，表面錾着细密的暗纹，和右手的蓝银草挨在一起，像两件完全不该同时出现的东西。

唐昊手里的酒壶掉在地上，碎成几片。

他盯着那柄锤子看了很久，眼睛里有一种唐三从没见过的光。那不是惊喜，更像是某个埋在雪底很多年的东西，忽然被人挖了出来。

“听着。”唐昊蹲下来，双手按住他的肩，“左手的锤，护住右手的草。在外人面前，永远不要把它亮出来。也不要急着给锤子添魂环。”

“为什么？”

“因为你还没强到能护住这个秘密。”

唐三点头。唐昊的手很粗糙，掌心的老茧像铁一样硬。那天晚上，父亲第一次给他讲锤法，讲到月亮落到山后面。

三天后，老杰克村长带着唐三离开圣魂村，去诺丁城的初级魂师学院。

报名处看门的人因为“蓝银草”和“工读生”两个词，故意拖延。唐三没有争执，手指在袖口里轻轻一压，三枚细针无声钉进了对方脚边的木桩。

就在这时，一个面容僵硬、目光却极亮的中年人接过武魂证明。他只看了一眼“蓝银草”和“先天满魂力”，就抬起头来。

“孩子，”他说，“你愿不愿意拜我为师？”

唐三看着他，跪下，认认真真磕了三个头。

“老师。”`,
  },
  ch4: {
    title: '第四章 七舍的蝎子辫',
    summary: '唐三进入诺丁学院七舍，凭借身法赢下宿舍老大王圣；梳着蝎子辫的小舞推门而入，两人第一次见面。',
    status: 'done',
    text: `诺丁学院的七舍是一间旧宿舍，床板长短不齐，窗户关不严，风一吹就响。

工读生们靠做杂役换学费，在学院里并不体面。宿舍老大王圣习惯给新人立规矩，看见唐三瘦，伸手就来推他的肩膀。

唐三侧身让开。王圣扑了个空，脸上挂不住，第二下直接用了武魂。

他没赢。唐三甚至没有唤出蓝银草，只用步法绕到侧面，一抬手，三枚石子分别打在王圣的膝弯、手腕和胸口。力道不重，却刚好让人使不上劲。

“服不服？”王圣单膝跪在地上，抬头看他。

“服了。”唐三伸手把他拉起来，“我睡靠窗那张床就行。”

门在这时候被推开。

一个梳着蝎子辫的小女孩站在门口，粉白色的衣裙，眼睛很亮。她看看地上的王圣，又看看唐三，像在评估一件新玩具。

“你就是新来的？”她走进来，语气理所当然，“我叫小舞，跳舞的舞。武魂是兔子，很厉害的那种。”

“唐三。”

“唐三。”她跟着念了一遍，点点头，仿佛这个名字通过了某种检验，“七舍我说了算。你打赢了王圣，那以后你排第二，我排第一。”

“行。”

小舞愣了一下，大概没料到他会答应得这么快。她转身去挑床铺，蝎子辫在背后一甩一甩，嘴边却翘了起来。`,
  },
  ch5: {
    title: '第五章 猎魂森林的第一圈',
    summary: '大师带唐三进入猎魂森林，理论课变成生死局；唐三用暗器与步法杀死四百余年的曼陀罗蛇，得到第一枚黄色魂环。',
    status: 'done',
    text: `猎魂森林的树很高，阳光落下来被切成碎片。

大师玉小刚走在前面，身边跟着他那只长得像小猪的武魂罗三炮。唐三第一次看到罗三炮时，努力没有笑出声。大师却很大方：“笑吧。我的武魂是变异失败的产物，二十九级，一辈子都迈不过去。所以我才去研究别人怎么跨过去。”

第一堂课没有讲魂力。大师只讲了三个数字：十年、百年、千年。魂兽活多久，掉落的魂环大致就有多少年限。魂师能吸收的上限，和自身经脉、武魂强度有关。超了，轻则废，重则死。

他们遇到曼陀罗蛇时，唐三正在记笔记。

那是一条四百多年的蛇，立起来比人还高，蛇身翠绿，吐出的信子带着甜味。罗三炮挡在前面，被一口毒雾扫中，倒在地上抽搐。大师脸色苍白，却仍站在原地没有退。

唐三没有唤武魂。他先退，退到一棵树后，左手在腰间的机括囊上一按。

袖箭先出，钉向蛇眼。曼陀罗蛇偏头躲开，第二枚弩箭已经贴着树皮旋了半圈，钉进它的颈侧。蛇怒吼着扑来，唐三踩着树干翻身而起，蓝银草这才缠住蛇尾，把它的速度硬生生拖慢了一瞬。

一瞬够了。

三枚龙须针没入蛇口。曼陀罗蛇滚倒在地，压断了两棵小树。大师生死关头还不忘喊：“别靠太近，看它的魂环！”

一圈黄色的光从蛇身上浮起，慢慢落在唐三脚边。

“四百年出头。”大师喘着气，眼睛却亮得吓人，“吸收它。你比它更狠，就配得上它。”

唐三盘膝坐下。第一魂环入体时，他听见自己骨头里传来一声轻响，像有什么东西，终于被打开了。`,
  },
  ch6: {
    title: '第六章 只收怪物的学院',
    summary: '十二岁的唐三与小舞来到索托城外报名史莱克学院，戴沐白、奥斯卡、马红俊、宁荣荣、朱竹清陆续出现，七怪第一次站到同一扇门前。',
    status: 'done',
    text: `索托城外的史莱克学院没有校门，只有一块旧木牌，插在风吹得发白的土路尽头。

报名桌后面坐着一个老先生，眯着眼打量唐三和小舞：“十三岁以下，魂力二十五级以上。达不到，现在就可以回去了。”

小舞放出魂力，唐三跟着释放。空气里的压迫感让桌上的纸张哗啦一响。

“不错。”老先生点点头，朝院里喊，“有人来考试了。”

先出来的是个金发青年，身形高，眼睛里有种懒散的凶气。他看了唐三一眼：“戴沐白，邪眸白虎。走吧，第四关不在这里。”

紧接着，一个桃花眼的青年抱着手靠在门边笑：“奥斯卡，食物系魂师。想买香肠吗？不贵，一根魂力，童叟无欺。”

“别理他。”戴沐白说。

院子里又多了几个人。一个笑起来很亮的胖少年、一位衣饰精致却皱着眉的少女，还有一个安静得几乎没有存在感的黑衣女孩。最后那个女孩的眼睛最冷，像一把收在鞘里的刀。

马红俊率先开口：“又来两个。戴老大，这回不会又是打两下就哭的吧？”

“你先把嘴角的油擦干净。”戴沐白说。

唐三站在门口，看着这几个人。他忽然有种奇怪的感觉：这间破学院里，好像真的什么怪物都收。

“走吧。”他对小舞说，“进去看看。”

小舞握了握拳头，笑着跟上：“输的人请吃饭。”`,
  },
  ch7: {
    title: '第七章 赵无极的第四关',
    summary: '第四关由七十六级魂圣赵无极亲自出手；小舞受伤后，唐三用唐门暗器正面压制魂圣，直到夜里唐昊出现。',
    status: 'writing',
    text: `第四关的考官是赵无极。

这位史莱克学院的副院长站在院子中央，身形不高，肩背却宽得像一堵墙。他脚下升起两黄、两紫、三黑的魂环，整个院子的空气都沉了下去。

“一炷香。”赵无极说，“在我手里撑过一炷香，就算过关。”

戴沐白和朱竹清率先冲上去，一个正面硬接，一个从侧后切入。赵无极第一魂技“不动明王身”亮起，重力骤然压下，两人几乎同时被震飞。

小舞的魅惑刚刚出手就被反噬。她脸色一白，嘴角溢血，整个人向后倒。

唐三接住她。

那一瞬间，他眼里的温度消失了。他把小舞轻轻放在墙边，站起来，双手从腰间滑过，十指间已经多了十几样东西。

赵无极挑了挑眉：“小娃娃，想认真？”

回答他的是一阵密集到分不清先后的破空声。

袖箭、飞刀、透骨针、飞蝗石。唐三的步伐像贴着地面游走的影子，每一枚暗器都不求致命，只求封住赵无极下一步最舒服的落脚点。赵无极一拳砸碎三枚石子，脚边就多出两枚钢针；他侧身躲开弩箭，膝弯处又响起机括轻响。

堂堂七十六级魂圣，竟被逼得收了两次手。

赵无极的脸色终于认真起来。他正要加力，院墙外的黑暗里忽然多了一道影子。

那人没有进来，只站在树影里。九个魂环在月光下一闪而过。

“赵无极。”一个低沉的声音说，“以大欺小，很好。”

赵无极的动作僵住了。`,
  },
  ch8: {
    title: '第八章 星斗森林的夜',
    summary: '泰坦巨猿带走小舞，唐三孤身追入星斗大森林，在生死之间越级吸收人面魔蛛的魂环，八蛛矛破体而出。',
    status: 'writing',
    text: `星斗大森林的夜，静得不正常。

先是鸟不叫了，接着虫声也断了。大地开始一下一下地震动，像有一颗巨大的心脏埋在地下。参天古树被什么东西撞倒，轰然砸在营地外。

泰坦巨猿从黑暗里走出来，身高十五米，肌肉像一块块花岗岩。它没有看赵无极，也没有看戴沐白，径直越过所有人，把缩在营地中央的小舞抓进掌心。

“小舞！”

唐三追出去的时候，只来得及看见那道巨大的背影消失在林海里。

他在黎明前最黑的那段路上，遇到了人面魔蛛。

那是一头两千年的魂兽，腹部有一张惨白的人脸纹路，八条长腿几乎与夜色融为一体。它挡在唯一的山道上，像一扇活着的门。

唐三没有绕路。

他先用蓝银草缠住蛛腿，再以袖箭封眼。人面魔蛛喷出的蛛网把他整个人罩住，他就用匕首割开一条缝，硬生生扑进去，把最后一枚龙须针钉进那团白色纹路的正中。

魂兽倒下时，一圈紫色的光浮起来，比他能承受的年限高出一截。

大师的声音在脑子里响起：超了，会死。

唐三看了一眼山道尽头——那里有小舞的方向。

他盘膝坐下，把魂环引向自己。

骨骼碎裂的声音从背后传来。第一根紫黑色的蛛矛破开皮肉，接着是第二根、第三根。疼痛像潮水一样把他淹没，他咬着牙，没有出声。

天亮之前，星斗森林里多了一个长着八根蛛矛的少年。

他站起来，朝着森林深处走去。`,
  },
};

const EXTRA = {
  ch1: { target: 1500, tags: ['前世', '唐门', '开篇'], plotlines: ['main', 'tangmen'] },
  ch2: { target: 1500, tags: ['武魂觉醒', '双生武魂'], plotlines: ['main'] },
  ch3: { target: 1600, tags: ['唐昊', '拜师'], plotlines: ['main', 'tangmen'] },
  ch4: { target: 1400, tags: ['诺丁学院', '初遇'], plotlines: ['main', 'love'] },
  ch5: { target: 1600, tags: ['猎魂森林', '第一魂环'], plotlines: ['main'] },
  ch6: { target: 1800, tags: ['史莱克', '七怪'], plotlines: ['main', 'team'] },
  ch7: { target: 1800, tags: ['赵无极', '暗器'], plotlines: ['team', 'tangmen', 'love'] },
  ch8: { target: 1800, tags: ['星斗森林', '八蛛矛'], plotlines: ['main', 'team', 'romance'] },
};

export async function createDemoProject() {
  const now = Date.now();
  const projectId = uid('prj');
  const project = {
    id: projectId,
    name: PROJECT_NAME,
    author: AUTHOR,
    description: '基于《斗罗大陆1》早期剧情的原创同人重述，用于演示长篇连载、群像与剧情线管理。不是原文摘录，非官方资料；原作版权归原作者及权利方所有。',
    createdAt: now - 86400000 * 24,
    updatedAt: now,
    lastOpenedAt: now,
    dailyGoal: 3000,
    totalGoal: 3000000,
    color: '#8a5a3b',
    password: null,
  };

  const vol1 = { id: uid('vol'), projectId, title: '第一卷 圣魂村', order: 0 };
  const vol2 = { id: uid('vol'), projectId, title: '第二卷 史莱克七怪', order: 1 };
  const volumes = [vol1, vol2];

  const PLOTLINE_IDS = { main: uid('pl'), team: uid('pl'), love: uid('pl'), tangmen: uid('pl') };
  const plotlines = [
    { id: PLOTLINE_IDS.main, projectId, name: '主线 · 双生武魂与成神之路', color: '#b4552d', description: '从圣魂村觉醒到史莱克七怪，再到更远处的舞台。', createdAt: now - 86400000 * 22 },
    { id: PLOTLINE_IDS.team, projectId, name: '群像线 · 史莱克七怪', color: '#4d7d7a', description: '七个人如何从互不服气，变成能把后背交给彼此的队伍。', createdAt: now - 86400000 * 22 + 1000 },
    { id: PLOTLINE_IDS.love, projectId, name: '感情线 · 唐三与小舞', color: '#8a5f86', description: '从七舍初遇到星斗森林，一次次选择把对方放在前面。', createdAt: now - 86400000 * 22 + 2000 },
    { id: PLOTLINE_IDS.tangmen, projectId, name: '暗器线 · 唐门绝学', color: '#8a6f3f', description: '前世的手艺，在另一个世界成为保命与立身的底牌。', createdAt: now - 86400000 * 22 + 3000 },
  ];

  const chapterPlan = [
    { key: 'ch1', volumeId: vol1.id, day: -18 },
    { key: 'ch2', volumeId: vol1.id, day: -15 },
    { key: 'ch3', volumeId: vol1.id, day: -12 },
    { key: 'ch4', volumeId: vol1.id, day: -9 },
    { key: 'ch5', volumeId: vol1.id, day: -5 },
    { key: 'ch6', volumeId: vol2.id, day: -2 },
    { key: 'ch7', volumeId: vol2.id, day: -1 },
    { key: 'ch8', volumeId: vol2.id, day: 0 },
  ];

  const chapters = [];
  const contents = [];
  const chapterIdByKey = {};
  chapterPlan.forEach((plan, index) => {
    const raw = RAW[plan.key];
    const extra = EXTRA[plan.key];
    const id = uid('ch');
    chapterIdByKey[plan.key] = id;
    const html = plainTextToHtml(raw.text);
    const chars = countChars(raw.text);
    const ts = now + plan.day * 86400000 + 3600000 * 20;
    chapters.push({
      id,
      projectId,
      volumeId: plan.volumeId,
      title: raw.title,
      order: index,
      summary: raw.summary,
      status: raw.status,
      targetWords: extra.target,
      tags: extra.tags,
      plotlineIds: extra.plotlines.map(k => PLOTLINE_IDS[k]).filter(Boolean),
      wordCount: chars,
      wordCountNoPunct: countChars(raw.text, true),
      mentions: [],
      createdAt: ts,
      updatedAt: ts,
    });
    contents.push({ id, html, updatedAt: ts });
  });

  const characters = [
    {
      id: uid('chr'), projectId, name: '唐三', alias: '小三 / 唐门弟子', role: '主角', gender: '男',
      identity: '史莱克七怪核心；双生武魂：蓝银草与昊天锤；唐门暗器传人',
      appearance: '黑发，身形清瘦，手指修长，习惯在袖口里藏几枚细针。',
      personality: '冷静、谨慎，先算三步再出手；对承诺和同伴极认真。',
      bio: '前世为唐门外门弟子，跳崖后带着记忆转生斗罗大陆。武魂觉醒时为蓝银草，左手却藏着昊天锤。习惯用最小的代价换取最大的胜算。',
      tags: ['主角', '双生武魂', '唐门'],
      relations: [
        { targetName: '小舞', label: '青梅竹马 / 恋人' },
        { targetName: '玉小刚', label: '亦师亦父' },
        { targetName: '唐昊', label: '父子' },
        { targetName: '戴沐白', label: '队长与老大' },
        { targetName: '奥斯卡', label: '可靠的同伴' },
      ],
      color: '#b4552d',
      createdAt: now - 86400000 * 20,
    },
    {
      id: uid('chr'), projectId, name: '小舞', alias: '小舞姐 / 柔骨兔', role: '女主', gender: '女',
      identity: '史莱克七怪成员，武魂：柔骨兔；真实身份与魂兽血脉有关',
      appearance: '蝎子辫，粉白裙装，身形轻盈，笑起来眼睛很亮。',
      personality: '活泼、护短、直觉准；平时爱闹，遇事却能立刻决断。',
      bio: '在诺丁学院七舍与唐三相识，自称七舍第一。会在唐三最需要的时候挡在前面，也敢于在他冲动时拉住他。',
      tags: ['女主', '柔骨兔', '感情线'],
      relations: [
        { targetName: '唐三', label: '青梅竹马 / 恋人' },
        { targetName: '宁荣荣', label: '室友 / 闺蜜' },
        { targetName: '朱竹清', label: '同伴' },
        { targetName: '比比东', label: '杀母之仇' },
      ],
      color: '#8a5f86',
      createdAt: now - 86400000 * 20 + 1000,
    },
    {
      id: uid('chr'), projectId, name: '戴沐白', alias: '戴老大 / 邪眸白虎', role: '配角', gender: '男',
      identity: '史莱克七怪老大，武魂：邪眸白虎，星罗帝国皇子',
      appearance: '金发，身形高大，双瞳异色，站着不动也有压迫感。',
      personality: '外冷内热，嘴上不耐烦，真出事时第一个往前站。',
      bio: '史莱克学院的老学员，队伍里的正面承伤与威压担当。看起来散漫，其实比谁都清楚“老大”两个字要付什么。',
      tags: ['七怪', '邪眸白虎', '老大'],
      relations: [
        { targetName: '唐三', label: '队长与老大' },
        { targetName: '朱竹清', label: '恋人 / 并肩' },
        { targetName: '奥斯卡', label: '损友' },
        { targetName: '马红俊', label: '兄弟 / 损友' },
      ],
      color: '#8a6f3f',
      createdAt: now - 86400000 * 19,
    },
    {
      id: uid('chr'), projectId, name: '奥斯卡', alias: '小奥 / 香肠大叔', role: '配角', gender: '男',
      identity: '史莱克七怪成员，食物系魂师，武魂：香肠',
      appearance: '桃花眼，总像没睡醒，袖口永远沾着一点面粉。',
      personality: '话多、爱开玩笑，关键时刻极可靠；在喜欢的人面前会紧张。',
      bio: '食物系魂师的代表。看起来只会做香肠，实际上他的补给能让整支队伍多撑过很多个本不该撑过的回合。',
      tags: ['七怪', '食物系', '辅助'],
      relations: [
        { targetName: '宁荣荣', label: '恋人' },
        { targetName: '唐三', label: '可靠的同伴' },
        { targetName: '戴沐白', label: '损友' },
        { targetName: '马红俊', label: '损友' },
      ],
      color: '#5b7f63',
      createdAt: now - 86400000 * 19 + 1000,
    },
    {
      id: uid('chr'), projectId, name: '马红俊', alias: '胖子 / 邪火凤凰', role: '配角', gender: '男',
      identity: '史莱克七怪成员，武魂：邪火凤凰',
      appearance: '体型偏胖，笑起来很亮，动作却比看起来灵活得多。',
      personality: '嘴碎、热血、爱面子；对同伴的义气从来不需要理由。',
      bio: '队伍里的范围输出和气氛担当。有他在，再紧的场面也能喘一口气；但真到要拼命的时候，他比谁都先冲。',
      tags: ['七怪', '邪火凤凰', '输出'],
      relations: [
        { targetName: '戴沐白', label: '兄弟 / 损友' },
        { targetName: '奥斯卡', label: '损友' },
        { targetName: '唐三', label: '队友' },
      ],
      color: '#9c5a63',
      createdAt: now - 86400000 * 18,
    },
    {
      id: uid('chr'), projectId, name: '宁荣荣', alias: '荣荣 / 七宝琉璃塔', role: '配角', gender: '女',
      identity: '史莱克七怪成员，七宝琉璃宗小公主，武魂：七宝琉璃塔',
      appearance: '衣饰讲究，眉眼精致，走路时带着一点被宠大的骄气。',
      personality: '起初任性，后来学会把天赋和责任放在一起；护短，也愿意认错。',
      bio: '全书最强的增益系魂师之一。她真正的成长不是塔多了一层，而是终于愿意为别人承担。',
      tags: ['七怪', '七宝琉璃塔', '增益'],
      relations: [
        { targetName: '奥斯卡', label: '恋人' },
        { targetName: '小舞', label: '室友 / 闺蜜' },
      ],
      color: '#50708c',
      createdAt: now - 86400000 * 18 + 1000,
    },
    {
      id: uid('chr'), projectId, name: '朱竹清', alias: '竹清 / 幽冥灵猫', role: '配角', gender: '女',
      identity: '史莱克七怪成员，武魂：幽冥灵猫，星罗帝国朱家之女',
      appearance: '黑发，身形修长，神情清冷，站在人群里像一道影子。',
      personality: '寡言、倔强，目标明确；不擅长说软话，但会一直站在该站的位置。',
      bio: '速度与刺杀型魂师。她和戴沐白之间既有旧约，也有不肯低头的骄傲；两个人都在用自己的方式变强。',
      tags: ['七怪', '幽冥灵猫', '敏攻'],
      relations: [
        { targetName: '戴沐白', label: '恋人 / 并肩' },
        { targetName: '小舞', label: '同伴' },
      ],
      color: '#7a5c86',
      createdAt: now - 86400000 * 17,
    },
    {
      id: uid('chr'), projectId, name: '玉小刚', alias: '大师 / 罗三炮', role: '配角', gender: '男',
      identity: '史莱克学院教师，武魂理论研究者；武魂：变异罗三炮',
      appearance: '面容僵硬，衣着朴素，目光却很锐利，像随时在推演什么。',
      personality: '固执、克制，对武魂理论近乎偏执；对学生严厉，却愿意用自己的方式护住他们。',
      bio: '二十九级的大魂师，一辈子卡在瓶颈上，却把别人跨过瓶颈的方法研究了个透。他看穿唐三的双生武魂，也看出这个孩子缺的不是天赋，而是活下去的分寸。',
      tags: ['老师', '武魂理论', '罗三炮'],
      relations: [
        { targetName: '唐三', label: '亦师亦父' },
        { targetName: '比比东', label: '旧日恋人 / 旧怨' },
        { targetName: '唐昊', label: '旧识' },
      ],
      color: '#8a5a3b',
      createdAt: now - 86400000 * 16,
    },
    {
      id: uid('chr'), projectId, name: '唐昊', alias: '昊天斗罗', role: '配角', gender: '男',
      identity: '唐三之父，昊天宗封号斗罗；武魂：昊天锤',
      appearance: '高大，胡茬凌乱，常年一身酒气，手掌粗糙得像铁。',
      personality: '把痛藏得很深，清醒时寡言，喝醉后偶尔露出锋芒。',
      bio: '大陆最年轻的封号斗罗之一，因妻子阿银的旧事心灰意冷，隐居圣魂村打铁。唐三的双生武魂让他重新看见了某种可能性，也让他更害怕。',
      tags: ['封号斗罗', '昊天锤', '父亲'],
      relations: [
        { targetName: '唐三', label: '父子' },
        { targetName: '玉小刚', label: '旧识' },
      ],
      color: '#5b5f6e',
      createdAt: now - 86400000 * 15,
    },
    {
      id: uid('chr'), projectId, name: '比比东', alias: '武魂殿教皇', role: '反派', gender: '女',
      identity: '武魂殿教皇，双生武魂：死亡蛛皇与噬魂蛛皇',
      appearance: '华贵，冷静，眼神像一层结冰的湖面。',
      personality: '克制、骄傲、极有耐心；很少把真正的情绪放在脸上。',
      bio: '武魂殿的最高掌权者，也是唐三与小舞未来最危险的对手。她与玉小刚有一段旧缘，最终却站在了所有旧人之外。',
      tags: ['反派', '武魂殿', '双生武魂'],
      relations: [
        { targetName: '玉小刚', label: '旧日恋人 / 旧怨' },
        { targetName: '小舞', label: '杀母之仇' },
      ],
      color: '#7a5c86',
      createdAt: now - 86400000 * 14,
    },
  ];

  const nameToId = new Map(characters.map(c => [c.name, c.id]));
  for (const c of characters) {
    c.relations = (c.relations || [])
      .map(r => ({ targetId: nameToId.get(r.targetName) || null, label: r.label }))
      .filter(r => r.targetId);
  }

  const textByChapter = new Map(chapters.map((c, i) => [c.id, RAW[chapterPlan[i].key].text]));
  for (const c of characters) {
    const names = [c.name, ...(c.alias || '').split(/[\/，,、\s]+/)]
      .map(s => s.trim()).filter(s => s.length >= 2);
    for (const chapter of chapters) {
      const text = textByChapter.get(chapter.id) || '';
      if (names.some(n => text.includes(n))) chapter.mentions.push(c.id);
    }
  }

  const plotnodes = [
    { key: 'ch1', title: '鬼见愁跳崖', note: '前世以命还门规，带着记忆转生。', line: 'tangmen', color: '#8a6f3f' },
    { key: 'ch2', title: '双生武魂觉醒', note: '蓝银草与昊天锤同时出现，先天满魂力。', line: 'main', color: '#b4552d' },
    { key: 'ch3', title: '左手的锤', note: '唐昊的叮嘱，第一次把秘密变成责任。', line: 'main', color: '#b4552d' },
    { key: 'ch4', title: '七舍初遇', note: '唐三与小舞的第一次见面，七舍的规矩重新排序。', line: 'love', color: '#8a5f86' },
    { key: 'ch5', title: '第一枚魂环', note: '猎魂森林、曼陀罗蛇、四百余年的黄环。', line: 'main', color: '#b4552d' },
    { key: 'ch6', title: '七怪集结', note: '史莱克门前，七个人第一次站到一起。', line: 'team', color: '#4d7d7a' },
    { key: 'ch7', title: '暗器压魂圣', note: '赵无极的第四关，唐三用暗器替小舞讨回一瞬。', line: 'team', color: '#4d7d7a' },
    { key: 'ch8', title: '八蛛矛', note: '星斗森林越级吸收，八根蛛矛破体而出。', line: 'love', color: '#8a5f86' },
  ].map((n, i) => ({
    id: uid('node'),
    projectId,
    plotlineId: PLOTLINE_IDS[n.line],
    chapterId: chapterIdByKey[n.key],
    title: n.title,
    note: n.note,
    color: n.color,
    done: RAW[n.key]?.status === 'done',
    order: i,
    createdAt: now - 86400000 * 8 + i * 3600000,
  }));

  const lore = [
    {
      projectId, category: '世界观', name: '武魂与魂环', tags: ['设定', '参考'],
      content: '斗罗大陆的基础成长体系：武魂决定能力方向，魂环来自魂兽，吸收后获得魂技。魂环年限越高，力量越强，反噬也越重。本书早期的主线，正是唐三如何用“双生武魂”和唐门暗器绕过常规成长曲线。',
    },
    {
      projectId, category: '势力', name: '史莱克学院', tags: ['学院', '七怪'],
      content: '一所建在索托城外的破旧学院，信奉“只收怪物”的选拔方式。它不看出身，只看潜力和胆量。七怪在这里第一次成为一支队伍，也是从这里走向更大的舞台。',
    },
    {
      projectId, category: '功法', name: '唐门绝学', tags: ['暗器', '前世'],
      content: '唐三前世所在唐门的功法与暗器体系：玄天功、玄玉手、紫极魔瞳、控鹤擒龙、鬼影迷踪，以及佛怒唐莲、龙须针、诸葛神弩等机括暗器。前世的手艺成为他今生最不像“武魂”的底牌。',
    },
    {
      projectId, category: '地点', name: '猎魂森林', tags: ['魂兽', '第一魂环'],
      content: '史莱克学院附近获取魂环的猎场。大师在这里给唐三上了第一堂真正的生死课：魂兽年限、魂环上限、吸收风险。曼陀罗蛇是第一份试卷，唐三用暗器与判断交了答案。',
    },
    {
      projectId, category: '地点', name: '星斗大森林', tags: ['魂兽', '转折'],
      content: '大陆最著名的魂兽栖息地之一。小舞被泰坦巨猿带走，唐三孤身追入森林，遇到两千年的人面魔蛛，越级吸收魂环，八蛛矛第一次破体而出。这一夜之后，他不再只是“会暗器的孩子”。',
    },
    {
      projectId, category: '方法论', name: '同人写作说明', tags: ['说明', '版权'],
      content: '本示例为基于《斗罗大陆1》早期剧情的原创同人重述，用于演示建书、拆卷、人物关系、剧情线与导出的完整流程。不是原文摘录，也不代表官方设定；《斗罗大陆》名称、角色及相关权利归原作者与权利方所有。',
    },
  ].map(l => ({
    id: uid('lore'),
    projectId,
    ...l,
    createdAt: now - 86400000 * 16,
    updatedAt: now - 86400000 * 2,
  }));

  const materials = [
    {
      projectId, category: '描写', title: '魂环升起的瞬间', tags: ['战斗', '氛围'],
      content: '一圈光从魂兽身上浮起来，先是很淡，接着慢慢凝实。它贴着地面旋转，最终停在少年脚下，像一枚不属于人间的戒指。',
    },
    {
      projectId, category: '对话', title: '七舍的规矩', tags: ['群像', '对话'],
      content: '“七舍我说了算。”\n“行。”\n“你答应得这么快，我反而有点不习惯。”\n“那你想让我再想一会儿？”',
    },
    {
      projectId, category: '练笔', title: '暗器出手的节奏', tags: ['唐门', '动作'],
      content: '第一枚暗器不求伤人，只求让对方抬手；第二枚封住退路；第三枚才是真正的杀招。唐门的暗器从来不是一件，是一整套让人来不及选择的答案。',
    },
  ].map(m => ({
    id: uid('mat'), projectId, ...m, createdAt: now - 86400000 * 12, updatedAt: now - 86400000 * 12,
  }));

  const snippets = [
    { projectId, trigger: ';xh', title: '魂环描写', content: '一圈魂环从魂兽身上缓缓浮起，光晕贴着地面旋转，最终停在少年脚下。' },
    { projectId, trigger: ';dh', title: '队友对话', content: '“你先走。”\n“那你呢？”\n“我留下断后。别回头。”' },
    { projectId, trigger: ';zt', title: '转折句', content: '直到很多年后他才明白，那一夜他追出去的不是一个人，而是自己的命。' },
    { projectId, trigger: ';tb', title: '同人声明', content: '（以下为原创同人重述，借用原作人物与设定，不含原文段落。）' },
  ].map(s => ({ id: uid('snip'), projectId, ...s, createdAt: now - 86400000 * 8 }));

  const dailyWords = [1200, 1800, 900, 0, 2100, 1600, 1300, 700];
  const daily = dailyWords.map((words, i) => {
    const d = addDays(new Date(), -(dailyWords.length - 1 - i));
    return {
      id: `${projectId}|${dateKey(d)}`,
      projectId,
      date: dateKey(d),
      words,
      seconds: words > 0 ? Math.round((words / 850) * 3600 + 240) : 0,
    };
  });

  await put('projects', project);
  await bulkPut('volumes', volumes);
  await bulkPut('chapters', chapters);
  await bulkPut('contents', contents);
  await bulkPut('characters', characters);
  await bulkPut('lore', lore);
  await bulkPut('materials', materials);
  await bulkPut('snippets', snippets);
  await bulkPut('plotlines', plotlines);
  await bulkPut('plotnodes', plotnodes);
  await bulkPut('daily', daily);

  return project;
}
