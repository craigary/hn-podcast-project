import { createOpenAICompatible } from '@ai-sdk/openai-compatible'

// 本地 DeepSeek 兼容代理（开发用），默认指向 http://127.0.0.1:3425
const local = createOpenAICompatible({
  name: 'local',
  apiKey: process.env.LOCAL_AI_API_KEY || 'magpie',
  baseURL: process.env.LOCAL_AI_BASE_URL || 'http://127.0.0.1:3425',
  includeUsage: true,
  // 上游是 DeepSeek，只支持 response_format: { type: 'json_object' }
  supportsStructuredOutputs: false,
})

export { local }
