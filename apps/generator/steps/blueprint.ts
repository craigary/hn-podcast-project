// Generate Blueprint for the Podcast Script using the processed stories

import { generateText, Output } from 'ai'
import { BlueprintSchema, getBlueprintPrompt } from '../ai/prompts/blueprint'
import type { ProcessedStory } from '../types'
import { kv } from '../utils/storage/kv'
import { openai } from '../ai/openai'
import { processText } from '../utils/text'

export const generateBlueprint = async ({
  allStories,
  date,
}: {
  allStories: ProcessedStory[]
  date: string
}) => {
  const cacheKey = `${date}:blueprint`
  // const cached = await kv.getItem<PodcastBlueprint>(cacheKey)

  console.log('开始生成 Blueprint...')
  // if (cached) {
  //   console.log(`[Cache Hit] Blueprint  ${date}, return`)
  //   return cached
  // }

  const candidates = allStories.slice(0, 10)

  try {
    const { output } = await generateText({
      model: openai('openai/gpt-oss-120b'),
      output: Output.object({
        schema: BlueprintSchema,
      }),
      system: getBlueprintPrompt(date),
      prompt: `这是今天的候选情报列表：\n${JSON.stringify(candidates)}`,
    })

    // 文本后处理：引号转换 + pangu 空格
    output.episode_overview.title = processText(output.episode_overview.title)
    output.episode_overview.description = processText(output.episode_overview.description)

    await kv.setItem(cacheKey, JSON.stringify(output), {
      expirationTtl: 604_800,
    })

    console.log(`✅ [Blueprint 生成成功] 标题: ${output.episode_overview.title}`)
    return output
  } catch (error) {
    console.error(`❌ Blueprint 生成失败:`, error)
    throw error
  }
}
