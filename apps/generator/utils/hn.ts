import type { RawStory } from '../types'

const HN_ALGOLIA = 'https://hn.algolia.com/api/v1'

/**
 * 抓一周的 HN 热门故事。
 * @param weekEnd 该周最后一天（YYYY-MM-DD），区间为 weekEnd 往前数 7 天。
 * 结果按 points 降序，取前 30 条作为候选。
 */
export const fetchWeeklyTopStories = async (weekEnd: string): Promise<RawStory[]> => {
  const end = new Date(`${weekEnd}T23:59:59Z`)
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000 + 1000)
  start.setUTCHours(0, 0, 0, 0)

  const startTs = Math.floor(start.getTime() / 1000)
  const endTs = Math.floor(end.getTime() / 1000)

  // 周更用 points>200 做门槛：一周 points>50 有 470 条，噪声太多
  const url =
    `${HN_ALGOLIA}/search?tags=story` +
    `&numericFilters=created_at_i>${startTs},created_at_i<${endTs},points>200` +
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

  return data.hits.map((hit) => ({
    title: hit.title,
    url: hit.url ?? `https://news.ycombinator.com/item?id=${hit.objectID}`,
    id: Number(hit.objectID),
    date: hit.created_at_i,
    points: hit.points,
    comments: hit.num_comments,
  }))
}

//
