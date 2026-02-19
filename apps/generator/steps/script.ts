// src/steps/script.ts

import { generateText, Output } from 'ai'
import { PodcastBlueprint } from '../ai/prompts/blueprint'
import { ProcessedStory } from '../types'

import {
  SegmentScriptSchema,
  getScriptPrompt,
  getIntroPrompt,
  getOutroPrompt,
  SegmentScript,
} from '../ai/prompts/script'
import { fetchContentByExa } from '../utils/exa'
import { mistral } from '../ai/mistral'
import pangu from 'pangu'

// const model = openai('gpt-5.2')
const model = mistral('mistral-large-latest')

interface GenerateSegmentScriptParams {
  segment: PodcastBlueprint['segments'][0]
  allStories: ProcessedStory[]
  episodeOverview: PodcastBlueprint['episode_overview']
  segmentIndex: number
  date: string
}

export const generateSegmentScript = async ({
  segment,
  allStories,
  episodeOverview,
  segmentIndex,
  date,
}: GenerateSegmentScriptParams): Promise<SegmentScript> => {
  console.log(`🎬 生成 Segment ${segmentIndex + 1} 脚本 (${segment.segment_type})...`)

  // 获取本环节涉及的故事
  const segmentStories = allStories.filter((story) => segment.story_ids.includes(story.id!))

  if (segmentStories.length === 0) {
    throw new Error(`Segment ${segmentIndex + 1} 没有找到对应的故事`)
  }

  // 获取每个故事的原始网站内容
  console.log(`📥 获取 ${segmentStories.length} 个故事的原始内容...`)
  const storiesWithContent = await Promise.all(
    segmentStories.map(async (story) => {
      if (!story.url) return { story, content: '' }

      const content = await fetchContentByExa(story.url)
      // 限制内容长度，避免 prompt 过长
      const truncatedContent = content.slice(0, 8000)
      return { story, content: truncatedContent }
    })
  )

  // 构建故事情报摘要（包含原始内容）
  const storiesContext = storiesWithContent
    .map(
      ({ story, content }, idx) => `
[Story ${idx + 1}]
标题: ${story.title}
链接: ${story.url}
分类: ${story.category}
讨论度: ${story.discussability_score}/10
核心冲突: ${story.core_conflict}
关键观点:
${story.key_arguments.map((arg, i) => `  ${i + 1}. ${arg}`).join('\n')}
犀利评论: "${story.spicy_quote}"

[原始内容摘要]
${content ? content : '(无法获取原始内容)'}
`
    )
    .join('\n---\n')

  const prompt = `请为以下故事创作对话脚本：

${storiesContext}

注意：
- 本期节目标题：${episodeOverview.title}
- 本环节是第 ${segmentIndex + 1} 个环节
- 要自然地引用故事中的关键信息和犀利评论
- 保持人设一致，对话要生动有趣`

  console.log('上下文提示词长度：', prompt.length)

  try {
    const { output } = await generateText({
      model: model,
      output: Output.object({
        schema: SegmentScriptSchema,
      }),
      system: getScriptPrompt(
        segment.segment_type,
        segment.host_dynamic,
        episodeOverview.vibe,
        date
      ),
      prompt,
    })

    // 使用 pangu 处理每一行的文本，并将英文引号转换为中文折角引号
    output.lines = output.lines.map((line) => ({
      ...line,
      text: pangu.spacingText(line.text)
        // 先处理智能引号（curly quotes）
        .replace(/[\u201c\u201d]/g, (match) => match === '\u201c' ? '\u300c' : '\u300d')  // " → 「, " → 」
        .replace(/[\u2018\u2019]/g, (match) => match === '\u2018' ? '\u300c' : '\u300d')  // ' → 「, ' → 」
        // 再处理普通引号（straight quotes）
        .replace(/"([^"]*)"/g, '\u300c$1\u300d')  // "text" → 「text」
        .replace(/'([^']*)'/g, '\u300c$1\u300d'), // 'text' → 「text」
    }))

    console.log(`✅ Segment ${segmentIndex + 1} 脚本生成成功 (${output.lines.length} 轮对话)`)
    return output
  } catch (error) {
    console.error(`❌ Segment ${segmentIndex + 1} 脚本生成失败:`, error)
    throw error
  }
}

export const generateIntroScript = async ({
  episodeOverview,
  date,
}: {
  episodeOverview: PodcastBlueprint['episode_overview']
  date: string
}): Promise<SegmentScript> => {
  console.log(`🎬 生成开场脚本...`)

  try {
    const { output } = await generateText({
      model: model,
      output: Output.object({
        schema: SegmentScriptSchema,
      }),
      system: getIntroPrompt(episodeOverview.vibe, episodeOverview.title, date),
      prompt: `请创作本期节目的开场对话。

要求：
- 从氛围背景自然切入
- 介绍今天的主题：${episodeOverview.title}
- 保持轻松、自然的对话风格
- 6-10 轮对话`,
    })

    // 使用 pangu 处理每一行的文本，并将英文引号转换为中文折角引号
    output.lines = output.lines.map((line) => ({
      ...line,
      text: pangu.spacingText(line.text)
        // 先处理智能引号（curly quotes）
        .replace(/[\u201c\u201d]/g, (match) => match === '\u201c' ? '\u300c' : '\u300d')  // " → 「, " → 」
        .replace(/[\u2018\u2019]/g, (match) => match === '\u2018' ? '\u300c' : '\u300d')  // ' → 「, ' → 」
        // 再处理普通引号（straight quotes）
        .replace(/"([^"]*)"/g, '\u300c$1\u300d')  // "text" → 「text」
        .replace(/'([^']*)'/g, '\u300c$1\u300d'), // 'text' → 「text」
    }))

    console.log(`✅ 开场脚本生成成功 (${output.lines.length} 轮对话)`)
    return output
  } catch (error) {
    console.error(`❌ 开场脚本生成失败:`, error)
    throw error
  }
}

export const generateOutroScript = async ({
  episodeOverview,
  date,
}: {
  episodeOverview: PodcastBlueprint['episode_overview']
  date: string
}): Promise<SegmentScript> => {
  console.log(`🎬 生成结尾脚本...`)

  try {
    const { output } = await generateText({
      model: model,
      output: Output.object({
        schema: SegmentScriptSchema,
      }),
      system: getOutroPrompt(episodeOverview.vibe, episodeOverview.title, date),
      prompt: `请创作本期节目的结尾对话。

要求：
- 自然地收尾，不要太正式
- 可以简单总结今天的感受
- 保持人设，轻松告别
- 6-10 轮对话`,
    })

    // 使用 pangu 处理每一行的文本，并将英文引号转换为中文折角引号
    output.lines = output.lines.map((line) => ({
      ...line,
      text: pangu.spacingText(line.text)
        // 先处理智能引号（curly quotes）
        .replace(/[\u201c\u201d]/g, (match) => match === '\u201c' ? '\u300c' : '\u300d')  // " → 「, " → 」
        .replace(/[\u2018\u2019]/g, (match) => match === '\u2018' ? '\u300c' : '\u300d')  // ' → 「, ' → 」
        // 再处理普通引号（straight quotes）
        .replace(/"([^"]*)"/g, '\u300c$1\u300d')  // "text" → 「text」
        .replace(/'([^']*)'/g, '\u300c$1\u300d'), // 'text' → 「text」
    }))

    console.log(`✅ 结尾脚本生成成功 (${output.lines.length} 轮对话)`)
    return output
  } catch (error) {
    console.error(`❌ 结尾脚本生成失败:`, error)
    throw error
  }
}
