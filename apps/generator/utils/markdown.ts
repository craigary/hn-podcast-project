import { PodcastBlueprint } from '../ai/prompts/blueprint'
import { SegmentScript } from '../ai/prompts/script'
import { ProcessedStory } from '../types'

interface FullScript {
  intro: SegmentScript
  segments: SegmentScript[]
  outro: SegmentScript
  metadata: {
    date: string
    title: string
    description: string
    vibe: string
    totalSegments: number
  }
}

/**
 * 将完整脚本转换为 Markdown 格式
 */
export function convertScriptToMarkdown(
  fullScript: FullScript,
  blueprint: PodcastBlueprint,
  allStories: ProcessedStory[],
  episodeNumber: number,
  audioUrl: string,
  coverImageUrl?: string
): string {
  const { metadata, intro, segments, outro } = fullScript

  // 构建 frontmatter
  const frontmatter = buildFrontmatter(
    metadata,
    blueprint,
    allStories,
    episodeNumber,
    audioUrl,
    coverImageUrl
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
function buildFrontmatter(
  metadata: FullScript['metadata'],
  blueprint: PodcastBlueprint,
  allStories: ProcessedStory[],
  episodeNumber: number,
  audioUrl: string,
  coverImageUrl?: string
): string {
  // 收集所有在 blueprint 中被引用的故事
  const storyIds = new Set<number>()
  blueprint.segments.forEach((segment) => {
    segment.story_ids.forEach((id) => storyIds.add(id))
  })

  // 获取对应的故事信息
  const showNotes = allStories
    .filter((story) => storyIds.has(story.id!))
    .map((story) => ({
      title: story.title,
      url: story.url,
      hnUrl: `https://news.ycombinator.com/item?id=${story.id}`,
      points: story.points,
    }))

  const coverImageLine = coverImageUrl ? `coverImage: '${coverImageUrl}'\n` : ''

  const frontmatter = `---
id: ${episodeNumber}
date: '${metadata.date}'
title: '${metadata.title.replace(/'/g, "''")}'
desc: '${metadata.description.replace(/'/g, "''")}'
audioUrl: '${audioUrl}'
${coverImageLine}showNotes:
${showNotes
  .map(
    (note) => `  - title: '${note.title.replace(/'/g, "''")}'
    url: '${note.url}'
    hnUrl: '${note.hnUrl}'
    points: ${note.points}`
  )
  .join('\n')}
transcript:`

  return frontmatter
}

/**
 * 构建 transcript
 */
function buildTranscript(
  intro: SegmentScript,
  segments: SegmentScript[],
  outro: SegmentScript
): string {
  const allLines = [...intro.lines, ...segments.flatMap((segment) => segment.lines), ...outro.lines]

  const transcript = allLines
    .map((line) => {
      // 转义单引号：在 YAML 中，单引号字符串内的单引号需要用两个单引号转义
      const escapedText = line.text.replace(/'/g, "''")
      const escapedSpeaker = line.speaker.replace(/'/g, "''")
      return `  - speaker: '${escapedSpeaker}'
    text: '${escapedText}'`
    })
    .join('\n')

  return transcript
}
