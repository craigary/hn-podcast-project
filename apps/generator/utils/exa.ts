import { kv } from './storage/kv'

export const EXA_BASE_URL = 'https://api.exa.ai/contents'
export const EXA_API_KEY = process.env.EXA_API_KEY!

const CACHE_TTL = 604_800 // 7 天，新闻类内容过了这个时间也没价值了
const MAX_TEXT = 15000

export interface PageContent {
  url: string
  text: string
  summary: string
  highlights: string[]
}

interface ExaResult {
  url?: string
  text?: string
  summary?: string
  highlights?: string[]
}

// URL 里含 / 和 ?，直接当 key 会被本地 fs driver 落成同一个文件（互相覆盖），先编码
const cacheKey = (url: string) => `exa:${encodeURIComponent(url)}`

/** 只读缓存，不发请求。脚本阶段优先用这个，避免重复抓取。 */
export const getCachedPage = async (url: string): Promise<PageContent | null> =>
  (await kv.getItem<PageContent>(cacheKey(url))) ?? null

/**
 * 抓取一个页面，一次请求同时拿 text + summary + highlights，并缓存 7 天。
 * 失败会抛错（不静默返回空内容，避免下游拿空数据继续跑）。
 */
export const fetchPageContent = async (
  url: string,
  opts: { summaryQuery?: string } = {}
): Promise<PageContent> => {
  const cached = await getCachedPage(url)
  // 命中缓存：如果没有额外要求 summary，或者缓存里已经有 summary，就直接复用
  if (cached && (!opts.summaryQuery || cached.summary)) {
    console.log(`📋 [Cache Hit] ${url}`)
    return cached
  }

  const body: Record<string, unknown> = {
    ids: [url],
    text: { maxCharacters: MAX_TEXT },
    highlights: { numSentences: 3, highlightsPerUrl: 8 },
  }
  if (opts.summaryQuery) body.summary = { query: opts.summaryQuery }

  const res = await fetch(EXA_BASE_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': EXA_API_KEY },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(
      `Exa 抓取失败 ${res.status} ${res.statusText}: ${detail.slice(0, 200)} (${url})`
    )
  }

  const data = (await res.json()) as { results?: ExaResult[] }
  const result = data.results?.[0]
  if (!result) throw new Error(`Exa 未返回内容: ${url}`)

  const page: PageContent = {
    url,
    text: (result.text ?? '').slice(0, MAX_TEXT),
    summary: result.summary ?? '',
    highlights: result.highlights ?? [],
  }

  await kv.setItem(cacheKey(url), page, { expirationTtl: CACHE_TTL })
  return page
}
