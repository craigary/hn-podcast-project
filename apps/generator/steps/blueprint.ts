// 用候选故事的摘要生成整期蓝图

import { BlueprintSchema, getBlueprintPrompt } from '../ai/prompts/blueprint'
import type { ScreenedStory } from '../types'
import { kv } from '../utils/storage/kv'
import { deepseek } from '../ai/deepseek'
import { processText } from '../utils/text'
import { withRetry } from '../utils/validate'
import { generateStructured } from '../utils/llm'

const model = deepseek('deepseek-flash')

/** 只把摘要送进 prompt，正文留在 KV 里给脚本阶段用 */
const buildCandidates = (stories: ScreenedStory[]) =>
  stories.map((story) => ({
    id: story.id,
    title: story.title,
    points: story.points,
    comments: story.comments,
    url: story.url,
    summary: story.summary,
  }))

export const generateBlueprint = async ({
  allStories,
  weekRange,
}: {
  allStories: ScreenedStory[]
  weekRange: string
}) => {
  if (allStories.length === 0) throw new Error('generateBlueprint: 没有候选故事')

  const candidates = buildCandidates(allStories.slice(0, 20))
  console.log(`开始生成 Blueprint（基于 ${candidates.length} 条摘要）...`)

  const output = await withRetry(
    () =>
      generateStructured({
        model,
        schema: BlueprintSchema,
        system: getBlueprintPrompt(weekRange),
        prompt: `这是今天的候选情报（每条只有评论区摘要，没有全文）：\n${JSON.stringify(candidates)}`,
        providerName: 'deepseek',
        structuredMode: 'json_object',
        maxOutputTokens: 8000,
      }),
    (output) => {
      if (!output.segments?.length) throw new Error('blueprint 没有生成任何 segment')
      const ids = new Set(candidates.map((c) => c.id))
      const unknown = output.segments.flatMap((s) => s.story_ids).filter((id) => !ids.has(id))
      if (unknown.length > 0)
        throw new Error(`blueprint 引用了不存在的 story id: ${unknown.join(',')}`)
    },
    { label: 'Blueprint 生成' }
  )

  output.episode_overview.title = processText(output.episode_overview.title)
  output.episode_overview.description = processText(output.episode_overview.description)

  await kv.setItem(`${weekRange}:blueprint`, JSON.stringify(output), { expirationTtl: 604_800 })

  console.log(`✅ [Blueprint 生成成功] 标题: ${output.episode_overview.title}`)
  return output
}
