import { z } from 'zod'

/**
 * 精读阶段：一次批量返回所有选中故事的冲突点与原话，不再逐条调用。
 */
export const QuoteBatchSchema = z.object({
  items: z.array(
    z.object({
      id: z.number().describe('故事 ID，必须与输入中的 id 完全一致'),
      category: z
        .string()
        .describe('话题分类，只能返回以下之一：Tech, AI, Career, Society, Show HN, Other'),
      core_conflict: z.string().describe('评论区的主要冲突点或核心讨论点（一句话）'),
      spicy_quote: z
        .string()
        .describe('评论区最犀利、最搞笑或最刻薄的一句原话（保留原文；若为英文可附中文意译）'),
    })
  ),
})

export type QuoteBatch = z.infer<typeof QuoteBatchSchema>

export const getQuotePrompt = () => `# Role
你是 Hacker News 评论区的情报提炼员。你会在一次任务中拿到多个帖子的摘要与评论区原话片段。

# Task
为每个帖子提取两样东西，一次性全部返回：
1. \`core_conflict\`：一句话说清评论区到底在吵什么（谁反对谁、分歧在哪）。
2. \`spicy_quote\`：一句最刺头、最阴阳怪气或最一针见血的原话。优先从提供的原话片段里挑，不要自己编造。

# Rules
- 必须为每个输入的 id 返回一条记录，id 不得改动、不得遗漏。
- \`spicy_quote\` 尽量保留原话，英文原话优先保留原文，可附中文意译。
- \`category\` 只能是：Tech, AI, Career, Society, Show HN, Other 之一。
- 如果某个帖子实在没有可提取的冲突，\`core_conflict\` 写"无明显冲突"，\`spicy_quote\` 写空字符串。

# Output
严格遵守 JSON 格式：{"items": [{...}]}`
