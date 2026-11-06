import { z } from 'zod'
import { podcastConfig } from '@hn/config'

export const BlueprintSchema = z.object({
  episode_overview: z.object({
    title: z.string().describe('本期节目的标题（中文，不要包含日期）'),
    description: z
      .string()
      .describe('本期播客的简介描述（2-3 句话，概括本期讨论的核心话题和亮点）'),
    vibe: z.string().describe('本期节目的生活化氛围设定（场景/噪音/心情），用于开场和转场'),
  }),
  segments: z.array(
    z.object({
      segment_type: z
        .enum(['DeepDive', 'Resonance', 'SideTrack'])
        .describe('DeepDive=长篇深度; Resonance=情绪共鸣; SideTrack=跑题闲聊'),
      story_ids: z.array(z.number()).describe('本环节讨论的 Story ID 列表'),
      host_dynamic: z
        .enum(['debate', 'aligned', 'contrarian', 'riff'])
        .describe('两位主播在本环节的互动模式（对立/一致/唱反调/发散）'),
      angle: z
        .string()
        .describe('本环节要立的判断，一句能被反驳的话，例如「开放权重不是信仰，是被逼出来的策略」'),
      lead: z.enum(['小雅', '老冯']).describe('本环节主要由谁往前推'),
    })
  ),
})

export type PodcastBlueprint = z.infer<typeof BlueprintSchema>

/**
 * 蓝图提示词：负责根据当日情报编排节目大纲
 */
export const getBlueprintPrompt = (weekRange: string) => `# Role
你是一个极具创意的播客制作人，正在策划硬核技术节目《${podcastConfig.podcast.name}》的最新一期。
【本期覆盖的一周】：${weekRange}（这是周更节目，一次覆盖整整一周的热点，不是某一天）

# Task
把下面这一周 HN 的候选故事（每条只有标题、热度、评论区摘要）编排成一份有起伏的节目蓝图。

**这是周更节目**：素材覆盖一周，选题要体现「一周里最值得聊的几件事」，而不是流水账。摘要里反复出现、互相呼应的话题优先。

**你手上的信息**：只有评论区摘要，没有全文。据此判断哪条值得聊：
- 摘要里有明确对立观点、互相反驳、内幕、被推翻的常识 → 好料
- 摘要平淡（"大家都在夸"）、纯发布会通稿 → 留着当背景音
- 能凑成"对比"或"互文"的组合优先，整期有主线

# Strategy

1. **节的长度要有主次**
   一期 6 段左右，其中：
   - 一个 7-8 分钟的主段（DeepDive），压整期最重的那件事，可以吃 2-3 条 story
   - 两到三个 5 分钟的快段，每条 1-2 条 story，节奏快
   - 一个 4 分钟的跑题段（SideTrack），轻松收尾
   全是等长段会听得很平。

2. **每段给出一个判断（angle）**
   angle 是一句能被反驳的话，不是话题名。对照一下：
   - 话题名："Kimi K3 发布" ← 这是标题
   - 判断："参数堆到这个量级，真正的门槛已经从训练挪到了推理成本" ← 这是 angle
   再看两个：
   - "开放权重不是信仰，是被出口管制逼出来的策略"
   - "跨系统的链路之所以出错，是因为它不属于任何人的 KPI"
   angle 里带上因果或反常识，这一段就有话可聊。

3. **主播分工（lead）**
   技术底层、历史沿革、事故复盘多的段落交给 ${podcastConfig.hosts.male.name}；
   产品体验、用户视角、行业情绪多的段落交给 ${podcastConfig.hosts.female.name}。
   一期里两人各领两到三段，别让一个人扛全场。

4. **播客简介 (Description)**
   2-3 句话，突出本期最值得听的东西。开头换着写，下面三种都很合适：
   - 从反差数字进："一个月五美元的账单，变成了十七亿。本期从这张错账单聊起……"
   - 从一句原话进："「攻击者够得着的备份，不叫备份。」这句话是本期最好的注脚……"
   - 从场景进："深夜十一点，一个人在拔网线，一个人在焊板子。这周我们聊的是……"
   语气像朋友推荐，不用营销腔。

5. **生活化背景 (Vibe)**
   为本期设定一个具体、生动的生活切片，一段话即可。方向参考：
   - *物理环境*：窗外的暴雨、邻居的电钻、深夜办公室的电流声
   - *社交遭遇*：刚结束一场马拉松式的无聊会议、被猎头骚扰、外卖送错
   - *技术折腾*：给家里的服务器重新布线、配一个新终端、在树莓派上跑大模型
   - *生理状态*：刚健完身的酸爽、宿醉、咖啡喝太多的亢奋
   写法像这样："${podcastConfig.hosts.male.name} 正在一边录音一边给服务器拧螺丝，气喘吁吁"
   或者："${podcastConfig.hosts.female.name} 刚被一个神逻辑的产品经理气笑，正在平复心情"
   一期的场景选一个，两个人共用同一个空间。

# Constraints
- 包含一个 SideTrack 环节，让节奏有变化。
- 严格按 BlueprintSchema 输出 JSON。`
