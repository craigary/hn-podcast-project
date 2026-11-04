import { createOpenAICompatible } from '@ai-sdk/openai-compatible'

// DeepSeek 官方 API。只支持 response_format: { type: 'json_object' }，
// 不支持 strict json_schema，字段结构靠 prompt + zod 校验约束。
const deepseek = createOpenAICompatible({
  name: 'deepseek',
  apiKey: process.env.DEEPSEEK_API_KEY!,
  baseURL: 'https://api.deepseek.com',
  includeUsage: true,
  supportsStructuredOutputs: false,
})

export { deepseek }
