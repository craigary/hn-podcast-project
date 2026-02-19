// src/prompts/intel.ts
import { z } from 'zod'

// 这是压缩后的“情报卡片”，只有这里面的信息会进入下一步的 Blueprint 决策
export const IntelSchema = z.object({
  id: z.number().describe('Story ID'),
  title: z.string().describe('原始标题'),
  category: z.enum(['Tech', 'AI', 'Career', 'Society', 'Show HN', 'Other']).describe('话题分类'),

  // 核心决策字段：让 AI 帮你打分，决定要不要聊这个
  discussability_score: z
    .number()
    .min(1)
    .max(10)
    .describe('可讨论性打分（争议大、深度足、槽点多则高分）'),

  // 核心摘要：一句话概括大家在吵什么
  core_conflict: z.string().describe('评论区的主要冲突点或核心讨论点（一句话）'),

  // 观点提炼：避免下一步幻觉
  key_arguments: z.array(z.string()).describe('评论区提到的 3 个主要核心观点或事实'),

  // 亮点提取：保留原文的“味道”
  spicy_quote: z
    .string()
    .describe('评论区最犀利、最搞笑或最刻薄的一句原话（保留原文，若是英文可附带中文意译）'),
})

export type StoryIntel = z.infer<typeof IntelSchema>

export const getIntelPrompt = () => `
# Role
你是一个 Hacker News 顶级情报分析师。你的工作是从嘈杂的评论区中提取有价值的“弹药”，供播客主持人使用。

# Task
阅读提供的 Hacker News 帖子内容（包括标题和评论），输出一个结构化的情报分析 JSON。

# Evaluation Criteria (评分标准)
- **10分**：极具争议、两极分化严重、有大佬现身说法、或者极其荒谬搞笑。
- **1分**：平平无奇的新闻通稿，大家只在说“Good job”。

# Guidelines
1. **忽略无意义评论**：忽略 "Nice", "Congrats" 等客套话。
2. **寻找冲突**：重点关注反驳、嘲讽、揭露内幕的评论。
3. **保留原味**：在提取 \`spicy_quote\` 时，尽量保留那种“阴阳怪气”或“一针见血”的感觉。

# Output
严格遵守 JSON 格式输出。
`
