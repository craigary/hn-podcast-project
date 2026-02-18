import { analyzeSingleStory } from '../steps/analyze'
import { ProcessedStory, RawStory } from '../types'

const HN_ALGOLIA = 'https://hn.algolia.com/api/v1'

export const fetchHackerNewsTopStories = async (date: string): Promise<RawStory[]> => {
  const start = new Date(date)
  start.setUTCHours(0, 0, 0, 0)
  const end = new Date(date)
  end.setUTCHours(23, 59, 59, 999)

  const startTs = Math.floor(start.getTime() / 1000)
  const endTs = Math.floor(end.getTime() / 1000)

  const url =
    `${HN_ALGOLIA}/search?tags=story` +
    `&numericFilters=created_at_i>${startTs},created_at_i<${endTs},points>50` +
    `&hitsPerPage=30`

  const res = await fetch(url)
  if (!res.ok) {
    console.error(`[HN Algolia] Failed: ${res.status} ${res.statusText}`)
    return []
  }

  const data = (await res.json()) as {
    hits: {
      objectID: string
      title: string
      url: string | null
      points: number
      created_at_i: number
      num_comments: number
    }[]
  }

  return data.hits.map(hit => ({
    title: hit.title,
    url: hit.url ?? `https://news.ycombinator.com/item?id=${hit.objectID}`,
    id: Number(hit.objectID),
    date: hit.created_at_i,
    points: hit.points
  }))
}

// export const processStories = async (rawStories: RawStory[]): Promise<ProcessedStory[]> => {
//   console.log(`\n🚀 开始处理 ${rawStories.length} 个故事 (模式: 串行/One-by-One)...`)

//   const results: ProcessedStory[] = []

//   for (const [index, story] of rawStories.entries()) {
//     const progress = `[${index + 1}/${rawStories.length}]`

//     try {
//       // 串行调用分析逻辑
//       const analyzedStory = await analyzeSingleStory(story)
//       if (analyzedStory) {
//         results.push(analyzedStory)
//       }
//     } catch (error) {
//       console.error(`${progress} 💥 Critical Error processing ${story.id}:`, error)
//       // 捕获单个循环的错误，防止整个流程中断
//     }
//   }

//   console.log(`\n✅ 处理完成! 成功: ${results.length}/${rawStories.length}`)

//   return results.sort((a, b) => (b.discussability_score || 0) - (a.discussability_score || 0))
// }

export const processStories = async (rawStories: RawStory[]): Promise<ProcessedStory[]> => {
  const CONCURRENCY = 5 // 同时处理的数量
  console.log(`\n🚀 开始处理 ${rawStories.length} 个故事 (模式: 并行, 并发数: ${CONCURRENCY})...`)

  const results: ProcessedStory[] = []

  // 按步长循环，每次跳 5 个
  for (let i = 0; i < rawStories.length; i += CONCURRENCY) {
    // 获取当前这一组 (比如 0-4, 5-9...)
    const chunk = rawStories.slice(i, i + CONCURRENCY)

    console.log(`\n📦 正在处理第 ${i + 1} 到 ${Math.min(i + CONCURRENCY, rawStories.length)} 个...`)

    // 同时启动这一组的 Promise
    const promises = chunk.map(async (story, subIndex) => {
      const globalIndex = i + subIndex + 1
      try {
        const analyzedStory = await analyzeSingleStory(story)
        return analyzedStory
      } catch (error) {
        console.error(`[${globalIndex}/${rawStories.length}] 💥 处理失败 ${story.id}:`, error)
        return null // 容错处理
      }
    })

    // 等待这一组全部完成
    const chunkResults = await Promise.all(promises)

    // 过滤掉失败的 null 结果并推入总数组
    for (const res of chunkResults) {
      if (res) results.push(res)
    }
  }

  console.log(`\n✅ 处理完成! 成功: ${results.length}/${rawStories.length}`)

  return results.sort((a, b) => (b.discussability_score || 0) - (a.discussability_score || 0))
}
