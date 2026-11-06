import type { PodcastBlueprint } from '../ai/prompts/blueprint'
import type { ProcessedStory } from '../types'
import type { FullScriptWithTimeline } from './tts'
import { superlinked } from '../ai/superlinked'
import { generateStructured } from './llm'
import { z } from 'zod'
import { processText } from './text'

const model = superlinked('deepseek-ai/DeepSeek-V4.1-Flash-1017')

// Chapter 类型定义
interface Chapter {
  title: string
  desc: string
  start: number
  storyIds: number[]
}

// AI 生成 Chapter 的 Schema
const ChapterSummarySchema = z.object({
  title: z.string().describe('章节标题（简短、吸引人，5-10 字）'),
  desc: z.string().describe('章节描述（1-2 句话，总结本段讨论的核心内容）'),
})

/**
 * 生成 Chapters（基于 segments 和脚本内容）
 */
async function generateChapters(
  blueprint: PodcastBlueprint,
  fullScript: FullScriptWithTimeline,
  allStories: ProcessedStory[]
): Promise<Chapter[]> {
  console.log('\n📖 开始生成 Chapters...')

  const chapters: Chapter[] = []
  let currentTime = 0

  // 计算 intro 的时长
  const introLines = fullScript.intro.lines
  if (introLines.length > 0) {
    const lastIntroLine = introLines[introLines.length - 1]
    currentTime = lastIntroLine?.end ?? 0
  }

  // 为每个 segment 生成 chapter
  for (let i = 0; i < blueprint.segments.length; i++) {
    const segment = blueprint.segments[i]!
    const segmentScript = fullScript.segments[i]!

    // 获取该 segment 的起始时间
    const segmentLines = segmentScript.lines
    const startTime = segmentLines[0]?.start ?? currentTime

    // 提取该 segment 的对话内容（用于 AI 总结）
    const dialogueText = segmentLines.map((line) => `${line.speaker}: ${line.text}`).join('\n')

    // 获取该 segment 讨论的故事信息
    const segmentStories = allStories.filter((story) => segment.story_ids.includes(story.id!))
    const storiesContext = segmentStories
      .map((story) => `- ${story.title} (${story.category ?? 'Other'})`)
      .join('\n')

    // 使用 AI 生成章节标题和描述（带重试）
    let retryCount = 0
    const maxRetries = 3
    let success = false

    while (retryCount < maxRetries && !success) {
      try {
        const output = await generateStructured({
          model,
          schema: ChapterSummarySchema,
          toolName: 'submit_chapter',
          maxOutputTokens: 800,
          temperature: 0.7,
          system: `你是播客章节的编辑，负责给每段配一个标题和一句导语。

# 标题
5-10 字，能当目录里的一行看。三种写法都很好：
- 抓反差：「一千六买回主权」「十七亿美元的错账单」
- 抓判断：「没人签字的那条链路」「评分器会骗人」
- 抓画面：「把播放器交给运营商」「一屋子小孩和黑掉的屏幕」

# 描述
1-2 句话，像在跟朋友说这段值得听什么。开头直接进内容：
- "保龄球馆老板用一千六百美元的 ESP32 重写十二万的计分系统，对比 LG 显示器插上就偷偷装软件。"
- "从十七亿美元的离谱账单到罗马尼亚地籍库被抹，两条新闻其实是同一件事：跨系统的链路没人拥有。"
- "Oink 到 What.CD，聊当年翻别人 mp3 文件夹那种意外发现之乐。"

# 语气
轻松、口语，带一点判断。像节目简介，不像论文摘要。`,
          prompt: `请为以下播客片段生成章节标题和描述：

【这一段要立的判断】
${segment.angle ?? '（未提供）'}

【讨论的话题】
${storiesContext}

【对话内容】
${dialogueText.slice(0, 2000)}

请生成这对标题和描述。`,
        })

        // 文本后处理：引号转换 + pangu 空格
        const processedTitle = processText(output.title)
        const processedDesc = processText(output.desc)

        chapters.push({
          title: processedTitle,
          desc: processedDesc,
          start: Math.floor(startTime),
          storyIds: segment.story_ids,
        })

        console.log(`✅ Chapter ${i + 1}: ${processedTitle}`)
        success = true
      } catch (error) {
        retryCount++
        console.error(`❌ 生成 Chapter ${i + 1} 失败 (尝试 ${retryCount}/${maxRetries}):`, error)

        if (retryCount < maxRetries) {
          console.log(`⏳ 等待 2 秒后重试...`)
          await new Promise((resolve) => setTimeout(resolve, 2000))
        } else {
          console.error(`❌ Chapter ${i + 1} 重试 ${maxRetries} 次后仍然失败，使用默认值`)
          // 使用默认值
          chapters.push({
            title: `第 ${i + 1} 部分`,
            desc: segmentStories.map((s) => s.title).join('、'),
            start: Math.floor(startTime),
            storyIds: segment.story_ids,
          })
        }
      }
    }

    // 更新当前时间
    if (segmentLines.length > 0) {
      const lastLine = segmentLines[segmentLines.length - 1]
      currentTime = lastLine?.end ?? currentTime
    }
  }

  console.log(`✅ 所有 Chapters 生成完成 (${chapters.length} 个)`)
  return chapters
}

