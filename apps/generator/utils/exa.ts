export const EXA_BASE_URL = 'https://exapool.chengtx.vip/contents'
export const EXA_API_KEY = 'linuxdo@chengtx'

interface ExaContentResult {
  text?: string
  highlights?: string[]
  highlightScores?: number[]
  summary?: string
}

export const fetchCommentInsights = async (storyId: number) => {
  const hnUrl = `https://news.ycombinator.com/item?id=${storyId}`
  try {
    const res = await fetch(EXA_BASE_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': EXA_API_KEY },
      body: JSON.stringify({
        ids: [hnUrl],
        highlights: {
          numSentences: 3,
          highlightsPerUrl: 10,
        },
        summary: {
          query: 'What are the most controversial and insightful opinions in the comments?',
        },
      }),
    })

    if (!res.ok) return { highlights: '', summary: '' }

    const data = (await res.json()) as { results: ExaContentResult[] }
    const result = data.results?.[0]
    return {
      highlights: result?.highlights ? (result?.highlights?.[0] ?? '') : '',
      summary: result?.summary ?? '',
    }
  } catch {
    return { highlights: '', summary: '' }
  }
}

export const fetchContentByExa = async (url: string) => {
  try {
    const res = await fetch(EXA_BASE_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': EXA_API_KEY },
      body: JSON.stringify({
        ids: [url],
        text: true,
      }),
    })

    if (!res.ok) return ''

    const data = (await res.json()) as { results: { text: string }[] }
    return data.results?.[0]?.text ?? ''
  } catch {
    return ''
  }
}
