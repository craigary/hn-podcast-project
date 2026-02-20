import { PodcastBlueprint } from '../ai/prompts/blueprint'
import { ProcessedStory } from '../types'
import type { FullScriptWithTimeline } from './tts'
import { generateText, Output } from 'ai'
import { mistral } from '../ai/mistral'
import { z } from 'zod'
import pangu from 'pangu'

const model = mistral('mistral-large-latest')

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
    currentTime = lastIntroLine.end || 0
  }

  // 为每个 segment 生成 chapter
  for (let i = 0; i < blueprint.segments.length; i++) {
    const segment = blueprint.segments[i]
    const segmentScript = fullScript.segments[i]

    // 获取该 segment 的起始时间
    const segmentLines = segmentScript.lines
    const startTime = segmentLines.length > 0 ? segmentLines[0].start || currentTime : currentTime

    // 提取该 segment 的对话内容（用于 AI 总结）
    const dialogueText = segmentLines.map((line) => `${line.speaker}: ${line.text}`).join('\n')

    // 获取该 segment 讨论的故事信息
    const segmentStories = allStories.filter((story) => segment.story_ids.includes(story.id!))
    const storiesContext = segmentStories
      .map((story) => `- ${story.title} (${story.category})`)
      .join('\n')

    // 使用 AI 生成章节标题和描述
    try {
      const { output } = await generateText({
        model: model,
        output: Output.object({
          schema: ChapterSummarySchema,
        }),
        system: `你是一个播客章节总结专家。请根据对话内容生成简短、吸引人的章节标题和描述。

要求：
- 标题：5-10 字，简洁有力，吸引人点击
- 描述：1-2 句话，总结本段讨论的核心观点和亮点
- 语气要轻松、口语化，符合播客风格`,
        prompt: `请为以下播客片段生成章节标题和描述：

【讨论的话题】
${storiesContext}

【对话内容片段】（仅供参考，不要照搬）
${dialogueText.slice(0, 2000)}

请生成吸引人的章节标题和描述。`,
      })

      // 处理标题：转换引号 + pangu 空格
      let processedTitle = output.title
        // 先处理智能引号（curly quotes）
        .replace(/[\u201c\u201d]/g, (match) => (match === '\u201c' ? '\u300c' : '\u300d')) // " → 「, " → 」
        .replace(/[\u2018\u2019]/g, (match) => (match === '\u2018' ? '\u300c' : '\u300d')) // ' → 「, ' → 」
        // 处理已有的中文引号（统一为折角引号）
        .replace(/[\u300e\u300f]/g, (match) => (match === '\u300e' ? '\u300c' : '\u300d')) // 『 → 「, 』 → 」
        .replace(/[\u3010\u3011]/g, (match) => (match === '\u3010' ? '\u300c' : '\u300d')) // 【 → 「, 】 → 」
        // 再处理普通引号（straight quotes）
        .replace(/"([^"]*)"/g, '\u300c$1\u300d') // "text" → 「text」
        .replace(/'([^']*)'/g, '\u300c$1\u300d') // 'text' → 「text」

      processedTitle = pangu.spacingText(processedTitle)

      // 处理描述：转换引号 + pangu 空格
      let processedDesc = output.desc
        // 先处理智能引号（curly quotes）
        .replace(/[\u201c\u201d]/g, (match) => (match === '\u201c' ? '\u300c' : '\u300d')) // " → 「, " → 」
        .replace(/[\u2018\u2019]/g, (match) => (match === '\u2018' ? '\u300c' : '\u300d')) // ' → 「, ' → 」
        // 处理已有的中文引号（统一为折角引号）
        .replace(/[\u300e\u300f]/g, (match) => (match === '\u300e' ? '\u300c' : '\u300d')) // 『 → 「, 』 → 」
        .replace(/[\u3010\u3011]/g, (match) => (match === '\u3010' ? '\u300c' : '\u300d')) // 【 → 「, 】 → 」
        // 再处理普通引号（straight quotes）
        .replace(/"([^"]*)"/g, '\u300c$1\u300d') // "text" → 「text」
        .replace(/'([^']*)'/g, '\u300c$1\u300d') // 'text' → 「text」

      processedDesc = pangu.spacingText(processedDesc)

      chapters.push({
        title: processedTitle,
        desc: processedDesc,
        start: Math.floor(startTime),
        storyIds: segment.story_ids,
      })

      console.log(`✅ Chapter ${i + 1}: ${processedTitle}`)
    } catch (error) {
      console.error(`❌ 生成 Chapter ${i + 1} 失败:`, error)
      // 使用默认值
      chapters.push({
        title: `第 ${i + 1} 部分`,
        desc: segmentStories.map((s) => s.title).join('、'),
        start: Math.floor(startTime),
        storyIds: segment.story_ids,
      })
    }

    // 更新当前时间
    if (segmentLines.length > 0) {
      const lastLine = segmentLines[segmentLines.length - 1]
      currentTime = lastLine.end || currentTime
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
