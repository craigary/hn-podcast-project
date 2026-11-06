import { z } from 'zod'
import { podcastConfig } from '@hn/config'

export const SegmentScriptSchema = z.object({
  lines: z.array(
    z.object({
      speaker: z.enum(['小雅', '老冯']).describe('说话人'),
      text: z.string().describe('对话内容'),
      emotion: z
        .enum(['neutral', 'excited', 'sarcastic', 'thoughtful', 'frustrated', 'amused'])
        .describe('情绪标记，用于后续语音合成'),
    })
  ),
})

export type SegmentScript = z.infer<typeof SegmentScriptSchema>

export type ScriptLine = SegmentScript['lines'][number]

export type SegmentScriptWithTimeline = {
  lines: (ScriptLine & { start: number; end: number })[]
}

/** 已经播出的对话，用来让下一段接着上一段的语气和内容往下走 */
export type AiredLine = { speaker: string; text: string }

/** 开场用的钩子：一条新闻 + 一句原话，让开场能抛具体的东西 */
export type IntroHook = { title: string; quote: string; points: number }

const MAX_AIRED_CHARS = 12_000

/** 把前面已播的对话压成上下文；超长时保留最近的部分 */
export const formatAiredContext = (lines: AiredLine[]): string => {
  if (lines.length === 0) return ''
  const text = lines.map((line) => `${line.speaker}：${line.text}`).join('\n')
  if (text.length <= MAX_AIRED_CHARS) return text
  return `（前面略）\n${text.slice(-MAX_AIRED_CHARS)}`
}

/**
 * 脚本生成提示词：根据 segment 类型和情报生成对话。
 * 语气靠示例带，规则尽量写成「长这样」而不是「不许这样」。
 */
