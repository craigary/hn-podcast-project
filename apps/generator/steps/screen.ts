import { fetchPageContent } from '../utils/exa'
import type { RawStory, ScreenedStory } from '../types'

/** 候选阶段追问摘要时用的指令：只要争议点、内幕和被反驳的说法，不要泛泛而谈 */
export const SCREEN_SUMMARY_QUERY = `从这篇 Hacker News 帖子的评论区中提取：
1) 最主要的争议点或相互对立的观点（谁在反对谁，理由是什么）
2) 最刺头、最阴阳怪气或最反直觉的说法（尽量保留原话）
3) 任何内幕、具体数据、被推翻的常识
用 3-5 条要点回答。`

export const hnItemUrl = (storyId: number) => `https://news.ycombinator.com/item?id=${storyId}`

/** 对一个候选故事抓 HN 详情页（评论），拿到摘要 + 原话片段。不调用 LLM。 */
export const screenStory = async (story: RawStory): Promise<ScreenedStory | null> => {
  if (!story.id) return null
  const url = hnItemUrl(story.id)

  try {
    const page = await fetchPageContent(url, { summaryQuery: SCREEN_SUMMARY_QUERY })
    if (!page.summary && !page.text) {
      console.error(`⚠️  空内容: ${story.id} ${story.title.slice(0, 40)}`)
      return null
    }
    console.log(`🔍 已筛选: ${story.title.slice(0, 50)}`)
    return { ...story, summary: page.summary, highlights: page.highlights }
  } catch (error) {
    console.error(`❌ 筛选失败 ${story.id} ${story.title.slice(0, 40)}:`, (error as Error).message)
    return null
  }
}

/** 批量筛选候选故事；失败不中断，但成功率过低由调用方决定是否放弃 */
export const screenStories = async (
  stories: RawStory[],
  concurrency = 5
): Promise<ScreenedStory[]> => {
  console.log(`\n🚀 开始筛选 ${stories.length} 个候选故事 (并发 ${concurrency})...`)
  const results: ScreenedStory[] = []

  for (let i = 0; i < stories.length; i += concurrency) {
    const chunk = stories.slice(i, i + concurrency)
    const settled = await Promise.all(chunk.map((story) => screenStory(story)))
    for (const item of settled) if (item) results.push(item)
    console.log(`📦 进度 ${Math.min(i + concurrency, stories.length)}/${stories.length}`)
  }

  console.log(`✅ 筛选完成：成功 ${results.length}/${stories.length}`)
  return results
}
