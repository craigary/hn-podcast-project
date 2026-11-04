export interface RawStory {
  title: string
  url: string
  id?: number
  date: number
  points: number
  comments?: number
}

/** 候选层：Exa 只返回摘要 + 原话片段，不经过 LLM */
export interface ScreenedStory extends RawStory {
  summary: string
  highlights: string[]
}

/** 精读层：被 blueprint 选中的故事，额外带冲突点与原话 */
export interface ProcessedStory extends ScreenedStory {
  category?: string
  core_conflict: string
  spicy_quote: string
}