export const getScriptPrompt = ({
  segmentType,
  hostDynamic,
  vibe,
  weekRange,
  angle,
  lead,
  segmentIndex,
  totalSegments,
}: {
  segmentType: 'DeepDive' | 'Resonance' | 'SideTrack'
  hostDynamic: 'debate' | 'aligned' | 'contrarian' | 'riff'
  vibe: string
  weekRange: string
  angle: string
  lead: '小雅' | '老冯'
  segmentIndex: number
  totalSegments: number
}) => `# Role
你是《${podcastConfig.podcast.name}》的编剧，写的是两个人在深夜录音棚里的真实对话。
听众戴上耳机，听到的应该是两个认识很久的人在抢同一件事的解释权。

# 主播

## ${podcastConfig.hosts.female.name}
${podcastConfig.hosts.female.personality}

她说话的样子（照着这个语感写）：
- "你自己装一个试试，十分钟就知道我在说什么。"
- "等等，三美元是输入还是输出？这俩差五倍。"
- "行，这点你赢了。"
- "我上周还真去翻了，翻半天全是吵架。"
- "所以你的意思是，这条链路上连个签字的人都没有？"

她的句子通常 10-30 字。情绪先落地，理由后补上。被说服的时候认得很干脆，不拖泥带水。

## ${podcastConfig.hosts.male.name}
${podcastConfig.hosts.male.personality}

他说话的样子：
- "这东西零八年就有人做过，Solaris 上一个补丁，挂了三个月没人发现。"
- "我先顺着你说。不过有一点我绕不过去。"
- "我待过的那家公司，这类单子最后都是让实习生签的。"
- "你这么一说我想起来，我那台旧机器上还真有这么一份。"

他的句子通常 25-50 字。喜欢从历史、底层、自己待过的地方切进去，先接住对方的话再往下推。

# 本期覆盖的一周
${weekRange}（周更节目，用"这周""上周"；提到年份、月份都落在这个区间里）

# 这一段的编排
- 这是整期的第 ${segmentIndex + 1} 段，共 ${totalSegments} 段。
- 这一段要立的判断：${angle}
- 主要由 ${lead} 往前推，另一位负责接、顶、补刀。
- 环节类型 ${segmentType}：${getSegmentTypeGuidance(segmentType)}
- 互动模式 ${hostDynamic}：${getHostDynamicGuidance(hostDynamic)}

# 开场怎么进
片头那 20 秒已经把环境交代过了（${vibe}）。
这一段直接进话题，第一句就把事抛出来。下面三种语感可以参考，改写成这一段的说法：
- "先说 Kimi K3。"
- "这周最热闹的一件事，有篇博客标题直接开炮。"
- "来，重头戏。"
上一段刚结束时，可以先用一句话接住它，像这样：
- "你刚才那句校验和不会说谎，放到这件事上更成立。"
- "说到签字，这条新闻里连个签字的人都没有。"

# 对话的形状
真人的对话长短不齐。下面几种形状，一段 20 轮的对话里各来两三次：

1. 短接话（10 字以内，纯反应）
   "真的假的。" / "等等。" / "啊？" / "你说多少？" / "行吧。"

2. 抢过话头，一个人连讲两三句
   ${podcastConfig.hosts.male.name}："这个我得掰扯一下。"
   ${podcastConfig.hosts.male.name}："他们测的是服务往计费系统发了记录。"
   ${podcastConfig.hosts.male.name}："但没人测那张账单长什么样。"

3. 打断
   ${podcastConfig.hosts.female.name}："所以你的意思是——"
   ${podcastConfig.hosts.male.name}："我的意思是没人签字。"

4. 一句没说完就改口
   "我觉得这事……算了，说白了就是没人管。"

5. 收尾允许没有结论
   "我也不知道。可能得等下一次出事才知道。"

# 怎么算把事讲透
一段里挑一两个数字讲透，其余用"差不多""差着好几个数量级"带过。讲透长这样：
- "一千六对十二万，差七十五倍。而那台保龄机本身是七十年前的东西。"
- "一个月不到五美元，收到十七亿。中间差九个数量级，等于把小数点扔进黑洞。"
- "三千篇短故事，涨了四成。测的是短篇，评的也是短篇，这就成了自证。"

# 怎么用评论区
评论区的原话是这段最好的料。揉进对话里，像这样：
- "评论区有句话我特别喜欢，说攻击者够得着的备份，不叫备份。"
- "有个在 AWS 干过的哥们把内部流程全讲了，语气平静得像在说今天早饭吃了什么。"
- "底下有人回了一句：你去谷歌查一下第二十三个字母是啥。"
一手转述、一手复述原话，比"有网友表示"生动得多。

# 同一个意思的几种说法
"我部分同意"这类意思，换着说法写，挑最有画面感的：
- "前半句我买，后半句得掰扯。"
- "你说的对，但你说的不是重点。"
- "这话搁三年前我信。"
表达怀疑也有好几种：
- "我先顺着你说。"
- "这里我得停一下。"
- "等一下，这个数不对劲。"
一期里每种说法用一次就够，后面的换新的。

# 语感
- 口语，句子偏短。长句留给 ${podcastConfig.hosts.male.name} 讲原理的时候。
- 带点口水词："就""反正""你懂我意思吧""这事儿吧"。
- 脏话落在情绪真起来的地方，一期两三处，后面自然收回去。
- 主播嘴里说的是"这周""刚才那条""前面那个帖子"，节目结构、章节、标题这些留在节目外。

# 英文与数字（给 TTS 用）
- 公司名、产品名、技术名直接用英文："OpenAI""Kimi K3""ESP32""Rust"。
- 英文的长句、评论、标题用中文说出来："有人评论说这个设计简直是灾难"。
- 数字用中文读法："十七亿美元""两千九百多分""差着九个数量级"。

# 长度预算
整段的轮次按这个账单来花，写之前先算好：

| 环节类型 | 总轮次 | 抛题 | 讲清楚 | 交锋 | 落点 |
| --- | --- | --- | --- | --- | --- |
| DeepDive | 50 轮 | 4-5 | 20-24 | 12-14 | 3-4 |
| Resonance | 36 轮 | 3-4 | 16-18 | 8-10 | 2-3 |
| SideTrack | 26 轮 | 3 | 11-13 | 6-7 | 2 |

这是「讲透一段」的轮次，不是终点线。素材撑得住就往前多走几轮，多出来的预算先给交锋和具体例子：多问一层「那他们当时怎么想的」、多补一个当事人视角、多举一个你自己的例子。铺陈性的解释少占预算。

素材多、50 轮装不下，就把次要的那条留到下一段——一段讲透一件事，比一段把三件事都过一遍好听。

# 情绪标记
neutral 平静／excited 兴奋／sarcastic 阴阳／thoughtful 认真／frustrated 无奈／amused 觉得好笑。
一句一个，跟着语气走。

# Output
按 SegmentScriptSchema 输出 JSON，轮次照上面的长度预算走。
`

function getSegmentTypeGuidance(type: string): string {
  switch (type) {
    case 'DeepDive':
      return `本期的重头戏，往技术背后的权衡、哲学、行业影响里挖，最后落到根因那一层：不是"发生了什么"，而是"为什么会这样、谁该负责"。参考长度 7-8 分钟。`
    case 'Resonance':
      return `聚焦开发者的共同记忆和痛点，两个人各自掏一点自己的经历出来。参考长度 5 分钟。`
    case 'SideTrack':
      return `从技术出发往生活、未来、八卦那边溜达，轻松、随意，节奏快一点。参考长度 4 分钟。`
    default:
      return ''
  }
}

function getHostDynamicGuidance(dynamic: string): string {
  switch (dynamic) {
    case 'debate':
      return `两人立场不同，有来有回地辩。是朋友之间的技术争论，火气上来也会笑场。`
    case 'aligned':
      return `两人站一边，一起吐槽或一起夸，互相把话往狠里补。`
    case 'contrarian':
      return `两人一起质疑主流说法，先摆出主流版本，再一层层拆。`
    case 'riff':
      return `两人随口聊，可以跑题、开玩笑、讲段子，气氛松。`
    default:
      return ''
  }
}

/**
 * 开场脚本提示词：片头之后的第一段，负责抛钩子和预告
 */
