import { createOpenAICompatible } from '@ai-sdk/openai-compatible'

// Superlinked（SIE）OpenAI 兼容网关。
// grammar（response_format）能力按模型开放：Qwen3.8-27B 支持 json_schema，
// DeepSeek-V4.1-Flash、GLM-5.3-Flash 不支持。
const superlinked = createOpenAICompatible({
  name: 'superlinked',
  apiKey: process.env.SUPERLINKED_API_KEY!,
  baseURL: 'https://api.superlinked.com/v1',
  includeUsage: true,
  supportsStructuredOutputs: false,
})

export { superlinked }