/**
 * 将完整脚本转换为 Markdown 格式
 */
export async function convertScriptToMarkdown(
  fullScript: FullScriptWithTimeline,
  blueprint: PodcastBlueprint,
  allStories: ProcessedStory[],
  episodeNumber: number,
  audioUrl: string,
  coverImageUrl?: string
): Promise<string> {
  const { metadata, intro, segments, outro } = fullScript

  // 构建 frontmatter
  const frontmatter = await buildFrontmatter(
    metadata,
    blueprint,
    allStories,
    episodeNumber,
    audioUrl,
    coverImageUrl,
    fullScript
  )

  // 构建 transcript
  const transcript = buildTranscript(intro, segments, outro)

  const markdown = `${frontmatter}\n${transcript}\n---`

  // // 使用 lint-md 修正中英文格式
  // const { fixedResult } = lintMarkdown(markdown, {}, true)

  // return fixedResult.result || markdown
  return markdown
}

/**
 * 构建 frontmatter
 */
async function buildFrontmatter(
  metadata: FullScriptWithTimeline['metadata'],
  blueprint: PodcastBlueprint,
  allStories: ProcessedStory[],
  episodeNumber: number,
  audioUrl: string,
  coverImageUrl: string | undefined,
  fullScript: FullScriptWithTimeline
): Promise<string> {
  // 收集所有在 blueprint 中被引用的故事
  const storyIds = new Set<number>()
  blueprint.segments.forEach((segment) => {
    segment.story_ids.forEach((id) => storyIds.add(id))
  })

  // 获取对应的故事信息（用于 links）
  const links = allStories
    .filter((story) => storyIds.has(story.id!))
    .map((story) => ({
      title: story.title,
      url: story.url,
      hnUrl: `https://news.ycombinator.com/item?id=${story.id}`,
      points: story.points,
    }))

  // 生成 chapters（基于 segments）
  const chapters = await generateChapters(blueprint, fullScript, allStories)

  const coverImageLine = coverImageUrl ? `coverImage: '${coverImageUrl}'\n` : ''

  const frontmatter = `---
id: ${episodeNumber}
date: '${metadata.date}'
title: '${metadata.title.replace(/['\\]/g, "''")}'
desc: '${metadata.description.replace(/['\\]/g, "''")}'
audioUrl: '${audioUrl}'
${coverImageLine}chapters:
${chapters
  .map(
    (chapter) => `  - title: '${chapter.title.replace(/['\\]/g, "''")}'
    desc: '${chapter.desc.replace(/['\\]/g, "''")}'
    start: ${chapter.start}
    storyIds: [${chapter.storyIds.join(', ')}]`
  )
  .join('\n')}
links:
${links
  .map(
    (link) => `  - title: '${link.title.replace(/['\\]/g, "''")}'
    url: '${link.url}'
    hnUrl: '${link.hnUrl}'
    points: ${link.points}`
  )
  .join('\n')}
transcript:`

  return frontmatter
}

/**
 * 构建 transcript
 */
function buildTranscript(
  intro: FullScriptWithTimeline['intro'],
  segments: FullScriptWithTimeline['segments'],
  outro: FullScriptWithTimeline['outro']
): string {
  const allLines = [...intro.lines, ...segments.flatMap((segment) => segment.lines), ...outro.lines]

  const transcript = allLines
    .map((line) => {
      const escapedText = line.text.replace(/['\\]/g, "''")
      const escapedSpeaker = line.speaker.replace(/['\\]/g, "''")
      const timeLine =
        line.start !== undefined ? `\n    start: ${line.start}\n    end: ${line.end}` : ''
      return `  - speaker: '${escapedSpeaker}'
    text: '${escapedText}'${timeLine}`
    })
    .join('\n')

  return transcript
}