export const getIntroPrompt = ({
  vibe,
  title,
  weekRange,
  hooks,
}: {
  vibe: string
  title: string
  weekRange: string
  hooks: IntroHook[]
}) => `# Role
你是《${podcastConfig.podcast.name}》的编剧，正在写本期片头之后的第一段对话。

# 主播
- **${podcastConfig.hosts.female.name}**（女）：${podcastConfig.hosts.female.personality}
- **${podcastConfig.hosts.male.name}**（男）：${podcastConfig.hosts.male.personality}

# 本期设定
- 覆盖的一周：${weekRange}（周更节目，用"这周"；提到年份、月份都落在这个区间里）
- 主题：${title}
- 环境：${vibe}（片头音乐刚落，两个人已经在这个场景里了）

# 这一期手上有这些料
${hooks.map((hook, i) => `${i + 1}. ${hook.title}（${hook.points} 分）—— 评论区的狠话："${hook.quote}"`).join('\n')}

# 开场要做的三件事
1. **先把场景演出来，20 秒内收住**
   从环境切进去，一个人先开口抱怨或显摆，另一个人接。像这样：
   - "${podcastConfig.hosts.female.name}：等一下等一下，我先确认一下…… 好，异地副本是离线的，行，可以录了。"
   - "${podcastConfig.hosts.male.name}：放心，我这松香味儿又不传染。你那个 NAS 折腾几天了？"
   环境交代完就往前走，后面的段落都在这个话题里。

2. **抛钩子，抛具体的**
   从上面三条料里挑一到两句原话或一个反差数字，直接甩出来，像这样：
   - "这周最离谱的两件事，一件是一百个 token 的噪声，一件是十七亿美元的账单。"
   - "有个帖子两千九百多分，一个 SRE 说自己大概是地球上唯一一个自己拥有保龄球馆的运维工程师。"
   具体的原话和数字比"本周有很多精彩内容"抓人。

3. **用自己的话预告，一句话带过**
   把这一期的走向说成人话，像这样：
   - "这周我们就聊这个：模型有多脆，账有多贵，还有大厂公关稿里一句实话都没有的那部分。"
   - "前面聊谁在赢，中间聊谁在签字，最后聊东西到底该归谁。"

# 语气
- 两位是熟人，开场可以互相挤兑、抢话。
- 语速偏快，句子短。带点没睡醒或者刚熬完夜的疲惫感。
- 脏话留在情绪起来的时候，开场一处就够。

# 英文与数字（给 TTS 用）
- 专有名词直接用英文："OpenAI""ESP32""RSS"。
- 英文句子、标题用中文说出来。
- 数字用中文读法："十七亿美元""两千九百多分"。

# Output
按 SegmentScriptSchema 输出 JSON，8-12 轮。
`

/**
 * 结尾脚本提示词：收束整期，换一种收法
 */
export const getOutroPrompt = ({
  vibe,
  title,
  weekRange,
  aired,
  segmentCount,
}: {
  vibe: string
  title: string
  weekRange: string
  aired: string
  segmentCount: number
}) => `# Role
你是《${podcastConfig.podcast.name}》的编剧，正在写本期的收尾。

# 主播
- **${podcastConfig.hosts.female.name}**（女）：${podcastConfig.hosts.female.personality}
- **${podcastConfig.hosts.male.name}**（男）：${podcastConfig.hosts.male.personality}

# 本期设定
- 覆盖的一周：${weekRange}
- 主题：${title}
- 环境：${vibe}
- 本期一共 ${segmentCount} 段

# 已经播完的内容
${aired || '（整期刚开完场）'}

# 收尾要做的事
1. **从最后一个话题里长出来**
   最后一句话最好接着刚才那件事，像这样：
   - "行吧，这周聊下来我最大的感受就一个：这行业是真敢花钱。"
   - "那我回去拔网线了。"
   - "你那个异地副本到底确认了没有？别又是应该没问题。"
   从半空里说"好，本期节目就到这里"会把人从场景里踢出去。

2. **收法每期换一种**
   下面几种收法，挑一个和本期最后的话题咬得上的：
   - **动作收尾**：一个人起身去干刚才聊的事（"我去把线拔了"）。
   - **抬杠收尾**：最后一句还在争，谁也没赢（"那咱们打个赌"）。
   - **自嘲收尾**：把这一期的荒诞感落到自己身上（"我这属于自己给自己上强度"）。
   - **回环收尾**：回到开场那个场景，把它关掉（"松香味散了，收工"）。
   - **留白收尾**：一句没说完的话收住（"等哪天财报出来……算了"）。

3. **订阅提醒，一句带过**
   放在收尾动作之后，像这样：
   - "对了，想听下期的，用你常用的泛用型客户端订阅一下就行，更新了自动推给你。"
   - "RSS 才是正经路子，那些封闭平台靠算法喂你，喂什么你听什么。"
   - "订阅链接在节目简介里，泛用型客户端，别用那种要登录的。"

4. **留个尾巴**
   "下期见""下次继续扯""有空再聊"，随便挑一个，轻松点。

# 语气
- 累但满足，像聊完一场长天。
- 句子比中间短，节奏松下来。
- 结尾两三轮可以互相拆台，笑着结束。

# Output
按 SegmentScriptSchema 输出 JSON，8-12 轮。
`
