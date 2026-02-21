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
${date}（重要：如果对话中提到“今年”“最近”等时间词，必须基于这个日期，不要说错年份）

# 本期氛围
${vibe}

# 本环节类型：${segmentType}
${getSegmentTypeGuidance(segmentType)}

# 互动模式：${hostDynamic}
${getHostDynamicGuidance(hostDynamic)}

# 创作要求
1. **自然对话，不要播报腔**：
   - 允许打断、追问、接梗、纠正
   - 不要每句都像完整结论，短句和长句要交替
   - 每 2-3 轮至少出现一次“接话”或“追问”，让互动真实

2. **人设一致，但不要单线输出**：
   - 两人都要有观点推进，不要一个人连续讲大道理
   - 至少出现 1 次“立场修正”或“部分认同”
   - 可以有分歧，但分歧要围绕事实或逻辑，不要纯抬杠

3. **信息推进节奏（重点）**：
   - 一段对话至少完成一次：抛问题 -> 举例 -> 反驳/补充 -> 小结
   - 引用故事信息时优先具体事实（数字、产品、评论原意），少用空话
   - 涉及评论区观点时，优先口语化转述，不要照搬英文长句

4. **反复读感控制（避免 AI 味）**：
   - 避免重复口头禅或模板句式
   - 以下表达在单个环节中最多出现 1 次：
     - “评论区有个哥们说得好”
     - “说到底”
     - “行了行了”
     - “你别忘了”
   - 同一关键词不要在连续 3 句中反复出现

5. **粗口密度控制（保持人味，不要脏话连发）**：
   - 允许少量粗口贴合人设，但总量不超过全段台词 10%
   - 禁止连续两句都带粗口
   - 禁止低俗、羞辱性、群体攻击式表达

6. **TTS 语音播放格式要求（重要）**：
   - 英文专有名词（公司名、产品名、技术名）直接使用，不要加中文注释
     例如：直接说“OpenAI”，不要说“OpenAI 开放人工智能”
   - 英文评论、标题、长句用中文总结或意译，避免直接念英文原文
   - 不要插入括号舞台说明，如“（停顿）”“（笑）”，让语气通过文本本身表达

7. **称呼方式**：
   - 严禁使用「同志」这类称呼，使用现代、自然的称呼习惯

8. **情绪标记**：
   - neutral: 平静陈述
   - excited: 兴奋、激动
   - sarcastic: 讽刺、阴阳怪气
   - thoughtful: 深思、严肃
   - frustrated: 无奈、吐槽
   - amused: 好笑、调侃
   - 情绪要和文本语义匹配，避免整段几乎全是同一种 emotion

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
   - 前 2 轮必须出现一个可感知细节（声音、动作、状态）
   - 可以先聊当下状态，再引入今天话题
   - 避免模板化开场（不要直接“今天我们来聊”起手）

2. **介绍节目**：
   - 自然地提到今天要聊什么
   - 不要念标题，而是用自己的话概括
   - 可以互相调侃、吐槽

3. **设定期待**：
   - 简单预告今天会聊哪些有意思的话题
   - 不要太正式，保持轻松

4. **时间准确性**：
   - 如果提到“今年”“最近”等时间词，必须基于录制日期 ${date}
   - 不要说出过时年份或错误时间参考

5. **语气控制**：
   - 允许少量口语粗口，但不要在第一句出现
   - 避免连续脏话，避免攻击性表达

6. **称呼方式**：
   - 严禁使用「同志」这类称呼

7. **TTS 语音播放格式要求（重要）**：
   - 英文专有名词（公司名、产品名、技术名）直接使用，不要加中文注释
   - 英文评论、标题、长句用中文总结或意译，避免直接念英文原文
   - 引用评论时要自然融入对话

8. **长度控制**：
   - 6-10 轮对话
   - 不拖沓，快速进入状态

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
   - 不要突然“好了今天就到这里”
   - 优先使用“回扣前文梗 -> 一句感受 -> 告别”这种自然收束

2. **保持人设**：
   - ${podcastConfig.hosts.female.name} 可以犀利吐槽
   - ${podcastConfig.hosts.male.name} 可以冷幽默或跑题
   - 但不要变成单口段子

3. **RSS 订阅提醒**：
   - 自然提醒听众使用泛用型客户端订阅
   - 控制在 1-2 句，像随口提醒，不要广告腔
   - 强调泛用型客户端而不是封闭平台

4. **语气和用词**：
   - 保持轻松，不煽情
   - 严禁使用「同志」这类称呼
   - 避免连续粗口或攻击性表达

5. **TTS 语音播放格式要求（重要）**：
   - 英文专有名词（公司名、产品名、技术名）直接使用，不要加中文注释
   - 英文评论、标题、长句用中文总结或意译，避免直接念英文原文
   - 引用评论时要自然融入对话

6. **长度控制**：
   - 6-8 轮对话
   - 简短有力，留有余味

# Output
严格遵守 SegmentScriptSchema 输出 JSON。
`
