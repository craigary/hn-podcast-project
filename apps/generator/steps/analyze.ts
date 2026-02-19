import { generateText, Output } from 'ai'
import { getIntelPrompt, IntelSchema } from '../ai/prompts/intel'
import { ProcessedStory, RawStory } from '../types'
import { EXA_API_KEY, EXA_BASE_URL } from '../utils/exa'
import { longcat } from '../ai/longcat'
import { kv } from '../utils/storage/kv'

export const fetchStoryContent = async (storyId: number) => {
  const hnUrl = `https://news.ycombinator.com/item?id=${storyId}`
  try {
    const res = await fetch(EXA_BASE_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': EXA_API_KEY,
      },
      body: JSON.stringify({
        ids: [hnUrl],
        text: true,
        highlights: {
          numSentences: 10,
          highlightsPerUrl: 5,
        },
      }),
    })

    if (!res.ok) return null

    const data = (await res.json()) as any
    const result = data.results?.[0]

    // 组合 Exa 返回的文本，构成上下文
    // 如果 result.text 太长，可以只取前 5000 字符
    const rawText = result?.text || result?.highlights?.join('\n') || ''
    return rawText.slice(0, 15000) // 简单的截断保护
  } catch (e) {
    console.error(`Error fetching Exa for ${storyId}:`, e)
    return null
  }
}

export const analyzeSingleStory = async (story: RawStory): Promise<ProcessedStory | null> => {
  console.log(`🔍 Analyzing: ${story.title}`)

  const key = `story:${story.id}`

  // 检查 KV 中是否已有缓存
  const cached = await kv.get(key)
  if (cached) {
    console.log(`📋 Using cached analysis for ${story.id}`)
    return cached as ProcessedStory
  }

  // A. 获取内容
  const content = await fetchStoryContent(story.id!)
  if (!content) {
    console.log(`⚠️ No content found for ${story.id}`)
    return null
  }

  // B. 调用 LongCat 生成结构化 Intel
  // 这里解决了你的 Context 长度问题：
  console.log('Start generating Intels for story: ', story.title)
  try {
    const { output } = await generateText({
      model: longcat('LongCat-Flash-Chat'),
      output: Output.object({
        schema: IntelSchema,
      }),
      system: getIntelPrompt(),
      prompt: `
        [Target Story]
        ID: ${story.id}
        Title: ${story.title}
        Link: ${story.url}
        
        [Raw Content / Comments Dump]
        ${content}
      `,
    })
    // 可以在这里强制把 ID 塞回去，防止 LLM 忘记
    const result = { ...output, ...story }

    // 存储到 KV
    await kv.set(key, result)

    return result
  } catch (e) {
    console.error(`AI Analysis failed for ${story.id}:`, e)
    return null
  }
}
