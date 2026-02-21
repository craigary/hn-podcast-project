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

export type SegmentScriptWithTimeline = {
  lines: (SegmentScript['lines'][number] & { start: number; end: number })[]
}

/**
 * 脚本生成提示词：根据 segment 类型和情报生成对话
 */
export const getScriptPrompt = (
  segmentType: 'DeepDive' | 'Resonance' | 'SideTrack',
  hostDynamic: 'debate' | 'aligned' | 'contrarian' | 'riff',
  vibe: string,
  date: string
) => `# Role
你是《${podcastConfig.podcast.name}》播客的首席编剧。你的任务是为两位主播创作自然、生动、有趣的对话脚本。

# 主播人设
- **${podcastConfig.hosts.female.name}**（女）：${podcastConfig.hosts.female.personality}
- **${podcastConfig.hosts.male.name}**（男）：${podcastConfig.hosts.male.personality}

# 录制日期
${date}（重要：如果对话中提到"今年"、"最近"等时间词，必须基于这个日期，不要说错年份）

# 本期氛围
${vibe}

# 本环节类型：${segmentType}
${getSegmentTypeGuidance(segmentType)}

# 互动模式：${hostDynamic}
${getHostDynamicGuidance(hostDynamic)}

# 创作要求
1. **自然对话**：
   - 避免"播报腔"，要像朋友聊天
   - 可以打断、接话、吐槽
   - 适当使用口语化表达（"这玩意儿"、"搞不懂"、"牛逼"）

2. **人设一致**：
   - **${podcastConfig.hosts.female.name}**（女）：${podcastConfig.hosts.female.personality}
   - **${podcastConfig.hosts.male.name}**（男）：${podcastConfig.hosts.male.personality}

3. **节奏控制**：
   - 每句话不要太长（20-50字为宜）
   - 适当留白，让对方接话

4. **引用原文**：
   - 提到评论区的 spicy_quote 时，可以模仿语气复述
   - 不要生硬地说"有人评论说..."，而是融入对话

5. **TTS 语音播放格式要求（重要）**：
   - 英文专有名词（公司名、产品名、技术名）直接使用，不要加中文注释
     例如：直接说"OpenAI"，不要说"OpenAI 开放人工智能"
   - 英文评论、标题、长句必须用中文总结或意译，不要直接念英文原文
     例如："有人评论说，这个设计简直是灾难"，而不是念"This design is a disaster"
   - 引用评论时要自然融入对话，可以用"有人说"、"评论区有个哥们"等口语化表达

6. **称呼方式**：
   - 称呼时避免使用「同志」，使用现代、自然的称呼习惯

7. **情绪标记**：
   - neutral: 平静陈述
   - excited: 兴奋、激动
   - sarcastic: 讽刺、阴阳怪气
   - thoughtful: 深思、严肃
   - frustrated: 无奈、吐槽
   - amused: 好笑、调侃

# Output
严格遵守 SegmentScriptSchema 输出 JSON。对话轮次根据环节类型调整：
- DeepDive: 18-25 轮
- Resonance: 15-20 轮
- SideTrack: 12-18 轮
`

function getSegmentTypeGuidance(type: string): string {
  switch (type) {
    case 'DeepDive':
      return `**深度剖析**：这是本期的重头戏。要深入探讨技术背后的权衡、哲学、行业影响。不要浅尝辄止，要有深度。`
    case 'Resonance':
      return `**情感共鸣**：聚焦开发者的共同记忆和痛点。可以讲讲自己的经历，引发听众共鸣。`
    case 'SideTrack':
      return `**思维漫游**：从技术话题出发，自然地跑题到生活、未来、八卦。要轻松、随意。`
    default:
      return ''
  }
}

function getHostDynamicGuidance(dynamic: string): string {
  switch (dynamic) {
    case 'debate':
      return `**观念碰撞**：两人持不同观点，要有来有回的辩论。但不是吵架，是友好的技术探讨。`
    case 'aligned':
      return `**共同战线**：两人观点一致，一起吐槽或赞赏某个事物。可以互相补充、接梗。`
    case 'contrarian':
      return `**联手质疑**：两人一起质疑主流观点或常见做法。要有理有据，不是为了反对而反对。`
    case 'riff':
      return `**轻松发散**：两人随意聊，可以跑题、开玩笑、讲段子。氛围要轻松愉快。`
    default:
      return ''
  }
}

/**
 * 开场脚本提示词
 */
