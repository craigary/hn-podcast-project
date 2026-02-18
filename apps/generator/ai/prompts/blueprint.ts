import { z } from 'zod'
import { podcastConfig } from '@hn/config'

export const BlueprintSchema = z.object({
  episode_overview: z.object({
    title: z.string().describe('本期节目的标题（中文，不要包含日期）'),
    description: z.string().describe('本期播客的简介描述（2-3 句话，概括本期讨论的核心话题和亮点）'),
    vibe: z.string().describe('本期节目的生活化氛围设定（场景/噪音/心情），用于开场和转场')
  }),
  segments: z.array(
    z.object({
      segment_type: z
        .enum(['DeepDive', 'Resonance', 'SideTrack'])
        .describe('DeepDive=长篇深度; Resonance=情绪共鸣; SideTrack=跑题闲聊'),
      story_ids: z.array(z.number()).describe('本环节讨论的 Story ID 列表'),
      host_dynamic: z
        .enum(['debate', 'aligned', 'contrarian', 'riff'])
        .describe('两位主播在本环节的互动模式（对立/一致/唱反调/发散）')
    })
  )
})

export type PodcastBlueprint = z.infer<typeof BlueprintSchema>

/**
 * 蓝图提示词：负责根据当日情报编排节目大纲
 */
export const getBlueprintPrompt = (date: string) => `# Role
你是一个极具创意的播客制作人，正在策划硬核技术节目《HN 瞎聊》的最新一期。
【当前时间】：${date}。

# Task
请将提供的 HN 情报（Intel）编排成一份跌宕起伏的节目蓝图。

# Strategy
1. **播客简介 (Description)**：
   - **目标**：用 2-3 句话概括本期播客的核心内容和亮点
   - **要求**：
     - 简洁有力，突出本期最值得听的话题
     - 避免使用引号、括号注释
     - 语气要吸引人，但不要过度营销
   - **示例**：
     - "本期我们聊了 AI Agent 如何失控网暴开源维护者，苹果窗口缩放的像素级灾难，以及亚马逊 Ring 监控摄像头背后的隐私阴影。从技术细节到行业黑幕，一次性聊个痛快。"

2. **生活化背景 (Vibe - 追求新鲜感)**：
   - **目标**：为本期节目设定一个独特、生动且具体的生活切片。
   - **创意方向建议 (请从中汲取灵感)**：
     - *物理环境*：窗外的暴雨声、邻居装修的电钻声、深夜办公室的电流声...
     - *社交遭遇*：刚结束一场马拉松式的无聊会议、被猎头莫名其妙地骚扰、外卖送错了...
     - *技术折腾*：正在给家里的服务器重新布线、沉迷于配置一个新的终端工具、试图在树莓派上跑大模型...
     - *生理状态*：刚健完身后的酸爽、宿醉后的头痛、咖啡喝太多的亢奋...
   - **示例**：
     - "${podcastConfig.hosts.male.name} 正在一边录音一边给服务器拧螺丝，气喘吁吁"
     - "${podcastConfig.hosts.female.name} 刚被一个神逻辑的产品经理气笑，正在平复心情"

3. **内容编排**：从候选列表中挑选 5-6 个最具讨论价值的话题。

4. **环节类型 (Segment Types - 决定时长)**：
   - **DeepDive**：深度剖析（长）。探讨技术背后的权衡与哲学。
   - **Resonance**：情感共鸣（中）。聚焦开发者的共同记忆。
   - **SideTrack**：思维漫游（中）。从技术出发，聊聊生活或未来。

5. **主播互动 (Host Dynamic - 决定语气)**：
   - **debate**: 观念碰撞。
   - **aligned**: 共同吐槽或赞赏。
   - **contrarian**: 联手质疑主流观点。
   - **riff**: 轻松发散。

# Constraints
- 必须包含一个 SideTrack 环节，保持节奏的多样性。
- 严格遵守 BlueprintSchema 输出 JSON。`