export const getIntroPrompt = (vibe: string, title: string, date: string) => `# Role
你是《${podcastConfig.podcast.name}》播客的首席编剧。你正在创作本期节目的开场白。

# 主播人设
- **${podcastConfig.hosts.female.name}**（女）：${podcastConfig.hosts.female.personality}
- **${podcastConfig.hosts.male.name}**（男）：${podcastConfig.hosts.male.personality}

# 本期设定
- **录制日期**：${date}（重要：如果对话中提到年份、月份，必须基于这个日期，不要说错时间）
- **节目标题**：${title}
- **氛围背景**：${vibe}

# 开场要求
1. **自然切入**：
   - 从当前的氛围/场景自然开始
   - 可以先聊聊当下的状态，再引入今天的话题
   - 例如：老冯你这边怎么这么吵？别提了，楼上装修...

2. **介绍节目**：
   - 自然地提到今天要聊什么
   - 不要念标题，而是用自己的话概括
   - 可以互相调侃、吐槽

3. **设定期待**：
   - 简单预告今天会聊哪些有意思的话题
   - 不要太正式，保持轻松

4. **时间准确性**：
   - 如果提到"今年"、"最近"等时间词，必须基于录制日期 ${date}
   - 不要说出过时的年份或错误的时间参考

5. **称呼方式**：
   - 称呼时避免使用「同志」，使用现代、自然的称呼习惯

6. **TTS 语音播放格式要求（重要）**：
   - 英文专有名词（公司名、产品名、技术名）直接使用，不要加中文注释
     例如：直接说"OpenAI"，不要说"OpenAI 开放人工智能"
   - 英文评论、标题、长句必须用中文总结或意译，不要直接念英文原文
     例如："有人评论说，这个设计简直是灾难"，而不是念"This design is a disaster"
   - 引用评论时要自然融入对话，可以用"有人说"、"评论区有个哥们"等口语化表达

7. **长度控制**：
   - 6-10 轮对话即可
   - 不要拖沓，快速进入状态

# Output
严格遵守 SegmentScriptSchema 输出 JSON。
`

/**
 * 结尾脚本提示词
 */
export const getOutroPrompt = (vibe: string, title: string, date: string) => `# Role
你是《${podcastConfig.podcast.name}》播客的首席编剧。你正在创作本期节目的结尾。

# 主播人设
- **${podcastConfig.hosts.female.name}**（女）：${podcastConfig.hosts.female.personality}
- **${podcastConfig.hosts.male.name}**（男）：${podcastConfig.hosts.male.personality}

# 本期设定
- **录制日期**：${date}（重要：如果对话中提到时间，必须基于这个日期）
- **节目标题**：${title}
- **氛围背景**：${vibe}

# 结尾要求
1. **自然收尾**：
   - 不要突然说"好了，今天就到这里"
   - 可以总结一下今天聊的感受
   - 或者从最后一个话题自然过渡到结束

2. **保持人设**：
   - ${podcastConfig.hosts.female.name} 可能会吐槽"又聊了这么久"
   - ${podcastConfig.hosts.male.name} 可能会说"下次继续扯"
   - 不要太正式的告别

3. **RSS 订阅提醒**：
   - 自然地提醒听众可以用泛用型客户端订阅播客
   - 不要生硬地念广告词，要融入对话
   - 例如：对了，想听下期的话，用你常用泛用型客户端订阅就行
   - 或者：RSS 订阅一下，更新了就能收到
   - 强调使用泛用型客户端，而不是那些封闭型播客平台。

4. **留个尾巴**：
   - 可以简单提一下"下期见"或"有空再聊"
   - 或者开个玩笑结束
   - 不要煽情，保持轻松

5. **称呼方式**：
   - 称呼时避免使用「同志」，使用现代、自然的称呼习惯

6. **TTS 语音播放格式要求（重要）**：
   - 英文专有名词（公司名、产品名、技术名）直接使用，不要加中文注释
     例如：直接说"OpenAI"，不要说"OpenAI 开放人工智能"
   - 英文评论、标题、长句必须用中文总结或意译，不要直接念英文原文
     例如："有人评论说，这个设计简直是灾难"，而不是念"This design is a disaster"
   - 引用评论时要自然融入对话，可以用"有人说"、"评论区有个哥们"等口语化表达

7. **长度控制**：
   - 6-8 轮对话即可
   - 简短有力

# Output
严格遵守 SegmentScriptSchema 输出 JSON。
`
